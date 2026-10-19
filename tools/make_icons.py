"""홈 화면 아이콘 생성: python3 tools/make_icons.py (app 폴더에서). 외부 이미지 없이 성조기 느낌 + 물음표."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

APP = Path(__file__).resolve().parent.parent
NAVY, RED, WHITE, GOLD = (27, 58, 140), (200, 16, 46), (255, 255, 255), (255, 196, 0)


def star(draw, cx, cy, r, fill):
    import math
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    draw.polygon(pts, fill=fill)


def make(size=1024):
    im = Image.new('RGB', (size, size), WHITE)
    d = ImageDraw.Draw(im)
    stripe = size / 13
    for i in range(13):
        if i % 2 == 0:
            d.rectangle([0, i * stripe, size, (i + 1) * stripe], fill=RED)
    d.rectangle([0, 0, size * 0.52, stripe * 7], fill=NAVY)
    for row in range(3):
        for col in range(3):
            star(d, size * (0.09 + col * 0.17), stripe * (1.2 + row * 2.3), size * 0.055, WHITE)
    # 물음표 배지
    cx, cy, r = size * 0.70, size * 0.68, size * 0.27
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD, outline=NAVY, width=int(size * 0.025))
    font = None
    for f in ['/System/Library/Fonts/Supplemental/Arial Black.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf']:
        if Path(f).exists():
            font = ImageFont.truetype(f, int(size * 0.36))
            break
    if font is None:
        font = ImageFont.load_default(size=int(size * 0.36))
    d.text((cx, cy + size * 0.01), '?', fill=NAVY, font=font, anchor='mm')
    return im


base = make()
for s in (180, 192, 512):
    base.resize((s, s), Image.LANCZOS).save(APP / f'icon-{s}.png', optimize=True)
print('ok')
