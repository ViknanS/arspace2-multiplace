# ARSpace — Physical Device Test Checklist

Automated tests cover the logic (see README → Testing performed). The items below need real hardware. Mark each one **Pass / Fail / Not supported** and note the device, OS and browser version. Do not mark AR movement tests as passed unless you actually walked around the object on the device.

Before you start: deploy the site (Netlify or Vercel) and use the **https** link. Testing from `http://<your-Mac-IP>:5173` is not equivalent: WebXR is blocked on insecure pages.

## Android (Chrome on an ARCore-supported phone)

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Open the https site | Home loads, hero chair renders | |
| 2 | Home device line | Says this device can place objects in AR | |
| 3 | Open Modern Accent Chair → **View in my room** | Guide appears first time → Start AR opens AR (WebXR or Scene Viewer) | |
| 4 | Scan floor, place chair | Chair lands at true size; stays put as you walk around it | |
| 5 | Product page → Fix Position block | Shows **Place with Fix Position** (not an explanation) | |
| 6 | Start Fix Position | Camera opens; "Move your phone slowly to scan the floor." | |
| 7 | Point at floor | Reticle appears; "Surface Detected — Ready to Place." | |
| 8 | **Place Object** | Chair appears and follows the reticle | |
| 9 | **Fix Position** | Chair stops following; label says *Anchored with WebXR Anchors* or *Fixed in tracked session space* | |
| 10 | Move left / right | Chair stays in place | |
| 11 | Walk towards / away | Chair grows / shrinks naturally | |
| 12 | Walk all the way around | Perspective changes; chair stays on the same floor spot (small drift acceptable) | |
| 13 | Rotate buttons | Chair turns 45° per tap in place | |
| 14 | **Unlock Position** → move → **Fix Position** | Chair follows reticle, then locks at the new spot | |
| 15 | **Reset Placement** | Chair disappears, back to scanning | |
| 16 | Cover the camera for a few seconds | "Tracking limited…" then resumes; fixed chair returns to its spot | |
| 17 | **Exit AR** | Back to the product page; button works again | |
| 18 | Deny camera permission, try again | Clear message, no stuck screen | |
| 19 | AutoGrid → **Start Scan** | Scan overlay with progress bar | |
| 20 | Capture 4 corners in order | Numbered markers stay on the floor; live distance readout; "n of 4 corners captured" | |
| 21 | Capture same corner twice | "That is the same spot as corner …" | |
| 22 | Undo / Reset Scan | Last marker / all markers removed | |
| 23 | **Finish Scan** | Result card with edges, area, angles | |
| 24 | Compare with tape measure | Record measured vs tape width and length | |
| 25 | **Use these measurements** → **Open in SmartFit** | SmartFit shows the same width and length | |
| 26 | SmartFit: add sofa + chair, drag with finger | Pieces move; page still scrolls when swiping empty floor | |
| 27 | Create an overlap, then fix it | Red → green; overlap message with cm value | |
| 28 | Walking route | Route updates; Restricted/No path when blocked | |
| 29 | Save plan, reload page, load plan | Plan restored | |
| 30 | Export plan; import it on another device | Same plan opens | |

## Android — MultiPlace (Chrome on an ARCore phone)

| # | Step | Expected | Result |
|---|---|---|---|
| M1 | MultiPlace → Start with Floor Lamp → **Start MultiPlace AR** | Camera opens; top bar shows "ARSpace MultiPlace", "Tracking: Good", "Objects Placed: 0", "Exit AR"; furniture bar at the bottom | |
| M2 | Scan the floor | "Surface Found. Ready to Place." | |
| M3 | **Place**, then **Lock Position** (or **Place & Lock**) | "Object Placed — Lock Position." then locked; label says which lock method is used | |
| M4 | Swipe the picker, pick **Modern Accent Chair** | Lamp stays where it was; chair previews on the reticle | |
| M5 | Place and lock the chair beside the lamp | Both stay put | |
| M6 | Pick **Coffee Table**, **Place & Lock** | Three objects; "Objects Placed: 3" | |
| M7 | Walk around all three | All stay in their positions; perspective changes naturally | |
| M8 | Tap the chair | Chair is selected (blue ring) | |
| M9 | **Unlock** → **Move** → place elsewhere → **Lock Position** | Only the chair moves | |
| M10 | Objects panel → remove the table | Lamp and chair remain | |
| M11 | Pick Floor Lamp again | New instance `floor-lamp-002` | |
| M12 | Rotate / resize an unlocked object | Only that object changes | |
| M13 | **Clear Room** (tap twice), then **Undo** | All objects removed, then all come back (locked ones re-anchored) | |
| M14 | Exit AR | Result card shows the session's objects; opens in the 3D composer | |
| M15 | Performance with 5–10 objects | Note phone model and whether it stays smooth | |
| M16 | Select the lamp → **Duplicate** | A second lamp appears beside it, unlocked; the original stays locked | |
| M17 | Pick **Framed Wall Painting**, aim at the floor | "That's the floor. Aim at a wall…"; Place & Lock disabled | |
| M18 | Aim at a plain, well-lit wall and move slowly | "Wall Found. Ready to Place." (if the phone/browser never reports a wall, note it: wall placement is then unsupported on that device) | |
| M19 | **Place & Lock** the painting | It hangs flat against the wall, facing the room; walk past it | |
| M20 | Search "clock" in the furniture bar | Only Wall Clock shown; clearing the search restores all | |

## iPhone / iPad (Safari)

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Open the https site | Home loads | |
| 2 | Product page → Fix Position block | Explanation that Safari lacks WebXR AR and View in my room uses AR Quick Look (no fake button) | |
| 3 | **View in my room** → Start AR | AR Quick Look opens with the chair | |
| 4 | Place on floor, move phone, walk around | Chair stays where placed (native Quick Look behaviour) | |
| 5 | Pinch / drag / rotate in Quick Look | Native gestures work | |
| 6 | AutoGrid | Scan option explains it's unavailable on Safari; Enter Measurements works | |
| 7 | Enter width/length → Generate grid | Proportional grid, correct cell count | |
| 8 | Open in SmartFit | Same dimensions | |
| 9 | Touch-drag furniture | Moves; page scrolls from empty floor | |
| 10 | Collisions and walking route | Update as on desktop | |
| 11 | Save / reload / load plan | Restored | |
| 12 | MultiPlace page | Explains no multi-object camera AR on Safari, points to the native app; 3D composer works | |
| 13 | Composer: add chair, lamp, table; drag, lock, unlock one | Only the selected piece changes | |
| 14 | Composer: add Framed Wall Painting, drag it | It slides along the nearest wall at its height | |

## iPhone — native ARSpace MultiPlace app (ARKit / RealityKit, built with Xcode)

Build and install as described in `ios/README.md`. None of these have been run yet.

| # | Step | Expected | Result |
|---|---|---|---|
| I1 | Build in Xcode 16+ (⌘B) | Builds without errors (first build of code written without Xcode — note any fixes needed) | |
| I2 | ⌘U on an iPhone simulator | All SceneManager / SurfaceClassifier / Catalog tests pass | |
| I3 | Launch on iPhone, allow camera | Coaching overlay, then "Tracking: Good" and a reticle on the floor | |
| I4 | Floor Lamp → **Place & Lock** | Lamp locked on the floor | |
| I5 | Chair from the bottom bar → Place & Lock | Camera never closes; lamp still visible and unchanged | |
| I6 | Coffee Table → Place & Lock | "Objects Placed: 3" | |
| I7 | Walk around all three | Each stays at its own spot | |
| I8 | Tap chair → Unlock → Move → Place & Lock | Only the chair moves | |
| I9 | Lamp → Duplicate; remove one lamp | The other lamp stays | |
| I10 | Framed Wall Painting on a wall | Hangs flat on the wall, facing the room | |
| I11 | Wall item aimed at the floor | App asks for a wall, won't place | |
| I12 | Pinch / twist an unlocked object; try on a locked one | Unlocked resizes/rotates; locked doesn't respond | |
| I13 | Lock the phone and return | Tracking recovers; objects return to their spots | |
| I14 | Exit AR → Export | Home shows the last session; share sheet with JSON | |

## Desktop (MacBook)

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | `npm run dev`, open http://localhost:5173 | Site loads | |
| 2 | 3D viewer: drag, scroll, sliders, finishes, reset | All respond | |
| 3 | View in my room | Dialog explains AR needs a phone (QR code when deployed) | |
| 4 | Fix Position block | Explanation, no button | |
| 5 | AutoGrid manual 4 × 3 m at 50 cm | 8 × 6 = 48 cells | |
| 6 | 4.3 × 3.55 m | Partial cells hatched and described | |
| 7 | Zoom, pan, reset view, grid toggle, spacing | Work | |
| 8 | Open in SmartFit, arrange furniture, check results | Work | |
| 9 | Save, rename, delete, export, import | Work | |
