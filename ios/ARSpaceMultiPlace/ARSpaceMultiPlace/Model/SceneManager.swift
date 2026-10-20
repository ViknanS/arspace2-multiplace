import Combine
import Foundation
import simd

/// Life cycle of one placed object.
///  - preview: new, never placed; follows the raycast reticle
///  - placed:  standing at a position; editable (rotate, resize, move, lock)
///  - moving:  an existing object being repositioned; follows the reticle
///  - locked:  fixed in the world (ARAnchor); only Unlock or Remove change it
enum ObjectState: String, Codable, Hashable {
    case preview
    case placed
    case moving
    case locked

    var isFollowing: Bool { self == .preview || self == .moving }

    var label: String {
        switch self {
        case .preview: return "Placing"
        case .placed: return "Placed"
        case .moving: return "Moving"
        case .locked: return "Locked"
        }
    }
}

/// One independent furniture instance. Positions are metres in ARKit world
/// space; rotationY is radians about world Y. For a wall item, rotationY is
/// the direction the wall faces (the model's front looks along it).
struct PlacedObject: Identifiable, Codable, Equatable {
    let id: String // instance ID, e.g. "chair-002"
    let productID: String
    var surface: PlacementSurface
    var position: SIMD3<Float>
    var rotationY: Float
    var scale: Float
    var state: ObjectState
    var lastPosition: SIMD3<Float>
}

/// Pure scene data for MultiPlace (no RealityKit), mirroring the website's
/// src/multiplace/objectManager.js. The AR controller renders whatever this
/// holds; unit tests drive it directly.
final class SceneManager: ObservableObject {
    static let scaleRange: ClosedRange<Float> = 0.5...1.5
    static let undoLimit = 30

    @Published private(set) var objects: [PlacedObject] = []
    @Published private(set) var selectedID: String?
    @Published private(set) var canUndo = false

    private var counters: [String: Int] = [:]
    private var history: [(objects: [PlacedObject], selectedID: String?)] = [] {
        didSet { canUndo = !history.isEmpty }
    }

    // MARK: - queries

    var count: Int { objects.count }
    var selected: PlacedObject? { selectedID.flatMap { object($0) } }
    var follower: PlacedObject? { objects.first { $0.state.isFollowing } }
    var placedCount: Int { objects.filter { $0.state != .preview }.count }
    var lockedCount: Int { objects.filter { $0.state == .locked }.count }

    func object(_ id: String) -> PlacedObject? { objects.first { $0.id == id } }

    private func index(_ id: String) -> Int? { objects.firstIndex { $0.id == id } }

    // MARK: - helpers

    private func record() {
        history.append((objects, selectedID))
        if history.count > Self.undoLimit { history.removeFirst() }
    }

    private func nextID(_ productID: String) -> String {
        let n = (counters[productID] ?? 0) + 1
        counters[productID] = n
        return "\(productID)-\(String(format: "%03d", n))"
    }

    private static func normalized(_ r: Float) -> Float {
        let twoPi = Float.pi * 2
        let m = r.truncatingRemainder(dividingBy: twoPi)
        return m < 0 ? m + twoPi : m
    }

    /// Stop whatever follows the reticle: a preview is discarded, a moving
    /// object returns to where it was. Placed and locked objects are untouched.
    private func settleFollower() {
        guard let i = objects.firstIndex(where: { $0.state.isFollowing }) else { return }
        if objects[i].state == .preview {
            let id = objects[i].id
            objects.remove(at: i)
            if selectedID == id { selectedID = nil }
        } else {
            objects[i].position = objects[i].lastPosition
            objects[i].state = .placed
        }
    }

    // MARK: - commands

    /// Add a new instance. Every other object keeps its state and transform.
    @discardableResult
    func add(_ productID: String, surface: PlacementSurface = .floor, position: SIMD3<Float> = .zero,
             rotationY: Float = 0, scale: Float = 1, state: ObjectState = .preview) -> PlacedObject {
        settleFollower()
        record()
        let obj = PlacedObject(
            id: nextID(productID), productID: productID, surface: surface,
            position: position, rotationY: Self.normalized(rotationY),
            scale: min(max(scale, Self.scaleRange.lowerBound), Self.scaleRange.upperBound),
            state: state == .moving ? .preview : state, lastPosition: position)
        objects.append(obj)
        selectedID = obj.id
        return obj
    }

    @discardableResult
    func select(_ id: String?) -> Bool {
        if let id, index(id) == nil { return false }
        if let f = follower, f.id != id { settleFollower() }
        selectedID = id
        return true
    }

    /// Reticle update: only the follower moves. Wall items also take the wall's facing.
    func follow(_ position: SIMD3<Float>, rotationY: Float? = nil) {
        guard let i = objects.firstIndex(where: { $0.state.isFollowing }) else { return }
        objects[i].position = position
        if objects[i].surface == .wall, let r = rotationY { objects[i].rotationY = Self.normalized(r) }
    }

    @discardableResult
    func place(_ id: String, at position: SIMD3<Float>? = nil, rotationY: Float? = nil) -> Bool {
        guard let i = index(id), objects[i].state.isFollowing else { return false }
        record()
        if let p = position { objects[i].position = p }
        if objects[i].surface == .wall, let r = rotationY { objects[i].rotationY = Self.normalized(r) }
        objects[i].lastPosition = objects[i].position
        objects[i].state = .placed
        return true
    }

    @discardableResult
    func lock(_ id: String) -> Bool {
        guard let i = index(id), objects[i].state == .placed else { return false }
        record()
        objects[i].state = .locked
        return true
    }

    @discardableResult
    func unlock(_ id: String) -> Bool {
        guard let i = index(id), objects[i].state == .locked else { return false }
        record()
        objects[i].state = .placed
        return true
    }

    /// Pick a placed object up again. Locked objects must be unlocked first.
    @discardableResult
    func move(_ id: String) -> Bool {
        guard let i0 = index(id), objects[i0].state == .placed else { return false }
        if let f = follower, f.id != id { settleFollower() }
        guard let i = index(id) else { return false }
        record()
        objects[i].lastPosition = objects[i].position
        objects[i].state = .moving
        selectedID = id
        return true
    }

    func cancel() { settleFollower() }

    @discardableResult
    func rotate(_ id: String, by delta: Float) -> Bool {
        guard let i = index(id), objects[i].state != .locked, objects[i].surface == .floor else { return false }
        record()
        objects[i].rotationY = Self.normalized(objects[i].rotationY + delta)
        return true
    }

    @discardableResult
    func setScale(_ id: String, _ s: Float) -> Bool {
        guard let i = index(id), objects[i].state != .locked else { return false }
        let next = min(max(s, Self.scaleRange.lowerBound), Self.scaleRange.upperBound)
        guard next != objects[i].scale else { return false }
        record()
        objects[i].scale = next
        return true
    }

    /// Continuous edits (pinch, rotate gestures): call checkpoint() once at the start.
    func checkpoint() { record() }

    @discardableResult
    func setTransform(_ id: String, rotationY: Float? = nil, scale: Float? = nil) -> Bool {
        guard let i = index(id), objects[i].state != .locked else { return false }
        if let r = rotationY, objects[i].surface == .floor { objects[i].rotationY = Self.normalized(r) }
        if let s = scale { objects[i].scale = min(max(s, Self.scaleRange.lowerBound), Self.scaleRange.upperBound) }
        return true
    }

    @discardableResult
    func resetSize(_ id: String) -> Bool {
        guard let i = index(id), objects[i].state != .locked else { return false }
        record()
        objects[i].scale = 1
        if objects[i].surface == .floor { objects[i].rotationY = 0 }
        return true
    }

    /// Anchor refinement from ARKit for a locked object (never touches others).
    func applyAnchorPose(_ id: String, position: SIMD3<Float>) {
        guard let i = index(id), objects[i].state == .locked else { return }
        objects[i].position = position
        objects[i].lastPosition = position
    }

    /// A new, unlocked copy beside the original (to its right, along the floor or the wall).
    @discardableResult
    func duplicate(_ id: String, offset: Float = 0.4) -> PlacedObject? {
        guard let src = object(id), !src.state.isFollowing else { return nil }
        record()
        let right = SIMD3<Float>(cos(src.rotationY), 0, -sin(src.rotationY))
        let p = src.position + right * offset
        let copy = PlacedObject(id: nextID(src.productID), productID: src.productID, surface: src.surface,
                                position: p, rotationY: src.rotationY, scale: src.scale, state: .placed, lastPosition: p)
        objects.append(copy)
        selectedID = copy.id
        return copy
    }

    @discardableResult
    func remove(_ id: String) -> Bool {
        guard let i = index(id) else { return false }
        record()
        objects.remove(at: i)
        if selectedID == id { selectedID = nil }
        return true
    }

    @discardableResult
    func clear() -> [String] {
        let ids = objects.map(\.id)
        if !ids.isEmpty { record() }
        objects.removeAll()
        selectedID = nil
        return ids
    }

    /// Undo the last command. Instance IDs are never reused afterwards.
    @discardableResult
    func undo() -> Bool {
        guard let snap = history.popLast() else { return false }
        objects = snap.objects
        selectedID = snap.selectedID.flatMap { id in objects.contains { $0.id == id } ? id : nil }
        return true
    }

    /// Wipe everything including history (new AR session).
    func reset() {
        objects.removeAll()
        selectedID = nil
        history.removeAll()
    }

    // MARK: - export (same format as the website's arrangement files)

    func arrangementJSON() -> String {
        let placed = objects.filter { $0.state != .preview }
        let n = Float(max(placed.count, 1))
        let cx = placed.reduce(0) { $0 + $1.position.x } / n
        let cz = placed.reduce(0) { $0 + $1.position.z } / n
        let floorY = placed.filter { $0.surface == .floor }.map(\.position.y).min() ?? 0
        let r = { (v: Float) in (Double(v) * 1000).rounded() / 1000 }
        let items: [[String: Any]] = placed.map { o in
            [
                "instanceId": o.id, "productId": o.productID,
                "position": ["x": r(o.position.x - cx), "y": r(o.position.y - floorY), "z": r(o.position.z - cz)],
                "rotationY": r(o.rotationY), "scale": r(o.scale),
                "locked": o.state == .locked, "surface": o.surface.rawValue,
            ]
        }
        let doc: [String: Any] = [
            "kind": "arspace-arrangement", "version": 1, "source": "ios-ar", "planId": NSNull(),
            "units": "meters", "relativeTo": "group-centre",
            "createdAt": ISO8601DateFormatter().string(from: Date()), "objects": items,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: doc, options: [.prettyPrinted, .sortedKeys]) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }
}
