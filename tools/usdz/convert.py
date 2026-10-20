"""Convert ARSpace's GLB models to USDZ for the native iOS app (RealityKit).

RealityKit loads USD/USDZ, not glTF, so every model in public/models is
converted with Blender's glTF importer and USD exporter (pip install bpy).
Output: Y-up, metres (metersPerUnit 1), UsdPreviewSurface materials, textures
packed in the .usdz and downscaled to at most 2048 px.

Glass that uses KHR_materials_transmission has no UsdPreviewSurface equivalent;
Blender exports it fully transparent, so those materials are converted to
alpha-blended glass (opacity 0.25) instead. Sheen, anisotropy, iridescence
and punctual lights are dropped. Geometry and dimensions are unchanged.

usage: python3 tools/usdz/convert.py public/models ios/ARSpaceMultiPlace/ARSpaceMultiPlace/Models [id,id,...]
"""
import sys, os, json, bpy, mathutils
import numpy as np
src, out = sys.argv[1], sys.argv[2]
ids = sys.argv[3].split(',') if len(sys.argv) > 3 else sorted(f[:-4] for f in os.listdir(src) if f.endswith('.glb'))
os.makedirs(out, exist_ok=True)
import tempfile
tmpdir = tempfile.mkdtemp(prefix='arspace-usdz-')
report = {}
for i in ids:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, i + '.glb'))
    # UsdPreviewSurface has no "texture x colour factor": bake the glTF
    # baseColorFactor into a copy of the texture so tinted textures keep their colour
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type != 'BSDF_PRINCIPLED': continue
            bc = n.inputs['Base Color']
            if not bc.is_linked or bc.links[0].from_node.type != 'MIX': continue
            mix = bc.links[0].from_node
            a, b = mix.inputs[6], mix.inputs[7]  # colour A / B sockets of a Mix (RGBA) node
            if not a.is_linked or a.links[0].from_node.type != 'TEX_IMAGE' or b.is_linked: continue
            tex = a.links[0].from_node
            f = tuple(b.default_value)
            src_img = tex.image
            w, h = src_img.size
            px = np.empty(w * h * 4, dtype=np.float32)
            src_img.pixels.foreach_get(px)
            px = px.reshape(-1, 4)
            px[:, :3] *= np.array(f[:3], dtype=np.float32)
            img = bpy.data.images.new(src_img.name + '_tinted', w, h, alpha=True)
            img.colorspace_settings.name = src_img.colorspace_settings.name
            img.pixels.foreach_set(px.ravel())
            img.filepath_raw = os.path.join(tmpdir, f'{i}_{len(os.listdir(tmpdir))}.png')
            img.file_format = 'PNG'
            img.save()
            tex.image = img
            nt.links.new(tex.outputs['Color'], bc)
        # velvet sheen has no USD equivalent: lift a near-black base colour toward the sheen tint
        for n in nt.nodes:
            if n.type == 'BSDF_PRINCIPLED' and not n.inputs['Base Color'].is_linked and n.inputs['Sheen Weight'].default_value > 0:
                base = n.inputs['Base Color'].default_value
                tint = n.inputs['Sheen Tint'].default_value
                for k in range(3):
                    base[k] = min(1.0, base[k] * 0.5 + tint[k] * 0.35)
    # transmission glass -> alpha-blended glass
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                t = n.inputs.get('Transmission Weight')
                if t is not None and not t.is_linked and t.default_value > 0.5:
                    t.default_value = 0.0
                    n.inputs['Alpha'].default_value = 0.25
                    n.inputs['Roughness'].default_value = min(n.inputs['Roughness'].default_value, 0.1)
                    m.surface_render_method = 'BLENDED'
    # world-space bounds in glTF axes (Blender Z-up -> glTF Y-up: x, z, -y)
    lo = [1e9] * 3; hi = [-1e9] * 3
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            g = (w.x, w.z, -w.y)
            lo = [min(a, b) for a, b in zip(lo, g)]; hi = [max(a, b) for a, b in zip(hi, g)]
    dst = os.path.join(out, i + '.usdz')
    bpy.ops.wm.usd_export(filepath=dst, export_materials=True, generate_preview_surface=True, export_textures_mode='NEW', usdz_downscale_size='2048', triangulate_meshes=True, export_curves=False, export_volumes=False,
                          convert_orientation=True, export_global_forward_selection='NEGATIVE_Z', export_global_up_selection='Y',
                          export_animation=False, export_lights=False, export_cameras=False, selected_objects_only=False)
    report[i] = {'min': [round(v, 3) for v in lo], 'max': [round(v, 3) for v in hi], 'bytes': os.path.getsize(dst)}
    print(i, report[i], flush=True)
json.dump(report, open(os.path.join(out, 'bounds.json'), 'w'), indent=1, sort_keys=True)
