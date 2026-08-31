#!/usr/bin/env python3
"""
사진을 웹에 맞게 줄이고, 갤러리 목록(album.json)을 만듭니다.

  python tools/build_media.py

하는 일
  images/Title/  →  assets/img/title/   커버·표지 (여러 크기)
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
    from PIL import Image, ImageFilter, ImageOps
except ImportError:
    sys.exit("Pillow 가 필요합니다:  python -m pip install pillow")


ROOT = Path(__file__).resolve().parent.parent

SRC_TITLE = ROOT / "images" / "Title"
SRC_ALBUM = ROOT / "images" / "album"

OUT_TITLE = ROOT / "assets" / "img" / "title"
OUT_ALBUM = ROOT / "assets" / "img" / "album"
OUT_DATA = ROOT / "assets" / "data"
OUT_OG = ROOT / "assets" / "img" / "og.jpg"
OUT_CSS = ROOT / "assets" / "css" / "generated.css"

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

# 커버(fresh) 세로 크롭
# 아래쪽 영문 문단을 버리고, 사진 끝에 '바닥 연장'을 덧붙입니다.
# 사진 맨 아랫줄 색에서 시작해 페이지 배경색으로 끝나는 띠라,
# 사진이 페이지에 그대로 이어져 이음매가 보이지 않습니다.
FRESH_TALL_TOP = 0.030      # 위쪽 아치는 조금 덜어냅니다
FRESH_TALL_BOTTOM = 0.895   # 날짜 배지 타원 바로 아래 (타원은 0.856~0.886)
FRESH_TALL_FOOT = 0.30      # 완성 높이 중 바닥 연장이 차지하는 비율
FRESH_TALL_RATIO = 0.565     # 완성본 가로/세로
# 바닥 연장을 넉넉히 두는 이유:
#   화면에서 사진 아래에 장소·버튼 안내가 겹칩니다. 연장이 짧으면
#   그 안내가 날짜 배지를 덮거나, object-fit:cover 가 배지를 잘라냅니다.
#   연장이 전체의 30% 면 썸네일 줄까지 들어가도 배지가 안내 위에 놓입니다.
PAGE_BG = (0xE9, 0xE4, 0xD6)   # tokens.css 의 --bg 와 같아야 합니다

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

        # 커버는 폰 전용 세로 크롭을 하나 더 만듭니다.
        # 아래쪽 영문 문단을 버려 참석 버튼이 앉을 바닥 여백을 남깁니다.
        if role == "fresh":
            top = round(im.height * FRESH_TALL_TOP)
            bot = round(im.height * FRESH_TALL_BOTTOM)
            photo_h = bot - top
            full_h = round(photo_h / (1 - FRESH_TALL_FOOT))
            foot_h = full_h - photo_h
            crop_w = min(im.width, round(full_h * FRESH_TALL_RATIO))
            left = (im.width - crop_w) // 2

            photo = im.crop((left, top, left + crop_w, bot))

            # 바닥 연장 — 사진 맨 아랫줄에서 이어받아 페이지 배경색으로.
            # 단색으로 채우면 사진 아래 좌우의 어두운 벽과 층이 져서
            # 가로 이음매가 보입니다. 열마다 제 색에서 출발시킵니다.
            overlap = max(8, photo.height // 40)
            blend_h = foot_h + overlap

            row = photo.crop((0, photo.height - max(2, photo.height // 300),
                              photo.width, photo.height))
            row = row.resize((crop_w, 1), Image.LANCZOS)
            # 크게 흐려 구두·벽 색이 세로로 번져 보이지 않게 합니다
            row = row.filter(ImageFilter.GaussianBlur(radius=crop_w / 9))
            stretched = row.resize((crop_w, blend_h), Image.NEAREST)

            solid = Image.new("RGB", (crop_w, blend_h), PAGE_BG)

            def _ramp(fn):
                g = Image.new("L", (1, blend_h))
                g.putdata([fn(y) for y in range(blend_h)])
                return g.resize((crop_w, blend_h), Image.NEAREST)

            # 위쪽 60% 안에 크림색으로 완전히 가라앉습니다
            def _to_cream(y):
                t = min(1.0, (y / max(1, blend_h - 1)) / 0.6)
                return round(255 * t * t * (3 - 2 * t))
            foot = Image.composite(solid, stretched, _ramp(_to_cream))

            # 사진 위로 조금 겹쳐 시작해 이음매 선을 없앱니다
            def _fade_in(y):
                t = min(1.0, y / overlap)
                return round(255 * t * t * (3 - 2 * t))

            tall = Image.new("RGB", (crop_w, full_h), PAGE_BG)
            tall.paste(photo, (0, 0))
            tall.paste(foot, (0, photo.height - overlap), _ramp(_fade_in))

            base = bottom_color(photo)

            for w in (720, 1080):
                size = save_webp(tall, OUT_TITLE / f"fresh-tall-{w}.webp", w)
                log(f"      fresh-tall-{w}.webp  {size[0]}x{size[1]}  "
                    f"{kb(OUT_TITLE / f'fresh-tall-{w}.webp')}")
            found["_footColor"] = base
            log(f"      바닥 연장 {foot_h}px  {base} → #E9E4D6")

    return found


def bottom_color(im: Image.Image) -> str:
    """
    커버 사진 맨 아래 '밝은 바닥면' 색을 뽑습니다.

    단순 평균을 내면 어두운 아치 벽이나 인물의 구두가 섞여 실제
    바닥보다 어둡게 나옵니다. 밝은 쪽 절반만 골라 평균을 냅니다.
    """
    band = max(4, im.height // 200)
    strip = im.crop((0, im.height - band, im.width, im.height))
    strip = strip.resize((80, 4), Image.LANCZOS)

    px = list(strip.getdata())
    px.sort(key=lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])
    bright = px[len(px) // 2:]          # 밝은 쪽 절반
    n = len(bright)
    rgb = tuple(round(sum(c[i] for c in bright) / n) for i in range(3))
    return "#%02X%02X%02X" % rgb


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

    log("\n[갤러리]")
    foot = titles.get("_footColor", "#EFECE3")
    OUT_CSS.parent.mkdir(parents=True, exist_ok=True)
    OUT_CSS.write_text(
        "/* build_media.py 가 사진에서 뽑아 만듭니다. 직접 고치지 마세요. */" + chr(10)
        + ":root{ --cover-foot:%s; }" % foot + chr(10),
        encoding="utf-8",
    )
    log("  generated.css   --cover-foot:%s" % foot)

    items = build_album()

    log(f"\n끝났습니다. 갤러리 {len(items)}장.")


if __name__ == "__main__":
    main()
