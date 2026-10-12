/*
 * Diamond Rush levels. See engine.js for what each character means.
 *
 *   name   - shown on the map and the intro
 *   hint   - one line of advice shown on the intro
 *   rows   - the board (at most 9 x 9 so cells stay big enough to tap)
 *   par    - the fewest actions that win, computed by check-levels.js (do not guess it)
 *
 * After editing a level run:  node games/diamondrush/check-levels.js
 * It proves every level is solvable and reports the par to paste in.
 */
(function (global) {
  'use strict';

  var LEVELS = [
    {
      name: 'First Steps',
      hint: 'Grab every diamond, then find the exit.',
      par: 17,
      rows: [
        '#######',
        '#P..:*#',
        '#.###.#',
        '#.#*..#',
        '#.#.###',
        '#*..:.E',
        '#######'
      ]
    },
    {
      name: 'Loose Dirt',
      hint: 'Dirt digs away when you walk into it.',
      par: 13,
      rows: [
        '#######',
        '#P::*.#',
        '#.###:#',
        '#*..#*#',
        '#.#.#.#',
        '#.#...E',
        '#######'
      ]
    },
    {
      name: 'Rolling Stone',
      hint: 'Push boulders out of the way, one tile at a time.',
      par: 11,
      rows: [
        '#########',
        '#...#.*.#',
        '#P..O...E',
        '#...#.*.#',
        '#########'
      ]
    },
    {
      name: 'Spike Pit',
      hint: 'Push a boulder onto spikes to fill them in.',
      par: 18,
      rows: [
        '########',
        '#P.O^.*#',
        '#.######',
        '#.*....E',
        '########'
      ]
    },
    {
      name: 'Golden Key',
      hint: 'Keys open doors of the same colour.',
      par: 19,
      rows: [
        '#########',
        '#P.:..r.#',
        '#.#######',
        '#.*.*.R.E',
        '#########'
      ]
    },
    {
      name: 'Slither',
      hint: 'Snakes bite! Press WAIT to let one slide past.',
      par: 16,
      rows: [
        '#########',
        '#P..h..*#',
        '#.#.##.##',
        '#.......E',
        '#########'
      ]
    },
    {
      name: 'Twin Keys',
      hint: 'One key leads to the next.',
      par: 21,
      rows: [
        '#########',
        '#P.r*R.b#',
        '#.#######',
        '#.*...B.E',
        '#########'
      ]
    },
    {
      name: 'Deep Shaft',
      hint: 'Snakes patrol up and down too.',
      par: 16,
      rows: [
        '#####',
        '#P..#',
        '#.#.#',
        '#...#',
        '#v#.#',
        '#.#.#',
        '#...#',
        '#*#.#',
        '###E#'
      ]
    },
    {
      name: 'Boulder Bridge',
      hint: 'Two pits, two boulders.',
      par: 23,
      rows: [
        '#########',
        '#P.O^.O^E',
        '#.#######',
        '#.*::::*#',
        '#########'
      ]
    },
    {
      name: 'Snake Crusher',
      hint: 'A pushed boulder crushes whatever is in front of it.',
      par: 21,
      rows: [
        '#########',
        '#P.O.H^*#',
        '#.#######',
        '#.......E',
        '#########'
      ]
    },
    {
      name: 'The Vault',
      hint: 'The key is the easy part.',
      par: 23,
      rows: [
        '#########',
        '#P.:.r..#',
        '#.#####.#',
        '#.#*O^*.#',
        '#.#.###R#',
        '#.....#.E',
        '#########'
      ]
    },
    {
      name: 'Temple Heart',
      hint: 'Everything you have learned, in order.',
      par: 34,
      rows: [
        '#########',
        '#P.:*.r.#',
        '#######.#',
        '#*..^O..#',
        '#.#######',
        '#.h....RE',
        '####.####',
        '#########'
      ]
    }
  ];

  global.DiamondRushLevels = LEVELS;
  if (typeof module !== 'undefined' && module.exports) { module.exports = LEVELS; }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
