import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointsTone, targetPercent } from '../../src/lib/domain/tone';

test('points are red below the mark, yellow when close and green at the target', () => {
  assert.equal(pointsTone(0, 1500), 'red');
  assert.equal(pointsTone(1349, 1500), 'red');
  assert.equal(pointsTone(1350, 1500), 'yellow');
  assert.equal(pointsTone(1400, 1500), 'yellow');
  assert.equal(pointsTone(1499, 1500), 'yellow');
  assert.equal(pointsTone(1500, 1500), 'green');
  assert.equal(pointsTone(2600, 1500), 'green');
  assert.equal(pointsTone(-200, 1500), 'red');
});

test('the tone follows a changed target', () => {
  assert.equal(pointsTone(950, 1000), 'yellow');
  assert.equal(pointsTone(1000, 1000), 'green');
  assert.equal(pointsTone(0, 0), 'green');
});

test('progress toward the target stays between 0 and 100', () => {
  assert.equal(targetPercent(750, 1500), 50);
  assert.equal(targetPercent(1400, 1500), 93);
  assert.equal(targetPercent(3000, 1500), 100);
  assert.equal(targetPercent(-50, 1500), 0);
});
