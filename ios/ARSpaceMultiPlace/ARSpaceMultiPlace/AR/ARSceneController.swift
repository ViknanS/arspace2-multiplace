import ARKit
import Combine
import RealityKit
import UIKit

enum TrackingStatus: Equatable {
    case initializing
    case good
    case limited(String)
    case unavailable

    var label: String {
        switch self {
        case .initializing: return "Tracking: Starting"
        case .good: return "Tracking: Good"
        case .limited: return "Tracking: Limited"
        case .unavailable: return "Tracking: Lost"
        }
    }

    var isGood: Bool { self == .good }
}

/// Runs the one ARKit world-tracking session for MultiPlace and keeps a
/// RealityKit entity per PlacedObject in SceneManager.
///
///  - Unlocked objects hang from a world-space AnchorEntity.
///  - Locking creates an ARAnchor at the object's transform; ARKit keeps
///    refining that anchor as it learns the room, and RealityKit moves the
///    object with it. Unlocking removes only that object's ARAnchor.
///  - Only the single following object (a new preview or an object being
///    moved) tracks the raycast reticle. Nothing is parented to the camera.
///  - Floor items follow horizontal planes, wall items follow vertical planes
///    and turn to face out of the wall.
@MainActor
final class ARSceneController: NSObject, ObservableObject {
    let arView: ARView
    let manager: SceneManager
    let catalog: Catalog

    @Published private(set) var tracking: TrackingStatus = .initializing
    @Published private(set) var surfaceKind: SurfaceKind?
    @Published private(set) var wallSeen = false
    @Published private(set) var wallHintDue = false
    @Published private(set) var flash: String?
    @Published private(set) var loadingIDs: Set<String> = []
    @Published private(set) var interrupted = false
    @Published private(set) var running = false

    static let performanceHintAt = 10

    private final class Node {
        var anchorEntity: AnchorEntity
        let pivot: Entity
        let highlight: ModelEntity
        let size: SIMD3<Float>
        var arAnchor: ARAnchor?

        init(anchorEntity: AnchorEntity, pivot: Entity, highlight: ModelEntity, size: SIMD3<Float>) {
            self.anchorEntity = anchorEntity
            self.pivot = pivot
            self.highlight = highlight
            self.size = size
        }
    }

    private var nodes: [String: Node] = [:]
    private var pivotIDs: [ObjectIdentifier: String] = [:]
    private let cache = ModelCache()
    private var hit: SurfaceHit?
    private var reticle: AnchorEntity?
    private var reticleSuits: Bool?
    private var subscriptions = Set<AnyCancellable>()
    private var updateSubscription: Cancellable?
    private var flashTask: Task<Void, Never>?
    private var wallHintTask: Task<Void, Never>?
    private var sessionDelegate: SessionDelegateProxy?
    private var coaching: ARCoachingOverlayView?
    private var gestureStart: (rotation: Float, scale: Float)?

    init(catalog: Catalog, manager: SceneManager = SceneManager()) {
        self.catalog = catalog
        self.manager = manager
        arView = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
        super.init()
        arView.renderOptions.insert(.disableMotionBlur)
    }

    // MARK: - session life cycle

    /// Start (or restart) one world-tracking session. Never runs two at once.
    func start() {
        guard !running else { return }
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        config.environmentTexturing = .automatic
        let proxy = SessionDelegateProxy(owner: self)
        sessionDelegate = proxy
        arView.session.delegate = proxy
        arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        running = true
        tracking = .initializing

        let coach = ARCoachingOverlayView()
        coach.session = arView.session
        coach.goal = .anyPlane
        coach.activatesAutomatically = true
        coach.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        coach.frame = arView.bounds
        arView.addSubview(coach)
        coaching = coach

        let ret = AnchorEntity(world: .zero)
        ret.addChild(Self.disc(radius: 0.1, color: .white, opacity: 0.55, vertical: false))
        ret.isEnabled = false
        arView.scene.addAnchor(ret)
        reticle = ret

        installGestures()
        updateSubscription = arView.scene.subscribe(to: SceneEvents.Update.self) { [weak self] _ in
            self?.frameUpdate()
        }
        Publishers.CombineLatest(manager.$objects, manager.$selectedID)
            .sink { [weak self] objects, selected in self?.sync(objects, selected: selected) }
            .store(in: &subscriptions)
    }

    /// End the session and free everything (anchors, entities, cached models).
    func stop() {
        guard running else { return }
        running = false
        updateSubscription?.cancel()
        updateSubscription = nil
        subscriptions.removeAll()
        flashTask?.cancel()
        wallHintTask?.cancel()
        for node in nodes.values {
            if let a = node.arAnchor { arView.session.remove(anchor: a) }
            node.anchorEntity.removeFromParent()
        }
        nodes.removeAll()
        pivotIDs.removeAll()
        loadingIDs.removeAll()
        reticle?.removeFromParent()
        reticle = nil
        coaching?.removeFromSuperview()
        coaching = nil
        arView.gestureRecognizers?.forEach { arView.removeGestureRecognizer($0) }
        arView.session.pause()
        arView.session.delegate = nil
        sessionDelegate = nil
        cache.removeAll()
        hit = nil
        surfaceKind = nil
    }

    // MARK: - commands from the UI

    func pick(_ product: Product) {
        let h = hit.flatMap { $0.suits(product.placement) ? $0 : nil }
        manager.add(product.id, surface: product.placement, position: h?.position ?? defaultPosition(), rotationY: h?.yaw ?? 0)
        scheduleWallHint(product.placement == .wall)
    }

    @discardableResult
    func placeFollower() -> Bool {
        guard let f = manager.follower, let h = hit, h.suits(f.surface), nodes[f.id] != nil else { return false }
        manager.place(f.id, at: h.position, rotationY: h.yaw)
        scheduleWallHint(false)
        return true
    }

    func placeAndLock() {
        guard placeFollower(), let id = manager.selectedID else { return }
        manager.lock(id)
    }

    func moveSelected() {
        guard let o = manager.selected, manager.move(o.id) else { return }
        scheduleWallHint(o.surface == .wall)
    }

    func duplicateSelected() {
        guard let o = manager.selected else { return }
        let width = nodes[o.id]?.size.x ?? 0.4
        if let copy = manager.duplicate(o.id, offset: max(0.3, width * o.scale + 0.1)) {
            say("Copy added beside it (\(copy.id)). Move or lock it.")
        }
    }

    func undo() {
        if manager.undo() { say("Undone.") }
    }

    func clearRoom() {
        manager.clear()
        say("Room cleared. Undo brings everything back.")
    }

    func say(_ text: String) {
        flash = text
        flashTask?.cancel()
        flashTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if !Task.isCancelled { self?.flash = nil }
        }
    }

    // MARK: - status text

    func statusText() -> String {
        if let flash { return flash }
        if interrupted { return "AR paused. Return to the camera view to continue." }
        switch tracking {
        case .initializing: return "Move your phone slowly to start tracking the room."
        case let .limited(reason): return "Tracking limited (\(reason)). Move slowly and point at a well-lit, textured area."
        case .unavailable: return "Tracking lost. Point the camera back at the room."
        case .good: break
        }
        if let f = manager.follower {
            let name = catalog.product(f.productID)?.name ?? "object"
            if loadingIDs.contains(f.id) { return "Loading \(name)…" }
            let suits = surfaceKind.map { f.surface == .wall ? $0 == .wall : $0 == .floor } ?? false
            if f.surface == .wall {
                if suits { return f.state == .moving ? "Wall found. Aim at the new spot, then Place & Lock." : "Wall Found. Ready to Place." }
                if surfaceKind == .floor { return "That's the floor. Aim at a wall to hang the \(name)." }
                if wallHintDue && !wallSeen { return "No wall detected yet. Move closer to a plain, well-lit wall and move slowly." }
                return "Point at a wall and move slowly to detect it."
            }
            if suits { return f.state == .moving ? "Ready to Place. Aim at the new spot, then Place & Lock." : "Surface Found. Ready to Place." }
            if surfaceKind == .wall { return "That's a wall. Aim at the floor or a tabletop." }
            return "Move your phone to scan the floor."
        }
        switch manager.selected?.state {
        case .placed?: return "Object Placed — Lock Position."
        case .locked?: return "Locked. Pick another item below to add more."
        default: break
        }
        if manager.count == 0 { return surfaceKind == nil ? "Move your phone to scan the floor." : "Surface Found. Pick furniture below." }
        return "Pick furniture below, or tap an object to select it."
    }

    /// Whether Place / Place & Lock can be pressed right now.
    var canPlace: Bool {
        guard let f = manager.follower, let kind = surfaceKind, nodes[f.id] != nil else { return false }
        return f.surface == .wall ? kind == .wall : kind == .floor
    }

    // MARK: - per-frame work

    private func frameUpdate() {
        guard running, let frame = arView.session.currentFrame else { return }
        let c = frame.camera.transform.columns.3
        let camera = SIMD3<Float>(c.x, c.y, c.z)
        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        let result = arView.raycast(from: center, allowing: .existingPlaneGeometry, alignment: .any).first
            ?? arView.raycast(from: center, allowing: .estimatedPlane, alignment: .any).first
        hit = result.map { SurfaceClassifier.classify($0.worldTransform, cameraPosition: camera) }
        if hit?.kind == .wall, !wallSeen { wallSeen = true }
        if surfaceKind != hit?.kind { surfaceKind = hit?.kind }

        let follower = manager.follower
        let suits = follower.map { f in hit?.suits(f.surface) ?? false }
        if let ret = reticle {
            ret.isEnabled = hit != nil
            if let h = hit { ret.setTransformMatrix(h.transform, relativeTo: nil) }
            let good = suits ?? (hit?.kind == .floor || hit?.kind == .wall)
            if reticleSuits != good {
                reticleSuits = good
                if let disc = ret.children.first as? ModelEntity {
                    disc.model?.materials = [Self.material(good ? Theme.accentUI : .white, opacity: 0.6)]
                }
            }
        }
        // the follower tracks the reticle directly (the manager is updated when it is placed)
        if let f = follower, let node = nodes[f.id] {
            if let h = hit, h.suits(f.surface) {
                node.anchorEntity.transform = Transform(scale: .one, rotation: Self.yawRotation(f.surface == .wall ? h.yaw : f.rotationY), translation: h.position)
                node.anchorEntity.isEnabled = true
            } else {
                node.anchorEntity.isEnabled = false
            }
        }
    }

    // MARK: - scene sync (diff SceneManager -> entities)

    private func sync(_ objects: [PlacedObject], selected: String?) {
        guard running else { return }
        let ids = Set(objects.map(\.id))
        for id in nodes.keys where !ids.contains(id) { removeNode(id) }
        for o in objects {
            if let node = nodes[o.id] {
                apply(o, to: node, selected: selected == o.id)
            } else if !loadingIDs.contains(o.id) {
                load(o)
            }
        }
    }

    private func load(_ o: PlacedObject) {
        guard let product = catalog.product(o.productID) else { return }
        loadingIDs.insert(o.id)
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let (pivot, size) = try await cache.instance(of: product)
                loadingIDs.remove(o.id)
                // removed while loading, or the session ended
                guard running, let current = manager.object(o.id) else { return }
                let highlight = Self.disc(radius: max(size.x, product.placement == .wall ? size.y : size.z) * 0.62,
                                          color: Theme.accentUI, opacity: 0.35, vertical: product.placement == .wall)
                highlight.isEnabled = false
                pivot.addChild(highlight)
                let anchor = AnchorEntity(world: .zero)
                anchor.addChild(pivot)
                arView.scene.addAnchor(anchor)
                let node = Node(anchorEntity: anchor, pivot: pivot, highlight: highlight, size: size)
                nodes[o.id] = node
                pivotIDs[ObjectIdentifier(pivot)] = o.id
                apply(current, to: node, selected: manager.selectedID == o.id)
            } catch {
                loadingIDs.remove(o.id)
                manager.remove(o.id) // a failed model never affects the other objects
                say("Couldn't load \(product.name). Other objects are unaffected.")
            }
        }
    }

    private func apply(_ o: PlacedObject, to node: Node, selected: Bool) {
        node.pivot.scale = SIMD3<Float>(repeating: o.scale)
        node.highlight.isEnabled = selected
        let transform = Transform(scale: .one, rotation: Self.yawRotation(o.rotationY), translation: o.position)
        switch o.state {
        case .locked:
            guard node.arAnchor == nil else { return } // ARKit drives locked objects
            let anchor = ARAnchor(name: "arspace:\(o.id)", transform: transform.matrix)
            arView.session.add(anchor: anchor)
            let anchorEntity = AnchorEntity(anchor: anchor)
            anchorEntity.addChild(node.pivot)
            arView.scene.addAnchor(anchorEntity)
            node.anchorEntity.removeFromParent()
            node.anchorEntity = anchorEntity
            node.arAnchor = anchor
        case .placed, .preview, .moving:
            if let a = node.arAnchor {
                // unlocked: release only this object's anchor, keep it where it is
                arView.session.remove(anchor: a)
                node.arAnchor = nil
                let world = AnchorEntity(world: .zero)
                world.addChild(node.pivot)
                arView.scene.addAnchor(world)
                node.anchorEntity.removeFromParent()
                node.anchorEntity = world
            }
            if o.state == .placed {
                node.anchorEntity.transform = transform
                node.anchorEntity.isEnabled = true
            } else if !(hit?.suits(o.surface) ?? false) {
                node.anchorEntity.isEnabled = false // shown only over a suitable surface
            } else if o.surface == .floor {
                node.anchorEntity.transform.rotation = Self.yawRotation(o.rotationY)
            }
        }
    }

    private func removeNode(_ id: String) {
        guard let node = nodes.removeValue(forKey: id) else { return }
        if let a = node.arAnchor { arView.session.remove(anchor: a) }
        node.anchorEntity.removeFromParent()
        pivotIDs[ObjectIdentifier(node.pivot)] = nil
    }

    /// ARKit refined a locked object's anchor: record its new position.
    fileprivate func anchorsUpdated(_ anchors: [ARAnchor]) {
        for a in anchors {
            guard let name = a.name, name.hasPrefix("arspace:") else { continue }
            let id = String(name.dropFirst("arspace:".count))
            let c = a.transform.columns.3
            let p = SIMD3<Float>(c.x, c.y, c.z)
            if let o = manager.object(id), o.state == .locked, simd_distance(o.position, p) > 0.01 {
                manager.applyAnchorPose(id, position: p)
            }
        }
    }

    fileprivate func trackingChanged(_ state: ARCamera.TrackingState) {
        switch state {
        case .normal: tracking = .good
        case .notAvailable: tracking = .unavailable
        case let .limited(reason):
            switch reason {
            case .initializing: tracking = .initializing
            case .excessiveMotion: tracking = .limited("moving too fast")
            case .insufficientFeatures: tracking = .limited("not enough detail")
            case .relocalizing: tracking = .limited("relocalizing")
            @unknown default: tracking = .limited("limited")
            }
        }
    }

    fileprivate func setInterrupted(_ value: Bool) { interrupted = value }

    fileprivate func failed(_ error: Error) {
        say("AR error: \(error.localizedDescription)")
    }

    // MARK: - gestures: tap to select or place, pinch to resize, twist to rotate

    private func installGestures() {
        arView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(handleTap(_:))))
        arView.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:))))
        arView.addGestureRecognizer(UIRotationGestureRecognizer(target: self, action: #selector(handleRotation(_:))))
    }

    @objc private func handleTap(_ g: UITapGestureRecognizer) {
        let point = g.location(in: arView)
        if let entity = arView.entity(at: point), let id = objectID(for: entity), id != manager.follower?.id {
            manager.select(id)
            return
        }
        placeFollower()
    }

    @objc private func handlePinch(_ g: UIPinchGestureRecognizer) {
        guard let o = manager.selected, o.state != .locked else { return }
        switch g.state {
        case .began:
            manager.checkpoint()
            gestureStart = (o.rotationY, o.scale)
        case .changed:
            if let s = gestureStart { manager.setTransform(o.id, scale: s.scale * Float(g.scale)) }
        default:
            gestureStart = nil
        }
    }

    @objc private func handleRotation(_ g: UIRotationGestureRecognizer) {
        guard let o = manager.selected, o.state != .locked, o.surface == .floor else { return }
        switch g.state {
        case .began:
            manager.checkpoint()
            gestureStart = (o.rotationY, o.scale)
        case .changed:
            if let s = gestureStart { manager.setTransform(o.id, rotationY: s.rotation - Float(g.rotation)) }
        default:
            gestureStart = nil
        }
    }

    private func objectID(for entity: Entity) -> String? {
        var current: Entity? = entity
        while let e = current {
            if let id = pivotIDs[ObjectIdentifier(e)] { return id }
            current = e.parent
        }
        return nil
    }

    // MARK: - helpers

    private func defaultPosition() -> SIMD3<Float> {
        guard let t = arView.session.currentFrame?.camera.transform else { return SIMD3<Float>(0, -1.4, -1.5) }
        let forward = -SIMD3<Float>(t.columns.2.x, 0, t.columns.2.z)
        let dir = simd_length(forward) > 0.01 ? simd_normalize(forward) : SIMD3<Float>(0, 0, -1)
        return SIMD3<Float>(t.columns.3.x, t.columns.3.y - 1.4, t.columns.3.z) + dir * 1.5
    }

    private func scheduleWallHint(_ waiting: Bool) {
        wallHintTask?.cancel()
        wallHintDue = false
        guard waiting else { return }
        wallHintTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            if !Task.isCancelled { self?.wallHintDue = true }
        }
    }

    static func yawRotation(_ yaw: Float) -> simd_quatf {
        simd_quatf(angle: yaw, axis: SIMD3<Float>(0, 1, 0))
    }

    static func material(_ color: UIColor, opacity: Float) -> UnlitMaterial {
        var m = UnlitMaterial(color: color)
        m.blending = .transparent(opacity: .init(floatLiteral: opacity))
        return m
    }

    /// A flat rounded disc: lying on the floor (XZ plane) or on a wall (XY plane).
    static func disc(radius: Float, color: UIColor, opacity: Float, vertical: Bool) -> ModelEntity {
        let mesh: MeshResource = vertical
            ? .generatePlane(width: radius * 2, height: radius * 2, cornerRadius: radius)
            : .generatePlane(width: radius * 2, depth: radius * 2, cornerRadius: radius)
        let e = ModelEntity(mesh: mesh, materials: [material(color, opacity: opacity)])
        if vertical { e.position.z = 0.004 } else { e.position.y = 0.004 }
        return e
    }
}

/// ARSessionDelegate lives in a small non-isolated object; ARKit calls it on
/// the main queue (the session's default delegate queue), so it hops straight
/// onto the main actor.
private final class SessionDelegateProxy: NSObject, ARSessionDelegate {
    weak var owner: ARSceneController?

    init(owner: ARSceneController) {
        self.owner = owner
    }

    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let state = camera.trackingState
        MainActor.assumeIsolated { owner?.trackingChanged(state) }
    }

    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        MainActor.assumeIsolated { owner?.anchorsUpdated(anchors) }
    }

    func sessionWasInterrupted(_ session: ARSession) {
        MainActor.assumeIsolated { owner?.setInterrupted(true) }
    }

    func sessionInterruptionEnded(_ session: ARSession) {
        MainActor.assumeIsolated { owner?.setInterrupted(false) }
    }

    /// Let ARKit try to relocalize after an interruption so anchored objects return to their places.
    func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool { true }

    func session(_ session: ARSession, didFailWithError error: Error) {
        MainActor.assumeIsolated { owner?.failed(error) }
    }
}
