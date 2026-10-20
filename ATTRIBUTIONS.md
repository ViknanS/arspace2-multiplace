# Attributions

Most 3D models in `public/models/` are binary glTF (`.glb`) files from the
[Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) repository; the rest are ARSpace's own procedural models (below).
They were downloaded directly from the repository's `glTF-Binary` folders. Licence details below
are copied from each model's `metadata.json` in that repository.

| ARSpace file | Shown as | Original asset | Credit | Licence |
|---|---|---|---|---|
| `chair.glb` | Modern Accent Chair | [SheenChair](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair) | Eric Chadwick, © Wayfair LLC (2020) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) |
| `sofa.glb` | Curved Velvet Sofa | [GlamVelvetSofa](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlamVelvetSofa) | Eric Chadwick, © Wayfair LLC (2021) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `barn-lamp.glb` | Copper Barn Wall Light | [AnisotropyBarnLamp](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/AnisotropyBarnLamp) | Eric Chadwick, © 2023 Wayfair LLC | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `glass-lamp.glb` | Table Lamp with Glass Base | [IridescenceLamp](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/IridescenceLamp) | Eric Chadwick, © Wayfair LLC (2022) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `vase.glb` | Glass Vases with Flowers | [GlassVaseFlowers](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlassVaseFlowers) | Vase: Eric Chadwick (2023); flowers: Rico Cilliers (2023) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) |
| `plant.glb` | Potted Plant | [DiffuseTransmissionPlant](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/DiffuseTransmissionPlant) | Materials and animation: Eric Chadwick, © Darmstadt Graphics Group GmbH (2024), CC BY 4.0; original asset: Rico Cilliers (2021), CC0 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `silk-pouf.glb` | Silk Pouf | [SpecularSilkPouf](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SpecularSilkPouf) | Eric Chadwick, © 2023 Wayfair LLC | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `arc-lamp.glb` | Art Nouveau Arc Lamp | [LightsPunctualLamp](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/LightsPunctualLamp) | DGG (Darmstadt Graphics Group) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| `candle-holder.glb` | Glass Candle Holder | [GlassHurricaneCandleHolder](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlassHurricaneCandleHolder) | Eric Chadwick, © Wayfair LLC; Khronos logo (non-copyrightable) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |

**Modification:** `silk-pouf.glb` is the original file with its `extensionsRequired` list removed (the sheen and specular extensions are still present as optional extensions), so stricter viewers such as Scene Viewer don't reject it. Geometry, materials and textures are unchanged.

### ARSpace procedural models (CC0)

`stool`, `coffee-table`, `side-table`, `dining-table`, `desk`, `bookshelf`, `tv-unit`, `storage-cabinet`, `floor-lamp`, `sculpture`, `wall-painting` and `wall-clock` are original low-poly models created for this project with three.js (`tools/procedural-models.js`) and exported as GLB. They are released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). Their dimensions are the designed sizes, not those of a real product.

### iOS USDZ versions

`ios/ARSpaceMultiPlace/ARSpaceMultiPlace/Models/*.usdz` are format conversions of the same models (Blender glTF import → USD export, `tools/usdz/convert.py`), for the native iOS app. Each keeps its original credit and licence above. Changes made by the conversion: materials are re-expressed as UsdPreviewSurface (velvet sheen becomes a flat colour, transmissive glass becomes alpha-blended glass, anisotropy and iridescence are dropped), base-colour factors are baked into texture copies, and textures are limited to 2048 px. Geometry and dimensions are unchanged. `ios/.../Thumbnails/*.png` are resized copies of the catalog thumbnails.

The catalog thumbnails in `public/thumbs/` are renders of these same models, made with
`<model-viewer>`'s `toBlob()` method, and carry the same licences.

## Software

- [@google/model-viewer](https://github.com/google/model-viewer) — Apache 2.0
- [three.js](https://github.com/mrdoob/three.js) — MIT
- [Vite](https://vitejs.dev) — MIT
- three.js addons used: GLTFLoader, GLTFExporter (procedural models), OrbitControls, RoomEnvironment, SkeletonUtils
- Native iOS app: Apple SwiftUI, ARKit and RealityKit (system frameworks)
- Asset conversion and validation (build tools, not shipped in the website): [Blender](https://www.blender.org) `bpy` (GPL; used only as a converter), [OpenUSD](https://openusd.org) `usd-core` (Tomorrow Open Source Technology License), Pillow (HPND)
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — MIT
- [Inter](https://rsms.me/inter/) via @fontsource-variable/inter — SIL Open Font License 1.1
- Interface icons adapted from [Lucide](https://lucide.dev) — ISC
