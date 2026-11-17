import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INVOICE_PARTS, readInvoiceOptions, storeInvoiceOptions } from '../../src/lib/domain/invoice-options';

test('everything but due date and status is shown until an admin changes it', () => {
  const options = readInvoiceOptions({});
  assert.ok(INVOICE_PARTS.filter((part) => !['due_date', 'status', 'company_name'].includes(part.key)).every((part) => options.show[part.key]));
  assert.equal(options.show.due_date, false);
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

test('the invoice texts are kept', () => {
  const options = readInvoiceOptions({ signature_name: 'Nabil Azmal Sajid', thank_you: 'THANK YOU FOR BUSINESS!' });
  assert.equal(options.text.signature_name, 'Nabil Azmal Sajid');
  assert.equal(readInvoiceOptions(storeInvoiceOptions(options)).text.thank_you, 'THANK YOU FOR BUSINESS!');
});

test('the logo size is kept within limits', () => {
  assert.equal(readInvoiceOptions({}).logoSize, 52);
  assert.equal(readInvoiceOptions({ logo_size: '90' }).logoSize, 90);
  assert.equal(readInvoiceOptions({ logo_size: '900' }).logoSize, 140);
  assert.equal(readInvoiceOptions(storeInvoiceOptions(readInvoiceOptions({ logo_size: '70' }))).logoSize, 70);
});
