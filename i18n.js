/* Fermi Frog: every word of the interface, in each language.
   The page asks for a sentence by its key: t('fr', 'play.caught', { n: 50 }) -> "Attrapée ! +50".
   To add a language: add its dictionary below (same keys as English), its code to LANGS in profile.js,
   its numbers to NUMBERS in core.js, and a questions-xx.js file.
   `node --test` checks that every language has every key.

   The questions have their own files: questions.js (English), questions-fr.js, questions-es.js. */
(function (root) {
  'use strict';

  const NAMES = { en: 'English', fr: 'Français', es: 'Español' };

  const WORDS = {
    en: {
      'home.tagline': 'Five flies a day. Guess the number, catch the fly, climb the tree.',
      'home.step1': 'Drag the scale',
      'home.step2': 'Pick a width',
      'home.step3': 'Catch the fly',
      'home.play': 'Play',
      'home.continue': 'Keep climbing',
      'home.result': 'See my climb',
      'home.leaderboard': 'Leaderboard',
      'home.practice': 'Practice',
      'home.round': 'Round {n}, {date}',  // no full stop: the page adds one unless the month already ends with a dot
      'home.streak': '{n} days in a row.',
      'home.profile': 'Your profile',

      'play.catch': 'Catch it',
      'play.next': 'Next fly',
      'play.end': 'See my climb',
      'play.caught': 'Caught! +{n}',
      'play.missed': 'It got away',
      'play.range': '{low} to {high}',
      'play.how': 'How?',
      'play.source': 'Source: {source}',
      'play.drag': 'Drag me',
      'play.scale': 'Your range. Drag the scale, or use the left and right arrow keys.',
      'play.widths': 'How wide is your range',
      'play.width': '{ratio} times wide, {points} points',
      'play.fly': 'Fly {n} of {total}',
      'play.zone': '{zone}!',

      'zone.pond': 'Pond', 'zone.reeds': 'Reeds', 'zone.trunk': 'Trunk', 'zone.canopy': 'Canopy', 'zone.clouds': 'Clouds', 'zone.moon': 'Moon',
      'where.pond': 'in the pond', 'where.reeds': 'in the reeds', 'where.trunk': 'on the trunk',
      'where.canopy': 'in the canopy', 'where.clouds': 'in the clouds', 'where.moon': 'on the moon',

      'end.verdict': 'You finished {where}',
      'end.of': 'of {max}',
      'end.miss': 'miss',
      'end.flies': 'Your five flies',
      'end.copy': 'Copy my result',
      'end.copied': 'Result copied',
      'end.select': 'Select the text and copy it',
      'end.result': 'Your result, ready to copy',
      'end.practice': 'Practice',
      'end.again': 'Practice again',
      'end.home': 'Home',
      'end.midnight': 'New flies at midnight.',
      'share.title': 'Fermi Frog no. {n}',
      'share.score': '{points} points, {where}',

      'board.title': 'Today’s tree',
      'board.loading': 'Looking up the tree…',
      'board.empty': 'No frogs on the tree yet. Be the first.',
      'board.rank': 'You are {rank} of {frogs} today.',
      'board.count': '{frogs} on the tree today.',
      'board.frog': '1 frog',
      'board.frogs': '{n} frogs',
      'board.you': '{name} (you)',
      'board.tag': 'You {n}',
      'board.name': 'Your name on the tree',
      'board.post': 'Put me on the tree',
      'board.needName': 'Type a name for the tree.',
      'board.posted': 'You are on the tree',
      'board.note': 'This sends your name, your frog and your five ranges. Everyone sees the name, the frog and the score.',
      'board.who': 'Who climbed highest today?',
      'board.tree': 'The tree. Scroll it to see the other frogs.',
      'board.unreachable': 'The leaderboard is not reachable right now. Your score is saved in this browser.',
      'board.full': 'Today’s tree is full.',
      'board.refused': 'The tree did not take this score.',

      'profile.title': 'Profile',
      'profile.name': 'Name',
      'profile.frog': 'Your frog',
      'profile.pick': 'Frog {n}',
      'profile.language': 'Language',
      'profile.colour': 'Colour',
      'profile.stats': 'Your climbs',
      'profile.played': 'Rounds',
      'profile.best': 'Best',
      'profile.streak': 'Days in a row',
      'profile.places': 'Places reached',
      'profile.account': 'Sign-in with Google comes later. For now, your profile stays in this browser.',
      'colour.pond': 'Pond', 'colour.reeds': 'Reeds', 'colour.lotus': 'Lotus', 'colour.dusk': 'Dusk', 'colour.moon': 'Moon',

      'unit.km': 'km', 'unit.m': 'm', 'unit.km/h': 'km/h', 'unit.litres': 'litres', 'unit.tonnes': 'tonnes', 'unit.years': 'years', 'unit.days': 'days',
    },

    fr: {
      'home.tagline': 'Cinq mouches par jour. Estime le nombre, attrape la mouche, grimpe à l’arbre.',
      'home.step1': 'Fais glisser l’échelle',
      'home.step2': 'Choisis une largeur',
      'home.step3': 'Attrape la mouche',
      'home.play': 'Jouer',
      'home.continue': 'Continuer à grimper',
      'home.result': 'Voir mon ascension',
      'home.leaderboard': 'Classement',
      'home.practice': 'Entraînement',
      'home.round': 'Manche {n}, {date}',
      'home.streak': '{n} jours d’affilée.',
      'home.profile': 'Ton profil',

      'play.catch': 'Attrape-la',
      'play.next': 'Mouche suivante',
      'play.end': 'Voir mon ascension',
      'play.caught': 'Attrapée ! +{n}',
      'play.missed': 'Elle s’est échappée',
      'play.range': 'de {low} à {high}',
      'play.how': 'Comment ?',
      'play.source': 'Source : {source}',
      'play.drag': 'Fais-moi glisser',
      'play.scale': 'Ta fourchette. Fais glisser l’échelle, ou utilise les flèches gauche et droite.',
      'play.widths': 'Largeur de ta fourchette',
      'play.width': '{ratio} fois de large, {points} points',
      'play.fly': 'Mouche {n} sur {total}',
      'play.zone': '{zone} !',

      'zone.pond': 'Mare', 'zone.reeds': 'Roseaux', 'zone.trunk': 'Tronc', 'zone.canopy': 'Canopée', 'zone.clouds': 'Nuages', 'zone.moon': 'Lune',
      'where.pond': 'dans la mare', 'where.reeds': 'dans les roseaux', 'where.trunk': 'sur le tronc',
      'where.canopy': 'dans la canopée', 'where.clouds': 'dans les nuages', 'where.moon': 'sur la lune',

      'end.verdict': 'Tu as fini {where}',
      'end.of': 'sur {max}',
      'end.miss': 'raté',
      'end.flies': 'Tes cinq mouches',
      'end.copy': 'Copier mon résultat',
      'end.copied': 'Résultat copié',
      'end.select': 'Sélectionne le texte et copie-le',
      'end.result': 'Ton résultat, prêt à copier',
      'end.practice': 'Entraînement',
      'end.again': 'Rejouer',
      'end.home': 'Accueil',
      'end.midnight': 'Nouvelles mouches à minuit.',
      'share.title': 'Fermi Frog n° {n}',
      'share.score': '{points} points, {where}',

      'board.title': 'L’arbre du jour',
      'board.loading': 'Je regarde dans l’arbre…',
      'board.empty': 'Aucune grenouille dans l’arbre. Sois la première.',
      'board.rank': 'Tu es {rank} sur {frogs} aujourd’hui.',
      'board.count': '{frogs} dans l’arbre aujourd’hui.',
      'board.frog': '1 grenouille',
      'board.frogs': '{n} grenouilles',
      'board.you': '{name} (toi)',
      'board.tag': 'Toi {n}',
      'board.name': 'Ton nom dans l’arbre',
      'board.post': 'Mets-moi dans l’arbre',
      'board.needName': 'Écris un nom pour l’arbre.',
      'board.posted': 'Tu es dans l’arbre',
      'board.note': 'Cela envoie ton nom, ta grenouille et tes cinq fourchettes. Tout le monde voit le nom, la grenouille et le score.',
      'board.who': 'Qui a grimpé le plus haut aujourd’hui ?',
      'board.tree': 'L’arbre. Fais-le défiler pour voir les autres grenouilles.',
      'board.unreachable': 'Le classement est injoignable pour le moment. Ton score est gardé dans ce navigateur.',
      'board.full': 'L’arbre du jour est plein.',
      'board.refused': 'L’arbre n’a pas accepté ce score.',

      'profile.title': 'Profil',
      'profile.name': 'Nom',
      'profile.frog': 'Ta grenouille',
      'profile.pick': 'Grenouille {n}',
      'profile.language': 'Langue',
      'profile.colour': 'Couleur',
      'profile.stats': 'Tes ascensions',
      'profile.played': 'Manches',
      'profile.best': 'Record',
      'profile.streak': 'Jours d’affilée',
      'profile.places': 'Lieux atteints',
      'profile.account': 'La connexion avec Google arrivera plus tard. Pour l’instant, ton profil reste dans ce navigateur.',
      'colour.pond': 'Mare', 'colour.reeds': 'Roseaux', 'colour.lotus': 'Lotus', 'colour.dusk': 'Crépuscule', 'colour.moon': 'Lune',

      'unit.km': 'km', 'unit.m': 'm', 'unit.km/h': 'km/h', 'unit.litres': 'litres', 'unit.tonnes': 'tonnes', 'unit.years': 'ans', 'unit.days': 'jours',
    },

    es: {
      'home.tagline': 'Cinco moscas al día. Estima el número, atrapa la mosca, trepa al árbol.',
      'home.step1': 'Arrastra la escala',
      'home.step2': 'Elige una anchura',
      'home.step3': 'Atrapa la mosca',
      'home.play': 'Jugar',
      'home.continue': 'Seguir trepando',
      'home.result': 'Ver mi subida',
      'home.leaderboard': 'Clasificación',
      'home.practice': 'Práctica',
      'home.round': 'Ronda {n}, {date}',
      'home.streak': '{n} días seguidos.',
      'home.profile': 'Tu perfil',

      'play.catch': 'Atrápala',
      'play.next': 'Siguiente mosca',
      'play.end': 'Ver mi subida',
      'play.caught': '¡Atrapada! +{n}',
      'play.missed': 'Se escapó',
      'play.range': 'de {low} a {high}',
      'play.how': '¿Cómo?',
      'play.source': 'Fuente: {source}',
      'play.drag': 'Arrástrame',
      'play.scale': 'Tu intervalo. Arrastra la escala o usa las flechas izquierda y derecha.',
      'play.widths': 'Anchura de tu intervalo',
      'play.width': '{ratio} veces de ancho, {points} puntos',
      'play.fly': 'Mosca {n} de {total}',
      'play.zone': '¡{zone}!',

      'zone.pond': 'Estanque', 'zone.reeds': 'Juncos', 'zone.trunk': 'Tronco', 'zone.canopy': 'Copa', 'zone.clouds': 'Nubes', 'zone.moon': 'Luna',
      'where.pond': 'en el estanque', 'where.reeds': 'entre los juncos', 'where.trunk': 'en el tronco',
      'where.canopy': 'en la copa', 'where.clouds': 'en las nubes', 'where.moon': 'en la luna',

      'end.verdict': 'Has terminado {where}',
      'end.of': 'de {max}',
      'end.miss': 'fallo',
      'end.flies': 'Tus cinco moscas',
      'end.copy': 'Copiar mi resultado',
      'end.copied': 'Resultado copiado',
      'end.select': 'Selecciona el texto y cópialo',
      'end.result': 'Tu resultado, listo para copiar',
      'end.practice': 'Práctica',
      'end.again': 'Practicar otra vez',
      'end.home': 'Inicio',
      'end.midnight': 'Moscas nuevas a medianoche.',
      'share.title': 'Fermi Frog n.º {n}',
      'share.score': '{points} puntos, {where}',

      'board.title': 'El árbol de hoy',
      'board.loading': 'Mirando el árbol…',
      'board.empty': 'Todavía no hay ranas en el árbol. Sé la primera.',
      'board.rank': 'Hoy ocupas el puesto {rank} entre {frogs}.',
      'board.count': '{frogs} en el árbol hoy.',
      'board.frog': '1 rana',
      'board.frogs': '{n} ranas',
      'board.you': '{name} (tú)',
      'board.tag': 'Tú {n}',
      'board.name': 'Tu nombre en el árbol',
      'board.post': 'Súbeme al árbol',
      'board.needName': 'Escribe un nombre para el árbol.',
      'board.posted': 'Ya estás en el árbol',
      'board.note': 'Esto envía tu nombre, tu rana y tus cinco intervalos. Todos ven el nombre, la rana y la puntuación.',
      'board.who': '¿Quién ha trepado más alto hoy?',
      'board.tree': 'El árbol. Desplázalo para ver a las otras ranas.',
      'board.unreachable': 'La clasificación no está disponible ahora mismo. Tu puntuación queda guardada en este navegador.',
      'board.full': 'El árbol de hoy está lleno.',
      'board.refused': 'El árbol no ha aceptado esta puntuación.',

      'profile.title': 'Perfil',
      'profile.name': 'Nombre',
      'profile.frog': 'Tu rana',
      'profile.pick': 'Rana {n}',
      'profile.language': 'Idioma',
      'profile.colour': 'Color',
      'profile.stats': 'Tus subidas',
      'profile.played': 'Rondas',
      'profile.best': 'Récord',
      'profile.streak': 'Días seguidos',
      'profile.places': 'Lugares alcanzados',
      'profile.account': 'El inicio de sesión con Google llegará más adelante. Por ahora, tu perfil se queda en este navegador.',
      'colour.pond': 'Estanque', 'colour.reeds': 'Juncos', 'colour.lotus': 'Loto', 'colour.dusk': 'Atardecer', 'colour.moon': 'Luna',

      'unit.km': 'km', 'unit.m': 'm', 'unit.km/h': 'km/h', 'unit.litres': 'litros', 'unit.tonnes': 'toneladas', 'unit.years': 'años', 'unit.days': 'días',
    },
  };

  const MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  };

  // The small rules of a language's typography, applied to any text: a sentence of the dictionary or a question.
  // French puts a thin space that never breaks before ? ! : ; and between the thousands of a number.
  const THIN = '\u202f';
  const TIDY = {
    fr: (text) => text.replace(/ ([?!:;])/g, THIN + '$1').replace(/(\d) (?=\d{3}(?!\d))/g, '$1' + THIN),
  };
  const tidy = (lang, text) => (TIDY[lang] ? TIDY[lang](text) : text);

  // The sentence for `key` in `lang`, with {names} filled in from `vars`. Falls back to English, then to the key.
  function t(lang, key, vars) {
    const dictionary = WORDS[lang] || WORDS.en;
    let text = Object.hasOwn(dictionary, key) ? dictionary[key] : Object.hasOwn(WORDS.en, key) ? WORDS.en[key] : key;
    for (const [name, value] of Object.entries(vars || {})) text = text.split('{' + name + '}').join(String(value));
    return tidy(lang, text);
  }

  // A rank as it is said: "1st" in English, "1re" in French. Spanish says "el puesto 1": the plain number.
  function ordinal(lang, n) {
    if (lang === 'fr') return n === 1 ? '1re' : n + 'e';
    if (lang === 'es') return String(n);
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return n + 'th';
    return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  }

  const month = (lang, index) => (MONTHS[lang] || MONTHS.en)[index];

  root.FermiI18n = { NAMES, WORDS, t, tidy, ordinal, month };
})(typeof globalThis !== 'undefined' ? globalThis : this);
