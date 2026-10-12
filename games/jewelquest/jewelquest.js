/*
 * Jewel Quest for GameHub. ES5, canvas-based match-3.
 *
 * Swap two neighbouring jewels to line up 3+ of a kind. Each cleared jewel turns the tile under
 * it one step closer to gold; turn every tile gold to clear the level. Levels live in levels.js.
 *
 * Model vs. picture: `grid[r][c]` holds the jewel that logically sits in a cell, while each jewel
 * has its own float x/y that tweens towards its cell. Game logic only reads the grid; animations
 * only move x/y, so a swap, a clear and a fall are all "change the grid, then tween".
 */
(function () {
  'use strict';

  var LEVELS = window.JewelQuestLevels;
  var N = 9;                // sprite size in "art pixels"
  var MAX_CELL = 62;        // biggest a board cell gets, in CSS px (small boards get chunkier cells)
  var SWAP_MS = 120;
  var CLEAR_MS = 150;
  var POINTS = 10;
  var SWIPE_FRAC = 0.45;    // fraction of a cell a finger must travel to count as a swap
  var FLASH_MS = 320;

  // Star ratings: fewer moves per tile layer is better. Tune these to taste.
  var STAR3_PER_LAYER = 0.45, STAR3_BASE = 2;
  var STAR2_PER_LAYER = 0.65, STAR2_BASE = 4;

  /* ---------- jewel art: 9x9 silhouettes, shaded in code ---------- */

  var SHAPES = {
    hex: [
      '...xxx...', '.xxxxxxx.', '.xxxxxxx.', 'xxxxxxxxx', 'xxxxxxxxx',
      'xxxxxxxxx', '.xxxxxxx.', '.xxxxxxx.', '...xxx...'
    ],
    diamond: [
      '....x....', '...xxx...', '..xxxxx..', '.xxxxxxx.', 'xxxxxxxxx',
      '.xxxxxxx.', '..xxxxx..', '...xxx...', '....x....'
    ],
    square: [
      '.xxxxxxx.', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx',
      'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', '.xxxxxxx.'
    ],
    round: [
      '..xxxxx..', '.xxxxxxx.', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx',
      'xxxxxxxxx', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..'
    ],
    triangle: [
      'xxxxxxxxx', 'xxxxxxxxx', '.xxxxxxx.', '.xxxxxxx.', '..xxxxx..',
      '..xxxxx..', '...xxx...', '...xxx...', '....x....'
    ],
    star: [
      '....x....', '....x....', '...xxx...', 'xxxxxxxxx', '.xxxxxxx.',
      '..xxxxx..', '..xx.xx..', '.xx...xx.', '.x.....x.'
    ],
    heart: [
      '.xx...xx.', 'xxxx.xxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx',
      '.xxxxxxx.', '..xxxxx..', '...xxx...', '....x....'
    ]
  };

  // Colour and shape both differ, so jewels stay distinguishable without relying on colour alone.
  var GEMS = [
    { shape: 'hex', color: '#ff4d6d' },       // ruby
    { shape: 'diamond', color: '#3b82ff' },   // sapphire
    { shape: 'square', color: '#34d97a' },    // emerald
    { shape: 'round', color: '#ffb703' },     // topaz
    { shape: 'triangle', color: '#a855f7' },  // amethyst
    { shape: 'star', color: '#05e6e6' },      // diamond
    { shape: 'heart', color: '#ff2ec4' }      // rose quartz
  ];

  var STAR_ART = ['..a..', '.aaa.', 'aaaaa', '.aaa.', '.a.a.'];

  function starHtml(on) {
    return GameHub.pixelIcon(STAR_ART, { a: on ? '#ffb703' : '#2a2848' });
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) {
      r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    } else {
      r = Math.round(r * (1 + amt)); g = Math.round(g * (1 + amt)); b = Math.round(b * (1 + amt));
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* Draw one jewel to its own little canvas, so each frame is just drawImage calls. */
  function makeSprite(gem, scale) {
    var rows = SHAPES[gem.shape];
    var cv = document.createElement('canvas');
    var g = cv.getContext('2d');
    var light = shade(gem.color, 0.45), mid = shade(gem.color, -0.2), outline = shade(gem.color, -0.72);
    var spark = null, bestSum = 99;
    var x, y, edge, t, col;

    function on(px, py) { return px >= 0 && py >= 0 && px < N && py < N && rows[py].charAt(px) === 'x'; }

    cv.width = cv.height = N * scale;
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        if (!on(x, y)) { continue; }
        edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
        t = (x + y) / (2 * (N - 1));
        col = edge ? outline : (t < 0.3 ? light : (t > 0.68 ? mid : gem.color));
        g.fillStyle = col;
        g.fillRect(x * scale, y * scale, scale, scale);
        if (!edge && x + y < bestSum) { bestSum = x + y; spark = { x: x, y: y }; }
      }
    }
    if (spark) {
      g.fillStyle = '#ffffff';
      g.fillRect(spark.x * scale, spark.y * scale, scale, scale);
    }
    return cv;
  }

  function now() { return window.performance && performance.now ? performance.now() : new Date().getTime(); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  function rnd(n) { return Math.floor(Math.random() * n); }

  GameHub.register({
    id: 'jewelquest',
    name: 'JEWEL QUEST',
    tagline: 'Match jewels. Strike gold.',
    category: 'Adventure',
    accent: '#ffb703',
    scoreKey: 'reached',
    scoreLabel: 'CLEARED',
    instructions: 'Swipe (or tap two) neighbouring jewels to swap them. Match 3 or more to turn the tiles beneath to gold. Gold every tile to win.',
    icon: {
      rows: [
        '.lllllll.',
        'lccccccdd',
        'lcclcccdd',
        '.lcccccd.',
        '..lcccd..',
        '...lcd...',
        '....d....',
        '.........',
        '.........'
      ],
      palette: { l: '#c8fbff', c: '#05e6e6', d: '#0a8f9a' }
    },

    start: function (container, api) {
      var el = api.el;
      var store = api.store;

      /* ---------- progress ---------- */

      var progress = (function () {
        var p = store.get('progress', null);
        if (!p || typeof p.unlocked !== 'number' || !Array.isArray(p.stars)) { p = { unlocked: 1, stars: [], scores: [] }; }
        if (!Array.isArray(p.scores)) { p.scores = []; }
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
        store.set('reached', clearedCount());
      }

      /* ---------- state ---------- */

      var dead = false;
      var gen = 0;                 // bumped when a level loads or the map opens; stale timers check it
      var raf = null;
      var lvIndex = 0, D = null;
      var rows = 0, cols = 0, cell = 0, spritePx = 0;
      var play, layer, flashAt, grid;
      var total = 0, remaining = 0, tilesGold = 0, tilesTotal = 0, totalLayers = 0;
      var score = 0, moves = 0, busy = false;
      var selected = null, hint = null, pops = [], anims = [], sprites = [];
      var dirty = true, flashUntil = 0, confirmTimer = null;

      /* ---------- DOM ---------- */

      var mapHead = el('div', { class: 'map-head' });
      var pathEl = el('div', { class: 'path' });
      var mapView = el('div', { class: 'map' }, [mapHead, pathEl]);

      var lvlVal = el('div', { class: 'val', text: '1' });
      var scoreVal = el('div', { class: 'val', text: '0' });
      var movesVal = el('div', { class: 'val', text: '0' });
      var hud = el('div', { class: 'hud' }, [
        el('div', { class: 'box lvl' }, [el('div', { class: 'lbl', text: 'LEVEL' }), lvlVal]),
        el('div', { class: 'box' }, [el('div', { class: 'lbl', text: 'SCORE' }), scoreVal]),
        el('div', { class: 'box mv' }, [el('div', { class: 'lbl', text: 'MOVES' }), movesVal])
      ]);
      var barFill = el('div', { class: 'fill' });
      var barText = el('div', { class: 'bar-text', text: 'GOLD 0/0' });
      var bar = el('div', { class: 'bar' }, [el('div', { class: 'track' }, [barFill]), barText]);

      var canvas = el('canvas');
      var ctx = canvas.getContext('2d');
      var overlayTitle = el('h2');
      var overlaySub = el('h3');
      var overlayStars = el('div', { class: 'stars' });
      var overlayMsg = el('p');
      var overlayRow = el('div', { class: 'row' });
      var overlay = el('div', { class: 'overlay hidden' }, [overlayTitle, overlaySub, overlayStars, overlayMsg, overlayRow]);
      var board = el('div', { class: 'board' }, [canvas, overlay]);

      var mapBtn = el('button', { class: 'btn', type: 'button', text: 'MAP', onclick: function () { showMap(); } });
      var hintBtn = el('button', { class: 'btn', type: 'button', text: 'HINT', onclick: showHint });
      var restartBtn = el('button', { class: 'btn primary', type: 'button', text: 'RESTART', onclick: onRestartTap });
      var controls = el('div', { class: 'controls' }, [mapBtn, hintBtn, restartBtn]);
      var levelView = el('div', { class: 'level hidden' }, [hud, bar, board, controls]);

      var root = el('div', { class: 'gjq' }, [mapView, levelView]);
      container.appendChild(root);

      /* ---------- quest map ---------- */

      function renderMap() {
        var ROW = 86, TOP = 38, xs = [20, 50, 80, 50];
        var i, f, n = LEVELS.length;
        var x, y, state, node, label, stars, k, nx, ny, lit;

        mapHead.innerHTML = '';
        mapHead.appendChild(el('div', { class: 'title', text: 'JEWEL QUEST' }));
        mapHead.appendChild(el('div', { class: 'blurb', text: 'Turn every tile to gold' }));
        mapHead.appendChild(el('div', { class: 'tally', html: starHtml(true) + '<span>' + totalStars() + '/' + (n * 3) + '</span>' }));

        pathEl.innerHTML = '';
        pathEl.style.height = (TOP + (n - 1) * ROW + 70) + 'px';

        for (i = 0; i < n - 1; i++) {                      // dotted trail between nodes
          lit = progress.stars[i] > 0;
          for (f = 1; f <= 4; f++) {
            nx = xs[i % 4] + (xs[(i + 1) % 4] - xs[i % 4]) * (f / 5);
            ny = TOP + i * ROW + ROW * (f / 5);
            pathEl.appendChild(el('div', { class: 'dot' + (lit ? ' lit' : ''), style: 'left:' + nx + '%;top:' + ny + 'px' }));
          }
        }

        for (i = 0; i < n; i++) {
          x = xs[i % 4];
          y = TOP + i * ROW;
          state = progress.stars[i] > 0 ? 'done' : (i + 1 <= progress.unlocked ? 'current' : 'locked');
          node = el('button', { class: 'node ' + state, type: 'button', text: String(i + 1), 'data-level': i, style: 'left:' + x + '%;top:' + (y - 28) + 'px' });
          node.addEventListener('click', onNodeTap);
          if (state === 'locked') { node.disabled = true; }
          pathEl.appendChild(node);

          if (state !== 'locked') {
            stars = el('div', { class: 'node-stars', style: 'left:' + x + '%;top:' + (y + 32) + 'px' });
            for (k = 1; k <= 3; k++) { stars.appendChild(el('span', { html: starHtml((progress.stars[i] || 0) >= k) })); }
            pathEl.appendChild(stars);
          }

          label = el('div', { class: 'label' + (state === 'locked' ? ' dim' : ''), text: state === 'locked' ? '???' : LEVELS[i].name });
          label.style.top = (y - 10) + 'px';
          if (x <= 50) { label.style.left = 'calc(' + x + '% + 38px)'; label.style.textAlign = 'left'; }
          else { label.style.right = 'calc(' + (100 - x) + '% + 38px)'; label.style.textAlign = 'right'; }
          pathEl.appendChild(label);
        }
      }

      function onNodeTap(e) {
        var idx = parseInt(e.currentTarget.getAttribute('data-level'), 10);
        if (idx + 1 <= progress.unlocked) { startLevel(idx); }
      }

      function showMap() {
        gen++;
        stopLoop();
        clearConfirm();
        anims = [];
        busy = false;
        renderMap();
        levelView.className = 'level hidden';
        mapView.className = 'map';
        // On a long map, bring the current level to about a third of the way down the screen.
        // Levels already on the first screen need no scrolling, so the Back bar stays visible.
        var cur = Math.min(progress.unlocked, LEVELS.length) - 1;
        var node = pathEl.querySelectorAll('.node')[cur];
        window.scrollTo(0, 0);
        if (node) {
          var nodeTop = node.getBoundingClientRect().top + (window.pageYOffset || 0);
          if (nodeTop > window.innerHeight * 0.7) { window.scrollTo(0, nodeTop - window.innerHeight * 0.33); }
        }
      }

      /* ---------- level setup ---------- */

      function startLevel(i) {
        lvIndex = i;
        D = LEVELS[i];
        gen++;
        anims = [];
        pops = [];
        busy = false;
        selected = null;
        hint = null;
        clearConfirm();

        rows = D.rows.length;
        cols = 0;
        var r, c, ch, row;
        for (r = 0; r < rows; r++) { cols = Math.max(cols, D.rows[r].length); }
        play = []; layer = []; flashAt = []; grid = [];
        tilesTotal = 0; totalLayers = 0;
        for (r = 0; r < rows; r++) {
          play.push([]); layer.push([]); flashAt.push([]); grid.push([]);
          row = D.rows[r];
          for (c = 0; c < cols; c++) {
            ch = row.charAt(c);
            play[r].push(ch === '#' || ch === '2');
            layer[r].push(ch === '2' ? 2 : (ch === '#' ? 1 : 0));
            flashAt[r].push(0);
            grid[r].push(null);
            if (ch === '#' || ch === '2') { tilesTotal++; totalLayers += (ch === '2' ? 2 : 1); }
          }
        }
        remaining = totalLayers;
        tilesGold = 0;
        score = 0;
        moves = 0;

        mapView.className = 'map hidden';
        levelView.className = 'level';
        window.scrollTo(0, 0);
        fit();
        randomFill();
        refreshHud();
        showOverlay('intro');
        startLoop();
      }

      function fit() {
        var avail = root.clientWidth - 8;                    // board has a 4px border each side
        var sc;
        cell = Math.max(30, Math.min(MAX_CELL, Math.floor(avail / cols)));
        sc = Math.max(2, Math.floor((cell - 6) / N));
        spritePx = N * sc;
        canvas.width = cell * cols;
        canvas.height = cell * rows;
        board.style.width = (canvas.width + 8) + 'px';
        sprites = [];
        var i;
        for (i = 0; i < GEMS.length; i++) { sprites.push(makeSprite(GEMS[i], sc)); }
        dirty = true;
      }

      /* ---------- gems on the board ---------- */

      function makeGem(type, c, r) { return { type: type, x: c, y: r, s: 1 }; }

      function pickType(r, c) {
        var bad = {}, t;
        if (c >= 2 && grid[r][c - 1] && grid[r][c - 2] && grid[r][c - 1].type === grid[r][c - 2].type) { bad[grid[r][c - 1].type] = true; }
        if (r >= 2 && grid[r - 1][c] && grid[r - 2][c] && grid[r - 1][c].type === grid[r - 2][c].type) { bad[grid[r - 1][c].type] = true; }
        do { t = rnd(D.gems); } while (bad[t]);
        return t;
      }

      /* Random board with no ready-made matches but at least one legal move. */
      function randomFill() {
        var r, c, tries = 0;
        do {
          for (r = 0; r < rows; r++) {
            for (c = 0; c < cols; c++) {
              grid[r][c] = play[r][c] ? makeGem(pickType(r, c), c, r) : null;
            }
          }
          tries++;
        } while (!findMove() && tries < 500);
      }

      function findMatches() {
        var mark = [], out = [];
        var r, c, e, t;
        for (r = 0; r < rows; r++) { mark.push([]); for (c = 0; c < cols; c++) { mark[r].push(false); } }

        for (r = 0; r < rows; r++) {
          c = 0;
          while (c < cols) {
            if (!grid[r][c]) { c++; continue; }
            t = grid[r][c].type;
            e = c;
            while (e + 1 < cols && grid[r][e + 1] && grid[r][e + 1].type === t) { e++; }
            if (e - c + 1 >= 3) { while (c <= e) { mark[r][c] = true; c++; } }
            c = e + 1;
          }
        }
        for (c = 0; c < cols; c++) {
          r = 0;
          while (r < rows) {
            if (!grid[r][c]) { r++; continue; }
            t = grid[r][c].type;
            e = r;
            while (e + 1 < rows && grid[e + 1][c] && grid[e + 1][c].type === t) { e++; }
            if (e - r + 1 >= 3) { while (r <= e) { mark[r][c] = true; r++; } }
            r = e + 1;
          }
        }
        for (r = 0; r < rows; r++) {
          for (c = 0; c < cols; c++) { if (mark[r][c]) { out.push({ r: r, c: c }); } }
        }
        return out;
      }

      function swapGrid(a, b) {
        var t = grid[a.r][a.c];
        grid[a.r][a.c] = grid[b.r][b.c];
        grid[b.r][b.c] = t;
      }

      function swapMakesMatch(a, b) {
        var ok;
        swapGrid(a, b);
        ok = findMatches().length > 0;
        swapGrid(a, b);
        return ok;
      }

      /* First legal swap found, or null. Used for hints and for "no moves left" detection. */
      function findMove() {
        var r, c, a, b;
        for (r = 0; r < rows; r++) {
          for (c = 0; c < cols; c++) {
            if (!grid[r][c]) { continue; }
            a = { r: r, c: c };
            if (c + 1 < cols && grid[r][c + 1]) {
              b = { r: r, c: c + 1 };
              if (swapMakesMatch(a, b)) { return [a, b]; }
            }
            if (r + 1 < rows && grid[r + 1][c]) {
              b = { r: r + 1, c: c };
              if (swapMakesMatch(a, b)) { return [a, b]; }
            }
          }
        }
        return null;
      }

      /*
       * The legal swap that would clear the most tiles still waiting to turn gold (a 2-layer tile
       * counts a little extra). This is what Hint shows, so it helps most on stubborn corner tiles.
       */
      function bestMove() {
        var best = null, bestScore = -1, pending = [], r, c;

        for (r = 0; r < rows; r++) {
          for (c = 0; c < cols; c++) { if (layer[r][c] > 0) { pending.push({ r: r, c: c }); } }
        }

        // 0..1: how close a cell is to the nearest tile that is not gold yet.
        function nearness(cr, cc) {
          var d = 99, i, k;
          for (i = 0; i < pending.length; i++) {
            k = Math.abs(pending[i].r - cr) + Math.abs(pending[i].c - cc);
            if (k < d) { d = k; }
          }
          return 1 / (1 + d);
        }

        function consider(a, b) {
          var ms, s = 0, i;
          swapGrid(a, b);
          ms = findMatches();
          swapGrid(a, b);
          if (!ms.length) { return; }
          for (i = 0; i < ms.length; i++) {
            if (layer[ms[i].r][ms[i].c] > 0) { s += 1 + (layer[ms[i].r][ms[i].c] - 1) * 0.5; }
            else { s += 0.3 * nearness(ms[i].r, ms[i].c); }   // shake things up around stubborn tiles
          }
          s += ms.length * 0.001;                      // final tie-break: bigger matches first
          if (s > bestScore) { bestScore = s; best = [a, b]; }
        }

        for (r = 0; r < rows; r++) {
          for (c = 0; c < cols; c++) {
            if (!grid[r][c]) { continue; }
            if (c + 1 < cols && grid[r][c + 1]) { consider({ r: r, c: c }, { r: r, c: c + 1 }); }
            if (r + 1 < rows && grid[r + 1][c]) { consider({ r: r, c: c }, { r: r + 1, c: c }); }
          }
        }
        return best;
      }

      /* ---------- animation ---------- */

      /* step(elapsedMs) runs every frame until ms have passed, then once more with exactly ms. */
      function animate(ms, step, done) {
        anims.push({ t0: null, ms: ms, step: step, done: done });
      }

      function runAnims(t) {
        var list = anims, i, a, el2;
        anims = [];
        for (i = 0; i < list.length; i++) {
          a = list[i];
          if (a.t0 === null) { a.t0 = t; }
          el2 = t - a.t0;
          if (el2 >= a.ms) {
            a.step(a.ms);
            if (a.done) { a.done(); }
          } else {
            a.step(el2);
            anims.push(a);
          }
        }
      }

      /* Tween jewels from where they are to the given cells. */
      function slide(items, ms, done) {
        var starts = [], i;
        for (i = 0; i < items.length; i++) { starts.push({ x: items[i].gem.x, y: items[i].gem.y }); }
        animate(ms, function (e) {
          var k, p = ease(Math.min(1, e / ms));
          for (k = 0; k < items.length; k++) {
            items[k].gem.x = starts[k].x + (items[k].c - starts[k].x) * p;
            items[k].gem.y = starts[k].y + (items[k].r - starts[k].y) * p;
          }
        }, done);
      }

      /* ---------- the move loop: swap -> clear -> fall -> repeat ---------- */

      function trySwap(a, b) {
        var ga, gb, myGen = gen, valid;
        if (busy || !grid[a.r][a.c] || !grid[b.r][b.c]) { return; }
        busy = true;
        selected = null;
        hint = null;
        ga = grid[a.r][a.c];
        gb = grid[b.r][b.c];
        swapGrid(a, b);
        valid = findMatches().length > 0;
        slide([{ gem: ga, r: b.r, c: b.c }, { gem: gb, r: a.r, c: a.c }], SWAP_MS, function () {
          if (myGen !== gen) { return; }
          if (valid) {
            moves++;
            refreshHud();
            resolve(1);
          } else {
            swapGrid(a, b);                       // not a match: swap back
            slide([{ gem: ga, r: a.r, c: a.c }, { gem: gb, r: b.r, c: b.c }], SWAP_MS, function () {
              if (myGen === gen) { busy = false; }
            });
          }
        });
      }

      function resolve(combo) {
        var cells = findMatches();
        var myGen = gen, gems = [], gained, sx = 0, sy = 0, i, c;
        if (!cells.length) { settle(); return; }

        for (i = 0; i < cells.length; i++) {
          c = cells[i];
          gems.push(grid[c.r][c.c]);
          if (layer[c.r][c.c] > 0) {
            layer[c.r][c.c]--;
            remaining--;
            if (layer[c.r][c.c] === 0) { tilesGold++; flashAt[c.r][c.c] = now(); flashUntil = now() + FLASH_MS; }
          }
          sx += c.c; sy += c.r;
        }
        gained = cells.length * POINTS * combo;
        score += gained;
        pops.push({ x: sx / cells.length, y: sy / cells.length, text: (combo > 1 ? 'x' + combo + ' ' : '') + '+' + gained, t0: now(), ms: 800 });
        refreshHud();

        animate(CLEAR_MS, function (e) {
          var k, s = Math.max(0, 1 - e / CLEAR_MS);
          for (k = 0; k < gems.length; k++) { gems[k].s = s; }
        }, function () {
          var k;
          if (myGen !== gen) { return; }
          for (k = 0; k < cells.length; k++) { grid[cells[k].r][cells[k].c] = null; }
          fall(function () { if (myGen === gen) { resolve(combo + 1); } });
        });
      }

      /* Settle jewels downwards inside each unbroken vertical run of tiles, refilling from its top. */
      function fall(done) {
        var drops = [], c, r, top, bottom, wp, i, g, maxDist = 0;
        for (c = 0; c < cols; c++) {
          r = rows - 1;
          while (r >= 0) {
            if (!play[r][c]) { r--; continue; }
            bottom = r;
            while (r >= 0 && play[r][c]) { r--; }
            top = r + 1;
            wp = bottom;
            for (i = bottom; i >= top; i--) {
              g = grid[i][c];
              if (!g) { continue; }
              if (wp !== i) { grid[wp][c] = g; grid[i][c] = null; }
              if (g.y !== wp) { drops.push({ gem: g, from: g.y, to: wp }); }
              wp--;
            }
            for (i = wp; i >= top; i--) {
              g = makeGem(rnd(D.gems), c, top - 1 - (wp - i));
              grid[i][c] = g;
              drops.push({ gem: g, from: g.y, to: i });
            }
          }
        }
        for (i = 0; i < drops.length; i++) { maxDist = Math.max(maxDist, drops[i].to - drops[i].from); }
        if (!drops.length) { done(); return; }
        animate(100 + 55 * maxDist, function (e) {
          var k, d, t;
          for (k = 0; k < drops.length; k++) {
            d = drops[k];
            t = Math.min(1, e / (100 + 55 * (d.to - d.from)));
            d.gem.y = d.from + (d.to - d.from) * t * t;       // ease-in, like gravity
          }
        }, done);
      }

      function settle() {
        if (remaining === 0) { winLevel(); return; }
        if (!findMove()) {
          pops.push({ x: (cols - 1) / 2, y: (rows - 1) / 2, text: 'NO MOVES!', t0: now(), ms: 1100 });
          shuffleBoard(function () { busy = false; });
          return;
        }
        busy = false;
      }

      function shuffleBoard(done) {
        var myGen = gen, spots = [], gems = [], r, c, i, j, t, tries = 0, items = [];
        for (r = 0; r < rows; r++) {
          for (c = 0; c < cols; c++) { if (play[r][c]) { spots.push({ r: r, c: c }); gems.push(grid[r][c]); } }
        }
        do {
          for (i = gems.length - 1; i > 0; i--) { j = rnd(i + 1); t = gems[i]; gems[i] = gems[j]; gems[j] = t; }
          for (i = 0; i < spots.length; i++) { grid[spots[i].r][spots[i].c] = gems[i]; }
          tries++;
          if (tries % 150 === 0) {                        // permutations keep failing: draw fresh jewels instead
            for (i = 0; i < gems.length; i++) { gems[i].type = rnd(D.gems); }
          }
        } while ((findMatches().length || !findMove()) && tries < 2000);
        for (i = 0; i < spots.length; i++) { items.push({ gem: grid[spots[i].r][spots[i].c], r: spots[i].r, c: spots[i].c }); }
        slide(items, 450, function () { if (myGen === gen) { done(); } });
      }

      /* ---------- winning ---------- */

      function starsFor() {
        if (moves <= Math.ceil(totalLayers * STAR3_PER_LAYER) + STAR3_BASE) { return 3; }
        if (moves <= Math.ceil(totalLayers * STAR2_PER_LAYER) + STAR2_BASE) { return 2; }
        return 1;
      }

      function winLevel() {
        var myGen = gen, stars = starsFor();
        progress.stars[lvIndex] = Math.max(progress.stars[lvIndex] || 0, stars);
        progress.scores[lvIndex] = Math.max(progress.scores[lvIndex] || 0, score);
        if (lvIndex + 2 > progress.unlocked) { progress.unlocked = Math.min(LEVELS.length, lvIndex + 2); }
        saveProgress();
        setTimeout(function () { if (!dead && myGen === gen) { showOverlay('clear', stars); } }, 450);
      }

      /* ---------- overlay ---------- */

      function overlayOpen() { return overlay.className.indexOf('hidden') === -1; }
      function hideOverlay() { overlay.className = 'overlay hidden'; }

      function button(label, cls, fn) { return el('button', { class: 'btn ' + cls, type: 'button', text: label, onclick: fn }); }

      function showOverlay(kind, stars) {
        var k, last = lvIndex === LEVELS.length - 1;
        overlayRow.innerHTML = '';
        overlayStars.innerHTML = '';
        overlaySub.textContent = '';
        if (kind === 'intro') {
          overlayTitle.className = 'ready';
          overlayTitle.textContent = 'LEVEL ' + (lvIndex + 1);
          overlaySub.textContent = D.name;
          overlayMsg.textContent = D.blurb;
          overlayRow.appendChild(button('GO!', 'primary', function () { hideOverlay(); }));
        } else {
          overlayTitle.className = 'win';
          overlayTitle.textContent = last ? 'QUEST DONE!' : 'LEVEL CLEAR!';
          for (k = 1; k <= 3; k++) { overlayStars.appendChild(el('span', { html: starHtml(stars >= k) })); }
          overlayMsg.textContent = (last ? 'Every jewel is yours. ' : '') + 'Score ' + score + ' in ' + moves + ' moves.';
          if (!last) { overlayRow.appendChild(button('NEXT', 'primary', function () { startLevel(lvIndex + 1); })); }
          overlayRow.appendChild(button('MAP', last ? 'primary' : '', function () { showMap(); }));
          overlayRow.appendChild(button('REPLAY', '', function () { startLevel(lvIndex); }));
        }
        overlay.className = 'overlay';
      }

      /* ---------- HUD + controls ---------- */

      function refreshHud() {
        lvlVal.textContent = lvIndex + 1;
        scoreVal.textContent = score;
        movesVal.textContent = moves;
        barFill.style.width = (tilesTotal ? Math.round(tilesGold / tilesTotal * 100) : 0) + '%';
        barText.textContent = 'GOLD ' + tilesGold + '/' + tilesTotal;
      }

      function showHint() {
        var m;
        if (busy || overlayOpen()) { return; }
        m = bestMove();
        if (m) { hint = { a: m[0], b: m[1], until: now() + 2600 }; dirty = true; }
      }

      function clearConfirm() {
        if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
        restartBtn.textContent = 'RESTART';
        restartBtn.className = 'btn primary';
      }

      function onRestartTap() {
        if (confirmTimer || moves === 0) { startLevel(lvIndex); return; }
        restartBtn.textContent = 'SURE?';
        restartBtn.className = 'btn danger';
        confirmTimer = setTimeout(clearConfirm, 2000);
      }

      /* ---------- drawing ---------- */

      function drawTile(r, c, t) {
        var px = c * cell, py = r * cell, L = layer[r][c], f, inset;
        var base = L === 0 ? '#8a6410' : (L === 1 ? '#26234a' : '#4a4780');
        var hi = L === 0 ? '#ffd45e' : (L === 1 ? '#3a3770' : '#8a85d0');
        var lo = L === 0 ? '#4d3706' : '#14122b';
        ctx.fillStyle = base;
        ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
        ctx.fillStyle = hi;
        ctx.fillRect(px + 1, py + 1, cell - 2, 2);
        ctx.fillRect(px + 1, py + 1, 2, cell - 2);
        ctx.fillStyle = lo;
        ctx.fillRect(px + 1, py + cell - 3, cell - 2, 2);
        ctx.fillRect(px + cell - 3, py + 1, 2, cell - 2);
        if (L === 2) {                                   // armoured plate
          inset = Math.round(cell * 0.2);
          ctx.strokeStyle = hi;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + inset, py + inset, cell - 2 * inset, cell - 2 * inset);
        } else if (L === 0) {                            // glints on finished gold
          ctx.fillStyle = '#fff3b0';
          ctx.fillRect(px + cell - 10, py + 6, 3, 3);
          ctx.fillRect(px + 6, py + cell - 10, 2, 2);
        }
        f = flashAt[r][c];
        if (f && t - f < FLASH_MS) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * (1 - (t - f) / FLASH_MS)) + ')';
          ctx.fillRect(px, py, cell, cell);
        }
      }

      function drawGem(g) {
        var w = Math.round(spritePx * g.s);
        if (w < 1) { return; }
        ctx.drawImage(sprites[g.type], Math.round(g.x * cell + (cell - w) / 2), Math.round(g.y * cell + (cell - w) / 2), w, w);
      }

      function outline(cellRef, color, t) {
        var pulse = 0.55 + 0.45 * Math.sin(t / 110);
        ctx.strokeStyle = color;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 3;
        ctx.strokeRect(cellRef.c * cell + 2, cellRef.r * cell + 2, cell - 4, cell - 4);
        ctx.globalAlpha = 1;
      }

      function draw(t) {
        var r, c, i, p, k;
        ctx.fillStyle = '#05040a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (r = 0; r < rows; r++) { for (c = 0; c < cols; c++) { if (play[r][c]) { drawTile(r, c, t); } } }

        // Jewels are clipped to tiles so falling ones emerge from the top of their column.
        ctx.save();
        ctx.beginPath();
        for (r = 0; r < rows; r++) { for (c = 0; c < cols; c++) { if (play[r][c]) { ctx.rect(c * cell, r * cell, cell, cell); } } }
        ctx.clip();
        for (r = 0; r < rows; r++) { for (c = 0; c < cols; c++) { if (grid[r][c]) { drawGem(grid[r][c]); } } }
        ctx.restore();

        if (selected) { outline(selected, '#ffb703', t); }
        if (hint && t < hint.until) { outline(hint.a, '#05e6e6', t); outline(hint.b, '#05e6e6', t); }

        ctx.textAlign = 'center';
        ctx.font = Math.max(9, Math.round(cell * 0.28)) + 'px "Press Start 2P", monospace';
        for (i = pops.length - 1; i >= 0; i--) {
          p = pops[i];
          k = (t - p.t0) / p.ms;
          if (k >= 1) { pops.splice(i, 1); continue; }
          ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          ctx.fillStyle = '#000';
          ctx.fillText(p.text, (p.x + 0.5) * cell + 2, (p.y + 0.5 - k * 0.8) * cell + 2);
          ctx.fillStyle = '#ffd45e';
          ctx.fillText(p.text, (p.x + 0.5) * cell, (p.y + 0.5 - k * 0.8) * cell);
          ctx.globalAlpha = 1;
        }
      }

      function frame(t) {
        raf = window.requestAnimationFrame(frame);
        if (anims.length) { runAnims(t); dirty = true; }
        if (hint && t >= hint.until) { hint = null; dirty = true; }
        if (dirty || selected || hint || pops.length || t < flashUntil) { draw(t); dirty = false; }
      }
      function startLoop() { if (raf === null) { raf = window.requestAnimationFrame(frame); } }
      function stopLoop() { if (raf !== null) { window.cancelAnimationFrame(raf); raf = null; } }

      /* ---------- input ---------- */

      var down = null;       // { r, c, x, y, handled } while a finger/mouse is down on the board

      function cellAt(clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        var x = (clientX - rect.left) * canvas.width / rect.width;
        var y = (clientY - rect.top) * canvas.height / rect.height;
        var c = Math.floor(x / cell), r = Math.floor(y / cell);
        if (r < 0 || c < 0 || r >= rows || c >= cols || !play[r][c]) { return null; }
        return { r: r, c: c };
      }

      function inputOk() { return !busy && !overlayOpen() && !dead; }

      function pointerDown(x, y) {
        var at = cellAt(x, y);
        down = at ? { r: at.r, c: at.c, x: x, y: y, handled: false } : null;
      }

      function pointerMove(x, y) {
        var dx, dy, target;
        if (!down || down.handled || !inputOk()) { return; }
        dx = x - down.x;
        dy = y - down.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * SWIPE_FRAC) { return; }
        down.handled = true;
        if (Math.abs(dx) > Math.abs(dy)) { target = { r: down.r, c: down.c + (dx > 0 ? 1 : -1) }; }
        else { target = { r: down.r + (dy > 0 ? 1 : -1), c: down.c }; }
        if (target.r < 0 || target.c < 0 || target.r >= rows || target.c >= cols || !play[target.r][target.c]) { return; }
        trySwap({ r: down.r, c: down.c }, target);
      }

      function pointerUp() {
        var d = down, adj;
        down = null;
        if (!d || d.handled || !inputOk()) { return; }
        if (!selected) { selected = { r: d.r, c: d.c }; return; }
        if (selected.r === d.r && selected.c === d.c) { selected = null; return; }
        adj = Math.abs(selected.r - d.r) + Math.abs(selected.c - d.c) === 1;
        if (adj) { trySwap(selected, { r: d.r, c: d.c }); }
        else { selected = { r: d.r, c: d.c }; }
      }

      function onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length !== 1) { down = null; return; }
        pointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
      function onTouchMove(e) {
        e.preventDefault();                    // keep the page still while swiping jewels
        if (e.touches.length === 1) { pointerMove(e.touches[0].clientX, e.touches[0].clientY); }
      }
      function onTouchEnd(e) { e.preventDefault(); pointerUp(); }
      function onMouseDown(e) { pointerDown(e.clientX, e.clientY); }
      function onMouseMove(e) { if (down) { pointerMove(e.clientX, e.clientY); } }
      function onMouseUp() { pointerUp(); }

      function onResize() {
        if (levelView.className.indexOf('hidden') !== -1) { return; }
        fit();
      }

      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });
      canvas.addEventListener('mousedown', onMouseDown, false);
      document.addEventListener('mousemove', onMouseMove, false);
      document.addEventListener('mouseup', onMouseUp, false);
      window.addEventListener('resize', onResize);

      /* ---------- boot ---------- */

      // Test seam: only exists if a test sets window.__jqDebug = {} before the game opens.
      if (window.__jqDebug) {
        window.__jqDebug.peek = function () {
          return {
            level: lvIndex, busy: busy, overlay: overlayOpen(), remaining: remaining, tilesGold: tilesGold, tilesTotal: tilesTotal,
            score: score, moves: moves, cols: cols, rows: rows, cell: cell,
            types: grid.map(function (row) { return row.map(function (g) { return g ? g.type : -1; }); }),
            layer: layer.map(function (row) { return row.slice(); })
          };
        };
        window.__jqDebug.move = function () { return bestMove(); };
        window.__jqDebug.allMoves = function () {
          var out = [], r, c, a, b;
          for (r = 0; r < rows; r++) {
            for (c = 0; c < cols; c++) {
              if (!grid[r][c]) { continue; }
              a = { r: r, c: c };
              b = { r: r, c: c + 1 };
              if (c + 1 < cols && grid[r][c + 1] && swapMakesMatch(a, b)) { out.push([a, b]); }
              b = { r: r + 1, c: c };
              if (r + 1 < rows && grid[r + 1][c] && swapMakesMatch(a, b)) { out.push([a, b]); }
            }
          }
          return out;
        };
        window.__jqDebug.swap = function (a, b) { trySwap(a, b); };
        window.__jqDebug.open = function (i) { startLevel(i); };
      }

      showMap();

      return {
        destroy: function () {
          dead = true;
          gen++;
          stopLoop();
          clearConfirm();
          canvas.removeEventListener('touchstart', onTouchStart, { passive: false });
          canvas.removeEventListener('touchmove', onTouchMove, { passive: false });
          canvas.removeEventListener('touchend', onTouchEnd, { passive: false });
          canvas.removeEventListener('mousedown', onMouseDown, false);
          document.removeEventListener('mousemove', onMouseMove, false);
          document.removeEventListener('mouseup', onMouseUp, false);
          window.removeEventListener('resize', onResize);
        }
      };
    }
  });
})();
