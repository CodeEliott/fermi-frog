// The translations, checked. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import './core.js';
import './questions.js';
import './profile.js';
import './i18n.js';

const I = globalThis.FermiI18n;
const P = globalThis.FermiProfile;
const C = globalThis.FermiCore;
const placeholders = (text) => (text.match(/\{[a-z]+\}/g) || []).sort().join(' ');

test('every language the profile offers has a dictionary and a name', () => {
  for (const lang of P.LANGS) {
    assert.ok(I.WORDS[lang], lang + ' has a dictionary');
    assert.ok(I.NAMES[lang], lang + ' has a name');
  }
});

test('every language has every sentence, with the same blanks to fill', () => {
  const english = I.WORDS.en;
  for (const lang of P.LANGS) {
    const words = I.WORDS[lang];
    assert.deepEqual(Object.keys(words).sort(), Object.keys(english).sort(), lang + ' has the same keys as English');
    for (const [key, text] of Object.entries(words)) {
      assert.ok(typeof text === 'string' && text.trim().length > 0, lang + ' ' + key + ' is not empty');
      assert.equal(placeholders(text), placeholders(english[key]), lang + ' ' + key + ' has the same blanks');
    }
  }
});

test('every zone, colour and unit of the game has a name', () => {
  for (const zone of C.ZONES) {
    assert.ok(I.WORDS.en['zone.' + zone.id], 'zone ' + zone.id);
    assert.ok(I.WORDS.en['where.' + zone.id], 'where ' + zone.id);
  }
  for (const colour of P.COLOURS) assert.ok(I.WORDS.en['colour.' + colour], 'colour ' + colour);
  for (const q of globalThis.FERMI_QUESTIONS || []) if (q.unit) assert.ok(I.WORDS.en['unit.' + q.unit], 'unit ' + q.unit);
});

test('t fills in the blanks and falls back to English', () => {
  assert.equal(I.t('en', 'play.caught', { n: 50 }), 'Caught! +50');
  assert.equal(I.t('fr', 'home.round', { n: 4, date: '19 nov.' }), 'Manche 4, 19 nov.');
  assert.equal(I.t('en', 'home.round', { n: 4, date: '19 Nov' }), 'Round 4, 19 Nov');
  assert.equal(I.t('xx', 'home.play'), 'Play', 'an unknown language speaks English');
  assert.equal(I.t('en', 'no.such.key'), 'no.such.key');
});

test('French is typeset the French way', () => {
  for (const [key, text] of Object.entries(I.WORDS.fr)) {
    assert.ok(!text.includes("'"), key + ' uses the curly apostrophe ’');
  }
  assert.equal(I.t('fr', 'play.caught', { n: 50 }), 'Attrapée ! +50', 'a thin space that cannot break before !');
  assert.equal(I.t('fr', 'play.how'), 'Comment ?');
});

test('ranks read naturally', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map((n) => I.ordinal('en', n)), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  assert.deepEqual([1, 2, 21].map((n) => I.ordinal('fr', n)), ['1re', '2e', '21e']);
  assert.equal(I.month('fr', 10), 'nov.');
  assert.equal(I.month('en', 10), 'Nov');
});
