/* ═══════════════════════════════════════════════════════════════
   구글 Apps Script 백엔드 — 하객 응답을 스프레드시트에 저장합니다.

   설치 방법
   ─────────────────────────────────────────────────────────────
   1. 구글 스프레드시트를 새로 만들고 주소창의 /d/  와  /edit  사이
      문자열(스프레드시트 ID)을 아래 SHEET_ID 에 붙여넣습니다.
   2. 그 스프레드시트에서 [확장 프로그램] → [Apps Script] 를 엽니다.
   3. 이 파일 내용을 통째로 붙여넣고 저장합니다.
   4. [배포] → [새 배포] → 유형 [웹 앱]
        · 실행 계정        : 나
        · 액세스 권한 있는 사용자 : 모든 사용자
   5. 배포 후 나오는 /exec 로 끝나는 주소를
      content.js 의 endpoint 에 붙여넣습니다.

   코드를 고칠 때마다 [배포] → [배포 관리] → 연필 → [새 버전] 을
   눌러야 반영됩니다. 주소는 그대로 유지됩니다.
   ═══════════════════════════════════════════════════════════════ */

const SHEET_ID  = '여기에_스프레드시트_ID';
const ADMIN_KEY = '아무도_모를_긴_문자열로_바꾸세요';
const NOTIFY_TO = '';   // 새 응답이 올 때 알림 받을 메일 주소. 비우면 안 보냅니다.

const RSVP_HEADER = ['timestamp', 'id', 'side', 'name', 'phone', 'attend',
                     'adults', 'kids', 'timeslot', 'meal', 'message', 'ua'];

/* ── 요청 처리 ────────────────────────────────────────────── */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    switch (body.type) {
      case 'rsvp':      return json(saveRsvp(body));
      case 'rsvp.find': return json(findRsvp(body));
      default:          return json({ ok: false, error: 'UNKNOWN_TYPE' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = e.parameter || {};

  // 하객 명단은 관리자 키가 맞을 때만 내줍니다.
  if (p.type === 'rsvp' && p.key === ADMIN_KEY) return json({ ok: true, items: listRsvp() });

  return json({ ok: false, error: 'FORBIDDEN' });
}

/* ── 참석 의사 ────────────────────────────────────────────── */

function saveRsvp(b) {
  const name  = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  if (!name || !/^01[016-9]-\d{3,4}-\d{4}$/.test(phone)) return { ok: false, error: 'INVALID' };

  const sheet = sheetOf('rsvp', RSVP_HEADER);
  const rows  = sheet.getDataRange().getValues();
  const now   = new Date();

  // 이미 보낸 사람이 수정하는 경우 — 같은 줄을 덮어씁니다.
  if (b.id) {
    for (let r = 1; r < rows.length; r++) {
      if (String(rows[r][1]) === String(b.id)) {
        sheet.getRange(r + 1, 1, 1, RSVP_HEADER.length).setValues([rowOf(b, b.id, now)]);
        return { ok: true, id: b.id, updated: true };
      }
    }
  }

  // 성함과 연락처가 똑같으면 같은 사람의 수정으로 봅니다.
  // 새 줄을 만들지 않고 원래 줄을 고쳐 씁니다.
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][3] === name && rows[r][4] === phone) {
      sheet.getRange(r + 1, 1, 1, RSVP_HEADER.length).setValues([rowOf(b, rows[r][1], now)]);
      return { ok: true, id: rows[r][1], updated: true };
    }
  }

  const id = Utilities.getUuid().slice(0, 8);
  sheet.appendRow(rowOf(b, id, now));
  notify(b);
  return { ok: true, id: id };
}

// 성함과 연락처가 둘 다 정확히 맞을 때만 그 한 줄을 돌려줍니다.
// 다른 사람의 응답은 어떤 경우에도 나가지 않습니다.
function findRsvp(b) {
  const name  = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  if (!name || !phone) return { ok: false, error: 'INVALID' };

  const rows = sheetOf('rsvp', RSVP_HEADER).getDataRange().getValues();

  for (let r = rows.length - 1; r >= 1; r--) {
    if (rows[r][3] !== name || rows[r][4] !== phone) continue;
    const item = {};
    RSVP_HEADER.forEach(function (k, i) { item[k] = rows[r][i]; });
    delete item.ua;
    delete item.timestamp;
    return { ok: true, item: item };
  }
  return { ok: false, error: 'NOT_FOUND' };
}

function rowOf(b, id, now) {
  return [now, id, b.side || '', String(b.name).trim(), b.phone || '', b.attend || '',
          Number(b.adults) || 0, Number(b.kids) || 0, b.timeslot || '', b.meal || '',
          String(b.message || '').slice(0, 200), String(b.ua || '').slice(0, 200)];
}

function listRsvp() {
  const rows = sheetOf('rsvp', RSVP_HEADER).getDataRange().getValues();
  return rows.slice(1).map(function (r) {
    const o = {};
    RSVP_HEADER.forEach(function (k, i) { o[k] = r[i]; });
    return o;
  });
}

function notify(b) {
  if (!NOTIFY_TO) return;
  const who = b.attend === '참석'
    ? b.name + '님 참석 · 성인 ' + b.adults + ' 아동 ' + b.kids + ' · ' + b.timeslot
    : b.name + '님 ' + b.attend;
  MailApp.sendEmail(NOTIFY_TO, '[청첩장] 새 응답 — ' + b.name,
                    who + '\n' + (b.side || '') + '\n' + (b.message || ''));
}

/* ── 공통 ─────────────────────────────────────────────────── */

function sheetOf(name, header) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
