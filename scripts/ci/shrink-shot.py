"""Сжать скриншот для печати в лог Actions: shrink-shot.py in.png out.webp ширина [макс_высота_исходника]"""
import sys
from PIL import Image

src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
max_h = int(sys.argv[4]) if len(sys.argv) > 4 else 0
im = Image.open(src).convert("RGB")
if max_h and im.height > max_h:
    im = im.crop((0, 0, im.width, max_h))
im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
im.save(dst, "WEBP", quality=42, method=6)
print(im.size)
