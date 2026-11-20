/* Fermi Frog: the flip book.
   An animation is one picture that holds every frame in a grid (a "sprite sheet").
   The game shows one cell of the grid at a time, and changes cell a few times a second.
   This file is only the arithmetic: which cell at which moment, and where to put it. The page does the showing.

   A sheet (see sheets.js):
     src     the picture
     frames  how many cells are used, counted row by row
     cols, rows   the grid
     fps     cells per second
     loop    true: start again for ever. false: play once and stay on the last cell
     box     where the still frog's picture sits compared to one cell: [left, top, width, height], as shares of the cell.
             It lets the animated frog stand exactly where the still one stood, at the same size.
             The still may be larger than the cell (left below 0, width above 1): cells are cut tight around the frog.
     still   optional: the pose whose still picture the box is measured on, when it is not this pose's own. */
(function (root) {
  'use strict';

  // how long one play lasts, in milliseconds
  const length = (sheet) => (sheet.frames / sheet.fps) * 1000;

  // the cell to show after `ms` milliseconds
  function frameAt(sheet, ms) {
    const index = Math.floor((Math.max(0, ms) / 1000) * sheet.fps + 1e-9);
    return sheet.loop ? index % sheet.frames : Math.min(index, sheet.frames - 1);
  }

  const ended = (sheet, ms) => !sheet.loop && ms >= length(sheet);

  const cellOf = (sheet, index) => ({ col: index % sheet.cols, row: Math.floor(index / sheet.cols) });

  // The CSS background-position of a cell: 0% is the first column or row, 100% the last.
  function positionOf(sheet, index) {
    const { col, row } = cellOf(sheet, index);
    const share = (i, count) => (count > 1 ? Number(((i / (count - 1)) * 100).toFixed(3)) : 0) + '%';
    return share(col, sheet.cols) + ' ' + share(row, sheet.rows);
  }

  // Size and place of a whole cell, measured against the still frog's picture (which is 100% by 100%).
  function place(sheet) {
    const [x, y, w, h] = sheet.box;
    const pct = (n) => Number((n * 100).toFixed(3)) + '%';
    return { width: pct(1 / w), height: pct(1 / h), left: pct(-x / w), top: pct(-y / h) };
  }

  // What is wrong with a sheet, in words. An empty list means it is fine.
  function problems(sheet) {
    const out = [];
    const whole = (n) => Number.isInteger(n) && n >= 1;
    if (!sheet || typeof sheet.src !== 'string' || !sheet.src) out.push('no picture');
    if (!whole(sheet.frames) || !whole(sheet.cols) || !whole(sheet.rows)) out.push('frames, cols and rows must be whole numbers from 1');
    else if (sheet.frames > sheet.cols * sheet.rows) out.push('more frames than the grid holds');
    if (!(sheet.fps > 0 && sheet.fps <= 30)) out.push('fps must be between 1 and 30');
    if (typeof sheet.loop !== 'boolean') out.push('loop must be true or false');
    const box = sheet.box;
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === 'number' && Number.isFinite(n)) || !(box[2] > 0 && box[3] > 0)) out.push('the box needs four numbers, with a width and a height');
    else if (box[0] >= 1 || box[1] >= 1 || box[0] + box[2] <= 0 || box[1] + box[3] <= 0) out.push('the still and the cell must overlap');
    return out;
  }

  root.FermiSprites = { length, frameAt, ended, cellOf, positionOf, place, problems };
})(typeof globalThis !== 'undefined' ? globalThis : this);
