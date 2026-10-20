"""Copy the catalog thumbnails (public/thumbs/*.webp) to PNG for the iOS app.
usage: python3 tools/usdz/thumbs.py public/thumbs ios/ARSpaceMultiPlace/ARSpaceMultiPlace/Thumbnails"""
import os, sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
n = 0
for f in sorted(os.listdir(src)):
    if f.endswith('.webp'):
        Image.open(os.path.join(src, f)).convert('RGBA').resize((240, 240), Image.LANCZOS).save(os.path.join(out, f[:-5] + '.png'), optimize=True)
        n += 1
print(f'{n} thumbnails written to {out}')
