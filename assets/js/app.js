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

    $('#coverImg').alt = NAMES + ' 웨딩 사진';
    $('#footNames').textContent = NAMES;

    // 매스트헤드 — 2026.11.28 / SATURDAY 6 PM · D-89
    const date = $('#mastDate');
    date.innerHTML = '';
    [D.getFullYear(), pad(D.getMonth() + 1), pad(D.getDate())].forEach((part, i) => {
      if (i) date.appendChild(el('i', null, '.'));
      date.appendChild(document.createTextNode(String(part)));
    });
    date.setAttribute('aria-label',
      `${D.getFullYear()}년 ${D.getMonth() + 1}월 ${D.getDate()}일 ${WEEK[D.getDay()]}요일 ${timeText()}`);

    const h = D.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const clock = h12 + (D.getMinutes() ? ':' + pad(D.getMinutes()) : '') + ' ' + ampm;
    $('#mastMeta').textContent = `${WEEK_EN[D.getDay()]} ${clock} · ${dday()}`;

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

  function renderTimeline() {
    const body = $('#timeline');
    (CONTENT.wedding.timeline || []).forEach(t => {
      const tr = el('tr', t.key ? 'is-key' : null);
      tr.appendChild(el('td', 't-when', t.time));
      const what = el('td', 't-what');
      what.appendChild(document.createTextNode(t.title));
      if (t.desc) what.appendChild(el('small', null, t.desc));
      tr.appendChild(what);
      body.appendChild(tr);
    });
  }

  /* ── 오시는 길 ──────────────────────────────────────────── */

  function chipRow(list) {
    const box = el('span', 'chips');
    list.forEach(c => box.appendChild(el('span', null, c)));
    return box;
  }

  function renderWays() {
    const body = $('#ways');
    (CONTENT.wedding.ways || []).forEach(w => {
      const tr = el('tr');
      tr.appendChild(el('td', 't-when', w.label));
      const td = el('td', 't-what');

      if (w.text)  td.appendChild(document.createTextNode(w.text));
      if (w.chips) td.appendChild(chipRow(w.chips));
      (w.legs || []).forEach(leg => {
        td.appendChild(el('em', 'leg', leg.text));
        if (leg.chips) td.appendChild(chipRow(leg.chips));
      });

      tr.appendChild(td);
      body.appendChild(tr);
    });
  }

  function renderMap() {
    const { lat, lng, venue } = CONTENT.wedding;
    // 키가 필요 없는 OpenStreetMap 을 씁니다.
    const src = 'https://www.openstreetmap.org/export/embed.html'
              + `?bbox=${lng - 0.0045},${lat - 0.0022},${lng + 0.0045},${lat + 0.0022}`
              + `&layer=mapnik&marker=${lat},${lng}`;

    const box = el('iframe');
    box.loading = 'lazy';
    box.title = venue + ' 위치';
    box.src = src;

    // 지도를 옮겨 놓고 예식장을 못 찾는 일이 없도록 되돌리는 버튼을 둡니다.
    const home = el('button', 'map__home', '예식장 위치');
    home.type = 'button';
    home.setAttribute('aria-label', venue + ' 위치로 지도 되돌리기');
    home.addEventListener('click', () => {
      box.src = src;                 // 주소를 다시 넣으면 처음 위치로 돌아옵니다
      toast('예식장 위치로 되돌렸습니다');
    });

    $('#map').append(box, home);
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

  function renderContacts() {
    const box = $('#contacts');

    [['groom', '신랑'], ['bride', '신부']].forEach(([side, ko]) => {
      const p = CONTENT.couple[side];
      const accounts = (CONTENT.accounts[side] || []).filter(a => a.number);
      const parents = [p.father, p.mother].filter(x => x && x.name && !x.deceased);
      const parentNames = parents.map(x => x.name).join(' · ');

      // 본인 줄
      const row = el('div', 'who');
      const who = el('p');
      who.appendChild(document.createTextNode(p.name));
      who.appendChild(el('small', null,
        `${ko}${parentNames ? ' · ' + parentNames + '의 ' + (p.rank || '') : ''}`));
      row.appendChild(who);

      const btns = el('div');
      if (p.phone) btns.appendChild(telBtn('전화', p.phone, `${ko} ${p.name}에게 전화`));
      accounts.forEach(a => {
        const b = el('button', 'pill pill--sm', '계좌');
        b.type = 'button';
        b.setAttribute('aria-label', `${ko} ${a.name} 계좌번호 복사`);
        b.addEventListener('click', () =>
          copy([a.bank, a.number, a.name].filter(Boolean).join(' '), '계좌번호를 복사했습니다'));
        btns.appendChild(b);
      });
      if (btns.children.length) row.appendChild(btns);
      box.appendChild(row);

      // 혼주 줄 — 연락처가 있는 분만
      const reachable = parents.filter(x => x.phone);
      if (!reachable.length) return;
      const prow = el('div', 'who');
      const pwho = el('p');
      pwho.appendChild(document.createTextNode(parentNames));
      pwho.appendChild(el('small', null, `${ko} 혼주`));
      prow.appendChild(pwho);
      const pbtns = el('div');
      reachable.forEach((x, i) => {
        const label = reachable.length > 1 ? (i === 0 ? '아버님' : '어머님') : '전화';
        pbtns.appendChild(telBtn(label, x.phone, `${ko} 혼주 ${x.name}에게 전화`));
      });
      prow.appendChild(pbtns);
      box.appendChild(prow);
    });
  }

  function telBtn(text, phone, label) {
    const a = el('a', 'pill pill--sm', text);
    a.href = 'tel:' + phone;
    a.setAttribute('aria-label', label || text);
    return a;
  }

  /* ── 갤러리 ─────────────────────────────────────────────── */
  /* images/album/ 의 사진은 배포할 때 tools/build_media.py 가
     assets/data/album.json 으로 정리해 둡니다. 여기서는 그걸 읽기만 합니다. */

  const G = { items: [], i: 0 };

  async function renderGallery() {
    const items = [];

    // 잡지 표지는 언제나 첫 장입니다
    items.push({
      id: 'cover',
      label: 'Cover',
      alt: NAMES + ' 웨딩 포스터',
      thumb: 'assets/img/title/mag-720.webp',
      src: 'assets/img/title/mag-1080.webp',
      full: 'assets/img/title/mag-1600.webp',
      srcset: 'assets/img/title/mag-720.webp 720w, assets/img/title/mag-1080.webp 1080w,'
            + ' assets/img/title/mag-1600.webp 1600w',
    });

    try {
      const res = await fetch('assets/data/album.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        (data.items || []).forEach((it, n) => {
          items.push({
            id: it.id,
            label: 'Photo ' + pad(n + 1),
            alt: it.alt || `${NAMES} 웨딩 사진 ${n + 1}`,
            thumb: it.src['480'],
            src: it.src['960'],
            full: it.src['1600'],
            srcset: `${it.src['480']} 480w, ${it.src['960']} 960w, ${it.src['1600']} 1600w`,
          });
        });
      }
    } catch (e) {
      // 매니페스트가 없으면 표지만 보여줍니다
    }

    G.items = items;
    const thumbs = $('#thumbs');
    items.forEach((it, i) => {
      const b = el('button', 'thumb');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === 0));
      b.setAttribute('aria-label', i === 0 ? '표지 보기' : `${i}번째 사진 보기`);
      const img = el('img');
      img.src = it.thumb;
      img.alt = '';
      img.loading = i < 8 ? 'eager' : 'lazy';
      img.decoding = 'async';
      b.appendChild(img);
      b.addEventListener('click', () => showStage(i));
      thumbs.appendChild(b);
    });

    showStage(0);
    $('#stage').addEventListener('click', () => openLightbox(G.i));
  }

  function showStage(i) {
    G.i = i;
    const it = G.items[i];
    const img = $('#stageImg');
    img.src = it.src;
    img.srcset = it.srcset;
    img.sizes = '(max-width:520px) 100vw, 520px';
    img.alt = it.alt;
    $('#stageLabel').textContent = it.label;
    $('#stageCount').textContent = `${pad(i + 1)} / ${pad(G.items.length)}`;
    $$('#thumbs .thumb').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  }

  /* ── 사진 크게 보기 ─────────────────────────────────────── */

  let lbReturn = null;

  function openLightbox(i) {
    if (!G.items.length) return;
    lbReturn = document.activeElement;
    G.i = i;
    paintLightbox();
    $('#lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    $('[data-lb-close]').focus({ preventScroll: true });
  }
  function closeLightbox() {
    $('#lightbox').hidden = true;
    document.body.style.overflow = '';
    showStage(G.i);
    if (lbReturn) lbReturn.focus({ preventScroll: true });
  }
  function moveLightbox(step) {
    G.i = (G.i + step + G.items.length) % G.items.length;
    paintLightbox();
  }
  function paintLightbox() {
    const it = G.items[G.i];
    $('#lightboxImg').src = it.full;
    $('#lightboxImg').alt = it.alt;
    $('#lightboxCount').textContent = `${pad(G.i + 1)} / ${pad(G.items.length)}`;
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

    let x0 = null;
    box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) moveLightbox(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
  }

  /* ── 공유하기 ───────────────────────────────────────────── */

  function wireShare() {
    $('#shareLink').addEventListener('click', () => copy(location.href, '링크를 복사했습니다'));
    $('#addCalendar').addEventListener('click', downloadIcs);

    $('#shareKakao').addEventListener('click', async () => {
      if (!CONTENT.kakaoJsKey) return copy(location.href, '링크를 복사했습니다');
      try {
        await loadKakao();
        window.Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: CONTENT.share.title,
            description: CONTENT.share.description,
            imageUrl: new URL(CONTENT.share.image, location.href).href,
            link: { mobileWebUrl: location.href, webUrl: location.href },
          },
          buttons: [{ title: '청첩장 열기', link: { mobileWebUrl: location.href, webUrl: location.href } }],
        });
      } catch (e) {
        // 대부분 developers.kakao.com 플랫폼에 도메인이 등록되지 않은 경우입니다.
        console.error('[카카오 공유 실패]', e, '현재 주소:', location.origin);
        copy(location.href, '공유에 실패해 링크를 복사했습니다');
      }
    });
  }

  function loadKakao() {
    return new Promise((res, rej) => {
      if (window.Kakao && window.Kakao.isInitialized()) return res();
      const s = el('script');
      s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        try { window.Kakao.init(CONTENT.kakaoJsKey); res(); }
        catch (err) { console.error('[카카오 init 실패]', err); rej(err); }
      };
      s.onerror = rej;
      document.head.appendChild(s);
    });
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

  /* ── 화면 넘김 · 쪽번호 ─────────────────────────────────── */

  function wireDeck() {
    const deck = $('#deck');
    const folio = $('#folio');
    const scrs = $$('.scr', deck);
    const total = pad(scrs.length);
    folio.textContent = '01 / ' + total;

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) folio.textContent = pad(scrs.indexOf(e.target) + 1) + ' / ' + total;
        });
      }, { root: deck, threshold: 0.6 });
      scrs.forEach(s => io.observe(s));
    }

    // 내용이 화면보다 길어진 장은 스냅을 풀어 갇히지 않게 합니다.
    // 첫 장은 예외 — 스냅이 풀리면 브라우저가 커버를 통째로 건너뜁니다.
    const fit = () => scrs.forEach((s, i) => {
      s.classList.remove('is-tall');
      if (i === 0) return;
      if (s.scrollHeight > s.clientHeight + 4) s.classList.add('is-tall');
    });
    // 각 장의 높이를 픽셀로 못박습니다.
    // 크롬은 화면을 꽉 채운 내부 스크롤 영역도 루트 스크롤러로 보고
    // 주소창을 숨깁니다. 그때 vh 계열을 쓰면 다섯 장 높이가 한꺼번에
    // 바뀌면서 스크롤 도중 바닥이 움직여 두 장씩 넘어가 버립니다.
    const lockHeight = () => {
      document.documentElement.style.setProperty('--vh', window.innerHeight + 'px');
    };
    lockHeight();

    // 세로 길이만 달라진 것(주소창이 숨거나 나타난 것)은 무시하고,
    // 가로 폭이 달라졌을 때 — 즉 화면을 돌렸을 때만 다시 잽니다.
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      lockHeight();
      fit();
    }, { passive: true });

    window.addEventListener('orientationchange', () => setTimeout(() => {
      lastWidth = window.innerWidth;
      lockHeight();
      fit();
    }, 250));

    window.addEventListener('load', fit);
    fit();
    window.__fitDeck = fit;
  }

  /* ── 시작 ───────────────────────────────────────────────── */

  bind();
  renderTimeline();
  renderWays();
  renderMap();
  wireNavi();
  renderContacts();
  wireShare();
  wireCopy();
  wireLightbox();
  wireDeck();
  renderGallery().then(() => { if (window.__fitDeck) window.__fitDeck(); });
})();
