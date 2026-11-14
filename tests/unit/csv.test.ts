import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell, monthRange, toCsv } from '../../src/lib/domain/csv';

test('csv cells are quoted when needed and never run as formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a, b'), '"a, b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(null), '');
});

test('a csv starts with a byte-order mark and uses one line per row', () => {
  assert.equal(toCsv(['A', 'B'], [[1, 'x']]), '﻿A,B\r\n1,x\r\n');
});

test('month ranges run to the first of the next month', () => {
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', until: '2027-01-01' });
  assert.deepEqual(monthRange('2026-03'), { from: '2026-03-01', until: '2026-04-01' });
  assert.equal(monthRange('2026-13'), null);
  assert.equal(monthRange('march'), null);
});
