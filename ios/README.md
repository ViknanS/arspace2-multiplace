# ARSpace MultiPlace — native iPhone app

Several pieces of furniture in **one live ARKit camera session** on iPhone:
select Lamp → place → lock → select Chair → place → lock → select Table → place →
lock → walk around all three.

This is a separate **native iOS app** (Swift, SwiftUI, ARKit, RealityKit) that lives
in the same repository as the ARSpace website. It is needed because Safari on
iPhone has no WebXR AR, and AR Quick Look (what the website opens on iPhone)
shows one model per launch and doesn't let a web page add buttons or more
objects. The app **cannot run inside Safari** and **is not deployed by GitHub
Pages**; you build it with Xcode and install it on your own iPhone.

## Status

| Item | Status |
|---|---|
| Source code, Xcode project, shared scheme, unit tests | Written and included |
| USDZ models (21), thumbnails, shared catalog | Converted and validated (see below) |
| Swift syntax | Checked with a Swift parser (tree-sitter) — no syntax errors |
| **Compiled with Xcode / Swift compiler** | **Not yet.** It was written on Linux without Xcode. Expect to fix small compile errors, if any, on first build. |
| **Unit tests run (`xcodebuild test`)** | **Not yet** (needs Xcode) |
| **Tested on a physical iPhone** | **Not yet** — use the checklist below |

## Requirements

- A Mac with **Xcode 16 or newer** (the project uses Xcode 16's folder-synchronised groups).
- An **iPhone with an A12 Bionic chip or newer** (iPhone XS / XR or later) on **iOS 17 or newer**.
  ARKit world tracking does not run in the iOS Simulator; the simulator can run the unit tests only.
- An Apple ID added to Xcode (a free Personal Team is enough to install on your own phone).

## Open, sign and run on your iPhone

1. Open `ios/ARSpaceMultiPlace/ARSpaceMultiPlace.xcodeproj` in Xcode.
2. Select the **ARSpaceMultiPlace** target → **Signing & Capabilities**:
   - Team: choose your Apple ID / Personal Team.
   - Bundle Identifier: change `com.viknans.arspace.multiplace` to something unique to you if Xcode says it is taken (e.g. `com.<yourname>.arspace.multiplace`).
3. Connect the iPhone with a cable, unlock it, and trust the Mac. On iOS 16+, turn on
   **Settings → Privacy & Security → Developer Mode** (the phone restarts).
4. Choose your iPhone as the run destination and press **Run** (⌘R).
5. The first time, iOS may block the app: **Settings → General → VPN & Device Management →** trust your developer certificate. Run again.
6. Allow camera access when asked.

No signing files, certificates or provisioning profiles are stored in this repository, and none should be committed.

### Run the unit tests

In Xcode: **Product → Test** (⌘U) with an iPhone simulator selected, or:

```bash
cd ios/ARSpaceMultiPlace
xcodebuild test -scheme ARSpaceMultiPlace -destination 'platform=iOS Simulator,name=iPhone 16'
```

`SceneManagerTests` cover the scene logic (the lamp / chair / table scenario, locking,
unlock/move/re-lock, duplicate, delete, undo, wall placement maths, arrangement export) and
that every catalog item has a bundled USDZ model and thumbnail. They do **not** prove that
ARKit world tracking works — that needs a physical iPhone.

## How it works

| Part | File |
|---|---|
| App entry, home screen, session start/end | `ARSpaceMultiPlace/ARSpaceMultiPlaceApp.swift` |
| Shared catalog (generated from the website's `src/data/products.js`) | `catalog.json`, `Model/Catalog.swift` |
| Scene data: instances, IDs, lock state, duplicate, undo (pure, tested) | `Model/SceneManager.swift` |
| Floor / wall classification of raycast hits (pure, tested) | `Model/SurfaceClassifier.swift` |
| ARKit session, raycasting, entities, anchors, gestures | `AR/ARSceneController.swift` |
| USDZ loading, caching and cloning | `AR/ModelCache.swift` |
| Camera screen, bottom sheet, action buttons | `Views/MultiPlaceARView.swift` |
| Horizontal furniture carousel with search and categories | `Views/FurnitureCarousel.swift` |
| Objects in Room panel | `Views/ObjectsPanel.swift` |

- **One session.** `ARWorldTrackingConfiguration` with horizontal **and vertical** plane
  detection runs once; the furniture bar stays on screen, so the camera never closes while
  you add items. Nothing is ever parented to the camera.
- **Independent objects.** Each placed item is a `PlacedObject` (unique ID such as
  `chair-002`, product ID, position, rotation, scale, state, surface) with its own entity.
  Models are loaded once per product and **cloned** per instance.
- **Place & Lock.** Only the object being placed or moved follows the reticle (a
  `raycast` from the screen centre against detected planes, falling back to estimated
  planes). Locking adds an **`ARAnchor`** at the object's transform and attaches the
  object to an `AnchorEntity(anchor:)`, so ARKit keeps refining that object's pose as it
  learns the room. Unlocking removes only that object's anchor. Locked objects refuse
  rotate, resize and move.
- **Floor and wall.** Each catalog item has `placement: floor | wall`. Floor items need an
  upward-facing surface; wall items (Copper Barn Wall Light, Framed Wall Painting, Wall
  Clock) need a vertical plane and turn to face out of the wall. The status line says when
  the reticle is on the wrong kind of surface.
- **Selection and editing.** Tap an object (RealityKit collision hit-test) to select it,
  or use **Objects in Room**. Pinch resizes and two-finger twist rotates the selected
  unlocked object; buttons do the same in 15° / 10 % steps. Duplicate, Remove, Undo and
  Clear Room (with confirmation) are available.
- **Tracking loss.** The top bar shows `Tracking: Good / Limited / Lost` and the reason.
  After an interruption ARKit tries to relocalise so anchored objects return to their spots.
- **No persistence across sessions.** Objects don't come back at the same physical spots
  after you exit; that would need saved ARWorldMaps, which this app does not use. Export
  shares the arrangement (relative positions) in the same JSON format as the website, so it
  can be opened in the website's 3D composer.

## 3D models (USDZ)

RealityKit loads USD/USDZ, not glTF. Every model in `public/models/*.glb` is converted with
Blender's glTF importer and USD exporter (`pip install bpy`) by `tools/usdz/convert.py`:
Y-up, metres, UsdPreviewSurface materials, textures packed and limited to 2048 px.
`tools/usdz/validate.py` then checks each file with OpenUSD (`pip install usd-core`):
default prim, up axis, metres, only UsdPreviewSurface/UsdUVTexture shaders, PNG/JPEG
textures inside the package, OpenUSD's usdz/material/reference validators, and that the
size matches the glTF bounding box. Current result: **21 / 21 valid**.

Material notes: glTF extensions without a UsdPreviewSurface equivalent are simplified —
velvet sheen (chair, sofa, pouf) becomes a plain colour, transmissive glass becomes
alpha-blended glass, anisotropy and iridescence are dropped. Shapes and sizes are unchanged.

Regenerate everything after changing the catalog or models:

```bash
pip install bpy usd-core pillow   # once
npm run ios:assets                # catalog.json + thumbnails + USDZ + validation
```

## Physical iPhone test checklist

Record results in `DEVICE_TESTING.md` (rows I1–I14). Nothing below has been run yet.

1. App launches; camera permission prompt; coaching overlay appears.
2. Tracking reaches **Good**; the reticle appears on the floor.
3. Select **Floor Lamp** → **Place & Lock**.
4. Select **Modern Accent Chair** from the bar without leaving the camera → the lamp is still there.
5. Place & Lock the chair; select **Coffee Table** → Place & Lock. **Objects Placed: 3.**
6. Walk around all three: each stays at its own spot.
7. Tap the chair → **Unlock** → **Move** → new spot → **Place & Lock**; lamp and table unchanged.
8. Select the lamp → **Duplicate** → a second lamp appears beside it; remove one, the other stays.
9. Select **Framed Wall Painting**, aim at a wall → "Wall Found" → Place & Lock: it hangs flat on the wall.
10. Aim a wall item at the floor → the app asks for a wall and won't place it.
11. Pinch / twist an unlocked object; locked objects don't respond.
12. **Undo** after removing an object brings it back, still locked.
13. Press the side button (lock screen) and return: tracking recovers and objects return.
14. Exit AR → home shows "Last AR session: n objects"; Export shares the JSON.
