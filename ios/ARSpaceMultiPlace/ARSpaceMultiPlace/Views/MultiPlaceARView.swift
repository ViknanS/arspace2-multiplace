import RealityKit
import SwiftUI

/// Hosts the controller's ARView (the live camera) in SwiftUI.
struct ARViewContainer: UIViewRepresentable {
    let controller: ARSceneController

    func makeUIView(context: Context) -> ARView {
        controller.arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}

/// The MultiPlace camera screen: live AR camera first, SwiftUI controls over it.
///
/// TOP:    ARSpace MultiPlace · Tracking · Objects Placed · Exit AR
/// CENTER: live camera with every placed object
/// BOTTOM: selected object + its actions, the furniture carousel,
///         Objects in Room · Undo · Clear Room
struct MultiPlaceARView: View {
    @ObservedObject var controller: ARSceneController
    @ObservedObject var manager: SceneManager
    let onExit: () -> Void

    @State private var panelOpen = false
    @State private var confirmClear = false
    @State private var category = "all"
    @State private var query = ""
    @State private var highlighted: String?

    init(controller: ARSceneController, manager: SceneManager, onExit: @escaping () -> Void) {
        self.controller = controller
        self.manager = manager
        self.onExit = onExit
    }

    var body: some View {
        ZStack {
            ARViewContainer(controller: controller)
                .ignoresSafeArea()

            VStack(spacing: 8) {
                topBar
                statusPill
                if manager.count >= ARSceneController.performanceHintAt {
                    note("Many objects placed. Remove a few if the view stutters.")
                }
                Spacer(minLength: 0)
                bottomSheet
            }
            .padding(.horizontal, 12)
            .padding(.top, 6)

            if panelOpen {
                ObjectsPanel(controller: controller, manager: manager, isOpen: $panelOpen)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: panelOpen)
        .foregroundStyle(Theme.text)
        .onAppear { controller.start() }
        .onDisappear { controller.stop() }
        .confirmationDialog("Remove all \(manager.count) objects from the room?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Clear Room", role: .destructive) { controller.clearRoom() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Undo can bring them back.")
        }
    }

    // MARK: top

    private var topBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 6).fill(Theme.gradient).frame(width: 18, height: 18)
                    Text("ARSpace MultiPlace").font(.system(size: 15, weight: .bold)).lineLimit(1)
                }
                .padding(.horizontal, 12).frame(height: 40)
                .background(Capsule().fill(Theme.bg.opacity(0.72)))
                Spacer(minLength: 4)
                Button(action: onExit) {
                    Label("Exit AR", systemImage: "xmark")
                }
                .buttonStyle(PillButtonStyle(kind: .ghost))
                .accessibilityIdentifier("exit-ar")
            }
            HStack(spacing: 8) {
                stat(controller.tracking.label, color: controller.tracking.isGood ? Theme.ok : Theme.warn)
                stat("Objects Placed: \(manager.placedCount)", color: Theme.accent)
            }
        }
    }

    private func stat(_ text: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text).font(.system(size: 13, weight: .semibold)).lineLimit(1)
        }
        .padding(.horizontal, 10).frame(height: 28)
        .background(Capsule().fill(Theme.bg.opacity(0.72)))
    }

    private var statusPill: some View {
        Text(controller.statusText())
            .font(.system(size: 15, weight: .medium))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Capsule().fill(Theme.bg.opacity(0.78)).overlay(Capsule().strokeBorder(statusTone.opacity(0.7))))
            .frame(maxWidth: 420)
            .accessibilityIdentifier("status")
            .animation(nil, value: controller.statusText())
    }

    private var statusTone: Color {
        if !controller.tracking.isGood { return Theme.warn }
        if controller.canPlace || manager.selected?.state == .locked { return Theme.ok }
        return .white.opacity(0.2)
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.footnote).padding(.horizontal, 12).padding(.vertical, 6)
            .background(Capsule().fill(Theme.bg.opacity(0.6)))
    }

    // MARK: bottom

    private var bottomSheet: some View {
        VStack(spacing: 10) {
            selectedRow
            actionRow
            FurnitureCarousel(catalog: controller.catalog, category: $category, query: $query, highlighted: $highlighted) { product in
                highlighted = product.id
                controller.pick(product)
            }
            HStack(spacing: 8) {
                Button { panelOpen.toggle() } label: {
                    Label("Objects in Room (\(manager.count))", systemImage: "list.bullet")
                }
                .buttonStyle(PillButtonStyle(kind: .ghost))
                Button { controller.undo() } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                    .buttonStyle(PillButtonStyle(kind: .ghost))
                    .disabled(!manager.canUndo)
                Button { confirmClear = true } label: { Text("Clear Room") }
                    .buttonStyle(PillButtonStyle(kind: .danger))
                    .disabled(manager.count == 0)
            }
            .font(.system(size: 14))
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(.ultraThinMaterial))
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Theme.bg.opacity(0.55)))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(.white.opacity(0.12)))
        .environment(\.colorScheme, .dark)
        .padding(.bottom, 4)
    }

    private var selectedRow: some View {
        Group {
            if let o = manager.selected, let p = controller.catalog.product(o.productID) {
                HStack(spacing: 6) {
                    Text("Selected:").foregroundStyle(Theme.muted)
                    Text(p.name).fontWeight(.semibold)
                    Text("· \(o.id) · \(o.state.label)\(o.surface == .wall ? " · wall" : "")")
                        .foregroundStyle(Theme.muted).lineLimit(1)
                }
            } else {
                Text("Pick furniture below to add it to the room").foregroundStyle(Theme.muted)
            }
        }
        .font(.system(size: 14))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }

    @ViewBuilder private var actionRow: some View {
        if let o = manager.selected {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if o.state != .locked {
                        if o.surface == .floor {
                            Button { manager.rotate(o.id, by: .pi / 12) } label: { Image(systemName: "rotate.left") }
                                .buttonStyle(RoundIconButtonStyle()).accessibilityLabel("Rotate left 15 degrees")
                            Button { manager.rotate(o.id, by: -.pi / 12) } label: { Image(systemName: "rotate.right") }
                                .buttonStyle(RoundIconButtonStyle()).accessibilityLabel("Rotate right 15 degrees")
                        }
                        Button { manager.setScale(o.id, o.scale - 0.1) } label: { Image(systemName: "minus") }
                            .buttonStyle(RoundIconButtonStyle()).disabled(o.scale <= SceneManager.scaleRange.lowerBound + 0.001)
                            .accessibilityLabel("Smaller")
                        Text("\(Int((o.scale * 100).rounded()))%").font(.system(size: 14, weight: .semibold).monospacedDigit()).frame(minWidth: 44)
                        Button { manager.setScale(o.id, o.scale + 0.1) } label: { Image(systemName: "plus") }
                            .buttonStyle(RoundIconButtonStyle()).disabled(o.scale >= SceneManager.scaleRange.upperBound - 0.001)
                            .accessibilityLabel("Bigger")
                    }
                    switch o.state {
                    case .preview, .moving:
                        Button { controller.placeAndLock() } label: { Label("Place & Lock", systemImage: "lock.fill") }
                            .buttonStyle(PillButtonStyle(kind: .primary)).disabled(!controller.canPlace)
                        Button("Place") { controller.placeFollower() }
                            .buttonStyle(PillButtonStyle()).disabled(!controller.canPlace)
                        Button("Cancel") { manager.cancel() }.buttonStyle(PillButtonStyle(kind: .ghost))
                    case .placed:
                        Button { manager.lock(o.id) } label: { Label("Lock", systemImage: "lock.fill") }
                            .buttonStyle(PillButtonStyle(kind: .primary))
                        Button("Move") { controller.moveSelected() }.buttonStyle(PillButtonStyle())
                        Button("Duplicate") { controller.duplicateSelected() }.buttonStyle(PillButtonStyle())
                        Button("True size") { manager.resetSize(o.id) }.buttonStyle(PillButtonStyle(kind: .ghost))
                        Button(role: .destructive) { manager.remove(o.id) } label: { Label("Remove", systemImage: "trash") }
                            .buttonStyle(PillButtonStyle(kind: .danger))
                    case .locked:
                        Button { manager.unlock(o.id) } label: { Label("Unlock", systemImage: "lock.open") }
                            .buttonStyle(PillButtonStyle())
                        Button("Duplicate") { controller.duplicateSelected() }.buttonStyle(PillButtonStyle())
                        Button(role: .destructive) { manager.remove(o.id) } label: { Label("Remove", systemImage: "trash") }
                            .buttonStyle(PillButtonStyle(kind: .danger))
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }
}
