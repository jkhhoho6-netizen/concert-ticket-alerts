// 멜론티켓 "티켓오픈소식" — https://ticket.melon.com/csoon/index.htm
// The list is an HTML fragment served by /csoon/ajax/listTicketOpen.htm (10 items per page,
// pageIndex is a 1-based offset: 1, 11, 21, ...). Items with several open dates show
// "오픈일정 보기" in the list, so their schedule is read from the detail page.
import { fetchRetry, kstIso, stripTags } from '../util.mjs';

const BASE = 'https://ticket.melon.com/csoon';
const LIST_URL = `${BASE}/ajax/listTicketOpen.htm`;
const PAGE_SIZE = 10;
const MAX_PAGES = 30;
const GENRE = 'GENRE_CON_ALL';

const detailUrl = (id) => `${BASE}/detail.htm?csoonId=${id}`;

/** "2026.10.19(월) 12:00" or "2026년 10월 26일 (월) 20:00" → { at, timeKnown } */
export function parseMelonDate(s) {
  const m = s.match(/(\d{4})\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})\s*일?(?:\s*\([^)]*\))?(?:\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const timeKnown = m[4] != null;
  return { at: kstIso(+m[1], +m[2], +m[3], timeKnown ? +m[4] : 0, timeKnown ? +m[5] : 0), timeKnown };
}

const cleanTitle = (t) => t.replace(/\s*티켓\s*오픈\s*안내\s*$/, '').trim();
const posterUrl = (src) => src?.replace(/\/resize\/\d+x\d+\//, '/resize/160x225/') ?? null;

export function parseMelonList(html) {
  const items = [];
  for (const li of html.split(/<li>/).slice(1)) {
    const id = li.match(/csoonId=(\d+)"\s+class="tit"/)?.[1];
    if (!id) continue;
    const titleHtml = li.match(/class="tit">([\s\S]*?)<\/a>/)?.[1] ?? '';
    const dateText = stripTags(li.match(/<span class="date">([\s\S]*?)<\/span>/)?.[1] ?? '');
    const date = parseMelonDate(dateText);
    items.push({
      csoonId: id,
      title: cleanTitle(stripTags(titleHtml)),
      poster: posterUrl(li.match(/class="poster"><img src=\s*"([^"]+)"/)?.[1]),
      exclusive: /ico_list1">단독판매/.test(li),
      opens: date ? [{ label: '티켓오픈', ...date }] : [],
      needsDetail: !date, // "오픈일정 보기 >"
    });
  }
  return items;
}

export function parseMelonDetail(html) {
  const sched = html.match(/<ul class="list_schedule">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const blocks = sched.split(/<li[^>]*>/).slice(1);
  const opens = [];
  for (const block of blocks) {
    const name = stripTags(block.match(/<p class="tit_consert">([\s\S]*?)<\/p>/)?.[1] ?? '');
    const re = /<dt class="tit_type">([\s\S]*?)<\/dt>\s*<dd class="txt_date">([\s\S]*?)<\/dd>/g;
    for (const [, dt, dd] of block.matchAll(re)) {
      const date = parseMelonDate(stripTags(dd));
      if (!date) continue;
      const label = stripTags(dt) || '티켓오픈';
      opens.push({ label: blocks.length > 1 && name ? `${name} · ${label}` : label, ...date, _name: name });
    }
  }
  const infoAt = html.indexOf('class="box_concert_info"');
  const body = infoAt >= 0 ? stripTags(html.slice(infoAt, infoAt + 20000)) : '';
  return {
    opens: opens.map(({ _name, ...o }) => o),
    venue: infoField(body, /(?:공연\s*장소|장\s*소|공연장|Venue)/),
    showDates: infoField(body, /(?:공연\s*일시|공연\s*일자|일\s*시|Date)/),
  };
}

// "- 공연장소 : 서강대학교 메리홀 대극장 - 관람등급 ..." → "서강대학교 메리홀 대극장"
function infoField(text, label) {
  const re = new RegExp(`${label.source}\\s*[:：|▶]\\s*(.{2,60}?)(?=\\s+[-※\\[▶•*■◆○●]|\\s{2,}|$)`);
  return text.match(re)?.[1]?.trim() || null;
}

async function fetchDetail(id) {
  const res = await fetchRetry(detailUrl(id));
  return parseMelonDetail(await res.text());
}

/**
 * @param {Map<string, object>} prev previously stored items keyed by id, used to skip
 *   re-fetching detail pages for items we already know.
 */
export async function fetchMelon(prev = new Map()) {
  const listed = [];
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = new URLSearchParams({ orderType: '2', pageIndex: String(page * PAGE_SIZE + 1), schGcode: GENRE, schText: '' });
    const res = await fetchRetry(LIST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', referer: `${BASE}/index.htm` },
      body,
    });
    const items = parseMelonList(await res.text()).filter((it) => !seen.has(it.csoonId));
    if (!items.length) break;
    for (const it of items) seen.add(it.csoonId);
    listed.push(...items);
  }

  const out = [];
  for (const it of listed) {
    const id = `melon:${it.csoonId}`;
    const old = prev.get(id);
    let detail = { opens: [], venue: old?.venue ?? null, showDates: old?.showDates ?? null };
    if (it.needsDetail || !old) {
      try {
        detail = await fetchDetail(it.csoonId);
      } catch (err) {
        console.warn(`[melon] detail ${it.csoonId} failed: ${err.message}`);
        if (old) detail = { opens: old.opens, venue: old.venue, showDates: old.showDates };
      }
    }
    // Prefer the detail schedule (선예매 + 일반) when it has more than the list's single date.
    const opens = detail.opens.length > it.opens.length ? detail.opens : it.opens;
    out.push({
      id,
      source: 'melon',
      title: it.title,
      round: null,
      url: detailUrl(it.csoonId),
      poster: it.poster,
      venue: detail.venue,
      region: null,
      genre: null,
      showDates: detail.showDates,
      exclusive: it.exclusive,
      cast: null,
      opens: opens.sort((a, b) => a.at.localeCompare(b.at)),
    });
  }
  return out;
}
