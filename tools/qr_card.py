"""설치용 QR 카드(A4 반쪽 크기 PNG): python3 tools/qr_card.py <qr_raw.png> <주소> <출력.png>"""
import sys
from PIL import Image, ImageDraw, ImageFont

raw, url, out = sys.argv[1], sys.argv[2], sys.argv[3]
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
W = 1240                              # 약 A4 폭 150dpi
f_title = ImageFont.truetype(FONT, 64, index=6)   # Bold
f_url = ImageFont.truetype(FONT, 36, index=0)
f_note = ImageFont.truetype(FONT, 30, index=0)

q = Image.open(raw).convert('L')
mod = q.width
scale = 22
qr = q.resize((mod * scale, mod * scale), Image.NEAREST)
quiet = 4 * scale                      # 여백 4칸(판독 표준)
box = Image.new('L', (qr.width + 2 * quiet, qr.height + 2 * quiet), 255)
box.paste(qr, (quiet, quiet))
H = 130 + box.height + 30 + 70 + 2 * 48 + 50
card = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(card)
d.text((W // 2, 70), '미국 퀴즈 설치용 QR', fill='#1B3A8C', font=f_title, anchor='mm')
x = (W - box.width) // 2
card.paste(box.convert('RGB'), (x, 130))
y = 130 + box.height + 30
d.text((W // 2, y), url, fill='black', font=f_url, anchor='mm')
notes = [
    '학교 Wi-Fi에서 카메라로 찍어 Safari로 연다 → 공유 → 홈 화면에 추가',
    '홈 화면 아이콘을 인터넷이 될 때 한 번 실행 → «v1 · 웹 앱 · 오프라인 준비 ✓» 확인',
]
for i, t in enumerate(notes):
    d.text((W // 2, y + 70 + i * 48), t, fill='#444444', font=f_note, anchor='mm')
card.save(out)
print('ok', card.size)
