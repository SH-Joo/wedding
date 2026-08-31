#!/usr/bin/env python3
"""
index.html 의 CSS·JS 주소 뒤에 버전을 붙입니다.

  python tools/stamp_version.py <버전>

브라우저가 옛 파일을 캐시에서 꺼내 쓰면 CSS 와 JS 버전이 어긋나
화면이 밀립니다. 주소가 바뀌면 반드시 새로 받아갑니다.

  assets/js/app.js  →  assets/js/app.js?v=0bce9031
"""

import re
import sys
from pathlib import Path

# Windows 콘솔은 기본이 cp949 라 한글·기호에서 터집니다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"

# 이미 붙어 있는 버전은 새 것으로 갈아끼웁니다.
PATTERN = re.compile(r'(assets/(?:css|js)/[A-Za-z0-9._-]+\.(?:css|js))(\?v=[A-Za-z0-9]+)?"')


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "dev"
    version = re.sub(r"[^A-Za-z0-9]", "", version)[:12] or "dev"

    html = PAGE.read_text(encoding="utf-8")
    html, hits = PATTERN.subn(lambda m: f'{m.group(1)}?v={version}"', html)
    PAGE.write_text(html, encoding="utf-8")

    print(f"버전 {version} — {hits}곳에 도장을 찍었습니다.")
    if hits == 0:
        print("! 붙일 곳을 못 찾았습니다. index.html 의 경로 형식을 확인하세요.")
        sys.exit(1)


if __name__ == "__main__":
    main()
