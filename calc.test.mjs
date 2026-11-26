// The calculator, written as checks. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import './core.js';
import './calc.js';

const K = globalThis.FermiCalc;
// Press keys one after the other: run('70 * 60 * 24 =') -> the calculator after the last key.
const run = (keys) => keys.split(' ').reduce((state, key) => K.press(state, key), K.start());
const result = (keys) => K.value(run(keys));

test('it multiplies a chain, the way a Fermi estimate goes', () => {
  assert.equal(result('7 0 * 6 0 * 2 4 ='), 100800);
  assert.equal(result('7 0 * 6 0 * 2 4'), 24, 'before =, it shows the number being typed');
  assert.equal(result('7 0 * 6 0 *'), 4200, 'after an operation, it shows the result so far');
});

test('it works from left to right, like a pocket calculator', () => {
  assert.equal(result('2 + 3 * 4 ='), 20);
  assert.equal(result('1 0 - 4 / 2 ='), 3);
});

test('the 000 key writes thousands fast', () => {
  assert.equal(result('5 000'), 5000);
  assert.equal(result('8 000 000 000 ='), 8e9);
  assert.equal(result('000'), 0, 'nothing to multiply by a thousand yet');
  assert.equal(result('0 000 7'), 7);
});

test('decimals: one point only', () => {
  assert.equal(result('1 . 5 * 2 ='), 3);
  assert.equal(result('. 5'), 0.5);
  assert.equal(result('1 . 2 . 5'), 1.25);
  assert.equal(result('0 . 1 + 0 . 2 ='), 0.3, 'no 0.30000000000000004');
});

test('an operation pressed twice: the last one counts', () => {
  assert.equal(result('5 * / 2 ='), 2.5);
});

test('after =, a digit starts again and an operation carries on', () => {
  assert.equal(result('2 * 3 = 7'), 7);
  assert.equal(result('2 * 3 = 7 + 1 ='), 8);
  assert.equal(result('2 * 3 = * 1 0 ='), 60);
});

test('the back key removes one digit, C removes everything', () => {
  assert.equal(result('1 2 3 back'), 12);
  assert.equal(result('1 2 * 3 4 back ='), 36);
  assert.equal(result('9 back back'), 0);
  assert.deepEqual(run('1 2 * 3 clear'), K.start());
});

test('dividing by zero is an error, and the next digit starts again', () => {
  const broken = run('5 / 0 =');
  assert.equal(broken.error, true);
  assert.ok(Number.isNaN(K.value(broken)));
  assert.equal(K.value(K.press(broken, '4')), 4);
  assert.equal(K.press(broken, '*').error, true, 'an operation cannot rescue it');
});

test('a number stops at 16 digits', () => {
  assert.equal(result('1 000 000 000 000 000 000 000'), 1e15, 'the end of the scale');
  assert.equal(result('1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7'), 1234567890123456);
});

test('an unknown key changes nothing', () => {
  const state = run('4 2');
  assert.deepEqual(K.press(state, 'x'), state);
});

test('only a number the scale can show may be put on it', () => {
  assert.equal(K.fitsScale(result('7 0 * 6 0 =')), true);
  assert.equal(K.fitsScale(1), true);
  assert.equal(K.fitsScale(0), false);
  assert.equal(K.fitsScale(result('5 - 9 =')), false);
  assert.equal(K.fitsScale(0.5), false, 'the scale starts at 1');
  assert.equal(K.fitsScale(2e15), false);
  assert.equal(K.fitsScale(NaN), false);
});

test('the screen is written the way each language writes numbers', () => {
  assert.equal(K.screen(run('1 0 0 8 0 0'), 'en'), '100,800');
  assert.equal(K.screen(run('1 . 5 0'), 'en'), '1.50', 'the zeros being typed stay');
  assert.equal(K.screen(run('1 .'), 'fr'), '1,');
  assert.equal(K.screen(run('1 2 3 4 5 . 5'), 'es'), '12.345,5');
  assert.equal(K.screen(K.start(), 'en'), '0');
  assert.equal(K.screen(run('5 - 9 ='), 'en'), '−4');
  assert.equal(K.screen(run('5 / 0 ='), 'en'), '—');
  assert.match(K.screen(run('9 000 000 000 000 000 * 9 000 000 ='), 'en'), /× 10\^/);
  assert.equal(K.pending(run('7 0 * 6 0 *'), 'en'), '4,200 ×');
  assert.equal(K.pending(run('7 0 * 6 0 * 2'), 'en'), '4,200 ×');
  assert.equal(K.pending(run('7 0'), 'en'), '');
});
