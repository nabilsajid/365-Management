import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';
import { isPushEndpoint, vapidKey, vapidToken } from '../../src/lib/server/push';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  const secret = (privateKey.export({ format: 'jwk' }) as { d: string }).d;
  return { publicText: point.toString('base64url'), secret, publicKey };
}

test('the push token is signed with the private key and names the push service', () => {
  const pair = keyPair();
  const key = vapidKey(pair.publicText, pair.secret);
  assert.ok(key, 'a valid pair gives a key');
  const token = vapidToken(key, 'https://fcm.googleapis.com', 'mailto:a@b.c', Date.UTC(2026, 10, 14));
  const [head, body, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url').toString()), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.exp, Date.UTC(2026, 10, 14) / 1000 + 12 * 60 * 60);
  assert.ok(
    verify('sha256', Buffer.from(`${head}.${body}`), { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')),
    'the signature checks out against the public key',
  );
});

test('values that are not a key pair give no key', () => {
  assert.equal(vapidKey('not-a-key', 'nor-this'), null);
  assert.equal(vapidKey('', ''), null);
});

test('only real push services are called', () => {
  assert.ok(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'));
  assert.ok(isPushEndpoint('https://web.push.apple.com/abc'));
  assert.ok(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc'));
  assert.ok(!isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'), 'not https');
  assert.ok(!isPushEndpoint('https://evil.example.com/fcm.googleapis.com'));
  assert.ok(!isPushEndpoint('https://localhost:5432/'));
  assert.ok(!isPushEndpoint('nonsense'));
});
