const SOURCE_NAMES = { nol: 'NOL', melon: '멜론' };
const NEW_WINDOW_MS = 48 * 3600 * 1000;
const TZ = 'Asia/Seoul';

const $ = (sel) => document.querySelector(sel);
const state = { data: null, source: 'all', onlyNew: false, q: '' };

try {
  const saved = JSON.parse(localStorage.getItem('filters') || '{}');
  if (saved.source) state.source = saved.source;
} catch {}

// ---- KST date helpers -------------------------------------------------------
const dtf = (opts) => new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, ...opts });
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (t) => keyFmt.format(new Date(t));
const timeFmt = dtf({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const partsFmt = dtf({ month: 'numeric', day: 'numeric', weekday: 'short' });
function dateLabel(t) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.month}.${p.day}(${p.weekday})`;
}
const shortLabel = (t) => `${dateLabel(t)} ${timeFmt.format(new Date(t))}`;

function relDay(key, now) {
  const diff = Math.round((Date.parse(key) - Date.parse(dayKey(now))) / 86400000);
  return { 0: '오늘', 1: '내일', 2: '모레' }[diff] ?? (diff < 0 ? '지난 오픈' : null);
}

function countdown(ms) {
  if (ms <= 0) return '오픈됨';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}분 후`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간 ${m % 60}분 후` : null;
}

const nextOpen = (it, now) => it.opens.find((o) => Date.parse(o.at) > now) ?? it.opens.at(-1);

function isNew(it, now) {
  const seen = Date.parse(it.firstSeen);
  const seeded = Date.parse(state.data.seededAt || 0);
  return seen - seeded > 60_000 && now - seen < NEW_WINDOW_MS;
}

// ---- rendering --------------------------------------------------------------
function matches(it, now) {
  if (!it.opens.some((o) => Date.parse(o.at) > now)) return false; // already opened
  if (state.source !== 'all' && it.source !== state.source) return false;
  if (state.onlyNew && !isNew(it, now)) return false;
  if (state.q) {
    const hay = [it.title, it.venue, it.cast, it.region, it.round].filter(Boolean).join(' ').toLowerCase();
    if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

function renderCard(it, now) {
  const node = $('#card-tpl').content.firstElementChild.cloneNode(true);
  const next = nextOpen(it, now);
  const left = Date.parse(next.at) - now;

  node.classList.toggle('soon', left > 0 && left < 3 * 3600 * 1000);
  node.classList.toggle('past', left <= 0);

  for (const a of node.querySelectorAll('a')) a.href = it.url;
  const img = node.querySelector('img');
  if (it.poster) img.src = it.poster;
  else img.remove();

  const when = node.querySelector('.when');
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = next.timeKnown ? timeFmt.format(new Date(next.at)) : '시간 미정';
  const label = document.createElement('span');
  label.textContent = next.label;
  when.append(time, label);
  const cd = countdown(left);
  if (cd && next.timeKnown) {
    const c = document.createElement('span');
    c.className = 'countdown';
    c.textContent = `· ${cd}`;
    when.append(c);
  }

  node.querySelector('.title').textContent = it.title;

  const meta = node.querySelector('.meta');
  const badge = (cls, text) => {
    const b = document.createElement('span');
    b.className = `badge ${cls}`;
    b.textContent = text;
    meta.append(b);
  };
  if (isNew(it, now)) badge('new', 'NEW');
  badge(it.source, SOURCE_NAMES[it.source]);
  if (it.exclusive) badge('excl', '단독');
  if (it.round) badge('round', it.round);
  const place = [it.venue, it.showDates && `공연 ${it.showDates}`].filter(Boolean).join(' · ');
  if (place) meta.append(document.createTextNode(place));

  const opens = node.querySelector('.opens');
  if (it.opens.length > 1) {
    for (const o of it.opens) {
      const li = document.createElement('li');
      const t = Date.parse(o.at);
      li.textContent = `${o.label} ${o.timeKnown ? shortLabel(t) : dateLabel(t)}`;
      if (t <= now) li.className = 'done';
      else if (o === next) li.className = 'next';
      opens.append(li);
    }
  } else opens.remove();

  node.querySelector('.cal').addEventListener('click', () => downloadIcs(it, now));
  return node;
}

function render() {
  const list = $('#list');
  const status = $('#status');
  if (!state.data) return;
  const now = Date.now();
  const items = state.data.items.filter((it) => matches(it, now));

  const groups = new Map();
  for (const it of items) {
    const key = dayKey(nextOpen(it, now).at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const frag = document.createDocumentFragment();
  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const sec = document.createElement('section');
    sec.className = 'day';
    const h = document.createElement('h2');
    h.className = 'day-head';
    const rel = relDay(key, now);
    h.innerHTML = `${rel ? `<span class="rel">${rel}</span>` : ''}<span>${dateLabel(`${key}T12:00:00+09:00`)}</span><span class="count">${group.length}건</span>`;
    sec.append(h);
    group.sort((a, b) => nextOpen(a, now).at.localeCompare(nextOpen(b, now).at));
    for (const it of group) sec.append(renderCard(it, now));
    frag.append(sec);
  }
  list.replaceChildren(frag);

  status.hidden = items.length > 0;
  status.textContent = state.data.items.length ? '조건에 맞는 공연이 없어요.' : '예정된 티켓오픈이 없어요.';
}

function renderHeader() {
  const d = state.data;
  const upcoming = d.items.filter((it) => it.opens.some((o) => Date.parse(o.at) > Date.now())).length;
  const ago = Math.round((Date.now() - Date.parse(d.updatedAt)) / 60000);
  const agoText = ago < 1 ? '방금' : ago < 60 ? `${ago}분 전` : `${Math.floor(ago / 60)}시간 전`;
  $('#updated').textContent = `오픈 예정 ${upcoming}건 · ${agoText} 업데이트`;
  const down = Object.entries(d.sources || {}).filter(([, s]) => !s.ok).map(([k]) => SOURCE_NAMES[k]);
  $('#sourceState').innerHTML = down.length ? ` · <span class="warn">${down.join(', ')} 수집 오류 (이전 데이터 표시 중)</span>` : '';
}

// ---- calendar export ----------------------------------------------------------
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}
const icsDate = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function downloadIcs(it, now) {
  const future = it.opens.filter((o) => Date.parse(o.at) > now);
  const opens = future.length ? future : it.opens;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ticket-open-calendar//KO', 'CALSCALE:GREGORIAN'];
  for (const o of opens) {
    const start = Date.parse(o.at);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.id.replace(':', '-')}-${icsDate(start)}@ticket-open-calendar`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(start + 30 * 60000)}`,
      `SUMMARY:${icsEscape(`🎫 ${o.label} · ${it.title}`)}`,
      `DESCRIPTION:${icsEscape(`${SOURCE_NAMES[it.source]}${it.venue ? ` · ${it.venue}` : ''}\n${it.url}`)}`,
      `URL:${it.url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(`10분 후 ${o.label}: ${it.title}`)}`,
      'TRIGGER:-PT10M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${it.title.slice(0, 40).replace(/[\\/:*?"<>|]/g, '')}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---- data + events --------------------------------------------------------------
async function load() {
  try {
    const res = await fetch(`data/concerts.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
    renderHeader();
    render();
  } catch (err) {
    if (!state.data) {
      $('#status').hidden = false;
      $('#status').textContent = '데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
    }
  }
}

function syncChips() {
  for (const b of document.querySelectorAll('.chip[data-source]')) b.setAttribute('aria-pressed', String(b.dataset.source === state.source));
  $('#onlyNew').setAttribute('aria-pressed', String(state.onlyNew));
}

for (const b of document.querySelectorAll('.chip[data-source]')) {
  b.addEventListener('click', () => {
    state.source = b.dataset.source;
    try { localStorage.setItem('filters', JSON.stringify({ source: state.source })); } catch {}
    syncChips();
    render();
  });
}
$('#onlyNew').addEventListener('click', () => {
  state.onlyNew = !state.onlyNew;
  syncChips();
  render();
});
$('#q').addEventListener('input', (e) => {
  state.q = e.target.value.trim().toLowerCase();
  render();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});
setInterval(() => {
  if (!state.data) return;
  renderHeader();
  render();
}, 60_000);
setInterval(load, 10 * 60_000);

syncChips();
load();
