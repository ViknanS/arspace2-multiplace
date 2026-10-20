import Foundation
import simd

enum SurfaceKind: String {
    case floor
    case wall
    case other
}

/// A raycast hit under the screen centre, classified for placement.
struct SurfaceHit: Equatable {
    let kind: SurfaceKind
    let position: SIMD3<Float>
    /// Unit normal pointing out of the surface (towards the camera for walls).
    let normal: SIMD3<Float>
    /// Rotation about world Y that turns a model's +Z (its front) to face out of a wall.
    let yaw: Float
    let transform: simd_float4x4

    func suits(_ surface: PlacementSurface) -> Bool {
        surface == .wall ? kind == .wall : kind == .floor
    }
}

/// Pure maths, unit tested. ARKit raycast results on planes have their local
/// +Y axis along the plane normal.
enum SurfaceClassifier {
    static let floorMinUp: Float = 0.8 // cos ≈ 37°
    static let wallMaxUp: Float = 0.35 // within ~20° of vertical

    static func classify(_ transform: simd_float4x4, cameraPosition: SIMD3<Float>?) -> SurfaceHit {
        let position = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        var n = simd_normalize(SIMD3<Float>(transform.columns.1.x, transform.columns.1.y, transform.columns.1.z))
        let kind: SurfaceKind
        if n.y >= floorMinUp {
            kind = .floor
        } else if abs(n.y) <= wallMaxUp {
            kind = .wall
            // a wall's outward normal faces the viewer
            if let cam = cameraPosition, simd_dot(n, cam - position) < 0 { n = -n }
        } else {
            kind = .other
        }
        let yaw: Float = kind == .wall ? atan2(n.x, n.z) : 0
        return SurfaceHit(kind: kind, position: position, normal: n, yaw: yaw, transform: transform)
    }
}
