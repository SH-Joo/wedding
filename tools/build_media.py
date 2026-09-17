#!/usr/bin/env python3
"""
사진을 웹에 맞게 줄이고, 갤러리 목록(album.json)을 만듭니다.

  python tools/build_media.py

하는 일
  images/Title/  →  assets/img/title/   표지 두 장 (여러 크기, 손대지 않음)
  images/album/       →  assets/img/album/   크게 볼 때의 사진
  images/thumbnails/  →  assets/img/album/   앨범 격자의 정사각형 썸네일
                      →  assets/data/album.json
  music/*.mp3         →  assets/audio/bgm.mp3, assets/data/music.json
                      →  assets/img/og.jpg   카카오톡 링크 카드 1200x630

이 스크립트는 로컬과 GitHub Actions 에서 똑같이 돕니다.

앨범
  원본은 images/album/, 썸네일은 images/thumbnails/ 에 이름 앞에 t 를
  붙여 넣습니다.   images/album/00029.jpg  ↔  images/thumbnails/t00029.jpg
  확장자와 대소문자는 달라도 짝을 찾습니다.
  썸네일이 없는 사진은 원본 가운데를 정사각형으로 잘라 대신 씁니다.

  순서는 images/s.txt 에 원본 파일명을 한 줄에 하나씩 적습니다.
      00579.jpg
      00029.jpg
  s.txt 에 없는 사진은 그 뒤에 이름의 숫자 오름차순으로 붙습니다.
  s.txt 가 없으면 전부 숫자 오름차순입니다.

배경음악
  music/ 에 mp3 를 넣으면 음악 버튼이 생깁니다(처음엔 꺼짐). 여러 개면 이름순 첫 곡.
"""

import base64
import hashlib
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
SRC_THUMB = ROOT / "images" / "thumbnails"
SRC_ORDER = ROOT / "images" / "s.txt"
SRC_MUSIC = ROOT / "music"

OUT_TITLE = ROOT / "assets" / "img" / "title"
OUT_ALBUM = ROOT / "assets" / "img" / "album"
OUT_DATA = ROOT / "assets" / "data"
OUT_OG = ROOT / "assets" / "img" / "og.jpg"
OUT_MAP = ROOT / "assets" / "img" / "map.webp"
OUT_AUDIO = ROOT / "assets" / "audio"

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG", ".WEBP"}

ALBUM_WIDTHS = (960, 1600)   # 크게 볼 때
THUMB_W = 480                # 격자 한 칸 — 가장 넓어도 160px x 3배 화면
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

def square(im: Image.Image) -> Image.Image:
    """가운데를 기준으로 정사각형으로 자릅니다."""
    side = min(im.width, im.height)
    left = (im.width - side) // 2
    top = (im.height - side) // 2
    return im.crop((left, top, left + side, top + side))


def photos_in(folder: Path):
    if not folder.is_dir():
        return []
    return sorted(
        (f for f in folder.iterdir() if f.is_file() and f.suffix in PHOTO_EXT),
        key=natural_key,
    )


def read_order(photos):
    """images/s.txt 의 순서대로 사진을 늘어놓습니다.

    메모장이 붙이는 BOM, 윈도우 줄바꿈, 앞뒤 공백, 빈 줄은 무시합니다.
    파일명은 대소문자를 가리지 않고, 확장자가 달라도 이름이 같으면
    찾습니다. 썸네일 이름(t00029.jpg)을 적어도 원본으로 알아듣습니다.
    적히지 않은 사진은 뒤에 숫자 오름차순으로 붙입니다."""
    if not SRC_ORDER.is_file():
        return photos

    raw = SRC_ORDER.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp949")          # 메모장 'ANSI' 로 저장한 경우

    by_name = {f.name.lower(): f for f in photos}
    by_stem = {f.stem.lower(): f for f in photos}

    ordered, used = [], set()
    for n, line in enumerate(text.splitlines(), 1):
        name = line.strip()
        if not name:
            continue
        key = name.lower()
        stem = Path(key).stem
        f = (by_name.get(key) or by_stem.get(stem)
             or (by_stem.get(stem[1:]) if stem.startswith("t") else None))
        if f is None:
            log(f"  ! s.txt {n}행 '{name}': images/album/ 에 없어 건너뜁니다")
            continue
        if f in used:
            log(f"  ! s.txt {n}행 '{name}': 이미 앞에 적혀 있어 건너뜁니다")
            continue
        ordered.append(f)
        used.add(f)

    rest = [f for f in photos if f not in used]
    if rest:
        log(f"  (s.txt 에 없는 {len(rest)}장은 뒤에 숫자 순서로 붙입니다: "
            + ", ".join(f.name for f in rest) + ")")
    return ordered + rest


def build_album():
    items = []
    photos = read_order(photos_in(SRC_ALBUM))

    # 썸네일 짝 — 이름 앞에 t 를 붙인 파일(t00029.jpg)을 먼저 찾고,
    # 없으면 같은 이름의 파일을 찾습니다. 확장자·대소문자는 가리지 않습니다.
    thumb_files = photos_in(SRC_THUMB)
    prefixed = {f.stem[1:].lower(): f for f in thumb_files if f.stem[:1] in ("t", "T")}
    plain = {f.stem.lower(): f for f in thumb_files}
    used_thumbs = set()

    if not photos:
        log("  (images/album/ 이 비어 있습니다 — 앨범 화면은 숨겨집니다)")

    seen = set()
    for i, src in enumerate(photos, 1):
        slug = slugify(src.name)
        if slug in seen:                      # 이름이 겹치면 번호를 붙입니다
            slug = f"{slug}-{i}"
        seen.add(slug)

        im = load(src)
        srcs = {}
        widest = None
        for w in ALBUM_WIDTHS:
            dest = OUT_ALBUM / f"{slug}-{w}.webp"
            widest = save_webp(im, dest, w)
            srcs[str(w)] = rel(dest)

        key = src.stem.lower()
        pair = prefixed.get(key) or plain.get(key)
        if pair:
            # 넣어 주신 썸네일은 이미 1:1 로 잘라 둔 것이라 크기만 줄입니다.
            # 1px 쯤 어긋나도 화면의 정사각형 칸(object-fit:cover)이 흡수합니다.
            used_thumbs.add(pair)
            t = load(pair)
            note = ""
        else:
            t = square(im)
            note = "  ! 썸네일이 없어 원본 가운데를 잘라 썼습니다"
        thumb = OUT_ALBUM / f"{slug}-thumb.webp"
        save_webp(t, thumb, THUMB_W)

        items.append({
            "id": slug,
            "alt": "",
            "w": widest[0],
            "h": widest[1],
            "blur": lqip(t),
            "thumb": rel(thumb),
            "src": srcs,
        })
        log(f"  {i:2d}. {src.name}  ->  {slug}  {widest[0]}x{widest[1]}{note}")

    for f in thumb_files:
        if f not in used_thumbs:
            log(f"  ! thumbnails/{f.name}: 짝이 되는 원본이 images/album/ 에 없어 건너뜁니다")

    OUT_DATA.mkdir(parents=True, exist_ok=True)
    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "items": items,
    }
    (OUT_DATA / "album.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return items


# ── 배경음악 ─────────────────────────────────────────────────────

def build_music():
    """music/ 의 첫 mp3 를 영문 이름으로 옮기고 주소를 적어 둡니다.

    한글 파일명은 주소에서 깨지기 쉬워 bgm.mp3 로 옮깁니다. 곡을
    바꿔도 이름이 같으면 휴대폰이 옛 곡을 기억하므로, 내용으로 만든
    꼬리표(?v=)를 붙입니다."""
    songs = sorted(
        (f for f in SRC_MUSIC.iterdir() if f.is_file() and f.suffix.lower() == ".mp3"),
        key=natural_key,
    ) if SRC_MUSIC.is_dir() else []

    OUT_DATA.mkdir(parents=True, exist_ok=True)
    src = ""
    if not songs:
        log("  (music/ 에 mp3 가 없습니다 — 음악 버튼은 숨겨집니다)")
    else:
        song = songs[0]
        OUT_AUDIO.mkdir(parents=True, exist_ok=True)
        dest = OUT_AUDIO / "bgm.mp3"
        shutil.copyfile(song, dest)
        tag = hashlib.sha1(dest.read_bytes()).hexdigest()[:10]
        src = f"{rel(dest)}?v={tag}"
        mb = dest.stat().st_size / 1048576
        log(f"  {song.name}  ->  {rel(dest)}  {mb:.1f}MB")
        if mb > 6:
            log("  ! 파일이 큽니다. 하객이 데이터로 받게 되니 128kbps 로 줄이길 권합니다")
        if len(songs) > 1:
            log(f"  ! mp3 가 {len(songs)}개입니다. 이름순 첫 곡만 씁니다")

    (OUT_DATA / "music.json").write_text(
        json.dumps({"src": src}, ensure_ascii=False), encoding="utf-8"
    )


# ── 실행 ─────────────────────────────────────────────────────────

def main():
    log("사진 준비 중…\n")

    for d in (OUT_TITLE, OUT_ALBUM, OUT_AUDIO):
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

    log("\n[앨범]")
    items = build_album()

    log("\n[배경음악]")
    build_music()

    log(f"\n끝났습니다. 앨범 {len(items)}장.")


if __name__ == "__main__":
    main()
