/*
 * Jewel Quest level data. Kept apart from the engine so levels are easy to add or retune.
 *
 * Each level:
 *   name   - shown on the quest map and the level intro
 *   blurb  - one line of story for the intro
 *   gems   - how many jewel kinds are in play (5 to 7; more kinds = harder matches)
 *   rows   - the board, one string per row:
 *              '#' a tile that needs 1 match to turn gold
 *              '2' a tough tile that needs 2 matches
 *              '.' a hole (no tile, no jewel)
 *
 * Boards are at most 8 columns wide so cells stay at least 44px on a 414px screen.
 * Register the list on window.JewelQuestLevels so jewelquest.js can read it.
 */
(function (global) {
  'use strict';

  global.JewelQuestLevels = [
    {
      name: 'Dusty Trailhead',
      blurb: 'Every quest begins with a single step.',
      gems: 5,
      rows: [
        '.####.',
        '######',
        '######',
        '.####.'
      ]
    },
    {
      name: 'Mine Entrance',
      blurb: 'The old gate creaks open. Gold lies beneath.',
      gems: 5,
      rows: [
        '######',
        '######',
        '######',
        '######',
        '######',
        '######'
      ]
    },
    {
      name: 'Crystal Cave',
      blurb: 'The walls hum with light.',
      gems: 5,
      rows: [
        '...#...',
        '..###..',
        '.#####.',
        '#######',
        '.#####.',
        '..###..',
        '...#...'
      ]
    },
    {
      name: 'Twin Chambers',
      blurb: 'Two vaults, one wall of rock between them.',
      gems: 5,
      rows: [
        '###..###',
        '###..###',
        '###..###',
        '###..###',
        '###..###'
      ]
    },
    {
      name: 'Gold Vein',
      blurb: 'Hard stone guards the richest seam.',
      gems: 5,
      rows: [
        '#######',
        '#######',
        '###2###',
        '##222##',
        '###2###',
        '#######',
        '#######'
      ]
    },
    {
      name: 'Emerald Tunnel',
      blurb: 'Narrow passages. Mind the pillars.',
      gems: 6,
      rows: [
        '########',
        '#.####.#',
        '########',
        '#.####.#',
        '########'
      ]
    },
    {
      name: 'Ruby Stair',
      blurb: 'Step by step, deeper and deeper.',
      gems: 6,
      rows: [
        '#.......',
        '##......',
        '###.....',
        '####....',
        '#####...',
        '######..',
        '#######.',
        '########'
      ]
    },
    {
      name: 'Sapphire Bridge',
      blurb: 'Cracked stones hide the best shine.',
      gems: 6,
      rows: [
        '########',
        '#22##22#',
        '########',
        '#22##22#',
        '########'
      ]
    },
    {
      name: 'Amethyst Maze',
      blurb: 'Lose your way and you lose your torch.',
      gems: 6,
      rows: [
        '#.#..#.#',
        '########',
        '#.2##2.#',
        '########',
        '#.#..#.#'
      ]
    },
    {
      name: 'Topaz Fortress',
      blurb: 'A ring of armoured stone surrounds the keep.',
      gems: 7,
      rows: [
        '########',
        '#222222#',
        '#2####2#',
        '#2####2#',
        '#2####2#',
        '#2####2#',
        '#222222#',
        '########'
      ]
    },
    {
      name: "Dragon's Hoard",
      blurb: 'Something vast sleeps on the treasure.',
      gems: 7,
      rows: [
        '.##..##.',
        '########',
        '###22###',
        '###22###',
        '.######.',
        '..####..',
        '...##...'
      ]
    },
    {
      name: 'Crystal Throne',
      blurb: 'Claim the final jewel and the quest is yours.',
      gems: 7,
      rows: [
        '#2#2#2#2',
        '2#2#2#2#',
        '#2#2#2#2',
        '2#2#2#2#',
        '#2#2#2#2',
        '2#2#2#2#',
        '#2#2#2#2',
        '2#2#2#2#'
      ]
    }
  ];
})(window);
