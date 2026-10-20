import ARKit
import SwiftUI

@main
struct ARSpaceMultiPlaceApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}

/// Home screen → one live AR session → back home with a summary.
struct RootView: View {
    @State private var catalog: Catalog?
    @State private var loadError: String?
    @State private var controller: ARSceneController?
    @State private var lastSession: (count: Int, locked: Int, json: String)?

    var body: some View {
        ZStack {
            if let controller {
                MultiPlaceARView(controller: controller, manager: controller.manager) {
                    endSession(controller)
                }
                .transition(.opacity)
            } else {
                HomeView(catalog: catalog, loadError: loadError, lastSession: lastSession) {
                    startSession()
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: controller == nil)
        .task {
            do {
                catalog = try Catalog.load()
            } catch {
                loadError = error.localizedDescription
            }
        }
    }

    private func startSession() {
        guard let catalog, ARWorldTrackingConfiguration.isSupported, controller == nil else { return }
        let c = ARSceneController(catalog: catalog)
        controller = c
    }

    private func endSession(_ c: ARSceneController) {
        let m = c.manager
        lastSession = (m.placedCount, m.lockedCount, m.arrangementJSON())
        c.stop()
        m.reset()
        controller = nil
    }
}

struct HomeView: View {
    let catalog: Catalog?
    let loadError: String?
    let lastSession: (count: Int, locked: Int, json: String)?
    let onStart: () -> Void

    private var arSupported: Bool { ARWorldTrackingConfiguration.isSupported }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 8).fill(Theme.gradient).frame(width: 28, height: 28)
                    Text("ARSpace").font(.system(size: 22, weight: .bold))
                }
                .padding(.top, 24)
                Text("MultiPlace")
                    .font(.system(size: 40, weight: .heavy))
                    .foregroundStyle(Theme.gradient)
                Text("Place More. Lock Independently. Design Your Space.")
                    .font(.title3.weight(.semibold))
                Text("Add several pieces of furniture to one live camera session. Pick an item from the bar at the bottom, place it on the floor or a wall, lock it, and keep adding. Locked furniture stays where you put it while you walk around.")
                    .foregroundStyle(Theme.muted)

                if let loadError {
                    Label(loadError, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.danger)
                }
                if !arSupported {
                    Label("This device can't run ARKit world tracking (the iOS Simulator can't either). Run the app on an iPhone with an A12 chip or newer.", systemImage: "camera.metering.unknown")
                        .foregroundStyle(Theme.warn)
                }

                Button(action: onStart) {
                    Label("Start MultiPlace AR", systemImage: "arkit").frame(maxWidth: .infinity)
                }
                .buttonStyle(PillButtonStyle(kind: .primary))
                .disabled(catalog == nil || !arSupported)

                if let s = lastSession {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Last AR session: \(s.count) object\(s.count == 1 ? "" : "s") (\(s.locked) locked)")
                            .font(.headline)
                        Text("Objects don't come back in the same physical spots in a new session; that would need saved world maps, which this app doesn't use. Export keeps the arrangement (relative positions) for the website's 3D composer.")
                            .font(.footnote).foregroundStyle(Theme.muted)
                        ShareLink(item: s.json, preview: SharePreview("ARSpace arrangement")) {
                            Label("Export arrangement", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(PillButtonStyle(kind: .normal))
                    }
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Theme.surface))
                }

                if let catalog {
                    Text("\(catalog.products.count) pieces of furniture · \(catalog.products.filter { $0.placement == .wall }.count) for walls")
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
                Text("3D models: Khronos glTF Sample Assets (CC0 / CC BY 4.0) and ARSpace procedural models (CC0), converted to USDZ. Full credits in ATTRIBUTIONS.md.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .background(Theme.bg.ignoresSafeArea())
        .foregroundStyle(Theme.text)
    }
}
