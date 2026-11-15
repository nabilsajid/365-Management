import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formScope } from '../../src/lib/domain/form-scope';

test('each kind of record gets its own field names, so browser suggestions never mix', () => {
  assert.equal(formScope('/api/equipment'), 'equipment');
  assert.equal(formScope('/api/clients'), 'clients');
  assert.notEqual(formScope('/api/equipment'), formScope('/api/clients'));
  assert.equal(formScope('/api/equipment-needs'), 'equipment-needs');
  assert.equal(formScope('/api/projects/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/months'), 'projects-months');
});
