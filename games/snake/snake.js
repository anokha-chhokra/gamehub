/*
 * Snake for GameHub. ES5, canvas-based, steered by swipes or keys.
 *
 * The loop is a plain setTimeout chain (one step per tick), so speed is just the delay between
 * ticks. Steering inputs are queued (max 2) so two quick turns in a row are not lost.
 */
(function () {
  'use strict';

  var COLS = 20;
  var ROWS = 20;
  var START_MS = 150;     // delay between steps at level 1
  var MIN_MS = 70;        // fastest it gets
  var STEP_MS = 10;       // speed-up per level
  var LEVEL_EVERY = 5;    // foods eaten per level
  var POINTS = 10;
  var SWIPE_MIN = 20;     // px a finger must travel to count as a turn

  var DIRS = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
  };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  var KEY_DIRS = {
    ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
    w: 'up', d: 'right', s: 'down', a: 'left'
  };
  var KEYCODE_DIRS = { 38: 'up', 39: 'right', 40: 'down', 37: 'left' };

  var COLOR = {
    bgA: '#07060d',
    bgB: '#0b0a15',
    body: '#34d97a',
    head: '#05e6e6',
    dead: '#ff4d6d',
    food: '#ff2ec4',
    stem: '#34d97a',
    eye: '#08070d'
  };

  GameHub.register({
    id: 'snake',
    name: 'SNAKE',
    tagline: 'Eat. Grow. Repeat.',
    category: 'Arcade',
    accent: '#34d97a',
    scoreKey: 'best',
    instructions: 'Swipe (or use arrow keys / WASD) to steer. Eat the pink blocks. Do not hit the walls or yourself.',
    icon: {
      rows: [
        '.........',
        '.aaaaaaa.',
        '.a.......',
        '.a.......',
        '.aaaaaaa.',
        '.......a.',
        'fhhhaaaa.',
        '.........',
        '.........'
      ],
      palette: { a: '#34d97a', h: '#05e6e6', f: '#ff2ec4' }
    },

    start: function (container, api) {
      var el = api.el;
      var store = api.store;

      var snake, dirName, queue, food, score, eaten, best, mode, cell;
      var timer = null;
      var dead = false;
      var confirmTimer = null;

      /* ---------- DOM ---------- */

      var scoreVal = el('div', { class: 'val', text: '0' });
      var bestVal = el('div', { class: 'val', text: '0' });
      var levelVal = el('div', { class: 'val', text: '1' });
      var hud = el('div', { class: 'hud' }, [
        el('div', { class: 'box' }, [el('div', { class: 'lbl', text: 'SCORE' }), scoreVal]),
        el('div', { class: 'box best' }, [el('div', { class: 'lbl', text: 'BEST' }), bestVal]),
        el('div', { class: 'box lvl' }, [el('div', { class: 'lbl', text: 'LEVEL' }), levelVal])
      ]);

      var canvas = el('canvas');
      var overlayTitle = el('h2');
      var overlayMsg = el('p');
      var overlayRow = el('div', { class: 'row' });
      var overlay = el('div', { class: 'overlay hidden' }, [overlayTitle, overlayMsg, overlayRow]);
      var board = el('div', { class: 'board' }, [canvas, overlay]);

      var pauseBtn = el('button', { class: 'btn', type: 'button', text: 'PAUSE', onclick: togglePause });
      var restartBtn = el('button', { class: 'btn primary', type: 'button', text: 'RESTART', onclick: onRestartTap });
      var controls = el('div', { class: 'controls' }, [pauseBtn, restartBtn]);

      var root = el('div', { class: 'gsnake' }, [hud, board, controls]);
      container.appendChild(root);

      var ctx = canvas.getContext('2d');

      /* Pick a whole-pixel cell size so the canvas stays crisp, then size the board to match. */
      function fit() {
        board.style.width = '';
        var avail = root.clientWidth - 8; // 4px border each side
        cell = Math.max(10, Math.floor(avail / COLS));
        canvas.width = cell * COLS;
        canvas.height = cell * ROWS;
        board.style.width = (canvas.width + 8) + 'px';
      }

      /* ---------- state ---------- */

      function level() { return 1 + Math.floor(eaten / LEVEL_EVERY); }
      function delay() { return Math.max(MIN_MS, START_MS - (level() - 1) * STEP_MS); }

      function occupied(x, y) {
        var i;
        for (i = 0; i < snake.length; i++) {
          if (snake[i].x === x && snake[i].y === y) { return true; }
        }
        return false;
      }

      function placeFood() {
        var empties = [], x, y, pick;
        for (y = 0; y < ROWS; y++) {
          for (x = 0; x < COLS; x++) { if (!occupied(x, y)) { empties.push({ x: x, y: y }); } }
        }
        if (!empties.length) { food = null; return; }
        pick = empties[Math.floor(Math.random() * empties.length)];
        food = { x: pick.x, y: pick.y };
      }

      function refreshHud() {
        scoreVal.textContent = score;
        bestVal.textContent = best;
        levelVal.textContent = level();
        pauseBtn.disabled = mode !== 'playing' && mode !== 'paused';
        pauseBtn.textContent = mode === 'paused' ? 'RESUME' : 'PAUSE';
      }

      function reset() {
        clearTimeout(timer);
        timer = null;
        clearConfirm();
        snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
        dirName = 'right';
        queue = [];
        score = 0;
        eaten = 0;
        mode = 'ready';
        placeFood();
        showOverlay('ready');
        refreshHud();
        draw();
      }

      /* ---------- overlay ---------- */

      function hideOverlay() { overlay.className = 'overlay hidden'; }

      function showOverlay(kind) {
        overlayRow.innerHTML = '';
        if (kind === 'ready') {
          overlayTitle.className = 'ready';
          overlayTitle.textContent = 'READY?';
          overlayMsg.textContent = 'Swipe in any direction to start.';
          overlayRow.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'START', onclick: begin }));
        } else if (kind === 'paused') {
          overlayTitle.className = 'ready';
          overlayTitle.textContent = 'PAUSED';
          overlayMsg.textContent = 'Take a breath.';
          overlayRow.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'RESUME', onclick: togglePause }));
        } else {
          overlayTitle.className = kind === 'win' ? 'win' : 'over';
          overlayTitle.textContent = kind === 'win' ? 'YOU WIN!' : 'GAME OVER';
          overlayMsg.textContent = (kind === 'win' ? 'You filled the board. ' : '') + 'Score ' + score + '.';
          overlayRow.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'PLAY AGAIN', onclick: function () { reset(); begin(); } }));
        }
        overlay.className = 'overlay';
      }

      /* ---------- loop ---------- */

      function schedule() {
        clearTimeout(timer);
        timer = setTimeout(tick, delay());
      }

      function begin() {
        if (mode !== 'ready') { return; }
        mode = 'playing';
        hideOverlay();
        refreshHud();
        schedule();
      }

      function togglePause() {
        if (mode === 'playing') {
          mode = 'paused';
          clearTimeout(timer);
          timer = null;
          showOverlay('paused');
        } else if (mode === 'paused') {
          mode = 'playing';
          hideOverlay();
          schedule();
        }
        refreshHud();
      }

      function finish(kind) {
        mode = 'over';
        clearTimeout(timer);
        timer = null;
        if (score > best) { best = score; store.set('best', best); }
        refreshHud();
        draw(kind === 'lose');
        showOverlay(kind);
      }

      function tick() {
        var d, head, ate, limit, i;
        timer = null;
        if (dead || mode !== 'playing') { return; }

        if (queue.length) { dirName = queue.shift(); }
        d = DIRS[dirName];
        head = { x: snake[0].x + d.x, y: snake[0].y + d.y };
        ate = !!food && head.x === food.x && head.y === food.y;

        if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) { finish('lose'); return; }
        // The tail cell frees up this step unless we grow, so it is only a hit when we eat.
        limit = ate ? snake.length : snake.length - 1;
        for (i = 0; i < limit; i++) {
          if (snake[i].x === head.x && snake[i].y === head.y) { finish('lose'); return; }
        }

        snake.unshift(head);
        if (ate) {
          score += POINTS;
          eaten++;
          if (score > best) { best = score; store.set('best', best); }
          placeFood();
          if (!food) { refreshHud(); draw(false); finish('win'); return; }
        } else {
          snake.pop();
        }
        refreshHud();
        draw(false);
        schedule();
      }

      /* ---------- drawing ---------- */

      function block(x, y, color) {
        var px = x * cell, py = y * cell;
        var edge = Math.max(2, Math.round(cell / 9));
        ctx.fillStyle = color;
        ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';           // bevel: light top/left ...
        ctx.fillRect(px + 1, py + 1, cell - 2, edge);
        ctx.fillRect(px + 1, py + 1, edge, cell - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';                  // ... dark bottom/right
        ctx.fillRect(px + 1, py + cell - 1 - edge, cell - 2, edge);
        ctx.fillRect(px + cell - 1 - edge, py + 1, edge, cell - 2);
      }

      function eyes(seg, headColor) {
        var px = seg.x * cell, py = seg.y * cell;
        var e = Math.max(2, Math.round(cell / 6));
        var o = Math.round(cell * 0.28);
        var d = DIRS[dirName];
        var ax, ay, bx, by;
        if (d.x !== 0) {                         // moving sideways: eyes stacked on the leading side
          ax = bx = d.x > 0 ? px + cell - o - e : px + o;
          ay = py + o; by = py + cell - o - e;
        } else {                                 // moving up/down: eyes side by side
          ay = by = d.y > 0 ? py + cell - o - e : py + o;
          ax = px + o; bx = px + cell - o - e;
        }
        ctx.fillStyle = headColor === COLOR.dead ? '#ffffff' : COLOR.eye;
        ctx.fillRect(ax, ay, e, e);
        ctx.fillRect(bx, by, e, e);
      }

      function draw(crashed) {
        var x, y, i, headColor;
        for (y = 0; y < ROWS; y++) {
          for (x = 0; x < COLS; x++) {
            ctx.fillStyle = (x + y) % 2 ? COLOR.bgA : COLOR.bgB;
            ctx.fillRect(x * cell, y * cell, cell, cell);
          }
        }
        if (food) {
          block(food.x, food.y, COLOR.food);
          ctx.fillStyle = COLOR.stem;                       // little stem, so it reads as fruit
          ctx.fillRect(food.x * cell + Math.floor(cell / 2) - 1, food.y * cell + 1, 3, Math.max(3, Math.round(cell / 5)));
        }
        headColor = crashed ? COLOR.dead : COLOR.head;
        for (i = snake.length - 1; i >= 1; i--) { block(snake[i].x, snake[i].y, crashed ? COLOR.dead : COLOR.body); }
        block(snake[0].x, snake[0].y, headColor);
        eyes(snake[0], headColor);
      }

      /* ---------- input ---------- */

      function steer(name) {
        var last;
        if (mode === 'ready') {
          if (name === OPPOSITE[dirName]) { return; }   // would run into its own body
          begin();                                      // any other input, even "straight on", starts the run
        }
        if (mode !== 'playing') { return; }
        last = queue.length ? queue[queue.length - 1] : dirName;
        if (name === last || name === OPPOSITE[last]) { return; }
        if (queue.length < 2) { queue.push(name); }
      }

      function onKeyDown(e) {
        var key = e.key;
        var name;
        if (key && key.length === 1) { key = key.toLowerCase(); }
        if (key === ' ' || key === 'p') { e.preventDefault(); togglePause(); return; }
        name = KEY_DIRS.hasOwnProperty(key) ? KEY_DIRS[key] : KEYCODE_DIRS[e.keyCode];
        if (!name || e.metaKey || e.ctrlKey || e.altKey) { return; }
        e.preventDefault();
        steer(name);
      }

      var sx = 0, sy = 0, tracking = false;

      function swipeTo(x, y) {
        var dx = x - sx, dy = y - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) { return; }
        if (Math.abs(dx) > Math.abs(dy)) { steer(dx > 0 ? 'right' : 'left'); }
        else { steer(dy > 0 ? 'down' : 'up'); }
        sx = x; sy = y;   // restart from here so the next turn needs no lift-off
      }

      function onTouchStart(e) {
        if (e.touches.length !== 1) { tracking = false; return; }
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
      }
      function onTouchMove(e) {
        if (!tracking) { return; }
        e.preventDefault();   // keep the page still while steering
        swipeTo(e.touches[0].clientX, e.touches[0].clientY);
      }
      function onTouchEnd() { tracking = false; }

      function onVisibility() { if (document.hidden && mode === 'playing') { togglePause(); } }
      function onResize() { fit(); draw(mode === 'over' && overlayTitle.className === 'over'); }

      /* First tap arms RESTART, a second one (within 2s) restarts. Protects a run from a stray tap. */
      function clearConfirm() {
        if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
        restartBtn.textContent = 'RESTART';
        restartBtn.className = 'btn primary';
      }

      function onRestartTap() {
        if (confirmTimer || mode === 'ready' || mode === 'over') { reset(); return; }
        if (mode === 'playing') { togglePause(); }
        restartBtn.textContent = 'SURE?';
        restartBtn.className = 'btn danger';
        confirmTimer = setTimeout(clearConfirm, 2000);
      }

      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('resize', onResize);
      container.addEventListener('touchstart', onTouchStart, false);
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, false);

      /* ---------- boot ---------- */

      best = store.get('best', 0);
      fit();
      reset();

      return {
        destroy: function () {
          dead = true;
          clearTimeout(timer);
          clearConfirm();
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('visibilitychange', onVisibility);
          window.removeEventListener('resize', onResize);
          container.removeEventListener('touchstart', onTouchStart, false);
          container.removeEventListener('touchmove', onTouchMove, { passive: false });
          container.removeEventListener('touchend', onTouchEnd, false);
        }
      };
    }
  });
})();
