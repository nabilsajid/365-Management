import assert from 'node:assert/strict';
import test from 'node:test';
import { isUrgent, whatsappNumber } from '../../src/lib/server/urgent-alerts';

test('only urgent alerts go out by email', () => {
  assert.equal(isUrgent('Deadline missed: Video 3'), true);
  assert.equal(isUrgent('Shoot not confirmed: Acme'), true);
  assert.equal(isUrgent('New task assigned: Video 3'), false);
});

test('Bangladeshi numbers become WhatsApp numbers', () => {
  assert.equal(whatsappNumber('01712-345678'), '8801712345678');
  assert.equal(whatsappNumber('+8801712345678'), '8801712345678');
  assert.equal(whatsappNumber('12345'), null);
});
