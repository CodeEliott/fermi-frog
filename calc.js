/* Fermi Frog: the calculator.
   A pocket calculator for chains like 70 × 60 × 24: it works from left to right, one operation at a time.
   Pure functions only, like core.js, so `node --test` can check them. The page draws the keys (app.js).

   A calculator is { acc, op, entry, error }:
     acc    the result so far (null before any)
     op     the operation waiting for its second number: '+', '-', '*', '/' (null when none)
     entry  the number being typed, as text ("12.5"); '' when none
     error  true after a division by zero
   Keys: '0' to '9', '000', '.', '+', '-', '*', '/', '=', 'back', 'clear'. */
(function (root) {
  'use strict';

  const C = root.FermiCore;
  const DIGITS = 16;   // the scale ends at 1 quadrillion, which has 16 digits
  const SIGNS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  const start = () => ({ acc: null, op: null, entry: '', error: false });

  function apply(a, op, b) {
    const r = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b;
    return Number.isFinite(r) ? Number(r.toPrecision(12)) : NaN; // 0.1 + 0.2 is 0.3 here
  }

  // Use the number being typed: it becomes the result, or the second number of the waiting operation.
  function settle(state) {
    if (state.entry === '') return state;
    const typed = Number(state.entry);
    const acc = state.op ? apply(state.acc, state.op, typed) : typed;
    return Number.isNaN(acc) ? { ...start(), error: true } : { acc, op: null, entry: '', error: false };
  }

  function type(state, text) {
    // a digit after "=" or after an error starts a new sum
    const s = state.error || (!state.op && state.entry === '') ? start() : state;
    let entry = s.entry;
    for (const ch of text) {
      if (ch === '.') { if (!entry.includes('.')) entry = (entry || '0') + '.'; continue; }
      if (entry.replace('.', '').length >= DIGITS) break;
      entry = entry === '0' ? ch : entry + ch;
    }
    return { ...s, entry };
  }

  function press(state, key) {
    if (key === 'clear') return start();
    if (/^\d$/.test(key) || key === '.') return type(state, key);
    if (key === '000') return state.error || state.entry === '' || state.entry === '0' ? state : type(state, key);
    if (state.error) return state;
    if (key === 'back') return { ...state, entry: state.entry.slice(0, -1) };
    if (key === '=') return { ...settle(state), op: null };
    if (key in SIGNS) {
      const s = settle(state);
      return s.error ? s : { ...s, acc: s.acc === null ? 0 : s.acc, op: key };
    }
    return state;
  }

  // The number the calculator shows.
  function value(state) {
    if (state.error) return NaN;
    return state.entry !== '' ? Number(state.entry) : state.acc === null ? 0 : state.acc;
  }

  // Can the scale show this number? It runs from 1 to 1 quadrillion.
  const fitsScale = (n) => Number.isFinite(n) && n >= 1 && n <= 1e15;

  function write(n, lang) {
    if (Math.abs(n) >= 1e15) return C.formatAmount(n, 3, lang);
    return n.toLocaleString(C.localeOf(lang), { maximumSignificantDigits: 12 }).replace('-', '−');
  }

  // The screen, in the player's language. A number being typed keeps what was typed: "1." and "1.50".
  function screen(state, lang) {
    if (state.error) return '—';
    if (state.entry === '') return write(value(state), lang);
    const [whole, decimals] = state.entry.split('.');
    const locale = C.localeOf(lang);
    const point = (1.5).toLocaleString(locale).charAt(1);
    return Number(whole).toLocaleString(locale) + (decimals === undefined ? '' : point + decimals);
  }

  // The small line over the screen: the result so far and the operation that waits, "4,200 ×".
  function pending(state, lang) {
    return state.op ? write(state.acc, lang) + ' ' + SIGNS[state.op] : '';
  }

  root.FermiCalc = { start, press, value, fitsScale, screen, pending, SIGNS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
