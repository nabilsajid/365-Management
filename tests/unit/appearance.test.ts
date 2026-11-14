import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCENT_PRESETS, accentShades, appearanceCss, contrast, readAppearance } from '../../src/lib/domain/appearance';
import { appearanceUpdate } from '../../src/lib/validation';

test('every accent gives buttons whose text is easy to read, in both themes', () => {
  for (const accent of [...ACCENT_PRESETS.map((preset) => preset.value), '#ffdd00', '#00ffff', '#111111', '#ff7f50']) {
    const { light, dark } = accentShades(accent);
    assert.ok(contrast(light.primary, light.on) >= 4.5, `light ${accent}: ${contrast(light.primary, light.on)}`);
    assert.ok(contrast(dark.primary, dark.on) >= 4.5, `dark ${accent}: ${contrast(dark.primary, dark.on)}`);
  }
});

test('stored values are read safely', () => {
  assert.deepEqual(readAppearance(null), { accent: '#b0643f', corners: 'soft', glow: true });
  assert.deepEqual(readAppearance({ accent: '#3B6EA8', corners: 'round', glow: false }), { accent: '#3b6ea8', corners: 'round', glow: false });
  assert.deepEqual(readAppearance({ accent: 'red;}body{display:none', corners: 'weird', glow: 'yes' }), { accent: '#b0643f', corners: 'soft', glow: true });
});

test('the styles carry only the checked values', () => {
  const css = appearanceCss({ accent: '#3b6ea8', corners: 'sharp', glow: false });
  assert.match(css, /--radius-card:6px/);
  assert.match(css, /\.app-glow\{display:none\}/);
  assert.ok(!appearanceCss({ accent: '</style><script>' } as never).includes('<'));
});

test('an admin can only save a real colour and a known corner style', () => {
  assert.ok(appearanceUpdate.safeParse({ accent: '#3b6ea8', corners: 'round', glow: true }).success);
  assert.ok(!appearanceUpdate.safeParse({ accent: 'blue' }).success);
  assert.ok(!appearanceUpdate.safeParse({ corners: 'circle' }).success);
});
