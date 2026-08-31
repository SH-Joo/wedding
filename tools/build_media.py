#!/usr/bin/env python3
"""
사진을 웹에 맞게 줄이고, 갤러리 목록(album.json)을 만듭니다.

  python tools/build_media.py

하는 일
  images/Title/  →  assets/img/title/   표지 두 장 (여러 크기, 손대지 않음)
  images/album/  →  assets/img/album/   갤러리 (여러 크기 + 흐린 미리보기)
                 →  assets/data/album.json
                 →  assets/img/og.jpg   카카오톡 링크 카드 1200x630

이 스크립트는 로컬과 GitHub Actions 에서 똑같이 돕니다.
갤러리에 사진을 추가하려면 images/album/ 에 넣고 push 하면 끝입니다.
파일 이름 순서대로 나오니 01_.jpg, 02_.jpg … 처럼 붙여 주세요.
"""

import base64
import io
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageEnhance, ImageOps
except ImportError:
    sys.exit("Pillow 가 필요합니다:  python -m pip install pillow")


ROOT = Path(__file__).resolve().parent.parent

SRC_TITLE = ROOT / "images" / "Title"
SRC_ALBUM = ROOT / "images" / "album"

OUT_TITLE = ROOT / "assets" / "img" / "title"
OUT_ALBUM = ROOT / "assets" / "img" / "album"
OUT_DATA = ROOT / "assets" / "data"
OUT_OG = ROOT / "assets" / "img" / "og.jpg"
OUT_MAP = ROOT / "assets" / "img" / "map.webp"

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG", ".WEBP"}

ALBUM_WIDTHS = (480, 960, 1600)
TITLE_WIDTHS = (720, 1080, 1600)

WEBP_Q = 82          # 갤러리·커버 화질
LQIP_W = 20          # 흐린 미리보기 가로 픽셀
CREAM = (233, 228, 214)   # 포스터 크림색 — OG 여백에 씁니다


# ── Title 이미지 두 장을 어떤 이름으로 부를지 ──────────────────────
# 파일명에 아래 키워드가 있으면 그 역할로 씁니다.
TITLE_ROLES = [
    ("fresh", ["산뜻", "fresh"]),   # 첫 화면 커버
    ("mag", ["화려", "잡지", "mag"]),  # 본문 중반 잡지 표지
]

# OG 카드 — 잡지 포스터에서 잘라낼 세로 구간 (제목 + 이름 + 날짜 + 커플 상단)
OG_TOP = 0.075
OG_SIZE = (1200, 630)


def log(msg):
    print(msg, flush=True)


# Windows 콘솔은 기본이 cp949 라 한글·기호에서 터집니다.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def natural_key(path: Path):
    """01_.jpg, 2.jpg, 10.jpg 를 사람이 기대하는 순서로 정렬합니다."""
    return [int(t) if t.isdigit() else t.lower()
            for t in re.split(r"(\d+)", path.name)]


def slugify(name: str) -> str:
    """한글·공백이 섞인 파일명을 URL 에 안전한 이름으로 바꿉니다."""
    stem = Path(name).stem
    s = re.sub(r"[^a-zA-Z0-9]+", "-", stem).strip("-").lower()
    return s or "photo"


def load(path: Path) -> Image.Image:
    """EXIF 회전을 적용하고 메타데이터(GPS 포함)를 떼어냅니다."""
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    clean = Image.new(im.mode, im.size)
    clean.putdata(list(im.getdata()))
    return clean


def save_webp(im: Image.Image, dest: Path, width: int, quality: int = WEBP_Q) -> tuple:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if im.width > width:
        h = round(im.height * width / im.width)
        out = im.resize((width, h), Image.LANCZOS)
    else:
        out = im
    out.save(dest, "WEBP", quality=quality, method=6)
    return out.size


def lqip(im: Image.Image) -> str:
    """20px 짜리 흐린 미리보기를 base64 문자열로 만듭니다."""
    h = max(1, round(im.height * LQIP_W / im.width))
    tiny = im.resize((LQIP_W, h), Image.LANCZOS)
    buf = io.BytesIO()
    tiny.save(buf, "WEBP", quality=40, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def kb(path: Path) -> str:
    return f"{path.stat().st_size / 1024:.0f}KB"


# ── Title ────────────────────────────────────────────────────────

def find_title(role_keywords):
    if not SRC_TITLE.is_dir():
        return None
    for f in sorted(SRC_TITLE.iterdir()):
        if f.suffix not in PHOTO_EXT:
            continue
        low = f.name.lower()
        if any(k.lower() in low for k in role_keywords):
            return f
    return None


def build_title():
    """커버(fresh)와 잡지 표지(mag) 를 여러 크기로 뽑습니다."""
    found = {}
    for role, keywords in TITLE_ROLES:
        src = find_title(keywords)
        if not src:
            log(f"  ! {role}: images/Title/ 에서 못 찾음 ({'/'.join(keywords)})")
            continue
        found[role] = src
        im = load(src)
        log(f"  {role}  <- {src.name}  {im.width}x{im.height}")

        for w in TITLE_WIDTHS:
            size = save_webp(im, OUT_TITLE / f"{role}-{w}.webp", w)
            log(f"      {role}-{w}.webp  {size[0]}x{size[1]}  {kb(OUT_TITLE / f'{role}-{w}.webp')}")

    return found


# ── OG 카드 ──────────────────────────────────────────────────────

def build_og(mag_src: Path):
    """
    잡지 포스터 위쪽을 1200x630 으로 잘라 카카오톡 링크 카드를 만듭니다.
    글자가 이미 사진에 있어서 폰트 파일이 필요 없습니다.
    """
    im = load(mag_src)
    target_ratio = OG_SIZE[0] / OG_SIZE[1]

    top = round(im.height * OG_TOP)
    band_h = round(im.width / target_ratio)
    if top + band_h > im.height:
        band_h = im.height - top

    band = im.crop((0, top, im.width, top + band_h))
    card = Image.new("RGB", OG_SIZE, CREAM)
    band = band.resize(OG_SIZE, Image.LANCZOS)
    card.paste(band, (0, 0))

    OUT_OG.parent.mkdir(parents=True, exist_ok=True)
    card.save(OUT_OG, "JPEG", quality=88, optimize=True, progressive=True)
    log(f"  og.jpg  1200x630  {kb(OUT_OG)}")


def read_coords():
    """content.js 에서 좌표와 예식장 이름을 읽습니다."""
    src = (ROOT / "assets" / "js" / "content.js").read_text(encoding="utf-8")

    def grab(key, cast=str):
        m = re.search(key + r":\s*'?([^,'\n]+)'?", src)
        if not m:
            raise SystemExit(f"content.js 에서 {key} 를 찾지 못했습니다.")
        return cast(m.group(1).strip())

    return {"lat": grab("lat", float), "lng": grab("lng", float), "venue": grab("venue")}


CONTENT_COORDS = read_coords()


# ── 지도 ─────────────────────────────────────────────────────────

MAP_ZOOM = 16
MAP_SIZE = (1000, 560)      # 만들어 둘 크기
MAP_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"


def build_map(lat, lng, venue):
    """
    예식장 주변을 담은 지도 그림을 만듭니다.

    지도를 iframe 으로 띄우면 아래에 저작권 띠가 크게 붙어 정작 지도가
    잘 안 보입니다. 타일을 받아 한 장으로 합치고, 톤을 낮춘 뒤 우리
    표시를 찍습니다. 저작권 표기는 화면에서 우리 서체로 답니다.
    """
    import math
    import urllib.request

    z = MAP_ZOOM
    n = 2 ** z
    x = (lng + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n

    cols = MAP_SIZE[0] // 256 + 2
    rows = MAP_SIZE[1] // 256 + 2
    x0, y0 = int(x) - cols // 2, int(y) - rows // 2

    canvas = Image.new("RGB", (cols * 256, rows * 256), (233, 228, 214))
    got = 0
    for dx in range(cols):
        for dy in range(rows):
            url = MAP_TILE.format(z=z, x=x0 + dx, y=y0 + dy)
            try:
                req = urllib.request.Request(url, headers={
                    "User-Agent": "wedding-invitation/1.0 (static map, one-off build)"
                })
                with urllib.request.urlopen(req, timeout=15) as r:
                    tile = Image.open(io.BytesIO(r.read())).convert("RGB")
                canvas.paste(tile, (dx * 256, dy * 256))
                got += 1
            except Exception as e:
                log(f"  ! 타일 {x0+dx},{y0+dy} 실패 ({e})")

    if got == 0:
        log("  ! 지도 타일을 하나도 못 받아 건너뜁니다")
        return

    # 예식장이 한가운데 오도록 잘라냅니다
    cx = (x - x0) * 256
    cy = (y - y0) * 256
    left = round(cx - MAP_SIZE[0] / 2)
    top = round(cy - MAP_SIZE[1] / 2)
    left = max(0, min(left, canvas.width - MAP_SIZE[0]))
    top = max(0, min(top, canvas.height - MAP_SIZE[1]))
    view = canvas.crop((left, top, left + MAP_SIZE[0], top + MAP_SIZE[1]))

    # 청첩장 톤에 맞춰 채도를 낮춥니다
    view = ImageEnhance.Color(view).enhance(0.45)
    view = ImageEnhance.Brightness(view).enhance(1.04)

    # 크림슨 표시
    d = ImageDraw.Draw(view, "RGBA")
    mx, my = MAP_SIZE[0] // 2, MAP_SIZE[1] // 2
    d.ellipse([mx - 34, my - 34, mx + 34, my + 34], fill=(176, 17, 51, 40))
    d.ellipse([mx - 11, my - 11, mx + 11, my + 11],
              fill=(176, 17, 51, 255), outline=(255, 255, 255, 255), width=3)

    OUT_MAP.parent.mkdir(parents=True, exist_ok=True)
    view.save(OUT_MAP, "WEBP", quality=80, method=6)
    log(f"  map.webp  {MAP_SIZE[0]}x{MAP_SIZE[1]}  {kb(OUT_MAP)}  (타일 {got}장)")


# ── 앨범 ─────────────────────────────────────────────────────────

def build_album():
    items = []
    if not SRC_ALBUM.is_dir():
        SRC_ALBUM.mkdir(parents=True, exist_ok=True)

    photos = sorted(
        (f for f in SRC_ALBUM.iterdir() if f.is_file() and f.suffix in PHOTO_EXT),
        key=natural_key,
    )

    if not photos:
        log("  (images/album/ 이 비어 있습니다 — 갤러리 섹션은 화면에서 숨겨집니다)")
    else:
        seen = set()
        for i, src in enumerate(photos, 1):
            slug = slugify(src.name)
            if slug in seen:                      # 이름이 겹치면 번호를 붙입니다
                slug = f"{slug}-{i}"
            seen.add(slug)

            im = load(src)
            widest = None
            srcs = {}
            for w in ALBUM_WIDTHS:
                dest = OUT_ALBUM / f"{slug}-{w}.webp"
                size = save_webp(im, dest, w)
                srcs[str(w)] = rel(dest)
                widest = size

            items.append({
                "id": slug,
                "alt": "",
                "w": widest[0],
                "h": widest[1],
                "blur": lqip(im),
                "src": srcs,
            })
            log(f"  {i:2d}. {src.name}  ->  {slug}  {widest[0]}x{widest[1]}")

    OUT_DATA.mkdir(parents=True, exist_ok=True)
    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "widths": list(ALBUM_WIDTHS),
        "items": items,
    }
    (OUT_DATA / "album.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return items


# ── 실행 ─────────────────────────────────────────────────────────

def main():
    log("사진 준비 중…\n")

    for d in (OUT_TITLE, OUT_ALBUM):
        if d.exists():
            shutil.rmtree(d)

    log("[표지]")
    titles = build_title()

    log("\n[링크 카드]")
    if "mag" in titles:
        build_og(titles["mag"])
    else:
        log("  ! 잡지 표지가 없어 og.jpg 를 건너뜁니다")

    log("\n[지도]")
    w = CONTENT_COORDS
    try:
        build_map(w["lat"], w["lng"], w["venue"])
    except Exception as err:
        log(f"  ! 지도를 건너뜁니다 ({err})")

    log("\n[갤러리]")
    items = build_album()

    log(f"\n끝났습니다. 갤러리 {len(items)}장.")


if __name__ == "__main__":
    main()
