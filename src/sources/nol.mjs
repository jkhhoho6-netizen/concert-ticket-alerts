// NOL 티켓 (구 인터파크) "오픈 예정" — https://nol.yanolja.com/ticket/display/upcoming?genre=concert
// The page is backed by a cursor-paginated JSON endpoint.
import { fetchRetry, nolDateToIso } from '../util.mjs';

const API = 'https://nol.yanolja.com/ticket/display/api/upcoming';
const PAGE_URL = 'https://nol.yanolja.com/ticket/display/upcoming?genre=concert';
const MAX_PAGES = 30;

function openLabel(t) {
  if (t.ticket_other_open_name) return t.ticket_other_open_name.trim();
  if (t.ticket_open_type === 1) return '일반예매';
  return (t.ticket_open_type_name || '티켓오픈').replace(/\s+/g, '');
}

function roundName(n) {
  if (n.open_type_name === '직접입력') return n.open_name?.trim() || null;
  if (n.open_type_name && n.open_type_name !== '일반예매') return n.open_type_name;
  return null;
}

export function normalizeNol(n) {
  const opens = (n.ticket_dates || [])
    .map((t) => ({ label: openLabel(t), at: nolDateToIso(t.ticket_open_date), timeKnown: true }))
    .filter((o) => o.at)
    .sort((a, b) => a.at.localeCompare(b.at));
  const showDates =
    n.goods_start_date && n.goods_end_date && n.goods_start_date !== n.goods_end_date
      ? `${n.goods_start_date} ~ ${n.goods_end_date}`
      : n.goods_start_date || null;
  return {
    id: `nol:${n.id}`,
    source: 'nol',
    title: n.title.trim(),
    round: roundName(n),
    url: n.goods_code ? `https://nol.yanolja.com/ticket/products/${n.goods_code}` : PAGE_URL,
    poster: n.goods_poster_image_url || n.open_notice_poster_image_url || null,
    venue: n.venue_name || null,
    region: n.goods_region_name || null,
    genre: n.goods_sub_genre_name || n.goods_genre_name || null,
    showDates,
    exclusive: n.goods_seat_type_name === '단독판매',
    cast: n.casting_info || null,
    opens,
  };
}

export async function fetchNol() {
  const items = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = { sort: 'open', genre: 'concert', region: 'all', ...(cursor && { cursor }) };
    const res = await fetchRetry(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://nol.yanolja.com', referer: PAGE_URL },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    items.push(...(data.notices || []));
    cursor = data.summary?.next_cursor;
    if (!cursor) break;
  }
  // The API ignores the genre filter, so filter concerts (incl. 팬미팅/내한공연 sub-genres) here.
  return items.filter((n) => n.display_concert || n.goods_genre_name === '콘서트').map(normalizeNol);
}
