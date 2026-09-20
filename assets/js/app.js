/* ═══════════════════════════════════════════════════════════════
   화면을 그리는 코드입니다. 내용을 바꾸려면 content.js 를 여세요.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* content.js 안의 'wedding.venue' 같은 경로를 읽습니다 */
  const pick = (path, root) =>
    path.split('.').reduce((o, k) => (o == null ? o : o[k]), root || CONTENT);

  const D = new Date(CONTENT.wedding.datetime);
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = n => String(n).padStart(2, '0');

  const NAMES = `${CONTENT.couple.groom.name} · ${CONTENT.couple.bride.name}`;

  function timeText() {
    const h = D.getHours(), m = D.getMinutes();
    const hh = h === 12 ? '낮 12' : h > 12 ? '오후 ' + (h - 12) : '오전 ' + h;
    return hh + '시' + (m ? ' ' + m + '분' : '');
  }

  /* ── content.js 값을 화면에 꽂기 ────────────────────────── */

  function bind() {
    $$('[data-c]').forEach(node => {
      const val = pick(node.dataset.c);
      node.textContent = val == null ? '' : val;
      if (!node.textContent) node.hidden = true;   // 비워둔 항목은 알아서 사라집니다
    });

    document.title = CONTENT.share.title || document.title;
    const og = {
      'og:title': CONTENT.share.title,
      'og:description': CONTENT.share.description,
      'og:image': new URL(CONTENT.share.image, location.href).href,
      'og:url': location.href,
    };
    Object.entries(og).forEach(([p, v]) => {
      let tag = document.querySelector(`meta[property="${p}"]`);
      if (!tag) { tag = el('meta'); tag.setAttribute('property', p); document.head.appendChild(tag); }
      tag.setAttribute('content', v || '');
    });

    $('#footNames').textContent = NAMES;
    // 날짜 한 줄 — 2026. 11. 28 · SAT 6 PM
    const h = D.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const clock = h12 + (D.getMinutes() ? ':' + pad(D.getMinutes()) : '') + ' ' + ampm;
    const line = $('#mastMeta');
    line.textContent = `${D.getFullYear()}. ${pad(D.getMonth() + 1)}. ${pad(D.getDate())}`
                     + ` · ${WEEK_EN[D.getDay()].slice(0, 3).toUpperCase()} ${clock}`;
    line.setAttribute('aria-label',
      `${D.getFullYear()}년 ${D.getMonth() + 1}월 ${D.getDate()}일 ${WEEK[D.getDay()]}요일 ${timeText()}`);

    // 혼주
    const lines = [['groom'], ['bride']].map(([side]) => {
      const p = CONTENT.couple[side];
      const parents = [p.father, p.mother]
        .filter(x => x && x.name)
        .map(x => (x.deceased ? '故 ' : '') + x.name)
        .join(' <em>·</em> ');
      const rank = p.rank ? ` 의 ${p.rank} ` : ' ';
      return `${parents}${rank}<b>${p.name}</b>`;
    });
    $('#signoff').innerHTML = lines.join('<br>');
  }

  function dday() {
    const midnight = t => new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const left = Math.round((midnight(D) - midnight(new Date())) / 86400000);
    return left > 0 ? `D-${left}` : left === 0 ? 'D-DAY' : `D+${-left}`;
  }

  /* ── 안내 문구 띄우기 ───────────────────────────────────── */

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }
  window.__toast = toast;

  async function copy(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = el('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
    toast(msg || '복사했습니다');
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function wireCopy() {
    $$('[data-copy-target]').forEach(btn => {
      btn.addEventListener('click', () => copy(pick(btn.dataset.copyTarget), '주소를 복사했습니다'));
    });
  }

  /* ── 식순 ───────────────────────────────────────────────── */

  /* 식순 — 시각을 왼쪽에 세우고 가는 척추선으로 잇습니다.
     '본식' 한 곳만 채운 점으로 강조합니다. */
  function renderTimeline() {
    const list = $('#timeline');
    (CONTENT.wedding.timeline || []).forEach(t => {
      const li = el('li', 'prog__i' + (t.key ? ' is-key' : ''));
      li.appendChild(el('span', 'prog__time', t.time));
      li.appendChild(el('span', 'prog__dot'));

      const body = el('div', 'prog__body');
      body.appendChild(el('p', 'prog__title', t.title));
      if (t.desc) body.appendChild(el('p', 'prog__desc', t.desc));
      if (t.menu && CONTENT.wedding.menu) {
        const b = el('button', 'prog__link', '메뉴 보기');
        b.type = 'button';
        b.setAttribute('aria-haspopup', 'dialog');
        b.addEventListener('click', openMenu);
        body.appendChild(b);
      }
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  /* ── 오시는 길 ──────────────────────────────────────────── */

  // 버스 번호처럼 '이름'은 상자에 넣고, 시각은 한 줄로 늘어놓습니다.
  // 시각까지 상자에 넣으면 여덟 개가 화면에서 가장 세게 보이는데
  // 정작 중요도는 가장 낮습니다.
  function chipRow(list) {
    const box = el('p', 'chips');
    list.forEach(c => box.appendChild(el('span', null, c)));
    return box;
  }

  function timeRow(list) {
    return el('p', 'times', list.join('  ·  '));
  }

  /* 오시는 방법을 한 화면에 다 펼치면 셔틀만 여섯 줄이라 표가 무너집니다.
     버튼으로 고르고, 고른 것만 팝업으로 보여줍니다. */
  function renderWays() {
    const box = $('#ways');
    (CONTENT.wedding.ways || []).forEach((w, i) => {
      const b = el('button', 'pill pill--sm', w.label);
      b.type = 'button';
      b.setAttribute('aria-haspopup', 'dialog');
      b.addEventListener('click', () => openWay(i));
      box.appendChild(b);
    });
  }

  /* 안내 팝업 — 오시는 길과 식사 메뉴가 같은 판을 씁니다.
     제목과 내용만 바꿔 끼웁니다. 뒤로가기로 닫히도록 기록을 한 칸 쌓습니다. */
  let sheetReturn = null;
  let sheetPushed = false;

  function openSheet(kind, title, fill) {
    const sheet = $('#sheet');
    const body = $('#sheetBody');
    body.textContent = '';
    fill(body);

    sheet.dataset.kind = kind;
    $('#sheetTitle').textContent = title;
    sheetReturn = document.activeElement;
    sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    $('[data-sheet-close]').focus({ preventScroll: true });
    if (!sheetPushed) {
      try { history.pushState({ overlay: 'sheet' }, ''); sheetPushed = true; } catch (e) {}
    }
  }

  function closeSheet(fromHistory) {
    $('#sheet').hidden = true;
    document.body.style.overflow = '';
    if (sheetReturn) sheetReturn.focus({ preventScroll: true });
    const was = sheetPushed;
    sheetPushed = false;
    if (!fromHistory && was) history.back();
  }

  function wireSheet() {
    const sheet = $('#sheet');
    sheet.addEventListener('click', e => {
      if (e.target.closest('[data-sheet-close]')) closeSheet();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !sheet.hidden) closeSheet();
    });
    window.addEventListener('popstate', () => {
      if (!sheet.hidden) closeSheet(true);
    });
  }

  function openWay(i) {
    const w = CONTENT.wedding.ways[i];
    openSheet('way', w.label, body => {
      if (w.text)  body.appendChild(el('p', 'sheet__text', w.text));
      if (w.chips) body.appendChild(chipRow(w.chips));

      // 덧붙일 안내가 있으면 이어서 보여주고,
      // 다른 항목을 가리키면 바로 건너갈 수 있게 합니다.
      if (w.note) {
        const note = el('p', 'sheet__note', w.note);
        if (w.seeAlso) {
          const to = CONTENT.wedding.ways.findIndex(x => x.label === w.seeAlso);
          if (to >= 0) {
            const go = el('button', 'linkbtn', w.seeAlso + ' 안내 보기');
            go.type = 'button';
            go.addEventListener('click', () => openWay(to));
            note.appendChild(document.createTextNode(' '));
            note.appendChild(go);
          }
        }
        body.appendChild(note);
      }
      (w.legs || []).forEach(leg => {
        body.appendChild(el('p', 'sheet__leg', leg.text));
        if (leg.chips) body.appendChild(chipRow(leg.chips));
        if (leg.times) body.appendChild(timeRow(leg.times));
      });
    });
  }

  /* 식사 메뉴 — 코스 차림표. 한 코스에 요리가 둘이면 나란히 같은
     무게로 적습니다. 코스 사이는 짧은 선 하나뿐입니다. */
  function openMenu() {
    const m = CONTENT.wedding.menu;
    openSheet('menu', 'Menu', body => {
      body.appendChild(el('p', 'menu__sub', CONTENT.wedding.venue));
      const list = el('ol', 'menu');
      m.courses.forEach(course => {
        const li = el('li', 'course');
        course.forEach(d => {
          const dish = el('div', 'dish');
          dish.appendChild(el('p', 'dish__en', d.en));
          dish.appendChild(el('p', 'dish__ko', d.ko));
          li.appendChild(dish);
        });
        list.appendChild(li);
      });
      body.appendChild(list);
      if (m.note) body.appendChild(el('p', 'menu__note', m.note));
    });
  }

  /* 지도.
     먼저 배포할 때 만들어 둔 그림을 깔아 화면이 비지 않게 하고,
     카카오맵이 뜨면 그 자리를 대신합니다. 카카오맵은 개발자 콘솔에서
     지도 서비스를 켜야 동작합니다. 꺼져 있으면 SDK 가 403 을 냅니다. */
  function renderMap() {
    const box = $('#map');
    const { lat, lng, venue } = CONTENT.wedding;

    // ── 그림 지도 (항상 먼저) ──
    const still = el('img', 'map__still');
    still.src = 'assets/img/map.webp';
    still.alt = venue + ' 위치';
    still.onerror = () => { box.classList.add('is-empty'); still.remove(); };
    const credit = el('p', 'map__credit', '지도 © OpenStreetMap 기여자');
    box.append(still, credit);

    if (!CONTENT.kakaoJsKey) return;

    // ── 카카오맵이 되면 갈아끼웁니다 ──
    const sdk = el('script');
    sdk.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${CONTENT.kakaoJsKey}&autoload=false`;
    sdk.onerror = () => console.warn('[카카오맵] SDK 를 불러오지 못했습니다 — 그림 지도로 둡니다');
    sdk.onload = () => {
      try {
        window.kakao.maps.load(() => {
          still.remove();
          credit.remove();
          box.classList.remove('is-empty');

          const K = window.kakao.maps;
          const at = new K.LatLng(lat, lng);
          const map = new K.Map(box, { center: at, level: 4 });
          map.addControl(new K.ZoomControl(), K.ControlPosition.RIGHT);
          new K.Marker({ map: map, position: at });
          new K.CustomOverlay({
            map: map, position: at, yAnchor: 2.1,
            content: el('div', 'map__pin', venue),
          });

          const home = el('button', 'map__home', '예식장 위치');
          home.type = 'button';
          home.setAttribute('aria-label', venue + ' 위치로 지도 되돌리기');
          home.addEventListener('click', () => {
            map.setLevel(4);
            map.setCenter(at);
            toast('예식장 위치로 되돌렸습니다');
          });
          box.appendChild(home);
        });
      } catch (e) {
        console.warn('[카카오맵]', e, '— 그림 지도로 둡니다');
      }
    };
    document.head.appendChild(sdk);
  }

  function wireNavi() {
    const { lat, lng, venue } = CONTENT.wedding;
    const name = encodeURIComponent(venue);
    const schemes = {
      kakao: {
        app: `kakaonavi://navigate?name=${name}&x=${lng}&y=${lat}&coord_type=wgs84`,
        web: `https://map.kakao.com/link/to/${name},${lat},${lng}`,
      },
      tmap: {
        app: `tmap://route?goalname=${name}&goalx=${lng}&goaly=${lat}`,
        web: `https://tmap.life/route?goalname=${name}&goalx=${lng}&goaly=${lat}`,
      },
      naver: {
        app: `nmap://route/car?dlat=${lat}&dlng=${lng}&dname=${name}&appname=${location.hostname}`,
        web: `https://map.naver.com/p/search/${name}`,
      },
    };

    $$('[data-navi]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = schemes[btn.dataset.navi];
        // 앱이 없으면 잠시 뒤 웹으로 넘깁니다
        const fallback = setTimeout(() => window.open(s.web, '_blank', 'noopener'), 900);
        window.addEventListener('pagehide', () => clearTimeout(fallback), { once: true });
        location.href = s.app;
      });
    });
  }

  /* ── 연락처 · 계좌 ──────────────────────────────────────── */

  /* 마음 전하실 곳 — 신부측·신랑측이 접혀 있다가 누르면 펼쳐집니다.
     한쪽을 펼치면 다른 쪽은 접힙니다. 화면 높이가 정해져 있어서,
     둘 다 펼치면 아래 버튼이 잘릴 수 있습니다. */
  function renderContacts() {
    const box = $('#contacts');
    const folds = [];

    // 인사말에서 신랑 혼주가 먼저 나오니, 여기서는 신부측을 앞에 둡니다
    [['bride', '신부측'], ['groom', '신랑측']].forEach(([side, label]) => {
      const list = (CONTENT.accounts[side] || []).filter(a => a.number);

      const fold = el('div', 'fold');
      const head = el('button', 'fold__head');
      head.type = 'button';
      head.setAttribute('aria-expanded', 'false');
      head.appendChild(el('span', 'fold__label', label));
      head.appendChild(el('span', 'fold__x'));

      const panel = el('div', 'fold__panel');
      const inner = el('div', 'fold__inner');
      if (!list.length) inner.appendChild(el('p', 'fold__empty', '준비 중입니다'));
      list.forEach(acc => {
        const row = el('div', 'who');
        row.appendChild(el('span', 'who__role', acc.role));
        row.appendChild(el('p', 'who__name', acc.name));
        row.appendChild(el('p', 'who__acc', [acc.bank, acc.number].filter(Boolean).join(' ')));
        const b = el('button', 'pill pill--sm', '복사');
        b.type = 'button';
        b.setAttribute('aria-label', `${acc.role} ${acc.name} 계좌번호 복사`);
        b.addEventListener('click', () =>
          copy([acc.bank, acc.number, acc.name].filter(Boolean).join(' '), '계좌번호를 복사했습니다'));
        row.appendChild(b);
        inner.appendChild(row);
      });
      panel.appendChild(inner);
      fold.append(head, panel);

      head.addEventListener('click', () => {
        const open = head.getAttribute('aria-expanded') !== 'true';
        folds.forEach(f => f.set(false));
        set(open);
        // 펼쳐진 만큼 장이 길어지므로, 펼침이 끝난 뒤 다시 잽니다
        setTimeout(() => { if (window.__fitDeck) window.__fitDeck(); }, 400);
      });
      const set = (open) => {
        head.setAttribute('aria-expanded', String(open));
        fold.classList.toggle('is-open', open);
      };
      folds.push({ set });
      box.appendChild(fold);
    });
  }

  /* ── 사진 ───────────────────────────────────────────────
     표지(1장 화면)는 images/Title 의 두 장만 씁니다.
     images/album 의 사진은 앨범 화면에서 격자로 보여줍니다.
     둘 다 크게 보기는 같은 뷰어를 씁니다. */

  const COVERS = [
    // 손대지 않은 원본을 그대로 보여줍니다
    { label: 'Cover', alt: NAMES + ' 웨딩 사진',
      src:  'assets/img/title/fresh-1080.webp',
      full: 'assets/img/title/fresh-1600.webp',
      srcset: 'assets/img/title/fresh-720.webp 720w, assets/img/title/fresh-1080.webp 1080w,'
            + ' assets/img/title/fresh-1600.webp 1600w' },
    // 잡지 표지는 배경이 크림색이라 통째로 보여줘도 이음매가 없습니다
    { label: 'Poster', alt: NAMES + ' 웨딩 포스터',
      src:  'assets/img/title/mag-1080.webp',
      full: 'assets/img/title/mag-1600.webp',
      srcset: 'assets/img/title/mag-720.webp 720w, assets/img/title/mag-1080.webp 1080w, assets/img/title/mag-1600.webp 1600w' },
  ];

  const G = { list: COVERS, i: 0, cover: 0, album: [] };

  function renderCover() {
    const dots = $('#dots');
    COVERS.forEach((it, i) => {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === 0));
      b.setAttribute('aria-label', (i + 1) + '번째 표지 보기');
      b.addEventListener('click', () => { stopCoverAuto(); showCover(i); });
      dots.appendChild(b);
    });

    showCover(0);
    $('#shotImg').addEventListener('click', () => { if (!swiped) openLightbox(COVERS, G.cover); });
    $('#shotZoom').addEventListener('click', () => openLightbox(COVERS, G.cover));
    wireShotSwipe();
    startCoverAuto();
  }

  /* 표지를 3초마다 저절로 넘깁니다.
     직접 넘기신 뒤에는 멈춥니다 — 보고 계신 사진을 뺏지 않기 위해서입니다. */
  const COVER_EVERY = 3000;
  let coverTimer = null;

  function startCoverAuto() {
    if (COVERS.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    stopCoverAuto();
    coverTimer = setInterval(() => {
      if (DECK.i !== 0) return;                       // 표지에 있을 때만
      if (document.hidden) return;                    // 다른 탭이면 쉽니다
      if (!$('#lightbox').hidden) return;             // 크게 보는 중이면 쉽니다
      if (!$('#rsvpModal').hidden) return;
      showCover((G.cover + 1) % COVERS.length);
    }, COVER_EVERY);
  }

  function stopCoverAuto() {
    if (coverTimer) { clearInterval(coverTimer); coverTimer = null; }
  }

  function showCover(i) {
    G.cover = i;
    const it = COVERS[i];
    const img = $('#shotImg');
    img.src = it.src;
    img.srcset = it.srcset;
    img.alt = it.alt;

    // 넘어가는 게 바로 보이도록 짧게 나타납니다
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = 'swap .26s var(--ease)';

    $$('#dots button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  }

  // 표지를 좌우로 밀어 넘깁니다. 위아래는 화면 넘김이 가져갑니다.
  let swiped = false;

  function wireShotSwipe() {
    const shot = $('#shot');
    let x0 = 0, y0 = 0, tracking = false;

    shot.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1 || COVERS.length < 2) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      tracking = true;
      swiped = false;
    }, { passive: true });

    shot.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      swiped = true;
      stopCoverAuto();
      showCover((G.cover + (dx < 0 ? 1 : -1) + COVERS.length) % COVERS.length);
    }, { passive: true });
  }

  /* ── 앨범 ───────────────────────────────────────────────
     images/album/ 에 넣은 사진을 배포할 때 tools/build_media.py 가
     assets/data/album.json 으로 정리해 둡니다. 사진이 없으면 앨범
     화면과 네비게이션 칸이 통째로 사라집니다. */

  async function renderAlbum() {
    let items = [];
    try {
      const res = await fetch('assets/data/album.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        items = (data.items || []).map((it, n) => ({
          label: 'Photo ' + pad(n + 1),
          alt: it.alt || (NAMES + ' 웨딩 사진 ' + (n + 1)),
          thumb: it.thumb,
          src: it.src['960'],
          full: it.src['1600'],
        }));
      }
    } catch (e) {
      // 매니페스트가 없으면 앨범 화면을 숨긴 채로 둡니다
    }

    G.album = items;
    const scr = $('#albumScr');

    if (!items.length) {
      scr.remove();
      const btn = $('#nav [data-album]');
      if (btn) btn.remove();
      $$('#nav [data-go]').forEach((b, i) => { b.dataset.go = String(i); });
      if (window.__deckRefresh) window.__deckRefresh();
      return;
    }

    scr.hidden = false;
    $('#albumCount').textContent = items.length + '장';

    const box = $('#album');

    items.forEach((it, i) => {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-label', (i + 1) + '번째 사진 크게 보기');
      const img = el('img');
      img.src = it.thumb;
      img.alt = '';
      img.loading = i < 9 ? 'eager' : 'lazy';
      img.decoding = 'async';
      b.appendChild(img);
      b.addEventListener('click', () => openLightbox(items, i));
      box.appendChild(b);
    });

    window.__fitAlbum = fitAlbum;
    fitAlbum();
    requestAnimationFrame(fitAlbum);
    if (window.__fitDeck) window.__fitDeck();
  }

  /* 화면에 온전히 들어가는 줄까지만 남기고 나머지는 접습니다.
     반 잘린 줄을 그대로 두면 사진이 잘려 고장처럼 보이므로,
     칸 크기를 재서 딱 떨어지는 줄 수를 구합니다. */
  function fitAlbum() {
    const box = $('#album');
    if (!box) return;
    const tiles = $$('button', box);
    if (!tiles.length) return;

    tiles.forEach((b) => {
      b.hidden = false;
      b.classList.remove('more');
      b.removeAttribute('data-more');
    });

    const gap = parseFloat(getComputedStyle(box).gap) || 0;
    const cell = (box.clientWidth - gap * 2) / 3;
    if (!(cell > 0) || !(box.clientHeight > 0)) return;

    const rows = Math.max(1, Math.floor((box.clientHeight + gap) / (cell + gap)));
    const cap = Math.min(tiles.length, rows * 3);
    tiles.forEach((b, i) => { b.hidden = i >= cap; });

    if (cap >= tiles.length) return;

    // 마지막 칸은 사진을 덮고 있으므로 그 한 장까지 세어 알립니다.
    const rest = tiles.length - cap + 1;
    const last = tiles[cap - 1];
    last.classList.add('more');
    last.dataset.more = '+' + rest;
    last.setAttribute('aria-label', '나머지 사진 ' + rest + '장 크게 보기');
  }

  /* ── 배경음악 ─────────────────────────────────────────────
     music/ 에 넣은 mp3 를 배포할 때 build_media.py 가
     assets/audio/bgm.mp3 로 옮기고 music.json 에 주소를 적어 둡니다.

     처음에는 꺼져 있고, 네비 끝의 버튼을 눌러야 나옵니다.
     갑자기 소리가 나면 공공장소에서 여신 분이 당황합니다. */
  async function wireBgm() {
    let src = '';
    try {
      const res = await fetch('assets/data/music.json', { cache: 'no-cache' });
      if (res.ok) src = (await res.json()).src || '';
    } catch (e) {}
    if (!src) return;

    const btn = $('#bgm');
    const audio = new Audio();
    audio.src = src;
    audio.loop = true;
    audio.preload = 'none';   // 누르기 전에는 받지 않습니다
    audio.volume = 0.39;      // 0.6 에서 65% 로 낮춤. 아이폰은 이 값을 무시합니다

    // 버튼은 '지금 실제로 나오는지'를 보여줍니다
    const paint = () => {
      const on = !audio.paused;
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? '배경음악 끄기' : '배경음악 켜기');
    };
    audio.addEventListener('play', paint);
    audio.addEventListener('pause', paint);
    btn.hidden = false;
    paint();

    btn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play().catch(() => toast('음악을 틀지 못했습니다. 다시 눌러 주세요'));
      } else {
        audio.pause();
      }
    });

    // 다른 앱으로 가면 멈추고, 돌아오면 이어 틉니다
    let hiddenPause = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (!audio.paused) { hiddenPause = true; audio.pause(); }
      } else if (hiddenPause) {
        hiddenPause = false;
        audio.play().catch(() => {});
      }
    });
  }

  /* ── 사진 크게 보기 ─────────────────────────────────────── */

  let lbReturn = null;
  let lbPushed = false;

  function openLightbox(list, i) {
    if (!list || !list.length) return;
    G.list = list;
    lbReturn = document.activeElement;
    G.i = i;
    paintLightbox();
    $('#lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    $('[data-lb-close]').focus({ preventScroll: true });

    // 뒤로가기가 사이트를 벗어나지 않고 사진 보기만 닫도록
    // 방문 기록을 한 칸 쌓아 둡니다.
    try { history.pushState({ overlay: 'photo' }, ''); lbPushed = true; } catch (e) {}
  }

  // fromHistory 는 뒤로가기로 불려온 경우입니다. 그때는 기록을
  // 되감으면 안 됩니다 — 이미 브라우저가 되감은 뒤니까요.
  function closeLightbox(fromHistory) {
    $('#lightbox').hidden = true;
    document.body.style.overflow = '';
    if (G.list === COVERS) showCover(G.i);
    if (lbReturn) lbReturn.focus({ preventScroll: true });
    const pushed = lbPushed;
    lbPushed = false;
    if (!fromHistory && pushed) history.back();
  }
  function moveLightbox(step) {
    G.i = (G.i + step + G.list.length) % G.list.length;
    paintLightbox();
  }
  function paintLightbox() {
    const it = G.list[G.i];
    $('#lightboxImg').src = it.full;
    $('#lightboxImg').alt = it.alt;
    $('#lightboxCount').textContent = `${pad(G.i + 1)} / ${pad(G.list.length)}`;
  }

  function wireLightbox() {
    const box = $('#lightbox');
    box.addEventListener('click', e => {
      if (e.target.closest('[data-lb-close]') || e.target === box) return closeLightbox();
      const mv = e.target.closest('[data-lb-move]');
      if (mv) moveLightbox(+mv.dataset.lbMove);
    });

    document.addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') moveLightbox(-1);
      if (e.key === 'ArrowRight') moveLightbox(1);
    });

    window.addEventListener('popstate', () => {
      if (!box.hidden) closeLightbox(true);
    });

    let x0 = null;
    box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) moveLightbox(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
  }

  /* ── 공유하기 ───────────────────────────────────────────
     카카오 SDK 는 페이지가 뜰 때 미리 불러 둡니다.
     버튼을 누른 뒤에 불러오면 await 로 기다리는 사이 사용자 클릭
     맥락이 끊겨, 모바일 브라우저가 카카오톡 창 띄우기를 조용히
     막아버립니다. 미리 준비해 두면 클릭 즉시 열립니다. */

  let kakaoReady = false;

  function primeKakao() {
    if (!CONTENT.kakaoJsKey) return;
    const s = el('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => {
      try {
        if (!window.Kakao.isInitialized()) window.Kakao.init(CONTENT.kakaoJsKey);
        kakaoReady = window.Kakao.isInitialized();
      } catch (err) {
        console.error('[카카오] 초기화 실패 — 앱키를 확인해 주세요', err);
      }
    };
    s.onerror = () => console.error('[카카오] SDK 를 불러오지 못했습니다');
    document.head.appendChild(s);
  }

  function shareKakao() {
    if (!kakaoReady) {
      copy(location.href, '카카오톡 공유가 준비되지 않아 링크를 복사했습니다');
      return;
    }
    const url = location.href;
    const img = new URL(CONTENT.share.image, location.href).href;
    try {
      // await 없이 클릭 그 자리에서 호출해야 창이 열립니다
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: CONTENT.share.title,
          description: CONTENT.share.description,
          imageUrl: img,
          link: { mobileWebUrl: url, webUrl: url },
        },
        buttons: [{ title: '청첩장 열기', link: { mobileWebUrl: url, webUrl: url } }],
      });
    } catch (err) {
      // 대부분 developers.kakao.com 에 도메인이 등록되지 않은 경우입니다
      console.error('[카카오 공유 실패]', err, '현재 주소:', location.origin);
      copy(url, '공유에 실패해 링크를 복사했습니다');
    }
  }

  function wireShare() {
    $('#shareKakao').addEventListener('click', shareKakao);
    $('#shareLink').addEventListener('click', () => copy(location.href, '링크를 복사했습니다'));
    $('#addCalendar').addEventListener('click', downloadIcs);
  }

  function downloadIcs() {
    const end = new Date(D.getTime() + 3 * 3600 * 1000);
    const stamp = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const w = CONTENT.wedding;
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wedding//KO', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + Date.now() + '@wedding',
      'DTSTAMP:' + stamp(new Date()),
      'DTSTART:' + stamp(D),
      'DTEND:' + stamp(end),
      'SUMMARY:' + CONTENT.share.title,
      'LOCATION:' + `${w.venue} ${w.hall}, ${w.address}`,
      'DESCRIPTION:' + CONTENT.share.description,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:내일 결혼식입니다', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');

    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = el('a');
    a.href = url;
    a.download = 'wedding.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('캘린더에 추가했습니다');
  }

  /* ── 화면 넘기기 ───────────────────────────────────────
     브라우저 스크롤 스냅에 맡기면 기기에 따라 관성 때문에 두 장씩
     지나갑니다. 위치를 직접 옮겨 한 번에 정확히 한 장만 넘깁니다. */

  const DECK = { i: 0, count: 0, h: 0, busy: false };

  function wireDeck() {
    const deck  = $('#deck');
    const rail  = $('#rail');
    const inner = $('#railInner');
    const scrs  = $$('.scr', inner);
    const navBtns = $$('#nav [data-go]');   // 음악 버튼은 빼고
    DECK.count = scrs.length;

    // 넉넉한 쪽에서 조인 쪽으로. cls 는 style.css 의 간격 단계입니다.
    const FIT_STEPS = [
      { cls: '',   pad: ''     },
      { cls: 'd1', pad: ''     },
      { cls: 'd1', pad: '16px' },
      { cls: 'd2', pad: '12px' },
      { cls: 'd3', pad: '10px' },
    ];

    // 높이는 CSS 가 100lvh 로 정합니다. JS 는 그 결과를 읽기만 합니다.
    // 주소창이 오가도 lvh 는 변하지 않으므로 이 값도 변하지 않습니다.
    function measure() {
      DECK.h = rail.clientHeight;
      if (window.__fitAlbum) window.__fitAlbum();

      // 계산으로 여백을 맞추면 글자가 몇 줄로 접히는지에 따라 어긋납니다.
      // 실제로 재 보고, 넘치면 아래 순서로 조여 맞춥니다.
      //
      // 장 여백만 줄이면 14px 밖에 못 벌어서, 카카오톡 인앱처럼
      // 세로가 짧은 화면에서는 금세 안쪽 스크롤로 떨어집니다.
      // 그러면 장을 넘기려는 손짓을 그 장이 먹어 갇힌 느낌이 듭니다.
      // 그래서 장 안의 세로 간격까지 함께 조입니다. 글자 크기는
      // 마지막 단계에서만 건드립니다.
      scrs.forEach((sc) => {
        if (sc.classList.contains('cover')) return;
        sc.classList.remove('is-tall', 'd1', 'd2', 'd3');
        sc.style.paddingTop = sc.style.paddingBottom = '';

        for (const step of FIT_STEPS) {
          sc.classList.remove('d1', 'd2', 'd3');
          if (step.cls) sc.classList.add(step.cls);
          sc.style.paddingTop = sc.style.paddingBottom = step.pad;
          if (sc.scrollHeight <= DECK.h + 2) return;
        }
        // 다 조여도 넘치면 그 장만 안에서 스크롤합니다 (마지막 수단)
        sc.classList.add('is-tall');
      });

      paint(false);
    }

    // lvh 를 모르는 오래된 브라우저를 위해, 지금까지 본 가장 큰 높이를
    // 기억해 뒀다가 씁니다. 주소창이 숨은 상태의 높이가 곧 그 값입니다.
    if (!CSS.supports('height', '100lvh')) {
      let biggest = 0;
      const noteHeight = () => {
        if (window.innerHeight <= biggest) return;
        biggest = window.innerHeight;
        document.documentElement.style.setProperty('--lvh', biggest + 'px');
        measure();
      };
      noteHeight();
      window.addEventListener('scroll', noteHeight, { passive: true });
      window.addEventListener('resize', noteHeight, { passive: true });
    }

    function paint(animate) {
      if (animate === false) inner.style.transition = 'none';
      inner.style.transform = 'translate3d(0,' + (-DECK.i * DECK.h) + 'px,0)';
      if (animate === false) {
        void inner.offsetHeight;
        inner.style.transition = '';
      }
      const sc = scrs[DECK.i];
      deck.dataset.tone = sc.classList.contains('scr--red') ? 'red'
                        : sc.classList.contains('scr--paper') ? 'paper' : 'bg';
      navBtns.forEach((b, j) => b.setAttribute('aria-current', String(j === DECK.i)));

      // 인사말 화면(두 번째)에 닿으면 아직 응답하지 않은 분께 한 번 물어봅니다
      if (DECK.i === 1 && window.__rsvpPrompt) window.__rsvpPrompt();
    }

    function go(i, animate) {
      i = Math.max(0, Math.min(DECK.count - 1, i));
      if (i === DECK.i) return paint(animate);
      DECK.i = i;
      DECK.busy = true;
      paint(animate);
      setTimeout(() => { DECK.busy = false; }, 560);
    }
    window.__deckGo = go;

    navBtns.forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));

    // 앨범이 빠지면 화면 수가 달라집니다. 다시 세어 둡니다.
    window.__deckRefresh = () => {
      scrs.length = 0;
      $$('.scr', inner).forEach((sc) => scrs.push(sc));
      navBtns.length = 0;
      $$('#nav [data-go]').forEach((b) => navBtns.push(b));
      DECK.count = scrs.length;
      DECK.i = Math.min(DECK.i, DECK.count - 1);
      measure();
    };

    // 손끝이 놓인 자리에서 위로 훑어 올라가며, 아직 더 스크롤할 수
    // 있는 영역이 있으면 장을 넘기지 않고 그쪽에 양보합니다.
    // 앨범 격자처럼 장 '안'에 있는 스크롤 영역도 이렇게 잡힙니다.
    function scrolling(from, dir) {
      let n = from;
      while (n && n !== rail && n.nodeType === 1) {
        if (n.scrollHeight > n.clientHeight + 1) {
          const atTop = n.scrollTop <= 0;
          const atEnd = n.scrollTop >= n.scrollHeight - n.clientHeight - 1;
          if ((dir > 0 && !atTop) || (dir < 0 && !atEnd)) return true;
        }
        n = n.parentElement;
      }
      return false;
    }

    // ── 손가락 ──
    let y0 = 0, x0 = 0, dy = 0, dragging = false, base = 0, startNode = null;

    rail.addEventListener('touchstart', (e) => {
      if (DECK.busy || e.touches.length > 1) return;
      startNode = e.target;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      dy = 0;
      base = -DECK.i * DECK.h;
      dragging = true;
      rail.classList.add('is-dragging');
    }, { passive: true });

    rail.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      const ay = t.clientY - y0;
      const ax = t.clientX - x0;
      if (ay === 0 || Math.abs(ax) > Math.abs(ay)) return;
      if (scrolling(startNode, ay)) { dragging = false; rail.classList.remove('is-dragging'); return; }
      // 장을 넘기는 손짓이면 브라우저의 기본 동작을 막습니다.
      // 막지 않으면 같은 손짓을 브라우저도 받아, 맨 위에서 아래로
      // 당길 때 새로고침이 뜹니다. overscroll-behavior 를 모르는
      // 브라우저(일부 인앱·삼성 인터넷)를 위한 두 번째 겹입니다.
      if (e.cancelable) e.preventDefault();
      dy = ay;
      const edge = (DECK.i === 0 && dy > 0) || (DECK.i === DECK.count - 1 && dy < 0);
      inner.style.transform = 'translate3d(0,' + (base + (edge ? dy * 0.28 : dy)) + 'px,0)';
    }, { passive: false });   // preventDefault 를 쓰려면 passive 가 아니어야 합니다

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      rail.classList.remove('is-dragging');
      const far = Math.abs(dy) > Math.min(70, DECK.h * 0.12);
      go(far ? DECK.i + (dy < 0 ? 1 : -1) : DECK.i);
      dy = 0;
    }
    rail.addEventListener('touchend', endDrag, { passive: true });
    rail.addEventListener('touchcancel', endDrag, { passive: true });

    // ── 마우스 휠 ──
    let wheelLock = 0;
    rail.addEventListener('wheel', (e) => {
      if (scrolling(e.target, -e.deltaY)) return;
      e.preventDefault();
      const now = Date.now();
      if (DECK.busy || now < wheelLock || Math.abs(e.deltaY) < 8) return;
      wheelLock = now + 620;
      go(DECK.i + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });

    // ── 키보드 ──
    document.addEventListener('keydown', (e) => {
      if (!$('#rsvpModal').hidden || !$('#lightbox').hidden) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return;
      const step = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 };
      if (e.key in step) { e.preventDefault(); go(DECK.i + step[e.key]); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(DECK.count - 1); }
    });

    // 높이가 lvh 에 묶여 있어 주소창이 오가도 다시 잴 일이 없습니다.
    // 화면을 돌려 가로 폭이 달라졌을 때만 다시 잽니다.
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      measure();
    }, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(measure, 250));
    window.addEventListener('load', measure);

    measure();
    window.__fitDeck = measure;
  }

  /* ── 시작 ───────────────────────────────────────────────── */

  bind();
  renderTimeline();
  renderWays();
  renderMap();
  wireNavi();
  renderContacts();
  wireShare();
  primeKakao();
  wireCopy();
  wireLightbox();
  wireSheet();
  wireDeck();
  renderCover();
  wireBgm();
  renderAlbum().then(() => { if (window.__fitDeck) window.__fitDeck(); });
})();
