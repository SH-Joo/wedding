#!/usr/bin/env python3
"""
images/album/ 의 원본을 웹에 필요한 만큼으로 줄입니다.

  python tools/shrink_album.py [가로픽셀]      기본 1600

왜 필요한가
  build_media.py 는 가로 1600px 까지만 씁니다. 그보다 큰 원본은
  한 픽셀도 화면에 나오지 않습니다. 그런데 git 은 한 번 올린 파일을
  지워도 기록에 남기므로, 큰 원본을 올리면 저장소가 계속 무거워집니다.

  기준은 '긴 변'이 아니라 '가로'입니다. 긴 변으로 2000px 을 맞추면
  세로 사진이 가로 1333px 이 되어 크게 보기가 흐려집니다.

주의
  원본 파일을 덮어씁니다. 진짜 원본은 따로 보관하세요.
"""

import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow 가 필요합니다:  python -m pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
ALBUM = ROOT / "images" / "album"
EXT = {".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"}
QUALITY = 88


def mb(n):
    return f"{n / 1048576:.1f}MB"


def main():
    target_w = int(sys.argv[1]) if len(sys.argv) > 1 else 1600
    if not ALBUM.is_dir():
        sys.exit("images/album/ 이 없습니다.")

    photos = sorted(f for f in ALBUM.iterdir() if f.is_file() and f.suffix in EXT)
    if not photos:
        sys.exit("줄일 사진이 없습니다.")

    before = after = 0
    for f in photos:
        was = f.stat().st_size
        before += was

        im = ImageOps.exif_transpose(Image.open(f))
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

        if im.width > target_w:
            scale = target_w / im.width
            im = im.resize((target_w, round(im.height * scale)), Image.LANCZOS)

        # 회전 정보를 이미 적용했으므로 메타데이터는 넘기지 않습니다.
        # (사진에 남아 있을 수 있는 위치 정보도 함께 사라집니다)
        im.save(f, "JPEG", quality=QUALITY, optimize=True, progressive=True)

        now = f.stat().st_size
        after += now
        print(f"  {f.name:28s} {mb(was):>8s} → {mb(now):>8s}  {im.width}x{im.height}")

    print(f"\n  합계 {mb(before)} → {mb(after)}  ({after / before * 100:.0f}%)")


if __name__ == "__main__":
    main()
