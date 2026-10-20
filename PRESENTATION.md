# ARSpace — Presentation Material

## Abstract

Online shoppers find it difficult to judge how furniture and decor will look in their own homes, because product photographs show a fixed angle in an unfamiliar room and give no real sense of scale. This project presents **ARSpace**, a web-based augmented reality application that lets users browse home products as interactive 3D models and place them in their physical surroundings through a smartphone camera. The application is built with Vite and vanilla JavaScript and uses Google's model-viewer web component, which renders glTF 2.0 models with physically based materials, environment lighting and soft shadows using three.js and WebGL. Users can orbit, zoom, recolour, rotate and resize each object in the browser. On compatible devices, ARSpace launches genuine device AR through the WebXR Device API or Google Scene Viewer on Android (ARCore) and AR Quick Look on iOS (ARKit), where the phone detects a horizontal surface and anchors the model at true real-world scale. The system detects AR capability at runtime, guides first-time users, and gives clear feedback with an interactive 3D fallback on unsupported devices. Beyond appearance, ARSpace introduces SmartFit, a furniture fit and walkability analyzer: users enter room dimensions and arrange furniture on a proportional floor plan, and a geometry engine detects wall overhangs and overlaps using rectangle intersection, tests whether a 90° rotation resolves each collision, computes the exact free floor area, and runs a clearance-based widest-path search on a 5 cm grid to determine whether a walking route of the user's chosen width remains between the entry and a destination. Rule-based recommendations are derived directly from these measurements. Two further modules close the loop between measurement and visualization. AutoGrid measures the room from four floor corners captured with WebXR hit testing (or typed dimensions on any device), validates the outline, computes edge lengths and shoelace area, and generates a proportional floor grid shared with SmartFit through a single room-plan model. Fix Position provides a custom WebXR placement mode in which furniture is locked to a tracked world pose, using WebXR anchors where available, with explicit fix, unlock and reset controls. ARSpace requires no backend or paid service and is deployed as a static website over HTTPS.

## Objectives

1. Replace static product images with interactive, physically based 3D models that users can inspect from any angle.
2. Allow users to customise the preview: material finish, orientation and on-screen size.
3. Enable true-scale placement of virtual objects in the user's real environment using device-supported AR runtimes.
4. Detect AR capability on every device and provide clear guidance and a working fallback where AR is unavailable.
5. Deliver the solution as a lightweight, free, responsive static web application that runs on desktop and mobile.
6. Evaluate whether a furniture layout is physically practical, using explainable geometry for collision detection and walking clearance.
7. Measure the room in AR where supported and generate a proportional floor grid that feeds the planner directly.
8. Keep placed furniture world-locked in AR with explicit fix, unlock and reset controls.

## Existing system

- Products are shown through 2D photographs taken from a few fixed angles chosen by the seller.
- Photos are staged in showroom-like rooms, not the buyer's space, so colour, style and lighting compatibility are guesswork.
- Size is given only as numbers (W × D × H), which most people find hard to imagine in a real room.
- There is no way to check clearance, walking space or proportion against existing furniture.
- Result: wrong-size or mismatched purchases, returns and low buyer confidence.

## Proposed system

- Each product is a real 3D model (glTF 2.0) that the user can rotate, zoom and recolour in the browser, so every angle and finish can be inspected.
- Dimensions are read directly from the model's bounding box, so the size shown is the size of the real object.
- On an AR-capable phone, one tap opens the device AR runtime. The phone tracks its position, detects the floor, and anchors the model at true scale, so the user can walk around it in their own room.
- Capability detection decides between WebXR, Scene Viewer, AR Quick Look or a 3D-only fallback, and explains the outcome to the user.
- Runs entirely in the browser with no app install, backend or cost.
- SmartFit checks the practical side: whether every piece fits inside the walls, whether pieces overlap, and whether you can still walk from the door to the other side at a width you choose, with specific fixes.

## Architecture

```
User Interface              (Vite + vanilla JS, responsive pages, hash router)
      ↓
Product Catalog             (product data, category filter, name search)
      ↓
3D Model Viewer             (<model-viewer> → three.js → WebGL; PBR, environment light, shadows)
      ↓
AR Compatibility Detection  (canActivateAR, platform and secure-context checks)
      ↓
Supported AR Runtime        (WebXR / Google Scene Viewer + ARCore on Android, AR Quick Look + ARKit on iOS)
      ↓
Physical Environment Visualization  (plane detection, hit-test placement, anchoring, gestures)
```

SmartFit runs alongside, on data the user enters:

```
Room dimensions + furniture footprints (manual input)
      ↓
Geometry engine: boundary check, pairwise rectangle overlap, rotation test, union area
      ↓
Walkability: distance-to-obstacle grid → widest-path (maximin Dijkstra) → A* route
      ↓
Rule-based recommendations → results dashboard (red / amber / green)
```

## Two-minute demonstration script

**0:00 – 0:15 · Problem.** "When you buy furniture online you only get photos. You can't tell if this chair fits your room or how big it really is. ARSpace solves that with 3D and augmented reality."

**0:15 – 0:35 · Home page (laptop).** Point at the hero chair and drag it. "This isn't an image, it's a real 3D model rendered in the browser with WebGL. Notice the line under the buttons: the app has already detected that this laptop can't do AR, and says so."

**0:35 – 0:55 · Catalog.** Click *Explore collection*. Click *Lighting*, then type "table" in search. "Filter and search work together." Clear, click *Modern Accent Chair*.

**0:55 – 1:20 · 3D viewer.** Drag to orbit, scroll to zoom. Switch *Mango Velvet* → *Peacock Velvet*. Move the rotation slider, then the preview size slider. "These dimensions, 83 by 57 by 69 centimetres, are read straight from the 3D file, not typed in. The size slider only changes the preview; in AR the chair stays its true size." Click *Reset view*.

**1:20 – 1:30 · Desktop fallback.** Click *AR not supported here*. "Instead of a dead button it explains why, and gives a QR code to open this exact chair on a phone."

**1:30 – 1:55 · Phone AR.** Scan the QR code (or open the Netlify link) on an Android/iPhone. Tap *View in my room* → guide → *Start AR*. Scan the floor; the chair lands at real size. Walk around it, drag it, twist to rotate. "The phone's ARCore or ARKit is tracking the floor; the chair is anchored at true scale."

**1:55 – 2:00 · Close.** "Real 3D models, real AR, works on any device with a graceful fallback, and it's a free static website."

> Before the demo: deploy, open the link on the phone once so the models are cached, and do one AR run in the demo room to check the floor is detected. Have a screen recording of AR as a backup in case the room lighting or Wi‑Fi is poor.

## SmartFit demonstration (add 60–90 seconds)

**1.** Open **SmartFit**. "The plan is a 4 × 3 m room drawn to scale. Green means it fits, and the blue line is the walking route from the door to the window, 85 cm at its narrowest."

**2.** Choose **Furniture overlapping**. "The sofa and coffee table turn red, and it says they overlap by 15 cm. That number is calculated from the rectangles, not guessed." Drag the table down until it turns green.

**3.** Choose **Fixed by rotating**. Select the bookshelf, press **Rotate 90°**. "SmartFit predicted that rotating would fix it, and it did."

**4.** Choose **Living room that fits**, drag the plant towards the sofa. "The route turns amber: Restricted. The ring marks the narrowest point, with its width." Lower the clearance slider to show it turning clear again. "Clearance is my planning preference, not a building code."

**5.** Choose **Walkway blocked**. "No path available. It names the sofa and the TV unit as the pieces blocking the route."

**6.** Click **Preview in AR** on the sofa. "The plan checks the numbers; AR checks the look. The phone's AR viewer doesn't send room geometry back, so I keep them separate and say so."

## Viva questions

**1. What is the difference between AR and VR?**
AR overlays virtual objects on the user's view of the real world, which stays visible (here, through the phone camera). VR replaces the real world entirely with a virtual environment, usually through a headset. ARSpace is AR: the chair appears in your actual room.

**2. Why use 3D models instead of 2D images?**
A 2D image is a fixed projection from one viewpoint. A 3D model stores geometry, materials and real dimensions, so it can be viewed from any angle, lit realistically, measured, and placed in AR at true scale. Images cannot be placed in 3D space.

**3. What is the difference between WebXR and native AR viewers like Scene Viewer and AR Quick Look?**
WebXR is a browser API: the AR session runs inside the web page, so the page's own rendering (including scale, rotation and finish changes) is used. Scene Viewer (Android) and AR Quick Look (iOS) are operating-system AR apps that the page hands a model file to; they open as separate screens with their own controls and do not show the web page's UI. model-viewer tries them in the order given in `ar-modes`.

**4. What is the difference between GLB and USDZ?**
GLB is the binary form of glTF 2.0, an open Khronos standard for web and real-time 3D that packs geometry, PBR materials and textures into one file. USDZ is Apple's zipped Universal Scene Description format required by AR Quick Look on iOS. ARSpace ships GLB files and model-viewer generates USDZ from them on iOS.

**5. What is the difference between 3D rendering and actual AR placement?**
3D rendering draws the model on screen from a virtual camera that the user orbits; there is no link to the real world. AR placement uses the phone's camera and motion sensors to track the device's position, detects real surfaces, and anchors the model to a point on the floor, so it stays put at real size as you move.

**6. How does the phone detect the floor?**
ARCore/ARKit use visual-inertial odometry: they track feature points in the camera image and combine them with gyroscope and accelerometer data to estimate the phone's pose. Clusters of feature points on the same plane are fitted as horizontal planes. A hit-test ray from the screen centre finds where it meets a plane, and the object is placed there. That's why textured, well-lit floors work best.

**7. How does ARSpace decide whether AR is available?**
It reads model-viewer's `canActivateAR` property, which checks for WebXR `immersive-ar` support, Android (for Scene Viewer) or iOS Quick Look support. ARSpace adds platform and HTTPS checks to explain the result and sets the AR button state accordingly.

**8. Why does the app need HTTPS for AR?**
WebXR and camera access are only allowed in secure contexts, and Scene Viewer downloads the model from a public URL. A static host such as Netlify provides HTTPS for free.

**9. What is PBR and why does it matter here?**
Physically based rendering models how light interacts with surfaces using properties like base colour, metalness and roughness, plus extensions such as sheen (velvet), anisotropy (brushed metal), transmission (glass) and iridescence. Combined with image-based environment lighting and soft shadows, it makes models look like real materials, which is essential when judging a product.

**10. What does `ar-scale="fixed"` do?**
By default (`auto`) users can pinch to resize the object in AR. `fixed` locks it to its true real-world size from the model file. ARSpace exposes this as "Lock to true size in AR".

**11. Why are the preview size and real size kept separate?**
The size slider is a presentation aid on screen. Showing fake measurements would be misleading, so the dimensions displayed always come from the model's bounding box at scale 1, and AR uses the real size.

**12. What are the limitations?**
AR needs a compatible phone; native viewers don't show the web UI; placement is on horizontal surfaces only; no occlusion behind real furniture; detection depends on lighting and surface texture.

### SmartFit questions

**13. How does SmartFit detect a collision?**
Each piece is an axis-aligned rectangle. Two rectangles overlap when the overlap of their x-ranges and their y-ranges are both positive. Those two values give the overlap width and depth; the smaller one is the distance needed to separate them. Wall overhang is how far each edge passes 0 or the room size.

**14. How does it decide whether a route exists, and how wide it is?**
The floor is split into 5 cm cells. Each cell stores its distance to the nearest wall or furniture rectangle. A modified Dijkstra search finds the route whose smallest distance is largest (the widest path). Twice that smallest distance is the narrowest passage width, which is compared with the clearance.

**15. Why not just check whether any path exists?**
A path 10 cm wide is useless to a person. The widest-path search answers the practical question "can I walk through at the width I need?" and reports the actual narrowest width.

**16. Is SmartFit using AI?**
No. It is deterministic geometry plus if/then rules. Every message comes from a measurement that can be shown and checked, and there are unit tests for it.

**17. Why doesn't SmartFit use the phone's AR scan of the room?**
Scene Viewer and AR Quick Look run outside the web page and don't return plane or placement data to it. WebXR could provide hit-test points, but building a reliable room model from them was out of scope. SmartFit therefore uses entered dimensions and says so in the interface.

**18. What are SmartFit's main limitations?**
Rectangular rooms only, rectangular footprints at 0° or 90°, ±5 cm grid accuracy for walkway width, manually placed entry and destination points, and furniture sizes taken from 3D models or demo values rather than manufacturer data.


---

# Phase 3 + 4 additions: Fix Position and AutoGrid

## Complete pipeline

```
AutoGrid: measure (AR corners or manual) → validate → width, length, area
      ↓
Proportional floor grid (25/50/100 cm, partial edge cells)
      ↓
Shared room plan (schema v1, metres; saved/exported as JSON)
      ↓
SmartFit: furniture placement → collisions → walkability → recommendations
      ↓
AR preview: View in my room (native) or Fix Position (custom WebXR)
      ↓
World-locked placement: anchor or tracked session space; unlock / reset
```

## Algorithms developed in this project vs. platform capabilities

| Developed in ARSpace | Provided by the browser / OS |
|---|---|
| Rectangle collision and wall-overhang measurement, rotation test, union area | Camera access and motion tracking (ARCore / ARKit) |
| Distance-to-obstacle grid + widest-path search + A* route + string pulling | Plane detection and hit testing (WebXR Hit Test API) |
| Rule-based recommendations from measurements | Spatial anchors (WebXR Anchors API), when granted |
| Fix Position state machine and placement logic (follow reticle → lock → unlock → reset, tracking-loss handling) | Native AR viewers (Scene Viewer, AR Quick Look) |
| AutoGrid corner validation: floor projection, duplicates, short edges, self-intersection, convexity, height spread, rectangularity | 3D rendering libraries (three.js, model-viewer) |
| Shoelace area, edge averaging, grid generation with partial cells | |
| Shared room-plan schema, validation, storage, import/export | |

Anchors, hit testing and room scanning in general were not invented here. The contribution is joining them with original geometry into one pipeline a user can follow from a tape-measure-free room size to a walkable, world-locked furniture preview.

## What is new compared to other AR furniture websites?

Most AR furniture sites stop at "see the product in your room". ARSpace adds:
1. **Measurement** of the actual room (AR corner capture on Android, manual everywhere) with validation instead of trusting raw taps.
2. **A proportional, metric floor grid** generated from those measurements.
3. **Planning on that grid** with exact collision measurements and a walkability check that reports the narrowest passage in centimetres.
4. **Rule-based fixes** derived from the geometry (rotate 90°, move N cm, which piece blocks the route).
5. **World-locked AR placement** with explicit Fix / Unlock / Reset controls where the browser allows custom WebXR, and honest native fallbacks elsewhere.

## Technologies used

Vite, vanilla JavaScript (ES modules), HTML5, CSS3 · Google model-viewer 4.1 · three.js 0.172 (WebGLRenderer XR, GLTFLoader, RoomEnvironment) · WebXR Device API: immersive-ar, Hit Test, Anchors, DOM Overlay, reference spaces · glTF 2.0 / GLB (USDZ generated for Quick Look) · localStorage + JSON export · Node test runner, Playwright.

## Full demonstration script (about 4 minutes)

1. **Introduce (15 s).** "ARSpace helps you decide whether furniture fits your room, not just how it looks."
2. **Catalog (20 s).** Collection → filter Lighting → open the chair; orbit, change finish.
3. **AutoGrid (45 s).**
   - *Android:* AutoGrid → Start Scan → capture the four floor corners of the demo room → Finish Scan → show edges, area and angles → Use these measurements.
   - *Laptop / iPhone:* AutoGrid → Enter Measurements 4.2 × 3.5 → Generate grid. Switch spacing 50 cm → 25 cm and show the cell count change; point at the hatched partial cells on 4.30 × 3.55.
4. **SmartFit (60 s).** Open in SmartFit (dimensions already there). Add the sofa and the chair. Drag the chair into the sofa: red, "overlaps … by N cm". Rotate or move it until green. Show the walking route and narrowest width; drag the plant into the path to make it Restricted.
5. **Save (15 s).** Save plan as "Demo room".
6. **AR (45 s).** On Android: chair → Place with Fix Position → Place Object → Fix Position → walk around it → Unlock → move → Fix → Reset. On iPhone: View in my room (Quick Look) and walk around it.
7. **Explain platforms (20 s).** "Android Chrome supports WebXR, so custom controls and scanning work there. Safari doesn't, so iPhone uses Quick Look and manual measurements: same plan, same analysis."

**Truthful fallback if AR misbehaves on the day:** keep the laptop flow (AutoGrid manual → SmartFit → 3D viewer) and show a screen recording of the phone AR run made beforehand. Say plainly that live AR depends on lighting and floor texture.

## More viva questions

**19. What does Fix Position actually do technically?**
It runs its own WebXR immersive-ar session. Hit testing gives the floor pose under the screen centre; on Fix, the object's transform is taken from that pose and, if the runtime grants anchors, an XRAnchor is created and the object follows the anchor's pose each frame. Otherwise it keeps a fixed transform in the tracked reference space.

**20. What is the difference between an anchor and session-local placement?**
Both stay put relative to the tracked room during the session. An anchor is managed by the AR runtime, which can correct its pose as tracking improves. A session-local transform is just a fixed matrix in the session's reference space, so it can't benefit from those corrections.

**21. What is an XR reference space?**
A coordinate system the runtime tracks for you. `local` is centred near where the session started; `local-floor` puts y = 0 at the floor. Both are in metres, Y up, gravity aligned.

**22. Why not put the Fix Position buttons inside Scene Viewer or Quick Look?**
They are separate OS apps; a web page can't add buttons to them. They already keep objects anchored, so ARSpace uses them as the fallback and explains the difference.

**23. How does AutoGrid turn four tapped points into a room size?**
Each point is a hit-test position in metres. They're projected onto the floor plane (x, z), consecutive distances give the four walls, opposite walls are averaged for width and length, and the shoelace formula gives the true outline area.

**24. How do you know a scan is bad?**
Validation rejects duplicate corners (< 15 cm apart), walls under 50 cm, crossing or out-of-order outlines, corners at different heights (> 15 cm), and sizes outside 1.5–15 m. If angles or opposite sides disagree too much, it warns that the room isn't rectangular instead of silently squaring it.

**25. Why do 4.30 m and 50 cm give 9 columns, not 8.6?**
Cells are whole grid squares; the last column is a partial cell 30 cm wide. AutoGrid counts and hatches partial cells so the drawing stays true to the measured size.

**26. Does the 50 cm visual grid make the walkway check coarser?**
No. The walkway analysis always uses its own 5 cm grid. The visual grid only affects drawing and optional snapping.

**27. Why doesn't a chair planned at (2 m, 1 m) appear at that spot in AR?**
The plan and the AR session don't share a coordinate frame. Aligning them needs registration, for example re-capturing a room corner in the same session. That's listed as future work.

**28. How are room plans stored and why is it safe?**
As versioned JSON in localStorage. Every read is validated; bad entries are skipped, corrupted data is kept as a backup instead of overwritten, and a different plan with the same name is never replaced without confirmation. Export/Import moves plans between devices.

**29. How were AR features tested without a phone?**
The logic was tested with a scripted WebXR stand-in in a real browser (hit results, anchors, tracking loss), plus unit tests. Real-device behaviour is still marked pending and checked with DEVICE_TESTING.md.

**30. What would you do next?**
Register the plan to the AR session so planned furniture appears in place, support L-shaped rooms, persistent anchors across sessions, and a native RoomPlan/LiDAR scanner on iPhone.


---

# Phase 5: MultiPlace — Multi-Object AR with Independent Spatial Locking

*"Place More. Lock Independently. Design Your Space."*

## What it adds

A basic AR visualizer shows one product per AR launch. MultiPlace keeps one WebXR session and one 3D scene, so you can place a lamp, lock it, add a chair beside it, lock that, add a coffee table, and walk around all three. Any single piece can be unlocked, moved, rotated, resized or removed without disturbing the others. Several instances of the same product are allowed (chair-001, chair-002). A swipeable picker at the bottom of the camera view lists the catalog, which now has 19 real 3D models.

## Technical contribution

The contribution is an **integrated multi-object scene-management and independent-placement workflow**, not spatial anchoring itself:

- a PlacedObjectManager that gives every instance its own ID, transform and lock state, with rules that guarantee only one object follows the reticle and that locking, moving or removing one never affects another (unit tested, including a 16-step lamp/chair/table scenario);
- a ModelAssetManager that loads each model once and clones it safely per instance;
- per-object WebXR anchors (created with `frame.createAnchor` at each object's pose) with a session-space fallback;
- raycast selection of placed objects from the WebXR select event's target ray;
- one shared object model for camera AR (Android) and a camera-free 3D composer (iPhone and desktop), connected to the SmartFit plan.

Anchors, hit testing and the AR runtime come from WebXR / ARCore.

## Demonstration script (about 2 minutes)

1. **Set up (10 s).** "Most AR furniture apps show one item at a time. MultiPlace lets me furnish a whole corner in one AR session."
2. **Start (10 s).** Android → MultiPlace → Start with Floor Lamp → Start MultiPlace AR.
3. **First object (15 s).** Scan the floor ("Surface Found. Ready to Place.") → Place → "Object Placed — Lock Position." → Lock Position.
4. **More objects without leaving AR (30 s).** Swipe the picker, tap the Modern Accent Chair, place it beside the lamp, lock. Swipe to Tables, tap Coffee Table, place in front, lock. "Objects (3)."
5. **Walk around (15 s).** "Each piece stays where I put it; the lamp didn't jump when I picked the chair."
6. **Edit one piece (25 s).** Tap the chair to select it → Unlock → Move → place it further away → Lock. "The lamp and table didn't move." Open the Objects panel and remove the table.
7. **Same product twice (5 s).** Pick Floor Lamp again: it becomes floor-lamp-002.
8. **Exit and reuse (10 s).** Exit AR → "Last AR session: 2 objects" → Open in 3D composer → Send to SmartFit plan → SmartFit checks collisions and the walkway.

**iPhone / laptop version:** use the 3D room composer on the same page. Say plainly that it's an interactive 3D scene, not camera AR, because Safari has no WebXR AR and Quick Look shows one model per launch.

## Viva questions (MultiPlace)

**31. How is MultiPlace different from opening AR several times?**
Native viewers show one model per launch and forget it when you close them. MultiPlace keeps one WebXR session and one scene and adds objects to it, so earlier pieces stay placed while you add more.

**32. How do you keep objects independent?**
Each instance is an entry in a Map keyed by a unique instance ID with its own position, rotation, scale and state. Only the one object in `preview` or `moving` state follows the reticle; locked objects ignore every edit except their own anchor pose updates.

**33. What happens to the lamp when you pick a chair?**
Nothing. Picking a product only creates a new preview instance. An unplaced preview of another product would be discarded, but placed and locked objects are untouched. This is a unit-tested rule.

**34. How are two chairs different objects if they use the same model file?**
The GLB is loaded once and cached; each instance is a separate clone (SkeletonUtils.clone) in its own pivot group with its own transform and selection ring. Geometry and materials are shared read-only to save memory.

**35. How does tapping select an object in AR?**
The WebXR select event provides the input source's target ray. ARSpace converts its pose to a ray and raycasts against the placed objects; the closest hit is selected. A tap that hits nothing places the object currently following the reticle.

**36. How does each object stay fixed?**
When locked, an XRAnchor is created at that object's pose (if the runtime grants anchors) and the object follows only its own anchor. Otherwise its transform stays fixed in the tracked reference space. Unlocking or removing deletes that object's anchor only.

**37. Why isn't there multi-object camera AR on iPhone in the browser?**
Safari doesn't implement WebXR AR, and AR Quick Look takes one model per launch without letting the web page add more. So iPhone gets a separate native ARKit app (Phase 6, below); in Safari it gets the 3D composer, and the UI says so.

**38. Can a saved arrangement be restored in the same physical place later?**
Not yet. Arrangements store relative positions and can be exported or opened in the composer, but putting them back on the same real spots needs relocalisation or persistent anchors.

**39. Where did the new 3D models come from?**
Four more from the Khronos glTF sample library (CC BY 4.0) and ten procedural low-poly models built with three.js and exported as GLB (CC0). A unit test checks every product has a valid GLB and that no two products share the same file.


---

# Phase 6: Native iPhone MultiPlace, wall placement, duplicate and undo

## What it adds

- **Native iPhone app** (`ios/ARSpaceMultiPlace`, Swift + SwiftUI + ARKit + RealityKit): one live camera session where you pick Lamp → Place & Lock → Chair → Place & Lock → Table → Place & Lock and walk around all three. SwiftUI controls sit over a RealityKit `ARView`: top bar (ARSpace MultiPlace · Tracking · Objects Placed · Exit AR), bottom sheet (selected object, actions, furniture carousel, Objects in Room · Undo · Clear Room).
- **Wall placement** on both Android (WebXR) and iPhone (ARKit vertical planes): wall light, framed painting and wall clock hang flat on a detected wall, facing the room.
- **Place & Lock** in one tap, **Duplicate**, **Undo**, carousel **search** and "+ Add another".
- **21 models**, each also converted to **USDZ** (Blender) and validated (OpenUSD) for RealityKit; one shared catalog for the website, SmartFit and the app.

## Technical contribution

| Problem | How it's solved |
|---|---|
| Quick Look can't show custom buttons or several objects | Don't touch Quick Look. Build a native SwiftUI + RealityKit app with its own camera screen and controls |
| RealityKit can't load glTF | Convert every GLB to USDZ with Blender's USD exporter; validate with OpenUSD (up axis, metres, shaders, packaged textures, size vs glTF) — 21/21 valid |
| Telling floors from walls | A hit's pose has +Y along the surface normal: n.y ≥ 0.8 → floor, |n.y| ≤ 0.35 → wall. Wall yaw = atan2(n.x, n.z) so the model's front faces out |
| A wall item must sit flush | Its pivot is the centre of its back (min z = 0), not its floor centre |
| Each object locked independently on iPhone | Lock adds an `ARAnchor` at that object's transform and parents it to `AnchorEntity(anchor:)`; unlock removes only that anchor |
| Undo without breaking anchors | Snapshot before each command; undo diffs the snapshot and rebuilds/re-anchors only the objects that changed; IDs never reused |
| Same logic on two platforms | `objectManager.js` (web) and `SceneManager.swift` (iOS) implement the same states and rules, each with its own unit tests |

## Demonstration script (about 2 minutes, iPhone)

1. Open **ARSpace** on the iPhone (installed from Xcode). "This is a native ARKit app, because Safari can't do multi-object AR."
2. **Start MultiPlace AR**. Point at the floor until "Surface Found".
3. Tap **Floor Lamp** in the bottom bar → **Place & Lock**. "Locked — it has its own ARKit anchor."
4. Swipe the bar → **Modern Accent Chair** → Place & Lock beside the lamp. "The camera never closed and the lamp is still there."
5. **Coffee Table** → Place & Lock. Point to **Objects Placed: 3**. Walk around all three.
6. Tap the chair → **Unlock** → **Move** → new spot → **Place & Lock**. "Only the chair moved."
7. Lamp → **Duplicate**, then remove one lamp. "Each copy is independent."
8. **Framed Wall Painting** → aim at a wall → "Wall Found" → Place & Lock. "Wall items use vertical plane detection."
9. **Undo**, **Objects in Room**, **Exit AR** → export the arrangement.

Android version: same steps on the MultiPlace page in Chrome (WebXR).

## Viva questions (Phase 6)

**40. Why a native app instead of modifying AR Quick Look?**
Quick Look is a system viewer. A web page can only hand it one model file; it can't add buttons, a carousel or more objects. A native app owns the camera screen, so it can.

**41. Can the Swift app run from the GitHub Pages website?**
No. It's an iOS app built and signed with Xcode and installed on the phone. GitHub Pages hosts only the website.

**42. How do you load the same furniture in RealityKit?**
RealityKit needs USD/USDZ, so `tools/usdz/convert.py` converts each GLB with Blender and `validate.py` checks it with OpenUSD. The app's `catalog.json` is generated from the website's `products.js`.

**43. How does the app know whether the reticle is on a wall?**
ARKit raycast results on planes have their +Y axis along the plane normal. If the normal is nearly horizontal it's a wall; the normal is flipped to face the camera, and the yaw `atan2(n.x, n.z)` turns the model's front to face the room.

**44. What does an ARAnchor give you over just storing a position?**
ARKit keeps refining an anchor's pose as it learns more of the room, so the object attached to it stays on the same real spot; a raw world position would drift when ARKit corrects its map.

**45. What happens if tracking is lost?**
The top bar shows Tracking: Limited or Lost with the reason; objects stay attached to their anchors; after an interruption ARKit tries to relocalise so they return to their spots.

**46. Has the iPhone app been tested?**
Its scene logic has XCTest unit tests and the Swift syntax was checked, but it was written without Xcode, so building it, running the tests and the physical iPhone checklist (DEVICE_TESTING.md, I1–I14) are still to do.
