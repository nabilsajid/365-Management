import assert from 'node:assert/strict';
import { test } from 'node:test';
import { open, seal } from '../../src/lib/server/secret-box';

test('a stored password reads back only with the same server key', () => {
  const sealed = seal('Kp7mWx2Qe9', 'server-key');
  assert.ok(!sealed.includes('Kp7mWx2Qe9'));
  assert.equal(open(sealed, 'server-key'), 'Kp7mWx2Qe9');
  assert.equal(open(sealed, 'another-key'), null);
});

test('the same password is stored differently each time', () => {
  assert.notEqual(seal('same', 'k'), seal('same', 'k'));
});

test('a damaged or unknown value reads as nothing', () => {
  const sealed = seal('secret', 'k');
  assert.equal(open(sealed.slice(0, -2) + 'AA', 'k'), null);
  assert.equal(open('plain text', 'k'), null);
  assert.equal(open('', 'k'), null);
});
