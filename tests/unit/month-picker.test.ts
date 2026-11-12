import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recentMonths } from '../../src/components/month-picker';

test('the month list runs backwards from the current month, across years', () => {
  assert.deepEqual(recentMonths('2026-11', 3), ['2026-11', '2026-10', '2026-09']);
  assert.deepEqual(recentMonths('2026-02', 4), ['2026-02', '2026-01', '2025-12', '2025-11']);
  assert.equal(recentMonths('2026-11', 36).length, 36);
  assert.ok(recentMonths('2026-11', 36).includes('2026-06'));
});
