import SwiftUI
import UIKit

/// The large horizontal furniture bar at the bottom of the AR camera view:
/// search, category chips, and a swipeable strip of thumbnails. Tapping an item
/// adds a new instance; "+ Add another" adds one more copy of the highlighted item.
struct FurnitureCarousel: View {
    let catalog: Catalog
    @Binding var category: String
    @Binding var query: String
    @Binding var highlighted: String?
    let onPick: (Product) -> Void

    @FocusState private var searchFocused: Bool

    init(catalog: Catalog, category: Binding<String>, query: Binding<String>, highlighted: Binding<String?>, onPick: @escaping (Product) -> Void) {
        self.catalog = catalog
        _category = category
        _query = query
        _highlighted = highlighted
        self.onPick = onPick
    }

    private var items: [Product] { catalog.filtered(category: category, query: query) }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                    TextField("Search furniture", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .focused($searchFocused)
                    if !query.isEmpty {
                        Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .foregroundStyle(Theme.muted)
                            .accessibilityLabel("Clear search")
                    }
                }
                .padding(.horizontal, 12).frame(height: 40)
                .background(Capsule().fill(Theme.bg.opacity(0.6)).overlay(Capsule().strokeBorder(.white.opacity(0.15))))
                if let id = highlighted, let p = catalog.product(id) {
                    Button { onPick(p) } label: { Text("+ Add another").font(.system(size: 14, weight: .semibold)) }
                        .buttonStyle(PillButtonStyle(kind: .ghost))
                        .accessibilityLabel("Add another \(p.name)")
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    chip("all", "All")
                    ForEach(catalog.categories) { chip($0.id, $0.label) }
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) {
                    if items.isEmpty {
                        Text("No furniture matches “\(query)”.").foregroundStyle(Theme.muted).frame(height: 120)
                    }
                    ForEach(items) { p in
                        Button {
                            searchFocused = false
                            onPick(p)
                        } label: {
                            card(p)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Add \(p.name)")
                        .accessibilityAddTraits(highlighted == p.id ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 2)
                .padding(.vertical, 2)
            }
            .frame(height: 124)
        }
    }

    private func chip(_ id: String, _ label: String) -> some View {
        Button {
            category = id
        } label: {
            Text(label).font(.system(size: 13, weight: .semibold))
                .padding(.horizontal, 14).frame(height: 32)
                .foregroundStyle(category == id ? Theme.text : Theme.muted)
                .background(Capsule().fill(category == id ? Theme.accent.opacity(0.25) : Theme.bg.opacity(0.5))
                    .overlay(Capsule().strokeBorder(category == id ? Theme.accent : .white.opacity(0.18))))
        }
        .buttonStyle(.plain)
    }

    private func card(_ p: Product) -> some View {
        let selected = highlighted == p.id
        return VStack(spacing: 4) {
            Thumbnail(name: p.thumbnail).frame(width: 72, height: 72)
            Text(p.name).font(.system(size: 12, weight: .semibold)).lineLimit(2).multilineTextAlignment(.center)
                .frame(height: 30)
            if p.placement == .wall {
                Text("Wall").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.accent2)
            }
        }
        .frame(width: 100, height: 118)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(selected ? Theme.accent.opacity(0.24) : Theme.surface.opacity(0.88)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(selected ? Theme.accent : .white.opacity(0.12), lineWidth: 1.5))
    }
}

/// Thumbnail PNG from the app bundle (decoded once and cached).
struct Thumbnail: View {
    let name: String
    private static let cache = NSCache<NSString, UIImage>()

    var body: some View {
        if let img = Self.image(name) {
            Image(uiImage: img).resizable().scaledToFit()
        } else {
            Image(systemName: "cube").resizable().scaledToFit().padding(16).foregroundStyle(Theme.muted)
        }
    }

    private static func image(_ name: String) -> UIImage? {
        if let img = cache.object(forKey: name as NSString) { return img }
        guard !name.isEmpty, let url = Bundle.main.resource(name, in: "Thumbnails"), let img = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(img, forKey: name as NSString)
        return img
    }
}
