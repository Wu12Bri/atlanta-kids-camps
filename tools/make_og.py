#!/usr/bin/env python3
"""Render og.png (1200x630 share image for Facebook / iMessage / X). Needs Pillow.
Re-run only if the design changes; og.png is committed."""
import os
from PIL import Image, ImageDraw, ImageFont
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1200, 630
def font(paths, size):
    for p in paths:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
SERIF = ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"]
SANS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]
SANSB = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]
im = Image.new("RGB", (W, H), "#fbf3e4"); d = ImageDraw.Draw(im)
for y in range(H):  # soft warm gradient
    t = y / H; d.line([(0, y), (W, y)], fill=(int(255 - 4 * t), int(243 + 4 * t), int(220 + 20 * t)))
# scene (right)
d.ellipse([930, 70, 1090, 230], fill="#f2a541")
d.polygon([(720, 560), (920, 260), (1020, 410), (1090, 330), (1200, 500), (1200, 560)], fill="#1f5f5b")
d.pieslice([660, 490, 1300, 760], 180, 360, fill="#8fbf9f"); d.rectangle([660, 625, 1200, 630], fill="#8fbf9f")
d.rectangle([850, 480, 915, 532], fill="#e76f51"); d.polygon([(840, 484), (882, 444), (925, 484)], fill="#c4553b")
# brand + text (left)
d.ellipse([70, 64, 122, 116], fill="#f2a541"); d.polygon([(82, 101), (94, 82), (102, 92), (108, 85), (114, 101)], fill="#1f5f5b")
d.text((138, 70), "Atlanta Kids Camps", font=font(SANSB, 36), fill="#1d2a2a")
d.text((70, 168), "SUMMER CAMPS 2027", font=font(SANSB, 30), fill="#b03f1c")
big = font(SERIF, 64)
for i, line in enumerate(["Atlanta & Cobb", "camps, compared"]):
    d.text((70, 215 + i * 80), line, font=big, fill="#1d2a2a")
small = font(SANS, 30)
for i, line in enumerate(["Real prices, ages, session weeks and", "sign-up dates from each camp's own site."]):
    d.text((72, 405 + i * 42), line, font=small, fill="#3c4b49")
d.rounded_rectangle([70, 520, 470, 580], radius=30, fill="#1f5f5b")
d.text((100, 533), "atlantakidscamps.com", font=font(SANSB, 28), fill="#ffffff")
im.save(f"{R}/og.png", optimize=True)
print("wrote og.png", im.size, os.path.getsize(f"{R}/og.png"), "bytes")
