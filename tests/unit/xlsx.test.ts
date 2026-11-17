import assert from 'node:assert/strict';
import test from 'node:test';
import { workbook } from '../../src/lib/server/xlsx';

test('an Excel file is a zip holding the workbook and each sheet', () => {
  const bytes = workbook([{ name: 'Money in', rows: [['Date', 'Amount'], ['2026-11-01', 5000]] }, { name: 'Team', rows: [['Name'], ['Rafi & co <x>']] }]);
  const text = new TextDecoder().decode(bytes);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.ok(text.includes('xl/worksheets/sheet2.xml'));
  assert.ok(text.includes('<v>5000</v>'));
  assert.ok(text.includes('Rafi &amp; co &lt;x&gt;'));
  assert.ok(text.includes('name="Money in"'));
});
