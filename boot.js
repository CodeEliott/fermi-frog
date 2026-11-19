/* Fermi Frog: runs before the page is drawn.
   It puts the player's colour and language on the page at once, so the app never flashes the default look first. */
(function () {
  try {
    var profile = (JSON.parse(localStorage.getItem('fermi-frog:v1') || '{}') || {}).profile || {};
    if (/^[a-z]{2,12}$/.test(profile.colour)) document.documentElement.dataset.colour = profile.colour;
    if (/^[a-z]{2}$/.test(profile.lang)) document.documentElement.lang = profile.lang;
  } catch (e) { /* no saved profile, or storage is blocked: the default look is fine */ }
})();
