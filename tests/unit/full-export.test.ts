import assert from 'node:assert/strict';
import test from 'node:test';
import { exportSheets, rowCount } from '../../src/lib/server/full-export';

test('a full export has one sheet per table, numbers stay numbers', () => {
  const sheets = exportSheets({ invoices: [{ id: 'x', amount: '1500.00', paid: true, lines: [{ a: 1 }] }], clients: [] });
  const invoices = sheets.find((sheet) => sheet.name === 'Invoices');
  assert.deepEqual(invoices?.rows, [['id', 'amount', 'paid', 'lines'], ['x', 1500, 'yes', '[{"a":1}]']]);
  assert.deepEqual(sheets.find((sheet) => sheet.name === 'Clients')?.rows, [['(empty)']]);
  assert.equal(rowCount({ a: [{}, {}], b: [{}] }), 3);
});
