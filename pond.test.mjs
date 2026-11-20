// The pond: how the frog's lily pad floats. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import './pond.js';

const P = globalThis.FermiPond;
const TALL = 2; // a pond twice as tall as it is wide, like a phone screen
const still = (x, y) => ({ x, y, vx: 0, vy: 0, turn: 0 });

// let the water run for `seconds`, in steps of `dt`
function run(pad, input, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) pad = P.step(pad, { tall: TALL, radius: 0.15, ...input }, dt);
  return pad;
}
const near = (a, b, by, why) => assert.ok(Math.abs(a - b) <= by, why + ': ' + a + ' is not within ' + by + ' of ' + b);

test('the lily pad floats to where you hold, and settles there', () => {
  const pad = run(still(0.5, 1), { target: { x: 0.8, y: 0.4 } }, 14);
  near(pad.x, 0.8, 0.01, 'x');
  near(pad.y, 0.4, 0.01, 'y');
  near(Math.hypot(pad.vx, pad.vy), 0, 0.01, 'it has stopped');
});

test('it floats: it does not jump there in one go', () => {
  const soon = run(still(0.5, 1), { target: { x: 0.8, y: 1 } }, 0.1);
  assert.ok(soon.x > 0.5 && soon.x < 0.51, 'after a tenth of a second it has only just left: ' + soon.x);
});

test('it is a resting frog: it sets off gently and never hurries', () => {
  // a long way to go, so it has all the room it wants to speed up
  let pad = still(0.2, 0.2), fastest = 0;
  const far = { target: { x: 0.8, y: 1.8 }, tall: TALL, radius: 0.15 };
  for (let i = 0; i < 60 * 8; i++) {
    pad = P.step(pad, far, 1 / 60);
    const speed = Math.hypot(pad.vx, pad.vy);
    fastest = Math.max(fastest, speed);
    if (i === 17) assert.ok(speed < 0.5 * P.PACE, 'after 0.3 seconds it is still under half its pace: ' + speed);
  }
  assert.ok(fastest <= P.PACE + 1e-6, 'never faster than its pace: ' + fastest);
  assert.ok(fastest >= 0.95 * P.PACE, 'but it does reach its pace: ' + fastest);
  assert.ok(P.PACE <= 0.2, 'and that pace is slow: the pond takes more than 5 seconds to cross');
});

test('it arrives softly: it does not shoot past and come back', () => {
  let pad = still(0.3, 1), furthest = 0;
  for (let i = 0; i < 60 * 12; i++) {
    pad = P.step(pad, { target: { x: 0.7, y: 1 }, tall: TALL, radius: 0.15 }, 1 / 60);
    furthest = Math.max(furthest, pad.x);
  }
  assert.ok(furthest <= 0.705, 'past the pointer by ' + (furthest - 0.7));
});

test('tilting the phone pushes the pad that way, until the bank stops it', () => {
  const right = run(still(0.5, 1), { tilt: { x: 1, y: 0 } }, 1);
  assert.ok(right.x > 0.51 && right.vx > 0, 'tilted right, it drifts right');
  assert.ok(right.vx <= P.PACE + 1e-6, 'at its own calm pace');
  near(right.y, 1, 1e-9, 'and not up or down');
  const held = run(still(0.5, 1), { tilt: { x: 1, y: 1 } }, 40);
  near(held.x, 1 - 0.15, 0.02, 'it rests against the right bank');
  near(held.y, TALL - 0.15, 0.02, 'and the bottom bank');
});

test('whatever happens, the pad stays inside the pond', () => {
  let pad = still(0.5, 1);
  const pushes = [{ x: 1, y: -1 }, { x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }];
  for (let i = 0; i < 40; i++) {
    pad = run(pad, i % 2 ? { tilt: pushes[i % 4] } : { target: { x: 5 * pushes[i % 4].x, y: 9 * pushes[i % 4].y } }, 4);
    assert.ok(pad.x >= 0.15 - 1e-9 && pad.x <= 0.85 + 1e-9, 'x ' + pad.x);
    assert.ok(pad.y >= 0.15 - 1e-9 && pad.y <= TALL - 0.15 + 1e-9, 'y ' + pad.y);
  }
});

test('left alone, a moving pad slows down and stops', () => {
  const pad = run({ x: 0.3, y: 1, vx: 0.15, vy: -0.05, turn: 0 }, {}, 6);
  near(Math.hypot(pad.vx, pad.vy), 0, 0.005, 'speed');
  assert.ok(pad.x > 0.35, 'it coasted on first, like something on water: ' + pad.x);
});

test('a slow phone and a fast one float the pad the same way', () => {
  const fast = run(still(0.5, 1), { target: { x: 0.8, y: 0.5 } }, 3, 1 / 120);
  const slow = run(still(0.5, 1), { target: { x: 0.8, y: 0.5 } }, 3, 1 / 30);
  near(fast.x, slow.x, 0.02, 'x');
  near(fast.y, slow.y, 0.02, 'y');
});

test('the frog turns to face where it is going, by the short way round', () => {
  const east = run(still(0.3, 1), { target: { x: 0.8, y: 1 } }, 2);
  near(east.turn, 0, 0.2, 'heading right is angle 0');
  const south = run(still(0.5, 0.5), { target: { x: 0.5, y: 1.5 } }, 3);
  near(south.turn, Math.PI / 2, 0.25, 'heading down is a quarter turn');
  // from just under a half turn to just over it: a small step, not a full spin back
  const pad = P.step({ x: 0.5, y: 1, vx: -0.5, vy: -0.05, turn: 3.0 }, { tall: TALL, radius: 0.15 }, 1 / 60);
  assert.ok(Math.abs(pad.turn - 3.0) < 0.1, 'turned by ' + (pad.turn - 3.0));
});

test('a tilt of the phone becomes a push: nothing when flat, full at 30 degrees', () => {
  assert.deepEqual(P.tiltFrom(50, 0, 50), { x: 0, y: 0 }, 'held as it was when tilt was turned on');
  assert.deepEqual(P.tiltFrom(51, 1.5, 50), { x: 0, y: 0 }, 'a shaky hand does nothing');
  assert.deepEqual(P.tiltFrom(50, 30, 50), { x: 1, y: 0 });
  assert.deepEqual(P.tiltFrom(50, -80, 50), { x: -1, y: 0 }, 'never more than a full push');
  assert.deepEqual(P.tiltFrom(20, 0, 50), { x: 0, y: -1 }, 'tipped away from you: up the screen');
  const half = P.tiltFrom(50, 16.5, 50);
  near(half.x, 0.5, 0.01, 'half way');
});

test('the pad goes somewhere only while the mouse button or a finger is held down', () => {
  const here = { x: 0.3, y: 0.4 }, there = { x: 0.7, y: 1.2 };
  let aim = { held: false, target: null };
  aim = P.aim(aim, 'move', here);
  assert.deepEqual(aim, { held: false, target: null }, 'just moving the mouse about does nothing');
  aim = P.aim(aim, 'down', here);
  assert.deepEqual(aim, { held: true, target: here }, 'pressing calls the frog');
  aim = P.aim(aim, 'move', there);
  assert.deepEqual(aim, { held: true, target: there }, 'and it follows while the press lasts');
  aim = P.aim(aim, 'up', there);
  assert.deepEqual(aim, { held: false, target: null }, 'letting go lets it drift');
  aim = P.aim(aim, 'move', here);
  assert.equal(aim.target, null);
});

test('a bump against the bank is noticed, a gentle touch is not', () => {
  const into = P.step({ x: 0.84, y: 1, vx: P.PACE, vy: 0, turn: 0 }, { tilt: { x: 1, y: 0 }, tall: TALL, radius: 0.15 }, 0.2);
  assert.ok(into.bump > 0.1, 'it hit the right bank at its pace: ' + into.bump);
  const clear = P.step(still(0.5, 1), { tilt: { x: 1, y: 0 }, tall: TALL, radius: 0.15 }, 0.2);
  assert.equal(clear.bump, 0, 'in open water there is nothing to bump');
  const resting = run(still(0.5, 1), { tilt: { x: 1, y: 0 } }, 40);
  assert.ok(resting.bump < 0.02, 'resting against the bank is not a bump: ' + resting.bump);
});

test('a small leaf is pushed aside by the pad, then drifts home', () => {
  const home = { x: 0.5, y: 1 };
  let leaf = { ...home, home, radius: 0.06 };
  const pad = { x: 0.45, y: 1, radius: 0.15 };
  for (let i = 0; i < 30; i++) leaf = P.nudge(leaf, pad, 1 / 60);
  assert.ok(Math.hypot(leaf.x - pad.x, leaf.y - pad.y) >= 0.2, 'it is no longer under the pad');
  assert.ok(leaf.x > home.x, 'pushed away from the pad, to the right');
  for (let i = 0; i < 600; i++) leaf = P.nudge(leaf, { x: 0.5, y: 0.2, radius: 0.15 }, 1 / 60);
  near(leaf.x, home.x, 0.01, 'back home, x');
  near(leaf.y, home.y, 0.01, 'back home, y');
});
