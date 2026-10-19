# Generates the app icons (run once: python3 scripts/make-icons.py). Needs Pillow.
import math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)
BG = (15, 76, 92); ACC = (232, 89, 12); WHITE = (255, 255, 255)

def draw(size, maskable=False):
    S = size * 4  # supersample
    im = Image.new('RGBA', (S, S), BG if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if not maskable:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    k = 0.78 if maskable else 1.0  # keep art inside the safe zone when maskable
    cx = cy = S / 2
    # gear
    teeth, ro, rb, ri = 10, S * 0.30 * k, S * 0.245 * k, S * 0.105 * k
    pts = []
    for i in range(teeth * 4):
        a = 2 * math.pi * i / (teeth * 4) - math.pi / 2
        r = ro if (i % 4) in (1, 2) else rb
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=WHITE)
    d.ellipse([cx - S * .17 * k, cy - S * .17 * k, cx + S * .17 * k, cy + S * .17 * k], fill=BG)
    # box (stock) inside the hub
    b = S * 0.095 * k
    d.rectangle([cx - b, cy - b * .85, cx + b, cy + b * .85], fill=ACC)
    d.rectangle([cx - b, cy - b * .85, cx + b, cy - b * .35], fill=(255, 150, 90))
    d.rectangle([cx - b * .25, cy - b * .85, cx + b * .25, cy - b * .35], fill=ACC)
    return im.resize((size, size), Image.LANCZOS)

draw(192).save(f'{OUT}/icon-192.png')
draw(512).save(f'{OUT}/icon-512.png')
draw(512, True).save(f'{OUT}/maskable-512.png')
a = draw(180); bgim = Image.new('RGB', (180, 180), BG); bgim.paste(a, (0, 0), a); bgim.save(f'{OUT}/apple-touch-icon.png')
print('icons written')
