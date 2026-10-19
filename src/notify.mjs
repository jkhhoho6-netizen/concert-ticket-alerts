// Push notifications via ntfy (https://ntfy.sh): no account needed — install the ntfy app
// and subscribe to the same (hard to guess) topic name that is set in NTFY_TOPIC.
import { formatKst } from './util.mjs';

export const SOURCE_NAMES = { nol: 'NOL 티켓', melon: '멜론티켓' };
const MAX_INDIVIDUAL = 8;

export function describeOpens(item, now = Date.now()) {
  const future = item.opens.filter((o) => Date.parse(o.at) > now);
  return (future.length ? future : item.opens)
    .map((o) => `${o.label} ${o.timeKnown ? formatKst(o.at) : `${formatKst(o.at, { withTime: false })} (시간 미정)`}`)
    .join('\n');
}

export function buildMessages(newItems, { siteUrl } = {}) {
  if (newItems.length > MAX_INDIVIDUAL) {
    const lines = newItems.map((it) => `• ${it.title} — ${describeOpens(it).split('\n').at(-1)}`);
    return [
      {
        title: `새 티켓오픈 예정 ${newItems.length}건`,
        message: lines.join('\n'),
        tags: ['ticket'],
        priority: 4,
        ...(siteUrl && { click: siteUrl }),
      },
    ];
  }
  return newItems.map((it) => {
    const meta = [it.venue, SOURCE_NAMES[it.source] + (it.exclusive ? ' 단독판매' : '')].filter(Boolean).join(' · ');
    return {
      title: it.round ? `${it.title} [${it.round}]` : it.title,
      message: `${describeOpens(it)}\n${meta}`,
      tags: ['ticket'],
      priority: 4,
      click: it.url,
      ...(it.poster && { attach: it.poster }),
    };
  });
}

export async function sendNtfy(messages, { topic, server = 'https://ntfy.sh', token } = {}) {
  if (!topic) {
    console.log('[notify] NTFY_TOPIC not set — skipping push');
    return 0;
  }
  let sent = 0;
  for (const msg of messages) {
    try {
      const res = await fetch(server.replace(/\/$/, ''), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ topic, ...msg }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      sent++;
    } catch (err) {
      console.warn(`[notify] failed to send "${msg.title}": ${err.message}`);
    }
  }
  return sent;
}
