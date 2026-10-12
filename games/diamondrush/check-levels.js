/*
 * Level checker for Diamond Rush:  node games/diamondrush/check-levels.js
 *
 * Solves every level with breadth-first search and reports whether it is solvable, the fewest
 * actions needed (the "par"), and whether the `par` stored in levels.js matches. Exits with a
 * non-zero code if any level is unsolvable, malformed or has a stale par.
 */
'use strict';

var path = require('path');
var Engine = require(path.join(__dirname, 'engine.js'));
var LEVELS = require(path.join(__dirname, 'levels.js'));

var bad = 0;

/* Replay the solution and count what it relied on, so a level meant to teach boulders really needs them. */
function mechanics(rows, path) {
  var s = Engine.parse(rows), count = {}, i, d, ev, j, names = [];
  for (i = 0; i < path.length; i++) {
    d = 'URDLW'.indexOf(path.charAt(i));
    ev = Engine.step(s, d) || [];
    for (j = 0; j < ev.length; j++) {
      var k = ev[j].t === 'push' && ev[j].fill ? 'fill' : ev[j].t;
      if (k !== 'move' && k !== 'snake') { count[k] = (count[k] || 0) + 1; }
    }
  }
  Object.keys(count).forEach(function (k) { names.push(k + 'x' + count[k]); });
  return names.join(' ') || '-';
}

LEVELS.forEach(function (lv, i) {
  var label = 'L' + (i + 1) + ' ' + lv.name;
  var w = 0, problems = [], players = 0, exits = 0, gems = 0;
  lv.rows.forEach(function (r) {
    w = Math.max(w, r.length);
    r.split('').forEach(function (c) {
      if (c === 'P') { players++; }
      if (c === 'E') { exits++; }
      if (c === '*') { gems++; }
    });
  });
  if (players !== 1) { problems.push('needs exactly one P (has ' + players + ')'); }
  if (exits < 1) { problems.push('needs an E'); }
  if (w > 9 || lv.rows.length > 9) { problems.push('bigger than 9x9 (' + w + 'x' + lv.rows.length + ')'); }

  var t0 = Date.now();
  var res = problems.length ? null : Engine.solve(lv.rows, 3000000);
  var ms = Date.now() - t0;

  if (problems.length) { console.log(label + ': BAD - ' + problems.join('; ')); bad++; return; }
  if (!res) { console.log(label + ': UNSOLVABLE (or too big to search)  [' + ms + ' ms]'); bad++; return; }
  var note = lv.par === res.moves ? 'ok' : (lv.par === undefined ? 'set par: ' + res.moves : 'STALE par ' + lv.par + ' -> ' + res.moves);
  if (lv.par !== res.moves) { bad++; }
  console.log(label + ': solvable in ' + res.moves + ' (' + gems + ' gems, ' + res.explored + ' states, ' + ms + ' ms)  ' + note);
  console.log('      uses: ' + mechanics(lv.rows, res.path) + '   path ' + res.path);
});

if (bad) { console.log('\n' + bad + ' level(s) need attention.'); process.exit(1); }
console.log('\nAll ' + LEVELS.length + ' levels are solvable and their pars are current.');
