// Merges a scrape run into the stored state and decides which items are "new" (→ push).
const KEEP_AFTER_OPEN_MS = 12 * 3600 * 1000; // keep just-opened items on the page for half a day
const SEEN_TTL_MS = 120 * 24 * 3600 * 1000;

const lastOpen = (it) => it.opens.at(-1)?.at;
const nextOpen = (it, now) => it.opens.find((o) => Date.parse(o.at) > now)?.at ?? lastOpen(it);

/**
 * @param {object} p
 * @param {object[]} p.prevItems items from the previous run
 * @param {Record<string,string>|null} p.seen id → first-seen ISO; null on the very first run
 * @param {Record<string, {ok: boolean, items?: object[], error?: string}>} p.results per-source results
 * @param {number} p.now epoch ms
 */
export function mergeRun({ prevItems, seen, results, now }) {
  const isFirstRun = seen == null;
  const nextSeen = { ...(seen ?? {}) };
  const nowIso = new Date(now).toISOString();
  const newItems = [];
  let items = [];

  for (const [source, r] of Object.entries(results)) {
    if (!r.ok) {
      // Source down: keep what we had so items don't vanish (and don't re-alert later).
      items.push(...prevItems.filter((it) => it.source === source));
      continue;
    }
    for (const it of r.items) {
      if (!it.opens.length) continue;
      const firstSeen = nextSeen[it.id];
      if (!firstSeen) {
        nextSeen[it.id] = nowIso;
        if (!isFirstRun && it.opens.some((o) => Date.parse(o.at) > now)) newItems.push(it);
      }
      items.push({ ...it, firstSeen: nextSeen[it.id] });
    }
  }

  items = items
    .filter((it) => Date.parse(lastOpen(it)) >= now - KEEP_AFTER_OPEN_MS)
    .sort((a, b) => nextOpen(a, now).localeCompare(nextOpen(b, now)) || a.title.localeCompare(b.title, 'ko'));

  const current = new Set(items.map((it) => it.id));
  for (const [id, ts] of Object.entries(nextSeen)) {
    if (!current.has(id) && Date.parse(ts) < now - SEEN_TTL_MS) delete nextSeen[id];
  }

  newItems.sort((a, b) => nextOpen(a, now).localeCompare(nextOpen(b, now)));
  return { items, seen: nextSeen, newItems, isFirstRun };
}
