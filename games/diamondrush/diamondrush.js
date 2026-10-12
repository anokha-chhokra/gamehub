/*
 * Diamond Rush for GameHub. ES5, canvas, portrait.
 *
 * The rules live in engine.js (pure, also used by the level solver); this file is the picture:
 * pixel-art sprites, short slide animations, input (swipe, d-pad, keys), the level map and progress.
 *
 * Every action goes through Engine.step(). The engine returns events ("move", "push", "gem", ...)
 * which this file turns into animations; the state itself is always already final, so animations
 * never block input - starting a new action just snaps any unfinished one.
 */
(function () {
  'use strict';

  var Engine = window.DiamondEngine;
  var LEVELS = window.DiamondRushLevels;
  var ART = 10;                // sprite size in "art pixels"
  var MAX_SC = 5;              // biggest pixel scale (cell = ART * scale)
  var MOVE_MS = 110;
  var SWIPE_STEP = 0.7;        // fraction of a cell a finger must drag to take one step
  var HOLD_DELAY = 280, HOLD_REPEAT = 125;

  var STAR_ART = ['..a..', '.aaa.', 'aaaaa', '.aaa.', '.a.a.'];
  function starHtml(on) { return GameHub.pixelIcon(STAR_ART, { a: on ? '#ffb703' : '#2a2848' }); }

  /* ---------- pixel art ---------- */

  var PAL = {
    floor: '#46382a', floor2: '#503f2d',
    mortar: '#241b13', brick: '#7b6a58', brickHi: '#9a8873',
    dirt: '#7a4a24', dirtDark: '#5e3718', dirtLight: '#9a6334'
  };

  var TILE_ART = {
    floor: {
      rows: [
        'aaaaaaaaaa', 'aaabaaaaaa', 'aaaaaaaaba', 'aaaaaaaaaa', 'abaaaaaaaa',
        'aaaaabaaaa', 'aaaaaaaaaa', 'aaabaaaaba', 'aaaaaaaaaa', 'abaaaaaaaa'
      ],
      pal: { a: PAL.floor, b: PAL.floor2 }
    },
    wall: {
      rows: [
        'mmmmmmmmmm', 'hhhhmhhhhh', 'aaaamaaaaa', 'aaaamaaaaa', 'aaaamaaaaa',
        'mmmmmmmmmm', 'hhmhhhhhmh', 'aamaaaaama', 'aamaaaaama', 'aamaaaaama'
      ],
      pal: { m: PAL.mortar, a: PAL.brick, h: PAL.brickHi }
    },
    dirt: {
      rows: [
        'ddddeddddd', 'dfdddddedd', 'dddddfdddd', 'eddddddddf', 'ddfdddeddd',
        'dddddddddd', 'dedddfdddd', 'dddfdddded', 'dddddddddd', 'fdedddddfd'
      ],
      pal: { d: PAL.dirt, e: PAL.dirtDark, f: PAL.dirtLight }
    },
    gem: {
      rows: [
        '..........', '...llll...', '..lccccd..', '.lcclccdd.', 'lcccccccdd',
        '.lcccccdd.', '..lcccdd..', '...lcdd...', '....dd....', '..........'
      ],
      pal: { l: '#c8fbff', c: '#05e6e6', d: '#0a8f9a' }
    },
    boulder: {
      rows: [
        '...oooo...', '..ohhbbo..', '.ohhbbbbso', 'ohhbbbbbso', 'ohbbbbbbso',
        'obbbbbbsso', 'obbbbbssso', '.obbbsssso', '..ossssoo.', '...oooo...'
      ],
      pal: { o: '#2c2a38', b: '#8f8fa6', h: '#c5c5d9', s: '#5c5c70' }
    },
    spikes: {
      rows: [
        'pppppppppp', 'pwwpwwpwwp', 'psspsspssp', 'psspsspssp', 'psspsspssp',
        'psspsspssp', 'psspsspssp', 'psspsspssp', 'pttpttpttp', 'pppppppppp'
      ],
      pal: { p: '#1c1410', w: '#e8e8f8', s: '#a8a8c4', t: '#6a6a86' }
    }
  };

  /* Sprites built from rectangles in art pixels: [x, y, w, h, colour]. */
  function keyRects(c, hi) {
    return [
      [1, 2, 4, 1, hi], [1, 5, 4, 1, c], [1, 3, 1, 2, c], [4, 3, 1, 2, c],
      [5, 3, 5, 2, c], [7, 5, 1, 2, c], [9, 5, 1, 2, c]
    ];
  }
  function doorRects(c, dark) {
    return [
      [0, 0, 10, 10, '#241b13'], [1, 1, 8, 8, dark], [2, 2, 6, 7, c],
      [4, 4, 2, 2, '#241b13'], [4, 6, 2, 2, '#241b13']
    ];
  }
  var RECT_ART = {
    keyR: keyRects('#ff4d6d', '#ffb0bf'),
    keyB: keyRects('#3b82ff', '#a9c8ff'),
    doorR: doorRects('#ff4d6d', '#8a2038'),
    doorB: doorRects('#3b82ff', '#1d4496'),
    exitShut: [
      [0, 0, 10, 10, '#241b13'], [1, 1, 8, 8, '#4a4668'], [2, 2, 6, 7, '#2d2a45'],
      [3, 5, 4, 3, '#a3a1c2'], [4, 3, 2, 1, '#a3a1c2'], [3, 4, 1, 1, '#a3a1c2'], [6, 4, 1, 1, '#a3a1c2'], [4, 6, 2, 1, '#2d2a45']
    ],
    exitOpen: [
      [0, 0, 10, 10, '#241b13'], [1, 1, 8, 8, '#ffb703'], [2, 2, 6, 7, '#fff3b0'],
      [4, 3, 2, 5, '#ffffff'], [3, 5, 4, 1, '#ffffff'], [0, 0, 1, 1, '#ffd45e'], [9, 0, 1, 1, '#ffd45e']
    ],
    player: [
      [2, 0, 6, 1, '#c8832a'], [3, 1, 4, 1, '#c8832a'], [1, 2, 8, 1, '#a8651a'],
      [3, 3, 4, 3, '#f0c090'], [4, 4, 1, 1, '#17151f'], [6, 4, 1, 1, '#17151f'], [4, 5, 2, 1, '#c97a5a'],
      [2, 6, 6, 3, '#2e8b57'], [1, 6, 1, 2, '#f0c090'], [8, 6, 1, 2, '#f0c090'], [3, 9, 2, 1, '#5b3a1a'], [5, 9, 2, 1, '#5b3a1a']
    ],
    snake: [
      [0, 6, 3, 2, '#34d97a'], [2, 5, 3, 2, '#34d97a'], [4, 6, 3, 2, '#34d97a'], [6, 4, 3, 4, '#34d97a'],
      [0, 7, 7, 1, '#2aa860'], [7, 5, 1, 1, '#ffffff'], [8, 5, 1, 1, '#17151f'], [9, 6, 1, 1, '#ff4d6d'], [6, 4, 3, 1, '#8bf0b0']
    ]
  };

  function artSprite(rows, pal, sc) {
    var cv = document.createElement('canvas'), g, x, y, c;
    cv.width = cv.height = ART * sc;
    g = cv.getContext('2d');
    for (y = 0; y < ART; y++) {
      for (x = 0; x < ART; x++) {
        c = pal[rows[y].charAt(x)];
        if (c) { g.fillStyle = c; g.fillRect(x * sc, y * sc, sc, sc); }
      }
    }
    return cv;
  }

  function rectSprite(list, sc, flip) {
    var cv = document.createElement('canvas'), g, i, r;
    cv.width = cv.height = ART * sc;
    g = cv.getContext('2d');
    if (flip) { g.translate(cv.width, 0); g.scale(-1, 1); }
    for (i = 0; i < list.length; i++) {
      r = list[i];
      g.fillStyle = r[4];
      g.fillRect(r[0] * sc, r[1] * sc, r[2] * sc, r[3] * sc);
    }
    return cv;
  }

  function buildSprites(sc) {
    var out = {}, k;
    for (k in TILE_ART) {
      if (Object.prototype.hasOwnProperty.call(TILE_ART, k)) { out[k] = artSprite(TILE_ART[k].rows, TILE_ART[k].pal, sc); }
    }
    for (k in RECT_ART) {
      if (Object.prototype.hasOwnProperty.call(RECT_ART, k)) { out[k] = rectSprite(RECT_ART[k], sc, false); }
    }
    out.snakeL = rectSprite(RECT_ART.snake, sc, true);
    return out;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function now() { return window.performance && performance.now ? performance.now() : new Date().getTime(); }

  GameHub.register({
    id: 'diamondrush',
    name: 'DIAMOND RUSH',
    tagline: 'Dig. Push. Escape.',
    category: 'Adventure',
    accent: '#05e6e6',
    scoreKey: 'cleared',
    scoreLabel: 'CLEARED',
    instructions: 'Swipe the board or use the pad to walk. Collect every diamond to open the exit.',
    icon: {
      rows: [
        '.....bb.....',
        '...bbbbbb...',
        '..bblbbbbb..',
        '.bblbbbbbbd.',
        'bbbbbbbbbbdd',
        'bbbbbbbbbddd',
        '.bbbbbbbddd.',
        '..bbbbbddd..',
        '...bbbddd...',
        '....bddd....',
        '.....dd.....'
      ],
      palette: { b: '#05e6e6', l: '#c8fbff', d: '#0a8f9a' }
    },

    start: function (container, api) {
      var el = api.el;
      var store = api.store;

      /* ---------- progress ---------- */

      var progress = (function () {
        var p = store.get('progress', null);
        if (!p || typeof p.unlocked !== 'number' || !Array.isArray(p.stars)) { p = { unlocked: 1, stars: [], best: [] }; }
        if (!Array.isArray(p.best)) { p.best = []; }
        p.unlocked = Math.max(1, Math.min(LEVELS.length, p.unlocked));
        return p;
      })();

      function clearedCount() {
        var n = 0, i;
        for (i = 0; i < LEVELS.length; i++) { if (progress.stars[i] > 0) { n++; } }
        return n;
      }
      function totalStars() {
        var n = 0, i;
        for (i = 0; i < LEVELS.length; i++) { n += progress.stars[i] || 0; }
        return n;
      }
      function saveProgress() {
        store.set('progress', progress);
        store.set('cleared', clearedCount());
      }

      /* ---------- state ---------- */

      var dead = false, raf = null;
      var lvIndex = 0, S = null, undo = [];
      var cell = 0, sc = 3, sprites = null, cols = 0, rows = 0;
      var anims = [], fx = [], dirty = true, shakeUntil = 0, flashUntil = 0, banner = null;
      var gen = 0;                       // bumped on level change so stale timers do nothing
      var confirmTimer = null;
      var stoppers = [];                 // d-pad hold timers, cleared on any release

      /* ---------- DOM ---------- */

      var mapTally = el('div', { class: 'tally' });
      var mapGrid = el('div', { class: 'lvgrid' });
      var mapView = el('div', { class: 'map' }, [
        el('div', { class: 'blurb', text: 'Collect every diamond. Find the exit.' }),
        mapTally,
        mapGrid
      ]);

      var lvlVal = el('div', { class: 'val', text: '1' });
      var movesVal = el('div', { class: 'val', text: '0' });
      var gemsVal = el('div', { class: 'val', text: '0/0' });
      var keysVal = el('div', { class: 'val keys' });
      var hud = el('div', { class: 'hud' }, [
        el('div', { class: 'box lvl' }, [el('div', { class: 'lbl', text: 'LEVEL' }), lvlVal]),
        el('div', { class: 'box mv' }, [el('div', { class: 'lbl', text: 'MOVES' }), movesVal]),
        el('div', { class: 'box gm' }, [el('div', { class: 'lbl', text: 'DIAMONDS' }), gemsVal]),
        el('div', { class: 'box ky' }, [el('div', { class: 'lbl', text: 'KEYS' }), keysVal])
      ]);

      var canvas = el('canvas');
      var ctx = canvas.getContext('2d');
      var overlayTitle = el('h2');
      var overlaySub = el('h3');
      var overlayStars = el('div', { class: 'stars' });
      var overlayMsg = el('p');
      var overlayRow = el('div', { class: 'row' });
      var overlay = el('div', { class: 'overlay hidden' }, [overlayTitle, overlaySub, overlayStars, overlayMsg, overlayRow]);
      var board = el('div', { class: 'board' }, [canvas, overlay]);

      function arrow(deg) {
        return el('span', { class: 'arrow', style: 'transform:rotate(' + deg + 'deg);-webkit-transform:rotate(' + deg + 'deg)',
          html: GameHub.pixelIcon(['...a...', '..aaa..', '.aaaaa.', 'aaaaaaa', '..aaa..', '..aaa..', '..aaa..'], { a: '#eef0ff' }) });
      }
      var mapBtn = el('button', { class: 'btn small', type: 'button', text: 'MAP', onclick: function () { showMap(); } });
      var undoBtn = el('button', { class: 'btn small', type: 'button', text: 'UNDO', onclick: doUndo });
      var waitBtn = el('button', { class: 'btn small', type: 'button', text: 'WAIT', onclick: function () { act(4); } });
      var resetBtn = el('button', { class: 'btn small', type: 'button', text: 'RESET', onclick: onResetTap });
      var actions = el('div', { class: 'actions' }, [mapBtn, undoBtn, waitBtn, resetBtn]);

      function padBtn(dir, deg, cls) {
        var b = el('button', { class: 'btn pad ' + cls, type: 'button', 'aria-label': ['up', 'right', 'down', 'left'][dir] }, [arrow(deg)]);
        holdButton(b, function () { act(dir); });
        return b;
      }
      var pad = el('div', { class: 'padgrid' }, [
        padBtn(0, 0, 'up'), padBtn(3, -90, 'left'), padBtn(2, 180, 'down'), padBtn(1, 90, 'right')
      ]);

      var levelView = el('div', { class: 'level hidden' }, [hud, board, actions, pad]);
      var root = el('div', { class: 'gdr' }, [mapView, levelView]);
      container.appendChild(root);

      /* ---------- level map ---------- */

      function renderMap() {
        var i, state, btn, stars, k;
        mapTally.innerHTML = starHtml(true) + '<span>' + totalStars() + '/' + (LEVELS.length * 3) + '</span>';
        mapGrid.innerHTML = '';
        for (i = 0; i < LEVELS.length; i++) {
          state = progress.stars[i] > 0 ? 'done' : (i + 1 <= progress.unlocked ? 'open' : 'locked');
          btn = el('button', { class: 'lv ' + state, type: 'button', 'data-level': i }, [
            el('div', { class: 'num', text: String(i + 1) }),
            el('div', { class: 'nm', text: state === 'locked' ? '???' : LEVELS[i].name })
          ]);
          if (state !== 'locked') {
            stars = el('div', { class: 'ls' });
            for (k = 1; k <= 3; k++) { stars.appendChild(el('span', { html: starHtml((progress.stars[i] || 0) >= k) })); }
            btn.appendChild(stars);
          } else {
            btn.disabled = true;
          }
          btn.addEventListener('click', onLevelTap);
          mapGrid.appendChild(btn);
        }
      }

      function onLevelTap(e) {
        var idx = parseInt(e.currentTarget.getAttribute('data-level'), 10);
        if (idx + 1 <= progress.unlocked) { startLevel(idx); }
      }

      function showMap() {
        gen++;
        stopLoop();
        clearConfirm();
        renderMap();
        levelView.className = 'level hidden';
        mapView.className = 'map';
        window.scrollTo(0, 0);
      }

      /* ---------- level setup ---------- */

      function startLevel(i) {
        lvIndex = i;
        gen++;
        S = Engine.parse(LEVELS[i].rows);
        undo = [];
        anims = [];
        fx = [];
        banner = null;
        shakeUntil = 0;
        flashUntil = 0;
        clearConfirm();
        cols = S.w; rows = S.h;
        mapView.className = 'map hidden';
        levelView.className = 'level';
        window.scrollTo(0, 0);
        fit();
        refreshHud();
        showOverlay('intro');
        startLoop();
      }

      function fit() {
        var avail = root.clientWidth - 8;                  // board has a 4px border on each side
        sc = Math.max(2, Math.min(MAX_SC, Math.floor(avail / (cols * ART))));
        cell = ART * sc;
        canvas.width = cell * cols;
        canvas.height = cell * rows;
        board.style.width = (canvas.width + 8) + 'px';
        sprites = buildSprites(sc);
        dirty = true;
      }

      /* ---------- actions ---------- */

      function overlayOpen() { return overlay.className.indexOf('hidden') === -1; }

      function act(d) {
        var before, ev;
        if (!S || overlayOpen() || S.status !== 'play') { return; }
        if (d === Engine.WAIT && !S.enemies.length) { return; }     // nothing to wait for
        before = Engine.clone(S);
        ev = Engine.step(S, d);
        if (!ev) { return; }                              // walked into a wall etc.: no turn used
        undo.push(before);
        if (undo.length > 1000) { undo.shift(); }
        play(ev);
        refreshHud();
        if (S.status === 'won') { win(); }
        else if (S.status === 'dead') { die(); }
      }

      function doUndo() {
        var prev;
        if (!undo.length || !S) { return; }
        prev = undo.pop();
        if (overlayOpen() && overlayTitle.className !== 'ready') { hideOverlay(); }
        S = prev;
        anims = [];
        fx = [];
        shakeUntil = 0;
        flashUntil = 0;
        refreshHud();
        dirty = true;
      }

      function restart() {
        startLevel(lvIndex);
      }

      function clearConfirm() {
        if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
        resetBtn.textContent = 'RESET';
        resetBtn.className = 'btn small';
      }
      function onResetTap() {
        if (confirmTimer || !S || S.moves === 0) { restart(); return; }
        resetBtn.textContent = 'SURE?';
        resetBtn.className = 'btn small danger';
        confirmTimer = setTimeout(clearConfirm, 2000);
      }

      /* Turn engine events into animations and effects. */
      function play(events) {
        var t = now(), i, e, gotGem = false;
        anims = [];                                       // snap whatever was still moving
        for (i = 0; i < events.length; i++) {
          e = events[i];
          if (e.t === 'gem') { gotGem = true; }
          if (e.t === 'move') { anims.push({ k: 'player', fx: e.fx, fy: e.fy, tx: e.tx, ty: e.ty, t0: t }); }
          else if (e.t === 'snake') { anims.push({ k: 'snake', i: e.i, fx: e.fx, fy: e.fy, tx: e.tx, ty: e.ty, t0: t }); }
          else if (e.t === 'push') { anims.push({ k: 'boulder', fx: e.fx, fy: e.fy, tx: e.tx, ty: e.ty, fill: e.fill, t0: t }); if (e.fill) { burst(e.tx, e.ty, '#8f8fa6', t); } }
          else if (e.t === 'gem') { burst(e.x, e.y, '#05e6e6', t); }
          else if (e.t === 'key') { burst(e.x, e.y, e.color === 'r' ? '#ff4d6d' : '#3b82ff', t); }
          else if (e.t === 'door') { burst(e.x, e.y, '#ffb703', t); }
          else if (e.t === 'dig') { burst(e.x, e.y, '#9a6334', t); }
          else if (e.t === 'kill') { burst(e.x, e.y, '#34d97a', t); }
        }
        if (gotGem && S.gems === S.need) { banner = { text: 'EXIT OPEN!', t0: t }; }
        dirty = true;
      }

      function burst(x, y, color, t) {
        var i, a;
        for (i = 0; i < 7; i++) {
          a = i / 7 * Math.PI * 2 + 0.4;
          fx.push({ x: (x + 0.5) * cell, y: (y + 0.5) * cell, vx: Math.cos(a), vy: Math.sin(a), c: color, t0: t });
        }
      }

      function starsFor(moves, par) {
        if (moves <= Math.ceil(par * 1.1) + 1) { return 3; }
        if (moves <= Math.ceil(par * 1.5) + 2) { return 2; }
        return 1;
      }

      function win() {
        var myGen = gen, par = LEVELS[lvIndex].par, stars = starsFor(S.moves, par);
        progress.stars[lvIndex] = Math.max(progress.stars[lvIndex] || 0, stars);
        if (!progress.best[lvIndex] || S.moves < progress.best[lvIndex]) { progress.best[lvIndex] = S.moves; }
        if (lvIndex + 2 > progress.unlocked) { progress.unlocked = Math.min(LEVELS.length, lvIndex + 2); }
        saveProgress();
        flashUntil = now() + 500;
        setTimeout(function () { if (!dead && myGen === gen) { showOverlay('clear', stars); } }, 450);
      }

      function die() {
        var myGen = gen, t = now();
        shakeUntil = t + 300;
        flashUntil = t + 260;
        setTimeout(function () { if (!dead && myGen === gen && S.status === 'dead') { showOverlay('dead'); } }, 420);
      }

      /* ---------- overlay ---------- */

      function hideOverlay() { overlay.className = 'overlay hidden'; }
      function button(label, cls, fn) { return el('button', { class: 'btn ' + cls, type: 'button', text: label, onclick: fn }); }

      function showOverlay(kind, stars) {
        var k, lv = LEVELS[lvIndex], last = lvIndex === LEVELS.length - 1;
        overlayRow.innerHTML = '';
        overlayStars.innerHTML = '';
        overlaySub.textContent = '';
        if (kind === 'intro') {
          overlayTitle.className = 'ready';
          overlayTitle.textContent = 'LEVEL ' + (lvIndex + 1);
          overlaySub.textContent = lv.name;
          overlayMsg.textContent = lv.hint;
          overlayRow.appendChild(button('GO!', 'primary', hideOverlay));
        } else if (kind === 'dead') {
          overlayTitle.className = 'lose';
          overlayTitle.textContent = 'OUCH!';
          overlayMsg.textContent = S.why || 'You did not make it.';
          overlayRow.appendChild(button('UNDO', 'primary', doUndo));
          overlayRow.appendChild(button('RETRY', '', restart));
        } else {
          overlayTitle.className = 'win';
          overlayTitle.textContent = last ? 'TEMPLE CLEARED!' : 'LEVEL CLEAR!';
          for (k = 1; k <= 3; k++) { overlayStars.appendChild(el('span', { html: starHtml(stars >= k) })); }
          overlayMsg.textContent = S.moves + ' moves (par ' + lv.par + ')' + (last ? '. You escaped the temple!' : '');
          if (!last) { overlayRow.appendChild(button('NEXT', 'primary', function () { startLevel(lvIndex + 1); })); }
          overlayRow.appendChild(button('MAP', last ? 'primary' : '', showMap));
          overlayRow.appendChild(button('REPLAY', '', restart));
        }
        overlay.className = 'overlay';
      }

      /* ---------- HUD ---------- */

      function refreshHud() {
        lvlVal.textContent = lvIndex + 1;
        movesVal.textContent = S.moves;
        gemsVal.textContent = S.gems + '/' + S.need;
        keysVal.innerHTML =
          '<span class="k kr' + (S.keys.r ? ' on' : '') + '"></span><span class="kn">' + S.keys.r + '</span>' +
          '<span class="k kb' + (S.keys.b ? ' on' : '') + '"></span><span class="kn">' + S.keys.b + '</span>';
      }

      /* ---------- drawing ---------- */

      function drawCell(x, y, skipBoulder) {
        var c = S.cells[y * S.w + x], px = x * cell, py = y * cell, open = S.gems >= S.need;
        if (c === '#') { ctx.drawImage(sprites.wall, px, py); return; }
        ctx.drawImage(c === ':' ? sprites.dirt : (c === '^' ? sprites.spikes : sprites.floor), px, py);
        if (c === '*') { ctx.drawImage(sprites.gem, px, py); }
        else if (c === 'O' && !skipBoulder) { ctx.drawImage(sprites.boulder, px, py); }
        else if (c === 'r') { ctx.drawImage(sprites.keyR, px, py); }
        else if (c === 'b') { ctx.drawImage(sprites.keyB, px, py); }
        else if (c === 'R') { ctx.drawImage(sprites.doorR, px, py); }
        else if (c === 'B') { ctx.drawImage(sprites.doorB, px, py); }
        else if (c === 'E') { ctx.drawImage(open ? sprites.exitOpen : sprites.exitShut, px, py); }
      }

      function progressOf(a, t) { return Math.max(0, Math.min(1, (t - a.t0) / MOVE_MS)); }

      function draw(t) {
        var x, y, i, a, p, px, py, e, sx = 0, sy = 0, skip = {}, snakeAnim = {}, pa = null, k, fade;

        for (i = 0; i < anims.length; i++) {
          a = anims[i];
          if (a.k === 'boulder' && progressOf(a, t) < 1) { skip[a.tx + ',' + a.ty] = true; }
          else if (a.k === 'snake' && progressOf(a, t) < 1) { snakeAnim[a.i] = a; }
          else if (a.k === 'player' && progressOf(a, t) < 1) { pa = a; }
        }

        ctx.save();
        if (t < shakeUntil) { sx = (Math.random() - 0.5) * 6; sy = (Math.random() - 0.5) * 6; ctx.translate(sx, sy); }

        for (y = 0; y < rows; y++) { for (x = 0; x < cols; x++) { drawCell(x, y, skip[x + ',' + y]); } }

        for (i = 0; i < anims.length; i++) {              // boulders sliding (or dropping into a pit)
          a = anims[i];
          if (a.k !== 'boulder') { continue; }
          p = progressOf(a, t);
          if (p >= 1) { continue; }
          px = lerp(a.fx, a.tx, p) * cell; py = lerp(a.fy, a.ty, p) * cell;
          if (a.fill && p > 0.6) { fade = 1 - (p - 0.6) / 0.4; ctx.globalAlpha = fade; }
          ctx.drawImage(sprites.boulder, px, py);
          ctx.globalAlpha = 1;
        }

        for (i = 0; i < S.enemies.length; i++) {          // snakes
          e = S.enemies[i];
          a = snakeAnim[i];
          if (a) { p = progressOf(a, t); px = lerp(a.fx, a.tx, p); py = lerp(a.fy, a.ty, p); }
          else { px = e.x; py = e.y; }
          ctx.drawImage(e.dx < 0 ? sprites.snakeL : sprites.snake, Math.round(px * cell), Math.round(py * cell));
        }

        if (pa) { p = progressOf(pa, t); px = lerp(pa.fx, pa.tx, p); py = lerp(pa.fy, pa.ty, p); }
        else { px = S.px; py = S.py; }
        ctx.drawImage(sprites.player, Math.round(px * cell), Math.round(py * cell));

        for (i = fx.length - 1; i >= 0; i--) {            // sparkles
          e = fx[i];
          k = (t - e.t0) / 420;
          if (k >= 1) { fx.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = e.c;
          ctx.fillRect(Math.round(e.x + e.vx * k * cell * 0.7) - sc, Math.round(e.y + e.vy * k * cell * 0.7) - sc, sc * 2, sc * 2);
          ctx.globalAlpha = 1;
        }

        if (banner) {
          k = (t - banner.t0) / 1100;
          if (k >= 1) { banner = null; }
          else {
            ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
            ctx.font = Math.max(10, Math.round(cell * 0.4)) + 'px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000';
            ctx.fillText(banner.text, canvas.width / 2 + 2, cell * 0.9 + 2);
            ctx.fillStyle = '#ffd45e';
            ctx.fillText(banner.text, canvas.width / 2, cell * 0.9);
            ctx.globalAlpha = 1;
          }
        }
        ctx.restore();

        if (t < flashUntil) {
          ctx.fillStyle = S.status === 'dead' ? 'rgba(255,77,109,' + (0.45 * (flashUntil - t) / 260) + ')' : 'rgba(255,255,255,' + (0.5 * (flashUntil - t) / 500) + ')';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }

      function frame(t) {
        var i, busy = false;
        raf = window.requestAnimationFrame(frame);
        for (i = anims.length - 1; i >= 0; i--) {
          if (progressOf(anims[i], t) >= 1) { anims.splice(i, 1); dirty = true; } else { busy = true; }
        }
        if (dirty || busy || fx.length || banner || t < shakeUntil || t < flashUntil) { draw(t); dirty = false; }
      }
      function startLoop() { if (raf === null) { raf = window.requestAnimationFrame(frame); } }
      function stopLoop() { if (raf !== null) { window.cancelAnimationFrame(raf); raf = null; } }

      /* ---------- input ---------- */

      /* A button that repeats while held: act at once, then again every HOLD_REPEAT ms after HOLD_DELAY. */
      function holdButton(btn, fn) {
        var t1 = null, t2 = null;
        function stop() {
          if (t1) { clearTimeout(t1); t1 = null; }
          if (t2) { clearInterval(t2); t2 = null; }
        }
        function begin(e) {
          if (e.cancelable) { e.preventDefault(); }
          stop();
          fn();
          t1 = setTimeout(function () { t2 = setInterval(fn, HOLD_REPEAT); }, HOLD_DELAY);
        }
        btn.addEventListener('touchstart', begin, { passive: false });
        btn.addEventListener('touchend', function (e) { e.preventDefault(); stop(); }, { passive: false });
        btn.addEventListener('touchcancel', stop, false);
        btn.addEventListener('mousedown', begin, false);
        stoppers.push(stop);
      }

      function stopAllHolds() { var i; for (i = 0; i < stoppers.length; i++) { stoppers[i](); } }

      var ax = 0, ay = 0, dragging = false;

      function dragStart(x, y) { ax = x; ay = y; dragging = true; }
      function dragMove(x, y) {
        var dx = x - ax, dy = y - ay, need = cell * SWIPE_STEP;
        if (!dragging || Math.max(Math.abs(dx), Math.abs(dy)) < need) { return; }
        if (Math.abs(dx) > Math.abs(dy)) { act(dx > 0 ? 1 : 3); } else { act(dy > 0 ? 2 : 0); }
        ax = x; ay = y;                                    // keep dragging to keep walking
      }

      function onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) { dragStart(e.touches[0].clientX, e.touches[0].clientY); }
      }
      function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) { dragMove(e.touches[0].clientX, e.touches[0].clientY); }
      }
      function onTouchEnd(e) { e.preventDefault(); dragging = false; }
      function onMouseDown(e) { dragStart(e.clientX, e.clientY); }
      function onMouseMove(e) { if (dragging) { dragMove(e.clientX, e.clientY); } }
      function onMouseUp() { dragging = false; stopAllHolds(); }

      var KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 };
      function onKeyDown(e) {
        var key = e.key, d;
        if (levelView.className.indexOf('hidden') !== -1) { return; }
        if (key && key.length === 1) { key = key.toLowerCase(); }
        if (key === ' ') { e.preventDefault(); act(4); return; }
        if (key === 'z' || key === 'Backspace') { e.preventDefault(); doUndo(); return; }
        d = KEYS.hasOwnProperty(key) ? KEYS[key] : undefined;
        if (d === undefined || e.metaKey || e.ctrlKey || e.altKey) { return; }
        e.preventDefault();
        act(d);
      }

      function onResize() {
        if (S && levelView.className.indexOf('hidden') === -1) { fit(); }
      }

      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });
      canvas.addEventListener('mousedown', onMouseDown, false);
      document.addEventListener('mousemove', onMouseMove, false);
      document.addEventListener('mouseup', onMouseUp, false);
      document.addEventListener('keydown', onKeyDown, false);
      window.addEventListener('resize', onResize);

      /* ---------- boot ---------- */

      showMap();

      return {
        destroy: function () {
          dead = true;
          gen++;
          stopLoop();
          stopAllHolds();
          clearConfirm();
          canvas.removeEventListener('touchstart', onTouchStart, { passive: false });
          canvas.removeEventListener('touchmove', onTouchMove, { passive: false });
          canvas.removeEventListener('touchend', onTouchEnd, { passive: false });
          canvas.removeEventListener('mousedown', onMouseDown, false);
          document.removeEventListener('mousemove', onMouseMove, false);
          document.removeEventListener('mouseup', onMouseUp, false);
          document.removeEventListener('keydown', onKeyDown, false);
          window.removeEventListener('resize', onResize);
        }
      };
    }
  });
})();
