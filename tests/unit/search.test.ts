import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anyColumn, matchPages, searchWords } from '../../src/lib/services/search';

test('every word typed is searched, cleaned of filter-breaking marks', () => {
  assert.deepEqual(searchWords('  Seraj   Sir '), ['seraj', 'sir']);
  assert.deepEqual(searchWords('50% (rush), "urgent"'), ['50', 'rush', 'urgent']);
  assert.deepEqual(searchWords('a b c d e f g'), ['a', 'b', 'c', 'd', 'e']);
});

test('a word is looked for in every column, quoted so dots are safe', () => {
  assert.equal(anyColumn(['name', 'brief'], 'v1.2'), 'name.ilike."%v1.2%",brief.ilike."%v1.2%"');
});

test('pages are found by name or contents, only where the person may go', () => {
  const employee = { isAdmin: false, segments: new Set<string>() };
  const finance = { isAdmin: false, segments: new Set(['cashflow']) };
  const admin = { isAdmin: true, segments: new Set<string>() };
  assert.ok(matchPages(['attendance'], employee).some((page) => page.href === '/employees?tab=attendance'));
  assert.equal(matchPages(['invoice'], employee).length, 0);
  assert.ok(matchPages(['invoice'], finance).some((page) => page.title === 'Invoices'));
  assert.ok(matchPages(['delete', 'log'], admin).some((page) => page.href === '/settings?tab=delete-log'));
  assert.equal(matchPages(['delete', 'log'], employee).length, 0);
});
