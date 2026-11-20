// The translations, checked. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import './core.js';
import './questions.js';
import './questions-fr.js';
import './questions-es.js';
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

test('Spanish is typeset the Spanish way', () => {
  for (const [key, text] of Object.entries(I.WORDS.es)) {
    assert.ok(!text.includes("'"), key + ' uses the curly apostrophe ’');
    assert.equal(text.includes('?'), text.includes('¿'), key + ': a question opens with ¿');
    assert.equal(text.includes('!'), text.includes('¡'), key + ': an exclamation opens with ¡');
  }
  assert.equal(I.t('es', 'play.caught', { n: 50 }), '¡Atrapada! +50');
  assert.equal(I.t('es', 'home.round', { n: 5, date: '20 nov' }), 'Ronda 5, 20 nov');
  assert.equal(I.month('es', 10), 'nov');
});

test('every question is written in every language', () => {
  const QUESTIONS = globalThis.FERMI_QUESTIONS;
  const TEXT = globalThis.FERMI_QUESTIONS_TEXT;
  const fields = ['short', 'q', 'text', 'how', 'source'];
  for (const lang of P.LANGS.filter((l) => l !== 'en')) {
    const words = TEXT[lang];
    assert.ok(words, lang + ' has its questions');
    assert.deepEqual(Object.keys(words).sort(), QUESTIONS.map((q) => q.id).sort(), lang + ': the same questions as English, no more, no less');
    for (const q of QUESTIONS) {
      for (const field of fields) {
        const text = words[q.id][field];
        assert.ok(typeof text === 'string' && text.trim().length > 0, lang + ' ' + q.id + ' ' + field);
        assert.ok(!text.includes("'"), lang + ' ' + q.id + ' ' + field + ' uses the curly apostrophe ’');
        if (/\d/.test(q[field])) assert.ok(/\d/.test(text), lang + ' ' + q.id + ' ' + field + ' keeps its numbers');
      }
      assert.ok(words[q.id].q.trim().endsWith('?'), lang + ' ' + q.id + ' is a question');
      if (lang === 'es') assert.ok(words[q.id].q.includes('¿'), 'es ' + q.id + ' opens its question with ¿');
    }
  }
});

test('French and Spanish numbers are written their own way in the questions', () => {
  const TEXT = globalThis.FERMI_QUESTIONS_TEXT;
  const nb = '\u202f';
  // French: thin spaces that cannot break, between thousands and before ? ! : ;
  assert.equal(I.tidy('fr', TEXT.fr['heart-day'].text), 'Environ 100' + nb + '000 battements');
  assert.equal(I.tidy('fr', '60 × 60 × 24 = 86 400. × 365 = 31 536 000 : voilà !'), '60 × 60 × 24 = 86' + nb + '400. × 365 = 31' + nb + '536' + nb + '000' + nb + ': voilà' + nb + '!');
  assert.equal(I.tidy('fr', 'de 1969 à 1972'), 'de 1969 à 1972', 'years are left alone');
  assert.equal(I.tidy('en', 'About 100,000 beats'), 'About 100,000 beats');
  // Spanish: a dot between thousands, and its own big-number words
  // (a comma cannot be checked blindly: "0,007 km²" is a correct Spanish decimal)
  assert.equal(TEXT.es['heart-day'].text, 'Unos 100.000 latidos');
  assert.equal(TEXT.es['world-pop'].text, 'Unos 8200 millones de personas', 'the English "billion" is "mil millones"');
  assert.equal(TEXT.es['cells'].text, 'Unos 37 billones de células', 'the English "trillion" is "billón"');
  for (const [id, words] of Object.entries(TEXT.es)) {
    for (const field of ['q', 'text', 'how']) assert.ok(!/billion|trillion|About /i.test(words[field]), 'es ' + id + ' ' + field + ' still has English in it');
  }
});

test('ranks read naturally', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map((n) => I.ordinal('en', n)), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  assert.deepEqual([1, 2, 21].map((n) => I.ordinal('fr', n)), ['1re', '2e', '21e']);
  assert.equal(I.month('fr', 10), 'nov.');
  assert.equal(I.month('en', 10), 'Nov');
  assert.equal(I.ordinal('es', 3), '3');
});
