"""Сжать скриншот для печати в лог Actions: shrink-shot.py in.png out.jpg ширина"""
import sys
from PIL import Image

src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert("RGB")
im = im.resize((width, int(im.height * width / im.width)))
im.save(dst, "JPEG", quality=60, optimize=True)
print(im.size)
