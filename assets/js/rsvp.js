/* ═══════════════════════════════════════════════════════════════
   참석 의사 전달 — 팝업으로 뜨고, 나중에 다시 열어 수정할 수 있습니다.

   content.js 의 endpoint 가 비어 있으면 "연습 모드"로 돕니다.
   실제로 보내지 않고 이 브라우저에만 저장하며, 개발자 콘솔에
   구글 시트로 갈 내용을 그대로 찍어줍니다.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const toast = window.__toast || (m => console.log(m));

  const DEMO = !CONTENT.endpoint;

  const KEY_MINE = 'wedding.rsvp.mine';   // 내가 보낸 응답 (id, 이름, 연락처)
  const KEY_DEMO = 'wedding.rsvp.demo';   // 연습 모드에서 쌓이는 응답들

  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  const modal = $('#rsvpModal');
  const form  = $('#rsvpForm');
  const find  = $('#rsvpFindForm');
  const done  = $('#rsvpDone');
  const findRow = $('#rsvpFindRow');
  const panel = $('.modal__panel', modal);

  let editingId = '';
  let lastFocus = null;

  /* ── 서버로 보내기 ──────────────────────────────────────────
     Content-Type 을 text/plain 으로 두면 브라우저가 사전 확인 요청을
     보내지 않아, Apps Script 에서도 응답을 정상적으로 읽을 수 있습니다. */

  async function send(payload) {
    if (DEMO) return demo(payload);
    const res = await fetch(CONTENT.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    return res.json();
  }

  async function demo(payload) {
    console.log('[연습 모드] 구글 시트로 갈 내용:', payload);
    await new Promise(r => setTimeout(r, 350));
    const rows = store.get(KEY_DEMO, []);
    const same = x => x.name === payload.name && x.phone === payload.phone;

    if (payload.type === 'rsvp.find') {
      const hit = rows.find(same);
      return hit ? { ok: true, item: hit } : { ok: false, error: 'NOT_FOUND' };
    }

    const at = rows.findIndex(x => (payload.id && x.id === payload.id) || same(x));
    const id = at >= 0 ? rows[at].id : 'demo-' + rows.length;
    const row = Object.assign({}, payload, { id: id });
    if (at >= 0) rows[at] = row; else rows.push(row);
    store.set(KEY_DEMO, rows);
    return { ok: true, id: id, updated: at >= 0, demo: true };
  }

  /* ── 마감일 안내 ────────────────────────────────────────── */

  function showDeadline() {
    const raw = CONTENT.rsvp.deadline;
    const long  = $$('[data-deadline]');
    const short = $$('[data-deadline-short]');
    if (!raw) {
      long.concat(short).forEach(n => { n.hidden = true; });
      return;
    }
    const d = new Date(raw + 'T00:00:00+09:00');
    const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    long.forEach(n => { n.innerHTML = `참석 여부를 <b>${md}</b>까지 알려주세요`; });
    short.forEach(n => { n.textContent = `${md}까지 알려주시면 정성껏 준비하겠습니다.`; });
  }

  /* ── 팝업 열고 닫기 ─────────────────────────────────────── */

  function openModal(view) {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setView(view || 'form');
    panel.scrollTop = 0;
    const first = modal.querySelector('.modal__panel input, .modal__panel button');
    if (first) first.focus({ preventScroll: true });
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  function setView(view) {
    form.hidden = view !== 'form';
    find.hidden = view !== 'find';
    done.hidden = view !== 'done';
    findRow.hidden = view !== 'form';
    // 수정 안내 배너는 '수정 중인 폼'일 때만 보입니다.
    // 화면 전환에서 빠뜨리면 전달을 마친 뒤에도 계속 남습니다.
    $('#rsvpEditing').hidden = !(view === 'form' && editingId);
    panel.scrollTop = 0;
  }

  /* ── 폼 채우기 ──────────────────────────────────────────── */

  const setRadio = (name, value) => {
    const hit = $$(`input[name="${name}"]`).find(i => i.value === value);
    if (hit) hit.checked = true;
    return !!hit;
  };

  function prefill(r) {
    form.reset();
    setRadio('side', r.side);
    $('#name').value  = r.name || '';
    $('#phone').value = r.phone || '';
    setRadio('attend', r.attend);
    $('output[name="adults"]').value = r.adults != null ? r.adults : 1;
    $('output[name="kids"]').value   = r.kids   != null ? r.kids   : 0;
    setRadio('meal', r.meal);
    $('#message').value = r.message || '';
    $('#consent').checked = true;
    $('#attendOnly').hidden = r.attend === '미참석';
    editingId = r.id || '';

    const banner = $('#rsvpEditing');
    banner.hidden = false;
    banner.textContent = `${r.name}님의 응답을 불러왔습니다. 고치신 뒤 다시 전달해 주세요.`;
    $('#rsvpSubmit').textContent = '수정 내용 전달하기';
  }

  function resetForm() {
    form.reset();
    $$('.field.is-invalid').forEach(f => f.classList.remove('is-invalid'));
    $('output[name="adults"]').value = 1;
    $('output[name="kids"]').value = 0;
    $('#attendOnly').hidden = false;
    $('#rsvpEditing').hidden = true;
    $('#rsvpSubmit').textContent = '전달하기';
    editingId = '';
  }

  /* ── 입력 도우미 ────────────────────────────────────────── */

  const hyphen = input => {
    const n = input.value.replace(/\D/g, '').slice(0, 11);
    input.value = n.length < 4 ? n
      : n.length < 8 ? `${n.slice(0, 3)}-${n.slice(3)}`
      : `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
  };

  function wireInputs() {
    ['#phone', '#findPhone'].forEach(sel => {
      const input = $(sel);
      input.addEventListener('input', () => hyphen(input));
    });

    $$('[data-count]').forEach(box => {
      const out = $('output', box);
      const min = +box.dataset.min, max = +box.dataset.max;
      $$('button', box).forEach(btn => {
        btn.addEventListener('click', () => {
          out.value = Math.min(max, Math.max(min, +out.value + +btn.dataset.step));
        });
      });
    });

    // 미참석을 고르면 인원·식사 항목을 접습니다
    $$('input[name="attend"]').forEach(r => {
      r.addEventListener('change', () => { $('#attendOnly').hidden = r.value === '미참석'; });
    });
  }

  /* ── 검사 ───────────────────────────────────────────────── */

  const PHONE = /^01[016-9]-\d{3,4}-\d{4}$/;

  function mark(checks) {
    let first = null;
    checks.forEach(([name, bad]) => {
      const f = $(`[data-field="${name}"]`);
      if (f) f.classList.toggle('is-invalid', bad);
      if (bad && !first) first = f;
    });
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !first;
  }

  function validate() {
    const fd = new FormData(form);
    const attend = fd.get('attend');
    const skip = attend === '미참석';

    const passed = mark([
      ['side',    !fd.get('side')],
      ['name',    !String(fd.get('name') || '').trim()],
      ['phone',   !PHONE.test(fd.get('phone') || '')],
      ['attend',  !attend],
      ['meal',    !skip && !fd.get('meal')],
      ['consent', !fd.get('consent')],
    ]);
    if (!passed) return null;

    return {
      type: 'rsvp',
      id: editingId || (store.get(KEY_MINE, {}) || {}).id || '',
      side: fd.get('side'),
      name: String(fd.get('name')).trim(),
      phone: fd.get('phone'),
      attend,
      adults: skip ? 0 : +$('output[name="adults"]').value,
      kids:   skip ? 0 : +$('output[name="kids"]').value,
      timeslot: '',
      meal:    skip ? '' : fd.get('meal'),
      message: String(fd.get('message') || '').trim(),
      ua: navigator.userAgent,
    };
  }

  /* ── 제출 ───────────────────────────────────────────────── */

  function wireForm() {
    const btn = $('#rsvpSubmit');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if ($('#nickname').value) return;                 // 봇이 함정을 채웠습니다

      const payload = validate();
      if (!payload) return;

      btn.disabled = true;
      btn.textContent = '전달하는 중…';
      try {
        const res = await send(payload);
        if (!res.ok) throw new Error(res.error || 'FAILED');

        store.set(KEY_MINE, { id: res.id, name: payload.name, phone: payload.phone });
        // 전달이 끝났으니 '수정 중' 상태를 놓아줍니다.
        // 다음에 고치려면 '응답 수정하기' 로 다시 불러오면 됩니다.
        editingId = '';
        $('#rsvpDoneMsg').innerHTML = res.updated
          ? `${payload.name}님의 응답을 수정했습니다.<br>알려 주셔서 감사합니다.`
          : `${payload.name}님의 응답을 전달했습니다.<br>귀한 마음 감사드립니다.`;
        setView('done');
        paintMine();
        toast(res.updated ? '응답을 수정했습니다' : '전달했습니다. 감사합니다');
      } catch (err) {
        console.error(err);
        toast('전달에 실패했습니다. 잠시 후 다시 시도해 주세요');
      } finally {
        btn.disabled = false;
        btn.textContent = editingId ? '수정 내용 전달하기' : '전달하기';
      }
    });
  }

  /* ── 내 응답 불러와 수정하기 ────────────────────────────── */

  function toFind() {
    const mine = store.get(KEY_MINE, null);
    if (mine) { $('#findName').value = mine.name || ''; $('#findPhone').value = mine.phone || ''; }
    setView('find');
  }

  function wireFind() {
    $('#rsvpFindOpen').addEventListener('click', toFind);
    $('#rsvpEdit').addEventListener('click', toFind);
    $('#rsvpFindCancel').addEventListener('click', () => { resetForm(); setView('form'); });

    find.addEventListener('submit', async e => {
      e.preventDefault();
      const name  = $('#findName').value.trim();
      const phone = $('#findPhone').value.trim();
      if (!mark([['findName', !name], ['findPhone', !PHONE.test(phone)]])) return;

      const btn = $('#rsvpFindSubmit');
      btn.disabled = true;
      btn.textContent = '찾는 중…';
      try {
        const res = await send({ type: 'rsvp.find', name, phone });
        if (!res.ok || !res.item) {
          toast('그 성함과 연락처로 접수된 응답이 없습니다');
          return;
        }
        prefill(res.item);
        store.set(KEY_MINE, { id: res.item.id, name: res.item.name, phone: res.item.phone });
        setView('form');
      } catch (err) {
        console.error(err);
        toast('불러오지 못했습니다. 잠시 후 다시 시도해 주세요');
      } finally {
        btn.disabled = false;
        btn.textContent = '내 응답 불러오기';
      }
    });
  }

  /* ── 본문 표시 ──────────────────────────────────────────── */

  function paintMine() {
    const mine = store.get(KEY_MINE, null);
    const note = $('#rsvpMine');
    if (!mine || !mine.name) { note.hidden = true; return; }
    note.hidden = false;
    note.textContent = `${mine.name}님의 응답이 접수되어 있습니다.`;
    $$('[data-rsvp-open]').forEach(b => { b.textContent = '응답 수정하기'; });
  }

  /* ── 열기 버튼 ──────────────────────────────────────────── */

  function wireOpeners() {
    $$('[data-rsvp-open]').forEach(b => {
      b.addEventListener('click', () => {
        openModal(store.get(KEY_MINE, null) ? 'find' : 'form');
      });
    });

    modal.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  /* ── 시작 ───────────────────────────────────────────────── */

  showDeadline();
  wireInputs();
  wireForm();
  wireFind();
  wireOpeners();
  paintMine();

  if (DEMO) console.info('%c청첩장 연습 모드', 'color:#B01133;font-weight:bold',
    '— RSVP_ENDPOINT 시크릿을 채우면 실제 구글 시트로 전송됩니다.');
})();
