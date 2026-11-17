import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessage, decryptSecret, encryptSecret } from '../../src/lib/server/smtp';

test('saved mail passwords are encrypted and come back the same', () => {
  process.env.MAIL_SECRET = 'test-secret';
  const stored = encryptSecret('abcd efgh ijkl mnop');
  assert.ok(!stored.includes('abcd'));
  assert.equal(decryptSecret(stored), 'abcd efgh ijkl mnop');
  assert.notEqual(encryptSecret('same'), encryptSecret('same'));
});

test('a message has sender, subject and both parts', () => {
  const message = buildMessage({ name: '365 Frames Alerts', address: 'alerts@gmail.com' }, 'rafi@gmail.com', 'Deadline missed: Video 3', 'text', '<p>html</p>');
  assert.ok(message.startsWith('From: 365 Frames Alerts <alerts@gmail.com>\r\n'));
  assert.ok(message.includes('Subject: Deadline missed: Video 3'));
  assert.ok(message.includes('text/plain') && message.includes('text/html'));
  assert.ok(buildMessage({ address: 'a@b.co' }, 'c@d.co', 'সময় শেষ', 't', 'h').includes('Subject: =?UTF-8?B?'));
});
