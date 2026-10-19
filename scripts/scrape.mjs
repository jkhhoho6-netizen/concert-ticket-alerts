#!/usr/bin/env node
// Scrapes upcoming ticket openings, updates public/data/concerts.json and pushes new ones via ntfy.
//   node scripts/scrape.mjs              normal run
//   node scripts/scrape.mjs --dry-run    scrape + print, no files written, no push
//   node scripts/scrape.mjs --test-notify  send one sample push to NTFY_TOPIC and exit
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMelon } from '../src/sources/melon.mjs';
import { fetchNol } from '../src/sources/nol.mjs';
import { mergeRun } from '../src/merge.mjs';
import { buildMessages, sendNtfy } from '../src/notify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'public/data/concerts.json');
const STATE_FILE = join(ROOT, 'data/state.json');

const args = new Set(process.argv.slice(2));
const ntfy = { topic: process.env.NTFY_TOPIC, server: process.env.NTFY_SERVER || undefined, token: process.env.NTFY_TOKEN };
const siteUrl = process.env.SITE_URL || undefined;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

async function runSource(name, fn) {
  const t = Date.now();
  try {
    const items = await fn();
    console.log(`[${name}] ${items.length} items (${Date.now() - t}ms)`);
    return { ok: true, items };
  } catch (err) {
    console.error(`[${name}] FAILED: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

if (args.has('--test-notify')) {
  const sent = await sendNtfy(
    [{ title: '콘서트 티켓오픈 알림 테스트', message: '알림이 잘 오네요! 새 오픈 예정이 등록되면 이렇게 알려드려요.', tags: ['ticket'], ...(siteUrl && { click: siteUrl }) }],
    ntfy,
  );
  process.exit(sent ? 0 : 1);
}

const prev = await readJson(DATA_FILE, { items: [] });
const state = await readJson(STATE_FILE, null);
const prevById = new Map(prev.items.map((it) => [it.id, it]));
const now = Date.now();

const results = {
  nol: await runSource('nol', fetchNol),
  melon: await runSource('melon', () => fetchMelon(prevById)),
};

if (Object.values(results).every((r) => !r.ok)) {
  console.error('All sources failed — leaving data untouched.');
  process.exit(1);
}

const { items, seen, newItems, isFirstRun } = mergeRun({ prevItems: prev.items, seen: state?.seen ?? null, results, now });

console.log(`${items.length} upcoming items, ${newItems.length} new${isFirstRun ? ' (first run: seeding, no push)' : ''}`);
for (const it of newItems) console.log(`  NEW ${it.id} ${it.title} @ ${it.opens.map((o) => o.at).join(', ')}`);

if (args.has('--dry-run')) process.exit(0);

const sources = Object.fromEntries(
  Object.entries(results).map(([k, r]) => [
    k,
    r.ok ? { ok: true, count: r.items.length, checkedAt: new Date(now).toISOString() } : { ...prev.sources?.[k], ok: false, error: r.error },
  ]),
);
const updatedAt = new Date(now).toISOString();
await writeJson(DATA_FILE, { updatedAt, seededAt: prev.seededAt ?? updatedAt, sources, items });
await writeJson(STATE_FILE, { seen });

if (newItems.length) {
  const sent = await sendNtfy(buildMessages(newItems, { siteUrl }), ntfy);
  console.log(`[notify] sent ${sent} push message(s)`);
}
