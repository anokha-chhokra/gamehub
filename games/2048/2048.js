/*
 * 2048 for GameHub. ES5, no dependencies beyond js/core.js.
 *
 * Model: `grid` is a SIZE x SIZE matrix of tile objects (or null). Each tile owns a DOM node
 * that is positioned with a CSS transform, so sliding is a transition. A move that merges two
 * tiles slides the absorbed one onto the survivor, then removes it and "pops" the survivor.
 */
(function () {
  'use strict';

  var SIZE = 4;
  var WIN_VALUE = 2048;
  var SWIPE_MIN = 24;     // px a finger must travel to count as a swipe
  var SLIDE_MS = 110;     // keep in sync with the .tile transition in 2048.css
  var UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

  var KEY_DIRS = {
    ArrowUp: UP, ArrowRight: RIGHT, ArrowDown: DOWN, ArrowLeft: LEFT,
    w: UP, d: RIGHT, s: DOWN, a: LEFT
  };
  var KEYCODE_DIRS = { 38: UP, 39: RIGHT, 40: DOWN, 37: LEFT };

  /* Where the i-th line's k-th cell is, counting from the edge tiles slide towards. */
  function pos(dir, i, k) {
    if (dir === UP) { return [k, i]; }
    if (dir === RIGHT) { return [i, SIZE - 1 - k]; }
    if (dir === DOWN) { return [SIZE - 1 - k, i]; }
    return [i, k];
  }

  function emptyMatrix(fill) {
    var m = [], r, c;
    for (r = 0; r < SIZE; r++) {
      m.push([]);
      for (c = 0; c < SIZE; c++) { m[r].push(fill); }
    }
    return m;
  }

  function validCells(cells) {
    var r, c;
    if (!Array.isArray(cells) || cells.length !== SIZE) { return false; }
    for (r = 0; r < SIZE; r++) {
      if (!Array.isArray(cells[r]) || cells[r].length !== SIZE) { return false; }
      for (c = 0; c < SIZE; c++) {
        if (typeof cells[r][c] !== 'number' || cells[r][c] < 0) { return false; }
      }
    }
    return true;
  }

  GameHub.register({
    id: '2048',
    name: '2048',
    tagline: 'Slide and merge',
    category: 'Puzzle',
    accent: '#05e6e6',
    scoreKey: 'best',
    instructions: 'Swipe (or use arrow keys / WASD) to slide the tiles. Equal numbers merge. Reach 2048!',
    icon: {
      rows: [
        'aaaa.bbbb',
        'aaaa.bbbb',
        'aaaa.bbbb',
        'aaaa.bbbb',
        '.........',
        'cccc.dddd',
        'cccc.dddd',
        'cccc.dddd',
        'cccc.dddd'
      ],
      palette: { a: '#8b5cf6', b: '#ff2ec4', c: '#ffb703', d: '#05e6e6' }
    },

    start: function (container, api) {
      var el = api.el;
      var store = api.store;

      var grid, tiles, score, best, won, keepGoing, over, undoSnap;
      var nextId = 1;
      var epoch = 0;       // bumped whenever the board is rebuilt; stale timers check it
      var dead = false;
      var confirmTimer = null;

      /* ---------- DOM ---------- */

      var scoreVal = el('div', { class: 'val', text: '0' });
      var bestVal = el('div', { class: 'val', text: '0' });
      var scoreBox = el('div', { class: 'box' }, [el('div', { class: 'lbl', text: 'SCORE' }), scoreVal]);
      var bestBox = el('div', { class: 'box best' }, [el('div', { class: 'lbl', text: 'BEST' }), bestVal]);
      var hud = el('div', { class: 'hud' }, [el('div', { class: 'brand', text: '2048' }), scoreBox, bestBox]);

      var field = el('div', { class: 'field' });
      var overlayTitle = el('h2');
      var overlayMsg = el('p');
      var overlayRow = el('div', { class: 'row' });
      var overlay = el('div', { class: 'overlay hidden' }, [overlayTitle, overlayMsg, overlayRow]);
      var board = el('div', { class: 'board' }, [field, overlay]);
      var sq = el('div', { class: 'sq' }, [board]);

      var undoBtn = el('button', { class: 'btn', type: 'button', text: 'UNDO', onclick: undo });
      var newBtn = el('button', { class: 'btn primary', type: 'button', text: 'NEW GAME', onclick: onNewGameTap });
      var controls = el('div', { class: 'controls' }, [undoBtn, newBtn]);

      var root = el('div', { class: 'g2048' }, [hud, sq, controls]);
      container.appendChild(root);

      function setPos(node, r, c) {
        node.style.transform = 'translate(' + (c * 100) + '%,' + (r * 100) + '%)';
      }

      // Background cells sit behind the tiles; rebuilt whenever the field is cleared.
      function addCells() {
        var r, c, cell;
        for (r = 0; r < SIZE; r++) {
          for (c = 0; c < SIZE; c++) {
            cell = el('div', { class: 'cell' }, [el('div', { class: 'c' })]);
            setPos(cell, r, c);
            field.appendChild(cell);
          }
        }
      }

      /* ---------- tiles ---------- */

      function paint(t) {
        var v = t.v;
        t.inner.className = 't ' + (v <= WIN_VALUE ? 'v' + v : 'vbig') + ' d' + String(v).length;
        t.inner.textContent = v;
      }

      function retrigger(t, cls) {
        t.inner.className = t.inner.className.replace(/ (new|pop)/g, '');
        void t.inner.offsetWidth; // restart the CSS animation
        t.inner.className += ' ' + cls;
      }

      function addTile(r, c, v, animate) {
        var inner = el('div');
        var node = el('div', { class: 'tile' }, [inner]);
        var t = { id: nextId++, v: v, r: r, c: c, el: node, inner: inner, fresh: false, into: null };
        paint(t);
        if (animate) { inner.className += ' new'; }
        setPos(node, r, c);
        field.appendChild(node);
        grid[r][c] = t;
        tiles.push(t);
        return t;
      }

      function cellValues() {
        var out = emptyMatrix(0), r, c;
        for (r = 0; r < SIZE; r++) {
          for (c = 0; c < SIZE; c++) { out[r][c] = grid[r][c] ? grid[r][c].v : 0; }
        }
        return out;
      }

      function build(cells) {
        var r, c;
        epoch++;
        field.innerHTML = '';
        addCells();
        tiles = [];
        grid = emptyMatrix(null);
        for (r = 0; r < SIZE; r++) {
          for (c = 0; c < SIZE; c++) {
            if (cells[r][c] > 0) { addTile(r, c, cells[r][c], false); }
          }
        }
      }

      function spawn() {
        var empties = [], r, c, pick;
        for (r = 0; r < SIZE; r++) {
          for (c = 0; c < SIZE; c++) { if (!grid[r][c]) { empties.push([r, c]); } }
        }
        if (!empties.length) { return null; }
        pick = empties[Math.floor(Math.random() * empties.length)];
        return addTile(pick[0], pick[1], Math.random() < 0.9 ? 2 : 4, true);
      }

      function maxTile() {
        var m = 0, i;
        for (i = 0; i < tiles.length; i++) { if (tiles[i].v > m) { m = tiles[i].v; } }
        return m;
      }

      function hasMoves() {
        var r, c, v;
        for (r = 0; r < SIZE; r++) {
          for (c = 0; c < SIZE; c++) {
            if (!grid[r][c]) { return true; }
            v = grid[r][c].v;
            if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].v === v) { return true; }
            if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].v === v) { return true; }
          }
        }
        return false;
      }

      /* ---------- persistence + HUD ---------- */

      function save() {
        store.set('state', { cells: cellValues(), score: score, won: won, keepGoing: keepGoing, over: over });
        store.set('best', best);
      }

      function refreshHud() {
        scoreVal.textContent = score;
        bestVal.textContent = best;
        undoBtn.disabled = !undoSnap;
      }

      function floatPoints(n) {
        var tag = el('div', { class: 'plus', text: '+' + n });
        scoreBox.appendChild(tag);
        setTimeout(function () { if (tag.parentNode) { tag.parentNode.removeChild(tag); } }, 650);
      }

      /* ---------- overlay ---------- */

      function hideOverlay() { overlay.className = 'overlay hidden'; }

      function showOverlay(kind) {
        overlayRow.innerHTML = '';
        if (kind === 'win') {
          overlayTitle.className = 'win';
          overlayTitle.textContent = 'YOU WIN!';
          overlayMsg.textContent = 'You made 2048. Keep going for a higher score?';
          overlayRow.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'KEEP GOING', onclick: function () {
            keepGoing = true;
            hideOverlay();
            save();
          } }));
          overlayRow.appendChild(el('button', { class: 'btn', type: 'button', text: 'NEW GAME', onclick: newGame }));
        } else {
          overlayTitle.className = 'over';
          overlayTitle.textContent = 'GAME OVER';
          overlayMsg.textContent = 'No moves left. Score ' + score + '.';
          overlayRow.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'TRY AGAIN', onclick: newGame }));
        }
        overlay.className = 'overlay';
      }

      function locked() { return overlay.className.indexOf('hidden') === -1; }

      /* ---------- moves ---------- */

      function move(dir) {
        if (dead || locked()) { return; }

        var before = { cells: cellValues(), score: score };
        var moved = false, gained = 0;
        var absorbed = [], survivors = [];
        var i, k, n, p, t, last, line, out;

        for (i = 0; i < SIZE; i++) {
          line = [];
          for (k = 0; k < SIZE; k++) {
            p = pos(dir, i, k);
            t = grid[p[0]][p[1]];
            if (t) { line.push(t); grid[p[0]][p[1]] = null; }
          }
          out = [];
          for (n = 0; n < line.length; n++) {
            t = line[n];
            last = out.length ? out[out.length - 1] : null;
            if (last && !last.fresh && last.v === t.v) {
              last.v *= 2;
              last.fresh = true;       // a tile merges at most once per move
              gained += last.v;
              t.into = last;
              absorbed.push(t);
              survivors.push(last);
            } else {
              out.push(t);
            }
          }
          for (k = 0; k < out.length; k++) {
            p = pos(dir, i, k);
            t = out[k];
            grid[p[0]][p[1]] = t;
            if (t.r !== p[0] || t.c !== p[1]) { moved = true; t.r = p[0]; t.c = p[1]; }
          }
        }

        for (i = 0; i < tiles.length; i++) { tiles[i].fresh = false; }
        if (!moved && !absorbed.length) { return; }

        // Absorbed tiles slide onto the survivor, then disappear.
        for (i = 0; i < absorbed.length; i++) {
          absorbed[i].r = absorbed[i].into.r;
          absorbed[i].c = absorbed[i].into.c;
        }
        tiles = tiles.filter(function (tile) { return absorbed.indexOf(tile) === -1; });
        for (i = 0; i < tiles.length; i++) { setPos(tiles[i].el, tiles[i].r, tiles[i].c); }
        for (i = 0; i < absorbed.length; i++) { setPos(absorbed[i].el, absorbed[i].r, absorbed[i].c); }

        undoSnap = before;
        score += gained;
        if (score > best) { best = score; }
        if (gained) { floatPoints(gained); }

        var myEpoch = epoch;
        setTimeout(function () {
          var j;
          if (dead || myEpoch !== epoch) { return; }
          for (j = 0; j < absorbed.length; j++) {
            if (absorbed[j].el.parentNode) { absorbed[j].el.parentNode.removeChild(absorbed[j].el); }
          }
          for (j = 0; j < survivors.length; j++) {
            paint(survivors[j]);
            retrigger(survivors[j], 'pop');
          }
        }, SLIDE_MS);

        spawn();

        if (!won && maxTile() >= WIN_VALUE) {
          won = true;
          if (!keepGoing) { later(function () { showOverlay('win'); }, 320); }
        } else if (!hasMoves()) {
          over = true;
          later(function () { showOverlay('over'); }, 320);
        }

        refreshHud();
        save();
      }

      /* Run fn after ms unless the board was rebuilt or the game closed meanwhile. */
      function later(fn, ms) {
        var myEpoch = epoch;
        setTimeout(function () { if (!dead && myEpoch === epoch) { fn(); } }, ms);
      }

      function undo() {
        if (!undoSnap) { return; }
        build(undoSnap.cells);
        score = undoSnap.score;
        undoSnap = null;
        over = false;
        won = maxTile() >= WIN_VALUE;
        if (!won) { keepGoing = false; }
        hideOverlay();
        refreshHud();
        save();
      }

      function newGame() {
        clearConfirm();
        build(emptyMatrix(0));
        score = 0;
        won = false;
        keepGoing = false;
        over = false;
        undoSnap = null;
        spawn();
        spawn();
        hideOverlay();
        refreshHud();
        save();
      }

      /* First tap arms the button, second tap (within 2s) starts over. Avoids a lost game to a stray tap. */
      function clearConfirm() {
        if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
        newBtn.textContent = 'NEW GAME';
        newBtn.className = 'btn primary';
      }

      function onNewGameTap() {
        if (confirmTimer || over || !tiles.length) { newGame(); return; }
        newBtn.textContent = 'SURE?';
        newBtn.className = 'btn danger';
        confirmTimer = setTimeout(clearConfirm, 2000);
      }

      /* ---------- input ---------- */

      function onKeyDown(e) {
        var key = e.key;
        var dir;
        if (key && key.length === 1) { key = key.toLowerCase(); }
        dir = KEY_DIRS.hasOwnProperty(key) ? KEY_DIRS[key] : KEYCODE_DIRS[e.keyCode];
        if (dir === undefined || e.metaKey || e.ctrlKey || e.altKey) { return; }
        e.preventDefault();
        move(dir);
      }

      var startX = 0, startY = 0, tracking = false;

      function begin(x, y) { startX = x; startY = y; tracking = true; }

      function finish(x, y) {
        var dx, dy;
        if (!tracking) { return; }
        tracking = false;
        dx = x - startX;
        dy = y - startY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) { return; }
        if (Math.abs(dx) > Math.abs(dy)) { move(dx > 0 ? RIGHT : LEFT); }
        else { move(dy > 0 ? DOWN : UP); }
      }

      function onTouchStart(e) {
        if (e.touches.length !== 1) { tracking = false; return; }
        begin(e.touches[0].clientX, e.touches[0].clientY);
      }
      function onTouchMove(e) { if (tracking) { e.preventDefault(); } } // stop the page scrolling mid-swipe
      function onTouchEnd(e) {
        var t = e.changedTouches[0];
        finish(t.clientX, t.clientY);
      }
      function onMouseDown(e) { begin(e.clientX, e.clientY); }
      function onMouseUp(e) { finish(e.clientX, e.clientY); }

      document.addEventListener('keydown', onKeyDown);
      container.addEventListener('touchstart', onTouchStart, false);
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, false);
      container.addEventListener('mousedown', onMouseDown, false);
      document.addEventListener('mouseup', onMouseUp, false);

      /* ---------- boot: resume the saved game, or start fresh ---------- */

      best = store.get('best', 0);
      var saved = store.get('state', null);
      if (saved && validCells(saved.cells)) {
        build(saved.cells);
        score = typeof saved.score === 'number' ? saved.score : 0;
        won = !!saved.won;
        keepGoing = !!saved.keepGoing;
        over = !!saved.over;
        undoSnap = null;
        if (!tiles.length) {
          newGame();
        } else {
          if (over || !hasMoves()) { over = true; showOverlay('over'); }
          else if (won && !keepGoing) { showOverlay('win'); }
          refreshHud();
        }
      } else {
        newGame();
      }

      return {
        destroy: function () {
          dead = true;
          clearConfirm();
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('mouseup', onMouseUp, false);
          container.removeEventListener('touchstart', onTouchStart, false);
          container.removeEventListener('touchmove', onTouchMove, { passive: false });
          container.removeEventListener('touchend', onTouchEnd, false);
          container.removeEventListener('mousedown', onMouseDown, false);
        }
      };
    }
  });
})();
