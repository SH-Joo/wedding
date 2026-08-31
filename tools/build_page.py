#!/usr/bin/env python3
"""
index.html 을 배포용으로 마무리합니다.

  python tools/build_page.py <버전> [사이트주소]

하는 일 두 가지
 1) 링크 미리보기(OG) 태그를 content.js 값으로 채워 넣습니다.
    카카오톡·문자·메신저의 크롤러는 JavaScript 를 실행하지 않습니다.
    JS 로 채우면 크롤러는 빈 태그만 보고 기본 제목만 가져갑니다.
    반드시 HTML 에 미리 적혀 있어야 합니다.

 2) CSS·JS 주소 뒤에 버전을 붙입니다.
    브라우저가 옛 파일을 캐시에서 꺼내 쓰면 CSS 와 JS 버전이 어긋나
    화면이 밀립니다. 주소가 바뀌면 반드시 새로 받아갑니다.
"""

import html
import re
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"
CONTENT = ROOT / "assets" / "js" / "content.js"

DEFAULT_SITE = "https://sh-joo.github.io/wedding/"

ASSET = re.compile(r'(assets/(?:css|js)/[A-Za-z0-9._-]+\.(?:css|js))(\?v=[A-Za-z0-9]+)?"')


def share_values():
    """content.js 의 share 블록에서 제목·설명·이미지를 읽습니다."""
    src = CONTENT.read_text(encoding="utf-8")
    block = re.search(r"share:\s*\{(.*?)\n\s*\},", src, re.S)
    if not block:
        sys.exit("content.js 에서 share 블록을 찾지 못했습니다.")
    out = {}
    for key in ("title", "description", "image"):
        m = re.search(key + r":\s*'((?:[^'\\]|\\.)*)'", block.group(1))
        if not m:
            sys.exit(f"content.js 의 share.{key} 를 찾지 못했습니다.")
        out[key] = m.group(1).replace("\\'", "'")
    return out


def put_meta(page, selector, value):
    """meta 태그의 content 를 채웁니다. 없으면 그대로 둡니다."""
    pattern = re.compile(
        r'(<meta\s+(?:property|name)="' + re.escape(selector) + r'"\s+content=")[^"]*(")'
    )
    new, n = pattern.subn(lambda m: m.group(1) + html.escape(value, quote=True) + m.group(2), page)
    if n == 0:
        print(f"  ! {selector} 태그가 없어 건너뜁니다")
    return new


def main():
    version = re.sub(r"[^A-Za-z0-9]", "", sys.argv[1] if len(sys.argv) > 1 else "dev")[:12] or "dev"
    site = (sys.argv[2] if len(sys.argv) > 2 else DEFAULT_SITE).rstrip("/") + "/"

    s = share_values()
    image = s["image"] if s["image"].startswith("http") else site + s["image"].lstrip("/")

    page = PAGE.read_text(encoding="utf-8")

    page = re.sub(r"<title>.*?</title>",
                  "<title>" + html.escape(s["title"]) + "</title>", page, count=1, flags=re.S)

    for sel, val in [
        ("og:title", s["title"]),
        ("og:description", s["description"]),
        ("og:image", image),
        ("og:url", site),
        ("twitter:title", s["title"]),
        ("twitter:description", s["description"]),
        ("twitter:image", image),
    ]:
        page = put_meta(page, sel, val)

    page, hits = ASSET.subn(lambda m: f"{m.group(1)}?v={version}\"", page)

    PAGE.write_text(page, encoding="utf-8")

    print(f"  제목      {s['title']}")
    print(f"  설명      {s['description']}")
    print(f"  카드 이미지 {image}")
    print(f"  주소      {site}")
    print(f"  버전 {version} — CSS·JS {hits}곳")
    if hits == 0:
        sys.exit("CSS·JS 주소를 찾지 못했습니다. index.html 을 확인하세요.")


if __name__ == "__main__":
    main()
