/*
 * Diamond Rush rules, with no DOM so it can run in the browser and in Node (the level solver).
 *
 * Level characters:
 *   #  wall            .  floor            :  dirt (digs away when walked into)
 *   *  diamond         O  boulder          ^  spikes (deadly)
 *   r  red key         R  red door         b  blue key        B  blue door
 *   E  exit (opens once every diamond is collected)
 *   P  player start
 *   H / h  snake that patrols left-right (H starts going right, h going left)
 *   V / v  snake that patrols up-down    (V starts going down,  v going up)
 *
 * One call to step() is one player action; if it did anything, every snake then takes one step.
 */
(function (global) {
  'use strict';

  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];         // directions: 0 up, 1 right, 2 down, 3 left
  var WAIT = 4;                   // "direction" 4 = stay put for a turn (snakes still move)

  function parse(rows) {
    var h = rows.length, w = 0, y, x, ch, s;
    for (y = 0; y < h; y++) { w = Math.max(w, rows[y].length); }
    s = { w: w, h: h, cells: [], px: 0, py: 0, enemies: [], keys: { r: 0, b: 0 }, gems: 0, need: 0, status: 'play', moves: 0 };
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        ch = rows[y].charAt(x) || '#';
        if (ch === 'P') { s.px = x; s.py = y; ch = '.'; }
        else if (ch === 'H' || ch === 'h') { s.enemies.push({ x: x, y: y, dx: ch === 'H' ? 1 : -1, dy: 0 }); ch = '.'; }
        else if (ch === 'V' || ch === 'v') { s.enemies.push({ x: x, y: y, dx: 0, dy: ch === 'V' ? 1 : -1 }); ch = '.'; }
        else if (ch === '*') { s.need++; }
        s.cells.push(ch);
      }
    }
    return s;
  }

  function clone(s) {
    var i, e = [];
    for (i = 0; i < s.enemies.length; i++) { e.push({ x: s.enemies[i].x, y: s.enemies[i].y, dx: s.enemies[i].dx, dy: s.enemies[i].dy }); }
    return {
      w: s.w, h: s.h, cells: s.cells.slice(), px: s.px, py: s.py, enemies: e,
      keys: { r: s.keys.r, b: s.keys.b }, gems: s.gems, need: s.need, status: s.status, moves: s.moves
    };
  }

  function at(s, x, y) { return x < 0 || y < 0 || x >= s.w || y >= s.h ? '#' : s.cells[y * s.w + x]; }
  function put(s, x, y, ch) { s.cells[y * s.w + x] = ch; }
  function enemyIndex(s, x, y) {
    var i;
    for (i = 0; i < s.enemies.length; i++) { if (s.enemies[i].x === x && s.enemies[i].y === y) { return i; } }
    return -1;
  }

  /*
   * Perform one action. Returns null if nothing happened (blocked), otherwise an event list the
   * renderer can animate: { t: 'move'|'push'|'gem'|'key'|'door'|'dig'|'kill'|'snake'|'die'|'win' ... }.
   */
  function step(s, d) {
    var nx = s.px + (DX[d] || 0), ny = s.py + (DY[d] || 0), c = d === WAIT ? '.' : at(s, nx, ny), ev = [], ei, tx, ty, tc, i, e, ex, ey, door;
    if (s.status !== 'play') { return null; }
    if (c === '#') { return null; }

    if (d === WAIT) {
      ev.push({ t: 'wait' });
    } else if (c === 'R' || c === 'B') {
      door = c === 'R' ? 'r' : 'b';
      if (s.keys[door] < 1) { return null; }
      s.keys[door]--;
      put(s, nx, ny, '.');
      ev.push({ t: 'door', x: nx, y: ny });
    } else if (c === 'E') {
      if (s.gems < s.need) { return null; }
    } else if (c === 'O') {
      tx = nx + DX[d]; ty = ny + DY[d];
      tc = at(s, tx, ty);
      if (tc !== '.' && tc !== '^') { return null; }
      ei = enemyIndex(s, tx, ty);
      if (ei >= 0) { ev.push({ t: 'kill', x: tx, y: ty }); s.enemies.splice(ei, 1); }
      put(s, nx, ny, '.');
      if (tc === '^') { put(s, tx, ty, '.'); ev.push({ t: 'push', fx: nx, fy: ny, tx: tx, ty: ty, fill: true }); }
      else { put(s, tx, ty, 'O'); ev.push({ t: 'push', fx: nx, fy: ny, tx: tx, ty: ty, fill: false }); }
    } else if (c === ':') {
      put(s, nx, ny, '.');
      ev.push({ t: 'dig', x: nx, y: ny });
    } else if (c === '*') {
      s.gems++;
      put(s, nx, ny, '.');
      ev.push({ t: 'gem', x: nx, y: ny });
    } else if (c === 'r' || c === 'b') {
      s.keys[c]++;
      put(s, nx, ny, '.');
      ev.push({ t: 'key', x: nx, y: ny, color: c });
    }

    if (d !== WAIT) { ev.unshift({ t: 'move', fx: s.px, fy: s.py, tx: nx, ty: ny }); }
    s.px = nx; s.py = ny;
    s.moves++;

    if (c === 'E') { s.status = 'won'; ev.push({ t: 'win' }); return ev; }
    if (c === '^') { s.status = 'dead'; s.why = 'SPIKES'; ev.push({ t: 'die', why: 'SPIKES' }); return ev; }
    if (enemyIndex(s, nx, ny) >= 0) { s.status = 'dead'; s.why = 'SNAKE BIT YOU'; ev.push({ t: 'die', why: 'SNAKE BIT YOU' }); return ev; }

    for (i = 0; i < s.enemies.length; i++) {         // snakes: keep going, turn round when blocked
      e = s.enemies[i];
      ex = e.x + e.dx; ey = e.y + e.dy;
      if (!snakeCan(s, ex, ey, i)) {
        e.dx = -e.dx; e.dy = -e.dy;
        ex = e.x + e.dx; ey = e.y + e.dy;
        if (!snakeCan(s, ex, ey, i)) { continue; }
      }
      ev.push({ t: 'snake', i: i, fx: e.x, fy: e.y, tx: ex, ty: ey });
      e.x = ex; e.y = ey;
      if (e.x === s.px && e.y === s.py) { s.status = 'dead'; s.why = 'SNAKE BIT YOU'; ev.push({ t: 'die', why: 'SNAKE BIT YOU' }); return ev; }
    }
    return ev;
  }

  function snakeCan(s, x, y, self) {
    var i;
    if (at(s, x, y) !== '.') { return false; }
    for (i = 0; i < s.enemies.length; i++) { if (i !== self && s.enemies[i].x === x && s.enemies[i].y === y) { return false; } }
    return true;
  }

  function key(s) {
    var i, out = s.cells.join('') + '|' + s.px + ',' + s.py + '|' + s.keys.r + s.keys.b + '|' + s.gems;
    for (i = 0; i < s.enemies.length; i++) { out += '|' + s.enemies[i].x + ',' + s.enemies[i].y + ',' + s.enemies[i].dx + ',' + s.enemies[i].dy; }
    return out;
  }

  /* Breadth-first search for the fewest actions that win. Returns { moves, path } or null. */
  function solve(rows, limit) {
    var start = parse(rows), seen = {}, queue = [{ s: start, path: '' }], head = 0, cur, d, n, k, ev;
    seen[key(start)] = true;
    limit = limit || 400000;
    while (head < queue.length && head < limit) {
      cur = queue[head++];
      for (d = 0; d < 5; d++) {
        if (d === WAIT && cur.s.enemies.length === 0) { continue; }     // waiting only matters when snakes move
        n = clone(cur.s);
        ev = step(n, d);
        if (!ev || n.status === 'dead') { continue; }
        if (n.status === 'won') { return { moves: cur.path.length + 1, path: cur.path + 'URDLW'.charAt(d), explored: head }; }
        k = key(n);
        if (seen[k]) { continue; }
        seen[k] = true;
        queue.push({ s: n, path: cur.path + 'URDLW'.charAt(d) });
      }
    }
    return null;
  }

  var api = { DX: DX, DY: DY, WAIT: WAIT, parse: parse, clone: clone, step: step, key: key, solve: solve, at: at };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  global.DiamondEngine = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
