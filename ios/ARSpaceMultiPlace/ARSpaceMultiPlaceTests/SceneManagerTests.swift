import XCTest
import simd
@testable import ARSpaceMultiPlace

/// Scene-management logic for the iPhone app (mirrors the website's
/// tests/multiplace-walls-undo.test.js). These tests do not prove that ARKit
/// world tracking works; that needs a physical iPhone (see ios/README.md).
final class SceneManagerTests: XCTestCase {
    private func p(_ x: Float, _ z: Float, _ y: Float = 0) -> SIMD3<Float> { SIMD3(x, y, z) }

    func testLampChairTableScenario() {
        let m = SceneManager()
        let lamp = m.add("floor-lamp") // 1 place a lamp
        m.follow(p(0, -1.5))
        XCTAssertTrue(m.place(lamp.id, at: p(0, -1.5)))
        XCTAssertTrue(m.lock(lamp.id)) // 2 lock
        let chair = m.add("chair") // 3 add a chair
        XCTAssertEqual(m.object(lamp.id)?.state, .locked) // 4 lamp still exists
        XCTAssertTrue(m.place(chair.id, at: p(0.8, -1.6)))
        XCTAssertTrue(m.lock(chair.id)) // 5
        let table = m.add("coffee-table") // 6
        m.place(table.id, at: p(0.3, -0.8))
        m.lock(table.id)
        XCTAssertEqual(m.count, 3) // 7 all three coexist
        XCTAssertEqual(Set(m.objects.map(\.id)).count, 3)
        let before = m.objects.map(\.position)
        m.follow(p(9, 9)) // 8 reticle moves with no follower
        XCTAssertEqual(m.objects.map(\.position), before) // 9 locked transforms unchanged
        XCTAssertTrue(m.select(chair.id)) // 10
        XCTAssertTrue(m.unlock(chair.id)) // 11
        XCTAssertEqual(m.object(lamp.id)?.state, .locked)
        XCTAssertEqual(m.object(table.id)?.state, .locked)
        XCTAssertTrue(m.move(chair.id)) // 12
        XCTAssertTrue(m.place(chair.id, at: p(1.5, -2)))
        XCTAssertTrue(m.lock(chair.id)) // 13
        XCTAssertEqual(m.object(lamp.id)?.position, p(0, -1.5)) // 14
        XCTAssertEqual(m.object(table.id)?.position, p(0.3, -0.8))
        let lamp2 = m.duplicate(lamp.id, offset: 0.5) // 15
        XCTAssertNotNil(lamp2)
        XCTAssertNotEqual(lamp2?.id, lamp.id)
        XCTAssertEqual(lamp2?.state, .placed)
        XCTAssertTrue(m.remove(lamp.id)) // 16
        XCTAssertNotNil(m.object(lamp2!.id)) // 17
        XCTAssertEqual(m.clear().count, 3) // 20
    }

    func testLockedObjectsRejectEditsAndPreviewIsDiscardedOnSwitch() {
        let m = SceneManager()
        let a = m.add("chair")
        m.place(a.id, at: p(1, 1))
        m.lock(a.id)
        XCTAssertFalse(m.rotate(a.id, by: 0.3))
        XCTAssertFalse(m.setScale(a.id, 1.2))
        XCTAssertFalse(m.move(a.id))
        let preview = m.add("sofa")
        _ = m.add("plant") // switching product discards only the unplaced sofa preview
        XCTAssertNil(m.object(preview.id))
        XCTAssertEqual(m.object(a.id)?.state, .locked)
        XCTAssertEqual(m.objects.filter { $0.state.isFollowing }.count, 1)
    }

    func testWallItemsFaceOutOfTheWallAndCannotSpin() {
        let m = SceneManager()
        let w = m.add("barn-lamp", surface: .wall)
        m.follow(p(2, -1, 1.6), rotationY: -.pi / 2)
        XCTAssertEqual(m.object(w.id)!.rotationY, 3 * .pi / 2, accuracy: 1e-5)
        XCTAssertFalse(m.rotate(w.id, by: 0.2))
        m.place(w.id, at: p(0.2, -2, 1.6), rotationY: 0)
        XCTAssertEqual(m.object(w.id)!.rotationY, 0, accuracy: 1e-6)
        let dup = m.duplicate(w.id, offset: 0.4)!
        XCTAssertEqual(dup.surface, .wall)
        XCTAssertEqual(dup.position.y, 1.6, accuracy: 1e-6)
        XCTAssertEqual(dup.position.x, 0.6, accuracy: 1e-5)
        // a floor item ignores a wall yaw
        let c = m.add("chair")
        m.follow(p(1, 1), rotationY: 1.2)
        XCTAssertEqual(m.object(c.id)!.rotationY, 0)
    }

    func testUndoAndBoundedHistory() {
        let m = SceneManager()
        let a = m.add("chair")
        m.place(a.id, at: p(1, 1))
        m.lock(a.id)
        XCTAssertTrue(m.undo())
        XCTAssertEqual(m.object(a.id)?.state, .placed)
        m.remove(a.id)
        XCTAssertTrue(m.undo())
        XCTAssertNotNil(m.object(a.id))
        let d = m.duplicate(a.id)!
        m.undo()
        XCTAssertNil(m.object(d.id))
        XCTAssertNotEqual(m.duplicate(a.id)!.id, d.id) // IDs are never reused
        m.clear()
        m.undo()
        XCTAssertEqual(m.count, 2)
        for _ in 0..<(SceneManager.undoLimit + 5) { m.rotate(a.id, by: 0.1) }
        var n = 0
        while m.undo() { n += 1 }
        XCTAssertEqual(n, SceneManager.undoLimit)
        XCTAssertFalse(m.canUndo)
    }

    func testScaleIsClampedAndIDsArePerProduct() {
        let m = SceneManager()
        let a = m.add("stool", state: .placed)
        m.setScale(a.id, 9)
        XCTAssertEqual(m.object(a.id)?.scale, SceneManager.scaleRange.upperBound)
        m.setScale(a.id, 0.01)
        XCTAssertEqual(m.object(a.id)?.scale, SceneManager.scaleRange.lowerBound)
        XCTAssertEqual(a.id, "stool-001")
        XCTAssertEqual(m.add("stool", state: .placed).id, "stool-002")
        XCTAssertEqual(m.add("chair", state: .placed).id, "chair-001")
    }

    func testAnchorPoseMovesOnlyThatLockedObject() {
        let m = SceneManager()
        let a = m.add("chair", position: p(0, 0), state: .locked)
        let b = m.add("sofa", position: p(2, 0), state: .locked)
        m.applyAnchorPose(a.id, position: p(0.02, 0))
        XCTAssertEqual(m.object(a.id)?.position, p(0.02, 0))
        XCTAssertEqual(m.object(b.id)?.position, p(2, 0))
    }

    func testArrangementExportMatchesTheWebsiteFormat() throws {
        let m = SceneManager()
        m.add("chair", position: p(1, 1), state: .placed)
        m.add("wall-painting", surface: .wall, position: p(1, 0, 1.5), state: .locked)
        let json = try XCTUnwrap(m.arrangementJSON().data(using: .utf8))
        let doc = try XCTUnwrap(JSONSerialization.jsonObject(with: json) as? [String: Any])
        XCTAssertEqual(doc["kind"] as? String, "arspace-arrangement")
        XCTAssertEqual(doc["version"] as? Int, 1)
        let objs = try XCTUnwrap(doc["objects"] as? [[String: Any]])
        XCTAssertEqual(objs.count, 2)
        XCTAssertEqual(objs[1]["surface"] as? String, "wall")
        XCTAssertEqual((objs[1]["position"] as? [String: Double])?["y"] ?? 0, 1.5, accuracy: 1e-6)
    }
}

final class SurfaceClassifierTests: XCTestCase {
    /// A pose whose +Y axis is `n` (as on an ARKit plane raycast result).
    private func pose(normal n: SIMD3<Float>, at pos: SIMD3<Float>) -> simd_float4x4 {
        let y = simd_normalize(n)
        let ref: SIMD3<Float> = abs(y.y) < 0.9 ? SIMD3(0, 1, 0) : SIMD3(1, 0, 0)
        let x = simd_normalize(simd_cross(ref, y))
        let z = simd_cross(x, y)
        return simd_float4x4(SIMD4(x, 0), SIMD4(y, 0), SIMD4(z, 0), SIMD4(pos, 1))
    }

    func testFloorWallCeiling() {
        let floor = SurfaceClassifier.classify(pose(normal: SIMD3(0, 1, 0), at: SIMD3(0, -1.4, -1)), cameraPosition: .zero)
        XCTAssertEqual(floor.kind, .floor)
        XCTAssertTrue(floor.suits(.floor))
        XCTAssertFalse(floor.suits(.wall))
        let wall = SurfaceClassifier.classify(pose(normal: SIMD3(0, 0, 1), at: SIMD3(0, 0, -2)), cameraPosition: .zero)
        XCTAssertEqual(wall.kind, .wall)
        XCTAssertEqual(wall.yaw, 0, accuracy: 1e-5)
        XCTAssertTrue(wall.suits(.wall))
        let ceiling = SurfaceClassifier.classify(pose(normal: SIMD3(0, -1, 0), at: SIMD3(0, 1, 0)), cameraPosition: .zero)
        XCTAssertEqual(ceiling.kind, .other)
    }

    func testWallNormalIsFlippedTowardsTheCamera() {
        // a wall at x = 2 whose reported normal points away from the camera at the origin
        let hit = SurfaceClassifier.classify(pose(normal: SIMD3(1, 0, 0), at: SIMD3(2, 0, 0)), cameraPosition: .zero)
        XCTAssertEqual(hit.kind, .wall)
        XCTAssertEqual(hit.normal.x, -1, accuracy: 1e-5)
        XCTAssertEqual(hit.yaw, -.pi / 2, accuracy: 1e-5)
    }
}

final class CatalogTests: XCTestCase {
    func testBundledCatalogHasModelsAndThumbnails() throws {
        let catalog = try Catalog.load(from: Bundle(for: SceneManager.self))
        XCTAssertGreaterThanOrEqual(catalog.products.count, 15)
        XCTAssertEqual(Set(catalog.products.map(\.id)).count, catalog.products.count)
        XCTAssertTrue(catalog.products.contains { $0.placement == .wall })
        let bundle = Bundle(for: SceneManager.self)
        for p in catalog.products {
            XCTAssertNotNil(bundle.resource(p.model, in: "Models"), "\(p.model) missing")
            XCTAssertNotNil(bundle.resource(p.thumbnail, in: "Thumbnails"), "\(p.thumbnail) missing")
        }
        XCTAssertEqual(catalog.filtered(category: "lighting", query: "").map(\.category).allSatisfy { $0 == "lighting" }, true)
        XCTAssertEqual(catalog.filtered(category: "all", query: "clock").map(\.id), ["wall-clock"])
    }
}
