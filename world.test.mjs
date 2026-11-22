// The world's pictures: every scene has a wide picture for a computer's screen. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import './world.js';

const World = globalThis.FermiWorld;

test('every scene has a wide picture, and the file is there', () => {
  assert.deepEqual(Object.keys(World.WIDE).sort(), ['canopy', 'clouds', 'moon', 'pond', 'reeds', 'trunk']);
  for (const name of Object.keys(World.WIDE)) {
    assert.ok(existsSync('img/world/' + name + '-wide.webp'), name + '-wide.webp is missing');
  }
});
