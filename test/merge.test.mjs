import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRun } from '../src/merge.mjs';
import { buildMessages } from '../src/notify.mjs';
import { parseMelonDate } from '../src/sources/melon.mjs';

const NOW = Date.parse('2026-10-19T09:00:00+09:00');
const item = (id, at, extra = {}) => ({
  id,
  source: id.split(':')[0],
  title: `공연 ${id}`,
  url: `https://example.com/${id}`,
  opens: [{ label: '티켓오픈', at, timeKnown: true }],
  ...extra,
});

test('first run seeds without notifying', () => {
  const r = mergeRun({ prevItems: [], seen: null, results: { nol: { ok: true, items: [item('nol:1', '2026-10-20T20:00:00+09:00')] } }, now: NOW });
  assert.equal(r.isFirstRun, true);
  assert.equal(r.newItems.length, 0);
  assert.ok(r.seen['nol:1']);
});

test('new future item is notified once, past/new item is not', () => {
  const seen = { 'nol:1': '2026-10-18T00:00:00Z' };
  const results = {
    nol: {
      ok: true,
      items: [
        item('nol:1', '2026-10-20T20:00:00+09:00'),
        item('nol:2', '2026-10-21T20:00:00+09:00'),
        item('nol:3', '2026-10-19T08:00:00+09:00'), // already opened
      ],
    },
  };
  const r = mergeRun({ prevItems: [], seen, results, now: NOW });
  assert.deepEqual(r.newItems.map((i) => i.id), ['nol:2']);
  const again = mergeRun({ prevItems: r.items, seen: r.seen, results, now: NOW + 60000 });
  assert.equal(again.newItems.length, 0);
});

test('failed source keeps previous items and does not re-alert', () => {
  const prev = [{ ...item('melon:9', '2026-10-25T20:00:00+09:00'), firstSeen: '2026-10-18T00:00:00Z' }];
  const r = mergeRun({
    prevItems: prev,
    seen: { 'melon:9': '2026-10-18T00:00:00Z' },
    results: { melon: { ok: false, error: 'boom' }, nol: { ok: true, items: [] } },
    now: NOW,
  });
  assert.deepEqual(r.items.map((i) => i.id), ['melon:9']);
  assert.equal(r.newItems.length, 0);
});

test('items long past their last open are dropped, list sorted by next open', () => {
  const results = {
    nol: {
      ok: true,
      items: [item('nol:late', '2026-10-30T20:00:00+09:00'), item('nol:old', '2026-10-17T20:00:00+09:00'), item('nol:soon', '2026-10-19T12:00:00+09:00')],
    },
  };
  const r = mergeRun({ prevItems: [], seen: {}, results, now: NOW });
  assert.deepEqual(r.items.map((i) => i.id), ['nol:soon', 'nol:late']);
});

test('melon date parsing', () => {
  assert.deepEqual(parseMelonDate('2026.10.19(월) 12:00'), { at: '2026-10-19T12:00:00+09:00', timeKnown: true });
  assert.deepEqual(parseMelonDate('2026년 10월 26일 (월) 20:00'), { at: '2026-10-26T20:00:00+09:00', timeKnown: true });
  assert.deepEqual(parseMelonDate('2026.10.23(금)'), { at: '2026-10-23T00:00:00+09:00', timeKnown: false });
  assert.equal(parseMelonDate('오픈일정 보기 >'), null);
});

test('many new items collapse into one digest push', () => {
  const many = Array.from({ length: 12 }, (_, i) => item(`nol:${i}`, '2026-10-21T20:00:00+09:00'));
  const msgs = buildMessages(many, { siteUrl: 'https://example.com' });
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].title, /12건/);
  const one = buildMessages([item('nol:1', '2026-10-21T20:00:00+09:00', { venue: 'KSPO DOME', exclusive: true })]);
  assert.equal(one[0].click, 'https://example.com/nol:1');
  assert.match(one[0].message, /티켓오픈 10\.21\(수\) 20:00/);
  assert.match(one[0].message, /KSPO DOME · NOL 티켓 단독판매/);
});
