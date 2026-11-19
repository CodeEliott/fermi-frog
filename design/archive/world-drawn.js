/* Fermi Frog: the world, drawn in code.
   One tall pixel picture: the pond at the bottom, then reeds, the trunk, the canopy, the clouds, the moon.
   Height in the picture is the score: 0 points is the pond surface, 500 points is the moon.
   It is painted small, then shown 3 times larger, so every dot becomes a chunky pixel.
   Gemini backgrounds can replace this later: keep `paint` returning the same `yOf`. */
(function (root) {
  'use strict';

  const SCALE = 3;    // one painted dot = 3 screen pixels
  const STEP = 1.6;   // painted dots for one point of height
  const BOTTOM = 64;  // dots of water under the pond surface
  const TOP = 112;    // dots of sky above 500 points
  const TOP_SCORE = 500;

  function random(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Small drawing tools. Everything lands on whole dots, which gives the pixel look.
  function tools(g) {
    const rect = (x, y, w, h, colour) => {
      g.fillStyle = colour;
      g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    };
    const oval = (cx, cy, rx, ry, colour) => {
      cx = Math.round(cx); cy = Math.round(cy); rx = Math.max(1, Math.round(rx)); ry = Math.max(1, Math.round(ry));
      for (let dy = -ry; dy <= ry; dy++) {
        const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
        rect(cx - half, cy + dy, half * 2 + 1, 1, colour);
      }
    };
    const disc = (cx, cy, r, colour) => oval(cx, cy, r, r, colour);
    // a clump of leaves: dark underneath, lighter on top
    const leaves = (cx, cy, r) => {
      disc(cx, cy, r, '#2B7A41');
      disc(cx - 1, cy - 2, r - 2, '#3C9A50');
      if (r > 5) disc(cx - 2, cy - 3, r - 5, '#5CB96B');
    };
    const cloud = (cx, cy, r) => {
      disc(cx, cy, r, '#FFFFFF');
      disc(cx - r, cy + r * 0.35, r * 0.7, '#FFFFFF');
      disc(cx + r, cy + r * 0.4, r * 0.75, '#FFFFFF');
      rect(cx - r * 1.5, cy + r * 0.75, r * 3.1, r * 0.4, '#D7E7F6');
    };
    return { rect, oval, disc, leaves, cloud };
  }

  // The sky changes colour with height. Each entry: from this score up, this colour.
  const SKY = [[-60, '#D8EFDD'], [70, '#C6E7EE'], [190, '#ABD7F0'], [300, '#86BDEA'],
    [390, '#5C90D2'], [445, '#35589F'], [490, '#1D2D60'], [545, '#131C42']];

  // Paint the whole world into `canvas`, as wide as `width` screen pixels.
  // Returns { height, yOf } where yOf(score) is the screen pixel row of that score.
  function paint(canvas, width) {
    const W = Math.max(70, Math.ceil(width / SCALE));
    const H = Math.round(BOTTOM + TOP_SCORE * STEP + TOP);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W * SCALE + 'px';
    canvas.style.height = H * SCALE + 'px';
    const g = canvas.getContext('2d');
    const { rect, oval, disc, leaves, cloud } = tools(g);
    const rand = random(11);
    const Y = (score) => Math.round(H - BOTTOM - score * STEP);
    const ground = Y(0);

    // sky, with a dotted blend where two colours meet
    for (let y = 0; y < H; y++) {
      const score = (H - BOTTOM - y) / STEP;
      let i = 0;
      while (i < SKY.length - 1 && score >= SKY[i + 1][0]) i++;
      rect(0, y, W, 1, SKY[i][1]);
      if (i < SKY.length - 1) {
        const dotsToNext = (SKY[i + 1][0] - score) * STEP;
        if (dotsToNext < 5) for (let x = y % 2; x < W; x += 2) rect(x, y, 1, 1, SKY[i + 1][1]);
        else if (dotsToNext < 10 && y % 2 === 0) for (let x = (y % 4) + 1; x < W; x += 4) rect(x, y, 1, 1, SKY[i + 1][1]);
      }
    }

    // stars and the moon
    for (let n = 0; n < W * 1.1; n++) {
      const score = 448 + rand() * 120;
      rect(rand() * W, Y(score), 1, 1, rand() < 0.25 ? '#FFE9A3' : '#FFFFFF');
    }
    const moonX = Math.round(W * 0.7), moonY = Y(TOP_SCORE) - 36;
    disc(moonX, moonY, 21, '#E3D48C');
    disc(moonX - 1, moonY - 1, 20, '#F5EAAE');
    disc(moonX - 7, moonY - 5, 4, '#DCCD86');
    disc(moonX + 8, moonY + 7, 5, '#DCCD86');
    disc(moonX + 4, moonY - 10, 2, '#DCCD86');
    disc(moonX - 4, moonY + 9, 2, '#DCCD86');

    // clouds
    [[0.66, 392, 9], [0.22, 412, 8], [0.84, 430, 10], [0.42, 452, 7], [0.74, 472, 6], [0.12, 468, 5]]
      .forEach(([x, score, r]) => cloud(Math.round(W * x), Y(score), r));

    // far hills behind the pond
    for (let x = 0; x < W; x++) {
      const far = 9 + 6 * Math.sin(x / 17) + 4 * Math.sin(x / 7 + 1);
      rect(x, ground - far, 1, far, '#B3DBC4');
      const near = 4 + 4 * Math.sin(x / 11 + 2) + 2 * Math.sin(x / 5);
      rect(x, ground - near, 1, Math.max(1, near), '#93C9AA');
    }

    // the trunk
    const trunkX = Math.round(W * 0.08), trunkW = Math.max(14, Math.round(W * 0.19));
    const trunkTop = Y(338);
    rect(trunkX, trunkTop, trunkW, H - trunkTop, '#7B4F2F');
    rect(trunkX, trunkTop, 2, H - trunkTop, '#94653D');
    rect(trunkX + trunkW - 3, trunkTop, 3, H - trunkTop, '#5E3B22');
    for (let n = 0; n < (ground - trunkTop) / 4; n++) {
      rect(trunkX + 3 + rand() * (trunkW - 8), trunkTop + rand() * (ground - trunkTop - 10), 1, 4 + rand() * 8, '#5E3B22');
    }
    disc(trunkX + trunkW * 0.55, Y(122), 3, '#5E3B22');
    disc(trunkX + trunkW * 0.55, Y(122), 1, '#3F2716');
    rect(trunkX - 3, ground - 4, trunkW + 8, 4, '#7B4F2F');
    rect(trunkX - 6, ground - 1, trunkW + 14, 2, '#5E3B22');

    // branches, each with a clump of leaves at its end
    [[152, 0.46], [206, 0.66], [254, 0.4], [300, 0.74], [342, 0.52]].forEach(([score, reach]) => {
      const x = trunkX + trunkW, length = Math.round((W - x) * reach), y = Y(score);
      rect(x, y, length, 4, '#7B4F2F');
      rect(x, y + 3, length, 1, '#5E3B22');
      rect(x + length - 2, y - 5, 2, 5, '#7B4F2F');
      leaves(x + length, y - 7, 8);
      leaves(x + Math.round(length * 0.55), y - 4, 5);
    });

    // the canopy: many clumps of leaves, thicker above the trunk
    for (let n = 0; n < W / 2.6; n++) {
      const nearTrunk = rand() < 0.45;
      const x = nearTrunk ? rand() * W * 0.55 : rand() * W;
      const score = nearTrunk ? 318 + rand() * 70 : 300 + rand() * 105;
      leaves(Math.round(x), Y(score), 7 + Math.round(rand() * 8));
    }

    // reeds and cattails growing out of the pond
    for (let n = 0; n < Math.max(9, W / 9); n++) {
      const left = rand() < 0.22;
      const x = Math.round(left ? rand() * Math.max(2, trunkX - 2) : trunkX + trunkW + 5 + rand() * (W - trunkX - trunkW - 7));
      const tall = Math.round((28 + rand() * 105) * STEP);
      const lean = (rand() - 0.5) * 6;
      const colour = rand() < 0.5 ? '#4E9A52' : '#3D8246';
      for (let i = 0; i < tall; i++) rect(x + Math.round((lean * i) / tall), ground - i, 1, 1, colour);
      if (rand() < 0.6) rect(x + Math.round(lean) - 1, ground - tall - 5, 2, 6, '#7A4B2A');
      if (rand() < 0.5) for (let i = 0; i < 7; i++) rect(x + i + 1, ground - Math.round(tall * 0.4) - i, 1, 1, colour);
    }

    // the pond
    rect(0, ground, W, H - ground, '#2E6E8E');
    rect(0, ground + BOTTOM * 0.5, W, H, '#28607D');
    rect(0, ground + BOTTOM * 0.78, W, H, '#235471');
    rect(0, ground, W, 1, '#7FC4D9');
    rect(trunkX, ground + 1, trunkW, H, '#2A5C76');
    for (let n = 0; n < W / 3; n++) rect(rand() * W, ground + 3 + rand() * (BOTTOM - 8), 3 + rand() * 6, 1, '#4A8FAE');
    for (let n = 0; n < Math.max(5, W / 16); n++) {
      const x = Math.round(rand() * W), y = Math.round(ground + 7 + rand() * (BOTTOM - 18)), rx = 7 + Math.round(rand() * 4);
      oval(x, y, rx, 2, '#2F8F4A');
      oval(x, y - 1, rx - 1, 1, '#46B05D');
      rect(x + rx - 3, y - 1, 3, 1, '#2E6E8E');
      if (rand() < 0.4) { rect(x - 2, y - 4, 3, 2, '#F29BB6'); rect(x - 1, y - 5, 1, 1, '#E86A93'); }
    }

    return { height: H * SCALE, yOf: (score) => Y(score) * SCALE };
  }

  // What the frog sits on at a given score: a lily pad on the water, a leaf on a tall reed,
  // a branch of the tree, a cloud, then a moon rock.
  function perchFor(score) {
    if (score <= 0) return 'pad';
    if (score < 200) return 'leaf';
    if (score < 400) return 'branch';
    return score < TOP_SCORE ? 'cloud' : 'rock';
  }

  function perch(canvas, kind) {
    if (canvas.dataset.kind === kind) return;
    canvas.dataset.kind = kind;
    const W = 52, H = 16;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W * SCALE + 'px';
    canvas.style.height = H * SCALE + 'px';
    const g = canvas.getContext('2d');
    const { rect, oval, disc, leaves } = tools(g);
    g.clearRect(0, 0, W, H);
    if (kind === 'pad' || kind === 'leaf') {
      oval(26, 9, 24, 5, '#23703A');
      oval(26, 8, 24, 5, '#2F8F4A');
      oval(25, 7, 22, 4, '#49B863');
      if (kind === 'pad') g.clearRect(42, 6, 9, 2); // the notch of a lily pad
      else rect(4, 8, 44, 1, '#2F8F4A');             // the vein of a leaf
      rect(8, 6, 9, 1, '#6BCB7F');
    } else if (kind === 'branch') {
      rect(0, 6, W, 5, '#7B4F2F');
      rect(0, 6, W, 1, '#94653D');
      rect(0, 10, W, 1, '#5E3B22');
      leaves(6, 5, 5);
      leaves(46, 5, 5);
    } else if (kind === 'cloud') {
      disc(14, 9, 6, '#FFFFFF'); disc(26, 7, 7, '#FFFFFF'); disc(38, 9, 6, '#FFFFFF');
      rect(8, 11, 36, 3, '#FFFFFF');
      rect(9, 13, 34, 1, '#D7E7F6');
    } else {
      oval(26, 10, 24, 5, '#C9BC7C');
      oval(26, 9, 23, 4, '#E3D48C');
      disc(14, 9, 2, '#C9BC7C'); disc(34, 10, 2, '#C9BC7C');
    }
  }

  root.FermiWorld = { paint, perch, perchFor, SCALE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
