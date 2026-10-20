import SwiftUI

/// "Objects in Room": every placed instance with Select, Lock/Unlock and Remove.
struct ObjectsPanel: View {
    @ObservedObject var controller: ARSceneController
    @ObservedObject var manager: SceneManager
    @Binding var isOpen: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Objects in Room (\(manager.count))").font(.headline)
                Spacer()
                Button { isOpen = false } label: { Image(systemName: "xmark") }
                    .buttonStyle(RoundIconButtonStyle())
                    .accessibilityLabel("Close objects panel")
            }
            if manager.objects.isEmpty {
                Text("No objects yet. Pick one from the furniture bar.").foregroundStyle(Theme.muted).font(.subheadline)
            }
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(manager.objects) { o in row(o) }
                }
            }
            HStack(spacing: 8) {
                Text("\(manager.lockedCount) locked").font(.footnote).foregroundStyle(Theme.muted)
                Spacer()
                ShareLink(item: manager.arrangementJSON(), preview: SharePreview("ARSpace arrangement")) {
                    Label("Export", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(PillButtonStyle(kind: .ghost))
                .disabled(manager.placedCount == 0)
            }
        }
        .padding(14)
        .frame(maxWidth: 380, maxHeight: 460)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.bg.opacity(0.94)))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.14)))
        .padding(.horizontal, 12)
        .padding(.top, 96)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
    }

    private func row(_ o: PlacedObject) -> some View {
        let p = controller.catalog.product(o.productID)
        let selected = manager.selectedID == o.id
        return HStack(spacing: 10) {
            Thumbnail(name: p?.thumbnail ?? "").frame(width: 40, height: 40)
            Button { manager.select(o.id) } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(p?.name ?? o.productID).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text("\(o.id) · \(o.state.label)\(o.surface == .wall ? " · wall" : "")")
                        .font(.caption).foregroundStyle(o.state == .locked ? Theme.ok : Theme.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            switch o.state {
            case .locked:
                Button("Unlock") { manager.unlock(o.id) }.buttonStyle(PillButtonStyle(kind: .ghost))
            case .placed:
                Button("Lock") { manager.lock(o.id) }.buttonStyle(PillButtonStyle(kind: .ghost))
            default:
                EmptyView()
            }
            Button { manager.remove(o.id) } label: { Image(systemName: "trash") }
                .buttonStyle(RoundIconButtonStyle())
                .foregroundStyle(Theme.danger)
                .accessibilityLabel("Remove \(o.id)")
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 14).fill(selected ? Theme.accent.opacity(0.2) : Theme.surface))
    }
}
