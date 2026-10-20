import Combine
import Foundation
import RealityKit

/// Loads each product's USDZ once and hands out independent clones. Clones
/// share mesh and material resources, so three chairs cost one download and
/// one set of GPU buffers. A failed load is not cached, so it can be retried.
@MainActor
final class ModelCache {
    struct Template {
        let entity: Entity
        let bounds: BoundingBox
    }

    private var templates: [String: Template] = [:]
    private var inFlight: [String: Task<Template, Error>] = [:]

    func template(for product: Product) async throws -> Template {
        if let t = templates[product.id] { return t }
        if let task = inFlight[product.id] { return try await task.value }
        let task = Task { @MainActor () throws -> Template in
            guard let url = Bundle.main.resource(product.model, in: "Models") else {
                throw ModelError.missing(product.model)
            }
            let entity = try await Self.loadEntity(url)
            entity.generateCollisionShapes(recursive: true) // for tap-to-select
            return Template(entity: entity, bounds: entity.visualBounds(relativeTo: nil))
        }
        inFlight[product.id] = task
        defer { inFlight[product.id] = nil }
        let t = try await task.value
        templates[product.id] = t
        return t
    }

    /// A new independent instance wrapped in a pivot entity.
    /// Floor items: the pivot is the floor point under the model's centre.
    /// Wall items: the pivot is the centre of the model's back; the model faces the pivot's +Z.
    func instance(of product: Product) async throws -> (pivot: Entity, size: SIMD3<Float>) {
        let t = try await template(for: product)
        let model = t.entity.clone(recursive: true)
        let b = t.bounds
        switch product.placement {
        case .floor:
            model.position = SIMD3<Float>(-b.center.x, -b.min.y, -b.center.z)
        case .wall:
            model.position = SIMD3<Float>(-b.center.x, -b.center.y, -b.min.z)
        }
        let pivot = Entity()
        pivot.name = product.id
        pivot.addChild(model)
        return (pivot, b.extents)
    }

    func removeAll() {
        inFlight.values.forEach { $0.cancel() }
        inFlight.removeAll()
        templates.removeAll()
    }

    private static func loadEntity(_ url: URL) async throws -> Entity {
        if #available(iOS 18.0, *) {
            return try await Entity(contentsOf: url)
        }
        return try await withCheckedThrowingContinuation { cont in
            var cancellable: AnyCancellable?
            cancellable = Entity.loadAsync(contentsOf: url).sink(
                receiveCompletion: { completion in
                    if case let .failure(error) = completion { cont.resume(throwing: error) }
                    cancellable = nil // break the retain cycle once loading has finished
                },
                receiveValue: { entity in
                    cont.resume(returning: entity)
                })
            _ = cancellable
        }
    }
}

enum ModelError: LocalizedError {
    case missing(String)

    var errorDescription: String? {
        switch self {
        case let .missing(name): return "\(name) is not in the app bundle."
        }
    }
}
