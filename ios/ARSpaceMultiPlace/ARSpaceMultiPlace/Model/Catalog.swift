import Foundation

/// Where an object goes: horizontal surfaces (floor, tabletop) or a wall.
enum PlacementSurface: String, Codable, Hashable {
    case floor
    case wall
}

/// Size in centimetres (width, depth, height), as in the website catalog.
struct Footprint: Codable, Hashable {
    let w: Double
    let d: Double
    let h: Double
}

struct ProductSource: Codable, Hashable {
    let name: String
    let license: String
}

struct CatalogCategory: Codable, Hashable, Identifiable {
    let id: String
    let label: String
}

/// One furniture item. Generated from the website's src/data/products.js by
/// tools/export-ios-catalog.mjs, so the website, SmartFit and this app share
/// the same products and dimensions.
struct Product: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let category: String
    let placement: PlacementSurface
    let floorStanding: Bool
    let footprint: Footprint
    let dimsSource: String
    let wallHeight: Double?
    let summary: String
    let source: ProductSource
    /// File name of the USDZ model in the app bundle.
    let model: String
    /// File name of the PNG thumbnail in the app bundle.
    let thumbnail: String

    var sizeLabel: String {
        "\(Int(footprint.w.rounded())) × \(Int(footprint.d.rounded())) × \(Int(footprint.h.rounded())) cm"
    }
}

extension Bundle {
    /// A bundled resource by file name, found at the bundle root (Xcode
    /// flattens group members) or inside its source folder.
    func resource(_ fileName: String, in folder: String? = nil) -> URL? {
        let name = (fileName as NSString).deletingPathExtension
        let ext = (fileName as NSString).pathExtension
        return url(forResource: name, withExtension: ext)
            ?? folder.flatMap { url(forResource: name, withExtension: ext, subdirectory: $0) }
    }
}

enum CatalogError: LocalizedError {
    case missingFile

    var errorDescription: String? { "catalog.json is missing from the app bundle." }
}

struct Catalog: Codable {
    let categories: [CatalogCategory]
    let products: [Product]

    static func load(from bundle: Bundle = .main) throws -> Catalog {
        guard let url = bundle.resource("catalog.json") else {
            throw CatalogError.missingFile
        }
        return try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: url))
    }

    func product(_ id: String) -> Product? {
        products.first { $0.id == id }
    }

    /// Products for the carousel: category filter ("all" for everything) and a free-text search.
    func filtered(category: String, query: String) -> [Product] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return products.filter { p in
            (category == "all" || p.category == category)
                && (q.isEmpty || p.name.lowercased().contains(q) || p.category.contains(q) || p.id.contains(q))
        }
    }
}
