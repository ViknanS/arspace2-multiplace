"""Validate the converted USDZ models for RealityKit / ARKit.

Checks every .usdz in a folder with OpenUSD (pip install usd-core):
  - opens without composition errors, has a default prim
  - upAxis Y, metersPerUnit 1.0
  - only UsdPreviewSurface / UsdUVTexture / UsdPrimvarReader / UsdTransform2d shaders
  - textures are PNG or JPEG and packed inside the .usdz
  - OpenUSD's built-in validators (usdz package, missing references,
    shader compliance, material bindings, stage metadata) report no errors
  - bounding box matches the catalog footprint (when bounds.json exists)
  - no visible material is fully transparent (opacity 0, unconnected)

usage: python3 tools/usdz/validate.py <folder with .usdz>    exit code 1 on failure
"""
import json
import os
import sys

from pxr import Usd, UsdGeom, UsdShade, UsdUtils, UsdValidation, Sdf

ALLOWED_SHADERS = {'UsdPreviewSurface', 'UsdUVTexture', 'UsdPrimvarReader_float2', 'UsdPrimvarReader_float', 'UsdTransform2d'}
VALIDATORS = [
    'usdUtilsValidators:UsdzPackageValidator',
    'usdUtilsValidators:RootPackageValidator',
    'usdUtilsValidators:FileExtensionValidator',
    'usdUtilsValidators:PackageEncapsulationValidator',
    'usdUtilsValidators:MissingReferenceValidator',
    'usdValidation:CompositionErrorTest',
    'usdValidation:StageMetadataChecker',
    'usdGeomValidators:StageMetadataChecker',
    'usdShadeValidators:ShaderSdrCompliance',
    'usdShadeValidators:MaterialBindingApiAppliedValidator',
    'usdShadeValidators:MaterialBindingRelationships',
    'usdShadeValidators:NormalMapTextureValidator',
]


def check(path):
    problems, notes = [], []
    stage = Usd.Stage.Open(path)
    if not stage.GetDefaultPrim():
        problems.append('no default prim')
    if UsdGeom.GetStageUpAxis(stage) != 'Y':
        problems.append(f'upAxis {UsdGeom.GetStageUpAxis(stage)}')
    if abs(UsdGeom.GetStageMetersPerUnit(stage) - 1.0) > 1e-6:
        problems.append(f'metersPerUnit {UsdGeom.GetStageMetersPerUnit(stage)}')
    meshes = 0
    for prim in stage.Traverse():
        if prim.IsA(UsdGeom.Mesh):
            meshes += 1
        if prim.IsA(UsdShade.Shader):
            sid = prim.GetAttribute('info:id').Get()
            if sid not in ALLOWED_SHADERS:
                problems.append(f'unsupported shader {sid} at {prim.GetPath()}')
            shader = UsdShade.Shader(prim)
            if sid == 'UsdUVTexture':
                f = shader.GetInput('file')
                asset = f.Get() if f else None
                if asset and not asset.path.lower().endswith(('.png', '.jpg', '.jpeg')):
                    problems.append(f'texture format {asset.path}')
            if sid == 'UsdPreviewSurface':
                op = shader.GetInput('opacity')
                if op and not op.HasConnectedSource() and (op.Get() or 0) <= 0.0:
                    problems.append(f'fully transparent material {prim.GetParent().GetName()}')
    if not meshes:
        problems.append('no meshes')
    # every dependency must be inside the package
    layers, assets, unresolved = UsdUtils.ComputeAllDependencies(Sdf.AssetPath(path))
    if unresolved:
        problems.append(f'unresolved assets {unresolved}')
    reg = UsdValidation.ValidationRegistry()
    for name in VALIDATORS:
        v = reg.GetOrLoadValidatorByName(name)
        if not v:
            notes.append(f'validator {name} not available')
            continue
        errs = v.Validate(stage) if v.GetMetadata().isSuite is False else []
        for e in errs:
            if e.GetType() == UsdValidation.ValidationErrorType.Error:
                problems.append(f'{name}: {e.GetMessage()}')
    bbox = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ['default', 'render']).ComputeWorldBound(stage.GetPseudoRoot()).ComputeAlignedRange()
    size = [round(bbox.GetMax()[i] - bbox.GetMin()[i], 3) for i in range(3)]
    return problems, notes, size, meshes, len(assets)


def main(folder):
    expected = {}
    bj = os.path.join(folder, 'bounds.json')
    if os.path.exists(bj):
        for k, v in json.load(open(bj)).items():
            expected[k] = [round(v['max'][i] - v['min'][i], 3) for i in range(3)]
    files = sorted(f for f in os.listdir(folder) if f.endswith('.usdz'))
    failed = 0
    for f in files:
        pid = f[:-5]
        problems, notes, size, meshes, nassets = check(os.path.join(folder, f))
        exp = expected.get(pid)
        if exp and any(abs(a - b) > 0.01 for a, b in zip(size, exp)):
            problems.append(f'size {size} != glTF size {exp}')
        status = 'OK  ' if not problems else 'FAIL'
        failed += bool(problems)
        print(f'{status} {pid:16s} size(m) {size}  meshes {meshes}  textures {nassets}  {os.path.getsize(os.path.join(folder, f)) // 1024} KB')
        for p in problems:
            print('       -', p)
        for n in notes:
            print('       ·', n)
    print(f'{len(files) - failed} / {len(files)} USDZ files valid')
    return 1 if failed or not files else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
