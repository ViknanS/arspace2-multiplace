# ARSpace

**Live Website: https://viknans.github.io/arspace2/**

### [▶ Launch ARSpace](https://viknans.github.io/arspace2/)

Clicking **Launch ARSpace** opens the actual deployed application, hosted on GitHub Pages over HTTPS. Open it on an AR-capable phone to place furniture in your room. This repository page shows the source code; the link above is the running app.

| | |
|---|---|
| Live app | https://viknans.github.io/arspace2/ |
| Source code | https://github.com/ViknanS/arspace2 |
| Deployment | GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`), on every push to `main` |

**An Interactive Augmented Reality Room and Object Visualization Application**

ARSpace is a responsive website where you pick a piece of furniture or decor, explore it as a real 3D model (rotate, zoom, recolour, resize the preview), and then place it in your own room through your phone's camera using genuine device AR: WebXR or Google Scene Viewer on Android, and AR Quick Look on iPhone/iPad. On computers and on phones without AR, the 3D viewer still works and the app explains why AR isn't available.

It also includes **SmartFit**, an intelligent furniture fit and walkability analyzer. You enter your room size, drag furniture onto a measured floor plan, and SmartFit reports pieces that overlap or stick out past a wall, checks whether a walking route of your chosen width remains from the door to the other side, and gives specific, measured suggestions such as "Rotating the bookshelf by 90° would remove the overlap with the desk".

Two further modules complete the pipeline:

- **Fix Position** — a custom WebXR AR mode (on browsers that support it) where you place furniture on your floor, lock it to that tracked spot, walk around it, unlock it to move it, or reset.
- **MultiPlace** — several furniture objects in **one** live AR session, each placed, locked, unlocked, moved, rotated, resized, duplicated or removed on its own, chosen from a large swipeable furniture bar inside the camera view. Floor items go on floors and tabletops; wall items (wall light, painting, clock) hang on detected walls. Undo, Clear Room and an Objects in Room panel are built in. Android uses custom WebXR in the browser; **iPhone uses a separate native app** (Swift, SwiftUI, ARKit, RealityKit) in [`ios/`](ios/README.md), because Safari has no WebXR AR. A camera-free 3D room composer works everywhere.
- **AutoGrid** — measure the room by capturing its four floor corners in AR (Android WebXR) or by typing the dimensions (any device), generate a proportional floor grid, and open the result in SmartFit. Plans can be saved, loaded, renamed, deleted, exported and imported.

**Room Measurement → Floor Grid → Furniture Arrangement → Collision Detection → Walkability Analysis → AR Preview → World-Locked Placement → Multi-Object Room Composition.**

The catalog has **21 real 3D models** across Seating, Tables, Storage, Lighting and Decor (9 from the Khronos glTF sample library, 12 procedural models built for this project), including 3 wall items. Every model also ships as a validated USDZ for the iPhone app.

It is a static site: no backend, no database, no paid service.

---

## Problem statement

Shoppers and homeowners struggle to picture how furniture and decor will look in their own space. Product photos show one fixed angle in someone else's room, and dimensions on a spec sheet are hard to imagine. People buy items that turn out too big, too small or the wrong style for the room.

## Objectives

1. Present home products as interactive 3D models instead of flat images.
2. Let users inspect each object from any angle, zoom in, change its finish and adjust its orientation and preview size.
3. Place the selected object in the user's real environment at true scale using device-supported AR.
4. Detect AR capability and give clear feedback and a fallback on devices that cannot run AR.
5. Deliver everything as a fast, free, statically hosted web app that works on desktop and mobile.
6. Go beyond appearance: check whether a room layout is physically practical (fit, collisions, walking space) using explainable geometry.
7. Measure the room in AR where the browser allows it, generate a proportional grid, and carry it into planning without re-typing.
8. Keep placed furniture world-locked in AR with explicit Fix, Unlock and Reset controls where the runtime supports custom WebXR.

## Features

| Feature | What it does |
|---|---|
| Home page | Hero with a live, rotatable 3D chair, "Explore collection" and "Try AR" actions, a live device-capability line, photo vs 3D vs AR explanation, How it works, featured objects. |
| 3D catalog | 6 real `.glb` models across Furniture, Lighting and Decor, each with name, category, rendered thumbnail, description, **View in 3D** and **View in AR**. |
| Filter + search | Category buttons and a name search work together; empty state with a clear action; filters are kept in the URL. |
| Product page | Large 3D viewer on the left; name, category, description, file format/size, real dimensions read from the model, controls and AR on the right. Single column on small screens. |
| 3D controls | Drag to orbit, scroll/pinch to zoom, auto-rotate toggle, rotation slider + ±45° buttons (model `orientation`), preview size slider 50–150 % (model `scale`), material variants (chair: 2, sofa: 5), Reset view. |
| Real AR | `ar-modes="webxr scene-viewer quick-look"`, floor placement, optional **Lock to true size** (`ar-scale="fixed"`). |
| AR button states | Model loading → Checking AR availability → View in my room / AR not supported here / Error. It never silently does nothing. |
| AR onboarding | Dismissible "How to place an object" guide before the first AR launch, with a "Don't show again" option. |
| Unsupported devices | Dialog explaining why AR isn't available, plus a QR code (on deployed desktop sites) to open the same object on a phone. |
| Custom GLB preview | Open your own `.glb` (validated by extension, `glTF` magic bytes, and a 50 MB limit) for local 3D preview. Never uploaded; blob URLs are revoked. AR is intentionally not offered for local files. |
| **SmartFit planner** | Room width/length in metres (1.5–15 m, validated), proportional top-down plan with optional 50 cm grid and metre labels, default 4 × 3 m demo room. |
| SmartFit furniture | Catalog chair, sofa and plant with footprints measured from their 3D models, plus 5 planning blocks (coffee table, side table, bookshelf, TV unit, desk) with clearly labelled demo sizes. All sizes editable. Add as many pieces as you like. |
| SmartFit placement | Drag to move (5 cm snap), rotate 90°, remove, reset arrangement, clear plan, 5 example layouts. Keyboard: arrows move, Shift+arrows 25 cm, R rotates, Delete removes. |
| Collision detection | Wall overhang per side and overlap depth between every pair, measured exactly; colliding pieces turn red, valid ones green. Checks whether a 90° rotation (optionally with the smallest nudge back inside) removes the problem. |
| Walkability analyzer | Draggable Entry and Destination markers; widest-route search on a 5 cm grid; reports Clear / Restricted / No path, draws the route and marks the narrowest point with its width. Clearance slider 45–150 cm (default 80 cm), labelled as a planning preference, not a regulation check. |
| Recommendations | Rule-based, each from a measurement: rotate, move by N cm in a direction, move away from the doorway, widen the narrowest point by N cm, which piece blocks the route, consider a smaller piece. No AI model is involved. |
| Results dashboard | Overall red/amber/green status, room size and area, total furniture footprint (union, no double counting), free floor area, collision count, walking-route status, issues and recommended adjustments. No score is shown, by design. |
| SmartFit ↔ AR | "Preview in AR" on every catalog item opens the existing AR flow. The page explains that AR is a visual preview and does not send room geometry back to SmartFit. |
| **Fix Position** (custom WebXR) | Shown only when `navigator.xr.isSessionSupported('immersive-ar')` is true. immersive-ar session with required `hit-test` and optional `dom-overlay`, `anchors`, `local-floor`. Real hit-test reticle; "Move your phone slowly to scan the floor." → "Surface Detected — Ready to Place." → Place Object (preview follows the reticle) → **Fix Position** → **Unlock Position** / **Reset Placement** / rotate ±45° / **Exit AR**. Uses a WebXR Anchor when granted, otherwise a fixed transform in the tracked reference space, and says which. Tracking loss pauses and resumes. Taps step through place → fix → unlock if DOM Overlay isn't granted. |
| Fix Position fallbacks | Android without custom WebXR keeps **View in my room** (model-viewer WebXR / Scene Viewer). iPhone keeps **AR Quick Look**. Both native viewers already keep objects where you place them; the page explains this instead of showing a fake button. |
| **AutoGrid** | New nav tab. **Scan With AR** (only when WebXR AR is available; otherwise a disabled explanation): capture four floor corners with a live distance readout, numbered world-space markers and edges, Undo Last Corner, Reset Scan, Finish Scan, Exit. **Enter Measurements** on every device. |
| AutoGrid measurement | Projection to the floor plane, edge lengths, width/length (averages of opposite walls), shoelace area, corner angles, height spread. Rejects duplicate corners, short edges, self-intersecting or out-of-order outlines, excessive height differences and implausible sizes. Non-rectangular rooms show the required warning with Retake / Edit dimensions / Confirm approximation; the measured outline stays on the preview. |
| AutoGrid grid | 25 / 50 / 100 cm spacing (default 50), partial edge cells hatched and described, show/hide, zoom in/out, pan when zoomed, reset view, edit dimensions, regenerate. Drawn in real centimetres, so a 5 × 3 m room is visibly wider than a 3 × 3 m one. |
| Shared room plan | One plan (schema v1, metres) is the source of truth for AutoGrid and SmartFit, kept in memory and mirrored to localStorage. Edits on either page show on the other. SmartFit uses the plan's grid spacing, can snap furniture edges to it, and keeps its 5 cm walkway grid independently. |
| Room plans | Save, Load, Rename, Delete, New plan, Export JSON, Import JSON. Validation on every read, confirmation before overwriting a different plan with the same name or discarding unsaved changes, corrupted data kept as a backup instead of erased, storage-full and blocked-storage messages. |
| **MultiPlace AR** (custom WebXR, Android) | One immersive-ar session, one three.js scene, many objects. Top bar: **ARSpace MultiPlace · Tracking · Objects Placed · Exit AR**. Bottom: a translucent sheet with the selected object, its actions, a large swipeable furniture bar (thumbnails, names, search, category chips, "+ Add another" for copies) and **Objects in Room · Undo · Clear Room**. Pick an item → it previews on the reticle → **Place & Lock** (or Place, then Lock). Pick more items without leaving AR; locked items stay put. Tap an object (raycast) or use the Objects in Room panel to select it, then **Unlock**, **Move**, rotate ±15°, resize 50–150 % (100 % = true size), **True size**, **Duplicate**, **Remove**. **Clear Room** needs a second tap; **Undo** reverses the last edit (including Clear Room). Each locked object gets its own WebXR anchor when the runtime grants anchors. |
| **Floor and wall placement** | Hit-test poses are classified by their surface normal: upward → floor/tabletop, near-horizontal → wall. Floor items follow only horizontal hits; wall items (Copper Barn Wall Light, Framed Wall Painting, Wall Clock) follow only vertical hits and turn to face out of the wall, and can't be spun into it. The status line says when the reticle is on the wrong kind of surface, and after 8 s without any wall it says wall placement may be unsupported on that phone. Product-page AR (model-viewer) also opens wall items with `ar-placement="wall"`. |
| **Native iPhone app** (`ios/`) | SwiftUI + ARKit + RealityKit: one `ARWorldTrackingConfiguration` session with horizontal and vertical plane detection, the same carousel / Place & Lock / per-object `ARAnchor` / unlock / move / duplicate / undo / wall-placement workflow, USDZ models converted from the same GLBs, and the same catalog (generated from `products.js`). Built and installed with Xcode; it does not run in Safari and is not deployed by GitHub Pages. See [ios/README.md](ios/README.md). |
| MultiPlace object model | Every instance has a unique ID (`chair-001`, `chair-002`…), its own position, rotation, scale and lock state. Only one object (a new preview or one being moved) ever follows the reticle. Switching products discards only an unplaced preview. A model that fails to load is removed without touching the rest. Models are cached and cloned per instance. |
| **3D room composer** | The same multi-object workflow without the camera, labelled as not AR: room sized from the shared plan, add from the picker, click to select, drag to move, lock/unlock, rotate, resize, remove, clear. Export/import arrangement JSON, send floor furniture to the SmartFit plan, load the plan's furniture back. Used on iPhone (Safari has no WebXR AR) and desktop. |
| Catalog | 21 products with ID, name, category, placement (floor / wall), model, thumbnail, width/depth/height, description, source and licence. The same data feeds the viewer, AR, SmartFit (14 floor-standing items), MultiPlace and the iPhone app (`npm run ios:catalog` exports it as `catalog.json`). |
| Error handling | Missing/corrupt model, slow network (message after 25 s), offline/online notices, GPU context loss, AR session failure or denied camera, unknown routes, rapid switching between objects. |
| Accessibility | Keyboard focus rings, skip link, ARIA states on toggles, `prefers-reduced-motion` respected (no auto-rotate, no animations). |

## Technology stack

- **Vite 6** (build tool and dev server), **vanilla JavaScript ES modules**, HTML5, CSS3
- **@google/model-viewer 4.1.0** (built on **three.js 0.172**) for 3D rendering and AR launch
- **glTF 2.0 binary (`.glb`)** models; iOS USDZ is generated on the fly by model-viewer from the GLB for AR Quick Look
- **Native iPhone app:** Swift 5, SwiftUI, ARKit (world tracking, plane detection, raycasting, `ARAnchor`), RealityKit (`ARView`, `AnchorEntity`, USDZ loading); USDZ files converted with Blender (`bpy`) and validated with OpenUSD (`usd-core`)
- **qrcode-generator** for the "open on your phone" QR code; **Inter** font (self-hosted); Lucide-style inline SVG icons

> Why model-viewer 4.1.0 and not the newest 4.4.0? In 4.2–4.4, changing `scale` or `orientation` outside an AR session throws an internal error (`ARRenderer.onUpdateScene`). 4.1.0 does not have that bug and supports every feature ARSpace uses. The version is pinned in `package.json`.

## System architecture

```
User Interface (Vite + vanilla JS, hash router)
        │
        ▼
Product Catalog (data/products.js, filter + search)
        │
        ▼
3D Model Viewer (<model-viewer>: WebGL rendering, PBR lighting, shadows, camera controls)
        │
        ▼
AR Compatibility Detection (model-viewer canActivateAR + platform checks)
        │
        ├── Android Chrome ──► WebXR (in-browser AR session) or Google Scene Viewer (ARCore)
        ├── iPhone / iPad ───► AR Quick Look (ARKit), USDZ generated from the GLB
        └── Other devices ───► 3D-only + explanation + QR code
        │
        ▼
Physical Environment Visualization (surface detection, anchoring, native gestures)
```

### Project structure

```
arspace/
├── index.html
├── package.json / package-lock.json
├── vite.config.js            base: './' so one build works on any static host
├── netlify.toml              build settings + correct .glb MIME type
├── vercel.json
├── public/
│   ├── favicon.svg
│   ├── models/               21 real .glb files (see ATTRIBUTIONS.md)
│   └── thumbs/               catalog thumbnails rendered from those models
├── src/
│   ├── main.js               hash router, page lifecycle, lazy-loads model-viewer
│   ├── styles/main.css       design tokens and all styles
│   ├── data/products.js      catalog data
│   ├── components/
│   │   ├── Navbar.js  Footer.js
│   │   ├── ProductCard.js  ProductCatalog.js
│   │   ├── ModelViewer.js    viewer + loading/progress/error/slow states
│   │   ├── ARGuide.js        AR launch, onboarding guide, unsupported dialog
│   │   └── PlanManager.js    save/load/rename/delete/new/export/import UI
│   ├── pages/
│   │   ├── Home.js  Product.js  Upload.js
│   │   ├── MultiPlace.js     MultiPlace page: AR launcher + 3D composer
│   │   ├── SmartFit.js       room planner UI (SVG plan, panels, dashboard)
│   │   └── AutoGrid.js       room measurement, grid preview, scan results
│   ├── ar/
│   │   ├── capability.js     WebXR immersive-ar detection + honest explanations
│   │   ├── xrCore.js         one shared WebXR session: renderer, hit test, reticle, cleanup
│   │   ├── placementState.js Fix Position state machine (pure, unit tested)
│   │   ├── placementSession.js  Fix Position UI, anchors / session-local locking
│   │   ├── measureSession.js AutoGrid corner capture in AR
│   │   └── multiPlaceSession.js MultiPlace AR: one session, many objects, per-object anchors
│   ├── multiplace/
│   │   ├── objectManager.js  PlacedObjectManager: instances, IDs, lock/unlock/move/remove (pure, tested)
│   │   ├── modelAssets.js    ModelAssetManager: cached loading + safe cloning
│   │   ├── ui.js             swipeable furniture bar (search, categories) + objects panel (AR and composer)
│   │   ├── surface.js        floor / wall classification of hit-test poses (pure, tested)
│   │   ├── composer.js       camera-free 3D room composer (three.js + OrbitControls)
│   │   └── arrangement.js    arrangement export/import (pure, tested)
│   ├── autogrid/
│   │   ├── roomGeometry.js   projection, distances, shoelace area, validation
│   │   ├── gridGenerator.js  grid cells, partial edges, snapping
│   │   ├── roomPlanState.js  shared plan schema, validation, cm↔m conversion, working-plan store
│   │   └── planStorage.js    saved plans library, export/import
│   ├── smartfit/
│   │   ├── geometry.js       rectangles, boundary/overlap checks, rotation fix, union area, walkway search
│   │   ├── analysis.js       issues, rule-based recommendations, metrics
│   │   └── catalog.js        SmartFit furniture, demo sizes, example layouts
│   └── utils/
│       ├── arSupport.js      platform + AR checks
│       ├── dom.js            toast, escaping, helpers
│       └── icons.js
├── tests/
│   ├── *.test.js             unit tests (npm test): geometry, placement, measurement, grid, storage, integration
│   └── browser/              Playwright suites (npm run test:browser) + xrmock.js WebXR stand-in
├── ios/                      native iPhone app (SwiftUI + ARKit + RealityKit), see ios/README.md
│   ├── README.md             build, sign, run, test; physical-device checklist
│   └── ARSpaceMultiPlace/
│       ├── ARSpaceMultiPlace.xcodeproj
│       ├── ARSpaceMultiPlace/        app sources, catalog.json, Models/*.usdz, Thumbnails/*.png
│       └── ARSpaceMultiPlaceTests/   XCTest unit tests
├── DEVICE_TESTING.md         Android / iPhone / desktop hands-on checklist
├── tools/                    procedural furniture generator (three.js → GLB), iOS catalog export,
│                             usdz/ (GLB → USDZ conversion, validation, thumbnails)
├── .github/workflows/deploy.yml  GitHub Pages deployment
├── README.md
├── ATTRIBUTIONS.md
└── PRESENTATION.md           abstract, demo script, viva questions
```

Each page receives an `AbortSignal`. When the route changes, the previous page's signal is aborted, which removes all its event listeners and timers, and its `<model-viewer>` is removed from the DOM so its GPU memory is released. This is what makes rapid switching between objects safe and prevents duplicate listeners.

## Application workflow

**Desktop:** Home → Explore collection → choose the chair → model loads with progress → rotate/zoom/recolour/resize → View in my room → dialog explains AR needs a phone and shows a QR code.

**Mobile with AR:** open the deployed https link → choose an object → preview in 3D → View in my room → guide (first time) → Start AR → phone opens WebXR / Scene Viewer / Quick Look → scan the floor → object is placed → move, rotate, pinch.

**Mobile without AR:** 3D viewer works normally; the AR button reads "AR not supported here" and explains why when tapped.

## SmartFit: how the geometry works

All units are centimetres on a top-down plan: x along the room width, y along its length. Each piece of furniture is an axis-aligned rectangle (its footprint) given by its centre, width, depth and a rotation of 0° or 90°. Rotating by 90° swaps width and depth.

**1. Boundary check.** For a footprint `[left, right] × [top, bottom]` in a room `W × L`, the overhang past each wall is `max(0, −left)`, `max(0, right − W)`, `max(0, −top)`, `max(0, bottom − L)`. The piece also gets tested for whether it could fit at all in either orientation (`w ≤ W and d ≤ L`, or rotated).

**2. Overlap check.** Two rectangles overlap when both `min(rightA, rightB) − max(leftA, leftB)` and `min(bottomA, bottomB) − max(topA, topB)` are positive. Those two numbers are the overlap width and depth; the smaller one is how far a piece must move to separate them, which is the number used in messages like "overlaps the coffee table by 15 cm". Touching edges are not an overlap. Every pair is checked (O(n²), trivial for room-sized n).

**3. Rotation fix.** For a piece with a problem, SmartFit rotates it 90° about its centre and re-runs both checks. If that fails, it also tries the rotated piece nudged back inside the walls by the minimum distance. If either is valid, it recommends the rotation.

**4. Free area.** Total footprint is the exact area of the *union* of all rectangles clipped to the room, found by coordinate compression (split the room at every rectangle edge, add up covered cells), so overlapping pieces are not counted twice.

**5. Walkability.** The room is split into 5 cm cells. For every cell centre, the distance to the nearest obstacle (wall or footprint) is computed; a person passing through that cell has a passage about `2 × distance` wide. A *widest-path* search (Dijkstra that maximises the smallest distance along the route, using a binary max-heap and 8-way moves without corner cutting) finds the route from Entry to Destination whose narrowest point is as wide as possible. That bottleneck width decides the status:

| Bottleneck width | Status |
|---|---|
| ≥ your clearance (default 80 cm) | Clear path available |
| ≥ 45 cm but below your clearance | Restricted pathway (narrowest point marked) |
| < 45 cm, or a marker inside furniture | No path available |

The drawn route is the shortest A* path through cells that are wide enough, then straightened wherever a straight segment keeps the same clearance. The 45 cm floor is a stated planning assumption (roughly shoulder width), not a standard.

**6. Recommendations** are plain if/then rules on these measurements. For a blocked route, SmartFit runs "what-if" analyses (rotate each piece, or take each piece away) and names the pieces whose move would open a route.

---

## Fix Position: how world-locked AR works

**Runtimes.** ARSpace now has two AR paths:

| Path | Where | Who controls placement |
|---|---|---|
| **View in my room** | `<model-viewer>` with `ar-modes="webxr scene-viewer quick-look"` | The native viewer (model-viewer's WebXR mode, Google Scene Viewer / ARCore, Apple AR Quick Look / ARKit). These already keep the object where you place it; they don't accept extra buttons from the web page. |
| **Fix Position** | ARSpace's own WebXR session (`src/ar/`) | ARSpace: reticle, Place, Fix, Unlock, Reset, rotate, Exit, via WebXR DOM Overlay. |

**Session.** `navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'anchors', 'local-floor'] })` from the button's click. three.js renders in XR mode. The reference space is `local-floor` when granted, otherwise `local`: both are metres, Y up, gravity aligned and tracked by the device. A hit-test source from the `viewer` space gives the floor point under the screen centre every frame; that pose drives the reticle.

**States.** `initializing → scanning ⇄ surface → preview → fixed ⇄ repositioning`, plus `tracking-limited` (entered when the viewer pose is missing or `emulatedPosition`, resumes the previous state), `unsupported`, `error`, `ended`. Buttons are enabled from the state (`allowedActions`). Fix requires a current hit result.

**Locking.** On Fix, the object's transform is taken from the current hit pose (position) plus the user's yaw, at scale 1 (true size from the GLB).
- If the runtime granted **anchors**, `hitTestResult.createAnchor()` creates an `XRAnchor`; every frame the object is moved to `frame.getPose(anchor.anchorSpace, refSpace)`. The runtime can refine anchors as its map improves.
- Otherwise the object keeps a fixed matrix in the tracked reference space (**session-local placement**). It still stays put as you walk because the space itself is tracked; it just doesn't get anchor corrections.
After Fix, new reticle positions are ignored; nothing is camera-relative. Unlock deletes the anchor and lets the object follow the reticle again without restarting the session. Reset deletes the anchor, hides the object and returns to scanning. Exit or a system-ended session releases the hit-test source, anchors, GPU resources and the overlay. Only one session can run at a time.

**Model handling.** The GLB is loaded with three.js `GLTFLoader` while you scan. Its bounding box puts the base at y = 0 and centres it, so it stands on the floor point. A soft contact shadow is added. Material variants chosen on the product page are not carried into this mode.

## MultiPlace: multi-object AR

**Why it's different from launching AR several times.** Scene Viewer and AR Quick Look show one model per launch. MultiPlace keeps **one** WebXR session and **one** three.js scene and adds objects to it, so earlier furniture is still there when you add the next piece.

| Role | Module |
|---|---|
| ModelAssetManager | `multiplace/modelAssets.js` — loads each GLB once (cache), clones per instance with `SkeletonUtils.clone`, floor-centres the pivot, per-instance selection ring and contact shadow, disposal |
| PlacedObjectManager | `multiplace/objectManager.js` — a `Map` of instances with unique IDs and per-object `position`, `rotationY`, `scale`, `state` (`preview` / `placed` / `moving` / `locked`); pure and unit tested |
| ARPlacementManager | `ar/multiPlaceSession.js` on top of `ar/xrCore.js` — session, hit test, reticle, follower updates, per-object anchors, tracking state, raycast selection |
| ARObjectPicker + ARSceneUI | `multiplace/ui.js` and the overlay in `multiPlaceSession.js` — picker, category chips, selected-object controls, objects panel, status |

**Per-object locking.** Lock sets that instance's state to `locked`. If anchors are granted, ARSpace calls `frame.createAnchor(XRRigidTransform, referenceSpace)` at the object's pose on the next frame and stores the anchor under that instance ID; each frame, `frame.getPose(anchor.anchorSpace, refSpace)` updates only that object. Otherwise the object keeps its transform in the tracked reference space. Unlock, Move, Remove and Clear delete only the affected anchors. Locked objects refuse rotate, resize and move until unlocked.

**Selection.** A screen tap that isn't on a button arrives as a WebXR `select` event. Its target ray (`event.frame.getPose(inputSource.targetRaySpace, refSpace)`) is raycast against the placed objects; the nearest hit is selected. If nothing is hit, the tap places the object that is following the reticle.

**Floor and wall surfaces.** A WebXR hit-test pose has its +Y axis along the detected surface's normal. `multiplace/surface.js` classifies it: normal.y ≥ 0.8 → floor/tabletop, |normal.y| ≤ 0.35 → wall. A wall item's yaw is `atan2(n.x, n.z)`, so its front (+Z) faces out of the wall; its pivot is the centre of its back, so it sits flush. Chrome on ARCore phones is expected to report vertical planes to WebXR hit testing, but this depends on the phone and is **not yet verified on a device** — if a phone never reports a wall, the app says wall placement may be unsupported there.

**Duplicate and Undo.** Duplicate copies the selected object as a new, unlocked instance beside it (to its right along the floor or the wall). Every editing command stores a snapshot first (up to 30); Undo restores the previous snapshot and rebuilds only the objects that changed, re-anchoring any that are locked again. Instance IDs are never reused.

**Without DOM Overlay** the picker can't be shown inside AR, so taps cycle: place → lock → add another of the product chosen before starting.

**Arrangements.** When a session ends, the placed objects are kept as an arrangement (product IDs, instance IDs, positions relative to the group centre, rotations, scales, lock flags) that can be exported as JSON or opened in the 3D composer. Reopening AR does not restore objects to the same physical spots; that would need relocalisation, which isn't implemented.

**iPhone.** Safari doesn't provide WebXR AR, and AR Quick Look displays one model per launch with no way for a web page to add buttons or more models — so ARSpace does not try to modify Quick Look. Genuine multi-object AR on iPhone is the separate **native app** in [`ios/`](ios/README.md): SwiftUI controls over a RealityKit `ARView`, one ARKit world-tracking session with horizontal and vertical plane detection, raycast placement, a per-object `ARAnchor` on lock, and the same carousel, Place & Lock, Unlock/Move, Duplicate, Undo and wall placement. It is built and installed with Xcode; it is not a website. In Safari, iPhone still gets the 3D room composer (labelled as not camera AR) and single-object Quick Look.

## AutoGrid: measurement and grid

**Capture.** Each Capture Corner stores the hit-test position (x, y, z) in the tracked reference space. Markers and edges are drawn at those world positions so they stay on the floor while you move.

**Floor projection.** Room size is horizontal, so each point is projected to (x, z). The vertical values are only used for a level check: a spread over 15 cm is rejected, 5–15 cm gives a warning.

**Measurements.** Edge lengths are Euclidean distances between consecutive projected corners. Width = average of edges 1→2 and 3→4; length = average of edges 2→3 and 4→1. Area uses the shoelace formula on the actual outline: A = ½ |Σ (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)|. Corner angles come from the dot product of adjacent edges.

**Validation.** Exactly four finite points; no two within 15 cm; no edge under 50 cm; outline must not self-intersect (segment intersection test on opposite edges) and must turn the same way at every corner (convex, i.e. captured in order); area at least 1 m²; width and length within 1.5–15 m. Rectangular if every angle is within 90° ± 10° and opposite sides agree within 10 % (or 15 cm). Otherwise ARSpace says the room does not closely match a rectangle and offers Retake, Edit dimensions or Confirm approximation. It never silently squares an irregular room: the measured outline stays visible on the preview.

**Grid.** For width W, length L and spacing s: full columns = ⌊W/s⌋, plus one partial column of width W − ⌊W/s⌋·s if that is not zero (same for rows). 4 × 3 m at 50 cm gives 8 × 6 = 48 cells; 4.30 × 3.55 m gives 9 × 8 = 72 cells including a 30 cm partial column and a 5 cm partial row.

**Hand-off to SmartFit.** AutoGrid writes the dimensions (and scan metadata) into the shared room plan; SmartFit reads the same plan, so nothing is re-typed. SmartFit's walkway search keeps its own 5 cm grid regardless of the visual grid.

**Walkway threshold edge case.** The minimum passable width is `min(45 cm, clearance)`. With the slider's 45 cm minimum the Restricted band simply disappears (Clear or No path); if a clearance below 45 cm is ever supplied, the floor drops with it so the classification can't invert. This is covered by a unit test.

**Not done (by design).** SmartFit coordinates are not registered to a new AR session, so a chair at (2 m, 1 m) on the plan does not automatically appear at that floor spot in AR. That would need spatial registration between the plan and the session.

## Run it on your Mac (macOS, Apple Silicon)

### 1. Check Node.js and npm

```bash
node -v    # needs v18.18 or newer (v20 or v22 recommended)
npm -v
```

If `node` isn't found, install the LTS version from https://nodejs.org (free), or with Homebrew: `brew install node`.

### 2. Install dependencies

```bash
cd ~/Downloads/arspace     # wherever you unzipped the project
npm install
```

### 3. Start the development server

```bash
npm run dev
```

### 4. Open it

Open **http://localhost:5173** in Safari or Chrome. The terminal also prints a `Network:` address such as `http://192.168.1.20:5173` that other devices on the same Wi‑Fi can open.

### 5. Run the tests

```bash
npm test                 # 73 unit tests, no browser needed
```

Optional browser suites (need Python 3 and Playwright, and `npm run dev` running in another terminal):

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:browser
```

### 6. Production build

```bash
npm run build      # outputs the static site to dist/
npm run preview    # serves dist/ at http://localhost:4173 to check it
```

## Deploy (free)

AR on phones needs a public **https** address: WebXR only runs in secure contexts, and Scene Viewer downloads the model from a URL the phone itself must be able to reach. A free static host is the simplest way to get one.

### Netlify (recommended)

**Option A, drag and drop (no account setup beyond sign-in):**
1. Run `npm run build`.
2. Go to https://app.netlify.com/drop and drag the `dist` folder onto the page.
3. Netlify gives you an `https://<name>.netlify.app` link.

**Option B, from GitHub (auto-deploys on every push):**
1. Push the project to a GitHub repository.
2. Netlify → Add new site → Import an existing project → pick the repo.
3. Build command: `npm run build` · Publish directory: `dist` (already set in `netlify.toml`).

**Option C, CLI:**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=dist
```

### GitHub Pages (this repository's live site)

The workflow in `.github/workflows/deploy.yml` runs on every push to `main`: `npm ci` → `npm test` → `npm run build` with `BASE_PATH=/arspace/` → uploads `dist` → deploys with the official Pages actions. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Local development and other hosts are unaffected because the base path is only set inside the workflow.

### Vercel
Import the GitHub repo at https://vercel.com/new. `vercel.json` already sets the build command and `dist` output.



## Test AR on a phone

1. Deploy (above) and open the **https** link on the phone. On the desktop site, the "AR not supported" dialog shows a QR code you can scan.
2. **Android:** use Chrome on an [ARCore-supported phone](https://developers.google.com/ar/devices) with *Google Play Services for AR* installed and up to date.
3. **iPhone / iPad:** use Safari on iOS 12 or newer (an A9 chip or later).
4. Open an object → **View in my room** → **Start AR**, allow camera access, then move the phone slowly over a well-lit, textured floor.
5. If AR fails, ARSpace shows a message; check camera permission and that the AR service is installed.
6. **Fix Position (Android Chrome):** on a product page, tap **Place with Fix Position** → Place Object → Fix Position, then walk around the object. Try Unlock, Reset and Exit.
7. **AutoGrid scan (Android Chrome):** open **AutoGrid** → **Start Scan**, capture the four floor corners in order around the room, **Finish Scan**, review the numbers, then **Use these measurements** and **Open in SmartFit**.

The full hands-on checklist is in [DEVICE_TESTING.md](DEVICE_TESTING.md).

Testing over `http://<your-Mac-IP>:5173` from a phone is not reliable for AR: WebXR is blocked on non-https pages, and Scene Viewer may refuse to load the model. Use the deployed https link.

## Device and browser compatibility

| Device / browser | 3D viewer | View in my room | Fix Position | MultiPlace AR | 3D composer | AutoGrid scan | AutoGrid manual + SmartFit |
|---|---|---|---|---|---|---|---|
| macOS / Windows / Linux browsers | Yes | No — explained, QR code to phone | No — explained | No — explained | Yes | No — explained | Yes |
| Android Chrome, ARCore device, https | Yes | WebXR or Scene Viewer | Yes, if `immersive-ar` is reported | Yes, if `immersive-ar` is reported | Yes | Yes, if `immersive-ar` + hit test | Yes |
| Android, other browsers | Yes | Scene Viewer if supported | Only with WebXR AR | Only with WebXR AR | Yes | Same | Yes |
| iPhone / iPad Safari | Yes | AR Quick Look (one model per launch) | No — explained | No — explained; native app instead | Yes | No — explained | Yes |
| iPhone XS / XR or newer, iOS 17+, **native ARSpace MultiPlace app** (Xcode build) | — | — | — | Yes: ARKit, floor + wall (not yet device-tested) | — | — | — |
| Any page over plain http (not localhost) | Yes | Limited | No (WebXR needs https) | No | Yes | No | Yes |

## Testing performed

Run in this environment on the final code. "Mocked WebXR" means the suites replace `navigator.xr` with a scripted stand-in (`tests/browser/xrmock.js`) that returns controlled hit-test poses, anchors and tracking states. That exercises ARSpace's own logic end to end in a real browser (three.js XR rendering path, state machine, overlay, anchors, cleanup), but it is **not** a real phone.

| Command / suite | Result |
|---|---|
| `npm install`, `npm run build`, `npm run dev`, `npm run preview` | Passed |
| `npm test` — 80 unit tests: SmartFit geometry (13), Fix Position state machine (11), measurement geometry (13), grid generation (7), plan storage (11), AutoGrid→SmartFit integration (5), MultiPlace object manager + arrangement + catalog (13, incl. the 16-step lamp/chair/table scenario, unique IDs, every GLB present and valid, no duplicate model files), MultiPlace walls / duplicate / undo (7: the 20-step acceptance scenario at data level, floor/wall/ceiling classification and wall yaw, wall items can't spin, wall duplicate slides along the wall, undo of every command incl. clear, bounded history, wall items keep height in arrangements, wall GLBs face +Z with their back at z = 0, every product has a USDZ twin, iOS catalog in sync with the website catalog) | **80 / 80 passed** |
| Browser: original ARSpace features (home, catalog of 21, filters, search, models, viewer controls, reset, variants, AR attributes, desktop AR dialog, Android Scene Viewer intent, errors, quick switching, upload) | 42 / 44 (the two emulated touch-rotation checks, below) |
| Browser: SmartFit (all previous checks + emulated touch drag of furniture + page scroll from empty floor) | **34 / 34 passed** |
| Browser: Fix Position, mocked WebXR (button gating, session features requested, scanning/surface messages, place disabled without surface, preview follows reticle, Fix creates anchor, object ignores later reticle and camera movement, follows anchor updates, tracking loss and recovery, rotate, Unlock releases anchor, re-fix, Reset, Exit cleanup, second session, system-ended session, no-anchor session-local mode, tap fallback without DOM Overlay, permission denied, hit test unsupported, desktop and iPhone explanations) | **30 / 30 passed** |
| Browser: AutoGrid + plans + scan, mocked WebXR (grid counts for 25/50/100 cm, partial cells, proportional drawing, invalid input, zoom/pan/reset, grid toggle, hand-off to SmartFit, furniture/rotation/snap on generated plan, SmartFit edits sync back, save/new/load/rename/delete, export/import, broken import, reload persistence, corrupted storage recovery, corner capture with duplicate rejection, live readout, undo, reset, exit, rectangular/irregular/invalid scans, AR result to SmartFit, iPhone manual flow, mobile overflow) | **52 / 52 passed** |
| Browser: MultiPlace — desktop composer (picker scroll, filters and search, three locked objects, unlock/drag only one, locked drag refused, remove, unique second lamp, scale clamp, export/import, send to and load from SmartFit, failed model isolation, clear + undo, wall painting on a wall at 1.5 m, wall item can't spin, duplicate + undo) and **mocked WebXR, the 20-step acceptance scenario**: lamp place + lock, chair from the in-AR carousel without restarting, Place & Lock, table, three locked objects with three anchors, camera + reticle movement leave all three in place, anchor correction moves one, tap-select the chair, unlock only it, move, re-lock, lamp and table unaffected, duplicate the lamp, delete one lamp (copy stays), undo re-anchors it, wall lamp refused over the floor and placed on a vertical hit facing out of the wall, carousel search / no match / horizontal scroll / highlight / "+ Add another", tap-to-place, failed model, two-tap Clear Room, exit removes overlay, canvas, hit-test source and every anchor; no-DOM-overlay fallback; iPhone explanation pointing to the native app + composer | **82 / 82 passed** |
| iOS USDZ models — `npm run ios:validate` (OpenUSD: default prim, Y-up, metres, UsdPreviewSurface-only shaders, packaged PNG/JPEG textures, usdz/material/reference validators, size equals the glTF size), plus a visual check of re-imported renders | **21 / 21 valid** |
| iOS Swift sources — syntax check with tree-sitter-swift (11 files) | No syntax errors. **Not compiled**: no Xcode or Swift compiler in this environment |
| iOS XCTest suite (`SceneManagerTests`, `SurfaceClassifierTests`, `CatalogTests`) and Xcode build | **Not run — needs Xcode on a Mac.** See ios/README.md |
| Touch rotation of the 3D viewer | **Flaky in emulation** — headless Chrome cancels synthetic touches on model-viewer; check on a real phone. Furniture touch-drag in SmartFit is now verified in emulation. |
| **Real-device AR (View in my room, Fix Position, MultiPlace, AutoGrid scan) on Android** | **Pending — requires a compatible phone.** See DEVICE_TESTING.md. |
| **iPhone AR Quick Look and touch interaction** | **Pending — requires a real iPhone/iPad.** |
| **Native iPhone MultiPlace app (I1–I14)** | **Pending — requires Xcode and an iPhone (A12 or newer).** |
| **Wall placement on a real Android phone (M17–M19)** | **Pending — depends on the phone reporting vertical planes to WebXR.** |
| Measurement accuracy against a tape measure | **Pending — physical test.** |

## Known limitations

- AR works only on AR-capable phones and tablets, not on laptops or desktops.
- Scene Viewer and AR Quick Look are separate native screens: ARSpace's sliders, buttons and variant chips are not visible inside them.
- Preview size and rotation sliders change the on-screen preview. In WebXR they carry into AR; Scene Viewer always opens the original file, so it shows the default finish, size and orientation.
- Product-page AR places floor items on horizontal surfaces and wall items (wall light, painting, clock) on walls via model-viewer's `ar-placement="wall"`; how well walls are detected depends on the phone.
- Surface detection depends on the phone, lighting and surface texture; plain, white or glossy floors may not be detected.
- Uploaded `.glb` files can only be previewed in 3D, not in AR, because native AR viewers cannot read local `blob:` URLs.
- Some advanced material extensions (e.g. diffuse transmission on the plant leaves) may look simpler in AR viewers than in the browser.
- Model files total about 26 MB; the first load of a large model can be slow on mobile data.

### Fix Position and AutoGrid limitations

- Custom WebXR AR (Fix Position, AR scanning) needs a browser that reports `immersive-ar` with hit testing: in practice Chrome on ARCore-supported Android phones over https. Safari on iPhone does not provide it, so iPhone uses AR Quick Look and manual measurements.
- Anchors are optional in WebXR. Without them, placement is fixed in the session's tracked space and can drift slightly if tracking re-localises. Nothing persists after the AR session ends.
- AR measurements are approximate and depend on lighting, floor texture and careful aim at the corners. They are not survey-grade; always review and correct them.
- Rooms are measured as four corners. L-shaped or irregular rooms can only be approximated; the measured outline is shown so this is visible.
- The plan and an AR session share no coordinate frame, so furniture is not automatically placed at its planned floor position in AR.
- Saved plans live in this browser's localStorage. Use Export/Import to move them between devices; there is no cloud sync.

### MultiPlace limitations

- In the browser, multi-object camera AR needs WebXR AR (Chrome on ARCore Android over https). On iPhone it needs the native app (built with Xcode, A12 chip or newer, iOS 17+); Safari gets the 3D composer and single-object Quick Look.
- Wall placement in the browser depends on the phone's WebXR hit test reporting vertical planes; it is not yet verified on a device. Wall items can't be rotated freely (they face out of the wall).
- There's no occlusion, so real furniture doesn't hide virtual objects, and virtual objects don't collide with each other in AR (SmartFit does the collision maths on the plan).
- Anchors last for one session. Arrangements can be exported, but reopening AR does not restore objects to the same physical spots.
- About 5–10 objects is the target on a capable phone. Large textured models (e.g. the 7.8 MB barn light) cost more memory; ARSpace warns from 10 objects.
- Sending composer furniture to SmartFit rounds rotations to 0° or 90° and skips tabletop and wall items.
- The procedural models are simple low-poly pieces with designed (not real product) dimensions.

### Native iPhone app limitations

- Written on Linux without Xcode: Swift syntax was checked with a parser, but the app has **not been compiled, unit-tested in Xcode, or run on an iPhone yet**. Expect the first build to need small fixes. It must be built and signed with Xcode; it is not on the App Store and not deployed by GitHub Pages.
- USDZ conversion simplifies some glTF materials (velvet sheen becomes a flat colour; transmissive glass becomes alpha-blended; anisotropy and iridescence are dropped). Shapes and sizes are unchanged.
- No saved world maps: objects are not restored to the same physical spots in a new session. No people/object occlusion.

### SmartFit limitations

- SmartFit works only on the room size and positions you enter. It does not scan your room, detect walls or read furniture positions from the camera.
- The AR viewers (Scene Viewer, Quick Look, WebXR via model-viewer) do not give the website room geometry or placement coordinates, so AR and SmartFit are separate: the plan checks the numbers, AR shows the look.
- Rooms are rectangles; L-shaped rooms, doors that swing, windows and existing built-ins are not modelled. Entry and Destination are points you place.
- Furniture is treated as rectangles at 0° or 90°. A curved sofa is checked by its bounding box, so real clearance around curved edges may be slightly larger.
- Catalog sizes come from the 3D models' bounding boxes, not manufacturer specs; planning-block sizes are demo values. All are editable.
- Walkway widths are accurate to about ±5 cm (grid size). The default 80 cm clearance and the 45 cm minimum are planning preferences, not building or accessibility code checks.
- Height is shown and editable but not used in the 2D checks.

## Future enhancements (not implemented)

AI image-to-3D conversion · image upload with object reconstruction · full room scanning (LiDAR / Apple RoomPlan in a native app) · wall and L-shaped room capture · registering the SmartFit plan to the AR session so planned positions appear on the real floor · persistent cross-session anchors · object occlusion behind real furniture · interior design recommendations · AI room layout generation · cloud-synced room designs · occlusion and per-object physics in AR · relocalising saved arrangements in a new AR session · collaborative AR editing · VR interior walkthroughs.

## Model attributions

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md). Models are from the Khronos glTF Sample Assets (Wayfair LLC, Eric Chadwick, Rico Cilliers, Darmstadt Graphics Group) under CC0 and CC BY 4.0.

## Short project description (for submission)

ARSpace is a web-based augmented reality application for visualising furniture and home decor in a real room before buying, extended with SmartFit, a geometry-based planner that checks whether a furniture layout fits the room and leaves a usable walking route. Users browse a catalog of real 3D models, inspect them interactively in the browser, adjust their finish, orientation and preview size, and then launch device-native AR (WebXR or Google Scene Viewer on Android, AR Quick Look on iOS) to place the object at true scale on their floor. The application detects AR capability, guides first-time users, and falls back to an interactive 3D viewer on unsupported devices. AutoGrid measures the room from four AR-captured floor corners (or manual input), validates the outline, computes edge lengths and shoelace area, and generates a proportional floor grid that feeds a shared room plan. Fix Position adds a custom WebXR mode that locks placed furniture to a tracked world pose using WebXR anchors where available. SmartFit models furniture as rectangles on a measured floor plan, detects wall overhangs and overlaps exactly, tests whether a 90° rotation resolves them, and runs a clearance-based widest-path search to classify the walkway as clear, restricted or blocked, with rule-based recommendations derived from those measurements. It is built with Vite, vanilla JavaScript and Google's model-viewer on top of three.js, uses open glTF 2.0 assets, and deploys as a free static website.
