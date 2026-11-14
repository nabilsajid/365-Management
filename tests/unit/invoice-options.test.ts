import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INVOICE_PARTS, readInvoiceOptions, storeInvoiceOptions } from '../../src/lib/domain/invoice-options';

test('everything is shown until an admin switches it off', () => {
  const options = readInvoiceOptions({});
  assert.ok(INVOICE_PARTS.every((part) => options.show[part.key]));
  assert.equal(options.footer, '');
  assert.deepEqual(readInvoiceOptions(null), options);
});

test('switched-off parts and the footer are kept', () => {
  const options = readInvoiceOptions({ client_phone: false, logo: false, footer: 'Pay to bKash 01700000000' });
  assert.equal(options.show.client_phone, false);
  assert.equal(options.show.logo, false);
  assert.equal(options.show.client_name, true);
  assert.equal(options.footer, 'Pay to bKash 01700000000');
  assert.deepEqual(readInvoiceOptions(storeInvoiceOptions(options)), options);
});
