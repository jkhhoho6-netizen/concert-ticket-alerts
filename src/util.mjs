export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with a browser UA, timeout and a couple of retries. Returns the Response (ok only). */
export async function fetchRetry(url, init = {}, { retries = 2, timeoutMs = 20000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'ko-KR,ko;q=0.9', ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Build an ISO-8601 string in KST (+09:00). */
export function kstIso(y, mo, d, h = 0, mi = 0) {
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:00+09:00`;
}

/** NOL gives local KST times without offset, e.g. "2026-10-22T12:00:00". */
export function nolDateToIso(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? kstIso(+m[1], +m[2], +m[3], +m[4], +m[5]) : null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeHtml(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => ENTITIES[name] ?? m);
}

export function stripTags(s) {
  return decodeHtml(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Short Korean label for a KST ISO date, e.g. "10.26(월) 20:00". */
export function formatKst(iso, { withTime = true } = {}) {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.month}.${parts.day}(${parts.weekday})`;
  return withTime ? `${date} ${parts.hour}:${parts.minute}` : date;
}
