/* Fermi Frog: the frog's animations, one per pose that has one.
   Written by design/anim/make.py. Do not edit by hand: run the script again.
   A pose that is not listed here stays a still picture. What each field means is in sprites.js. */
(function (root) {
  'use strict';
  root.FERMI_SHEETS = {
    "think": {"src": "img/anim/think.webp", "frames": 11, "cols": 4, "rows": 3, "fps": 3, "loop": true, "box": [-0.0589, -0.0279, 1.1329, 1.1096]},
    "catch": {"src": "img/anim/catch.webp", "frames": 10, "cols": 4, "rows": 3, "fps": 14, "loop": false, "box": [-0.0369, -0.018, 1.0799, 1.069]},
    "jump": {"src": "img/anim/jump.webp", "frames": 10, "cols": 4, "rows": 3, "fps": 11, "loop": false, "box": [-0.0129, 0.096, 1.0593, 0.9738], "still": "think"},
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
