# 주시헌 ♥ 황유나 모바일 청첩장

**https://sh-joo.github.io/wedding/**

2026년 11월 28일 토요일 오후 6시 · 더블트리 바이 힐튼 서울 판교 그랜드볼룸

---

## 사진 추가하기

`images/album/` 에 사진을 넣고 push 하면 끝입니다. 코드는 건드리지 않아도 됩니다.

```bash
git add . && git commit -m "사진 추가" && git push
```

1~2분 뒤 갤러리에 반영됩니다. 파일 이름 순서대로 나오니 `01.jpg`, `02.jpg` … 처럼
번호를 붙이면 그 순서가 됩니다. 배포할 때 480 / 960 / 1600px 세 크기로 자동 변환되어
휴대폰에서는 작은 것만 내려받습니다. 원본 크기는 신경 쓰지 않아도 됩니다.

## 내용 고치기

`assets/js/content.js` 한 파일만 고치면 됩니다. 이름, 날짜, 식순, 오시는 길, 계좌 등
모든 문구가 여기 있습니다. 색과 글꼴은 `assets/css/tokens.css` 에 있습니다.

## 로컬에서 보기

```bash
python tools/build_media.py     # 사진 변환 + 갤러리 목록 생성 (한 번만)
python -m http.server 8000      # http://localhost:8000
```

Pillow 가 필요합니다: `python -m pip install pillow`

연락처와 계좌번호를 로컬에서도 보려면 `assets/js/private.sample.js` 를
`private.js` 로 복사한 뒤 실제 값을 넣으세요. 이 파일은 git 에 올라가지 않습니다.

## 배포

`main` 에 push 하면 GitHub Actions 가 알아서 합니다. 별도 명령은 없습니다.

**한 번만 해두면 되는 설정**

1. Settings → Pages → Source 를 `GitHub Actions` 로
2. Settings → Secrets and variables → Actions 에서 아래를 등록

| 이름 | 값 | 없으면 |
|---|---|---|
| `GROOM_PHONE` | 신랑 연락처 | 전화 버튼이 안 보입니다 |
| `BRIDE_PHONE` | 신부 연락처 | 전화 버튼이 안 보입니다 |
| `GROOM_FATHER_PHONE` | 신랑 아버님 | 혼주 줄이 안 보입니다 |
| `GROOM_MOTHER_PHONE` | 신랑 어머님 | |
| `BRIDE_FATHER_PHONE` | 신부 아버님 | |
| `BRIDE_MOTHER_PHONE` | 신부 어머님 | |
| `ACCOUNT` | 신랑 계좌번호 | 계좌 버튼이 안 보입니다 |
| `RSVP_ENDPOINT` | Apps Script 웹앱 주소 | RSVP 가 연습 모드로 돕니다 |
| `KAKAO_JS_KEY` | 카카오 JavaScript 키 | 공유가 링크 복사로 대체됩니다 |

## 아직 연결이 필요한 것

- **RSVP 실제 저장** — 구글 시트 + `apps-script/Code.gs` 배포 후 `RSVP_ENDPOINT` 등록.
  지금은 브라우저에만 저장되는 연습 모드입니다.
- **카카오톡 공유** — developers.kakao.com 에서 앱을 만들고 JS 키를 `KAKAO_JS_KEY` 에.
  플랫폼에 `https://sh-joo.github.io` 도메인을 등록해야 합니다.
- **신부측 계좌** — `content.js` 의 `accounts.bride` 가 비어 있습니다.

## 구조

```
index.html              화면 다섯 장
assets/css/tokens.css   색·글꼴·여백
assets/css/style.css    레이아웃
assets/js/content.js    모든 문구와 정보
assets/js/app.js        화면 그리기
assets/js/rsvp.js       참석 의사 팝업
tools/build_media.py    사진 변환 + 갤러리 목록 생성
images/Title/           커버(산뜻한 메인) · 잡지 표지
images/album/           갤러리 사진 — 여기에 넣으세요
```

`assets/img/` 와 `assets/data/album.json` 은 배포할 때 만들어집니다. 커밋하지 않습니다.
