/*
 * 8-Ball Pool for GameHub. ES5, canvas, landscape.
 *
 * Layout: the game covers the whole viewport (position: fixed) because a pool table wants every
 * pixel in landscape. In portrait it shows a "rotate your phone" prompt instead.
 *
 * Physics runs on a fixed 240 Hz step inside a requestAnimationFrame loop, so motion looks the same
 * on any screen and fast balls cannot tunnel through each other. Everything on the table lives in
 * "table units" (an 800 x 400 playing surface); drawing scales that to whatever the screen allows.
 *
 * Phases: menu -> aim (or place, for ball-in-hand) -> shoot (cue stroke) -> roll (physics) -> back
 * to aim/place, or over. The computer opponent runs inside the same loop, driven by timestamps.
 */
(function () {
  'use strict';

  /* ---------- table geometry (table units) ---------- */

  var FW = 800, FH = 400;           // playing surface
  var R = 12;                       // ball radius
  var RAIL = 26;                    // wood + cushion thickness around the surface
  var TW = FW + 2 * RAIL, TH = FH + 2 * RAIL;
  var HEAD = { x: 200, y: 200 }, FOOT = { x: 600, y: 200 };
  var MOUTH_C = 30;                 // half-width of corner pocket openings along a wall
  var MOUTH_S = 26;                 // half-width of side pocket openings
  var POCKETS = [
    { x: -4, y: -4, r: 27 }, { x: FW + 4, y: -4, r: 27 },
    { x: -4, y: FH + 4, r: 27 }, { x: FW + 4, y: FH + 4, r: 27 },
    { x: FW / 2, y: -9, r: 23 }, { x: FW / 2, y: FH + 9, r: 23 }
  ];

  /* ---------- physics ---------- */

  var DT = 1 / 240;                 // fixed physics step (s)
  var MAX_STEPS = 12;               // safety cap per frame
  var DECEL = 400;                  // rolling friction (units/s^2)
  var DRAG = 0.35;                  // small speed-proportional drag (1/s)
  var STOP = 6;                     // below this speed a ball stops
  var E_BALL = 0.96, E_WALL = 0.8;  // bounciness
  var MIN_V = 200, MAX_V = 1500;    // cue ball speed at 0% and 100% power
  var PULL = 70;                    // how far the cue draws back at full power
  var TAU = Math.PI * 2;

  var BALL_COLORS = ['#f4f4ff', '#ffd23f', '#3b82ff', '#ff4d6d', '#a855f7', '#ff8a3d', '#34d97a', '#9b2c4f', '#17151f'];
  function colorOf(n) { return n === 0 ? BALL_COLORS[0] : BALL_COLORS[n > 8 ? n - 8 : n]; }
  function groupOf(n) { return n === 0 ? null : (n === 8 ? 'eight' : (n < 8 ? 'solid' : 'stripe')); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function ease(t) { return t < 0 ? 0 : (t > 1 ? 1 : t * t * (3 - 2 * t)); }
  function shuffle(a) {
    var i, j, t;
    for (i = a.length - 1; i > 0; i--) { j = rand(i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.2; }

  var ICON = {
    rows: [
      '....bbbbb....',
      '..bhbbbbbbb..',
      '.bbbbbbbbbbb.',
      '.bbbbwwwbbbb.',
      'bbbbwbbbwbbbb',
      'bbbwwbwbwwbbb',
      'bbbwwbbbwwbbb',
      'bbbwwbwbwwbbb',
      'bbbbwbbbwbbbb',
      'bbbbbwwwbbbbb',
      '.bbbbbbbbbbb.',
      '..bbbbbbbbb..',
      '....bbbbb....'
    ],
    palette: { b: '#3a3870', h: '#a3a1c2', w: '#eef0ff' }
  };

  GameHub.register({
    id: 'pool',
    name: '8-BALL POOL',
    tagline: 'Vs CPU or a friend.',
    category: 'Sports',
    accent: '#ff2ec4',
    scoreKey: 'wins',
    scoreLabel: 'WINS',
    instructions: 'Landscape game. Drag on the table to aim, pull the power bar down and let go to shoot.',
    icon: ICON,

    start: function (container, api) {
      var el = api.el;
      var store = api.store;

      /* ---------- state ---------- */

      var dead = false, raf = null, last = 0, clock = 0, acc = 0;
      var mode = 'cpu', difficulty = store.get('difficulty', 'normal');
      if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') { difficulty = 'normal'; }
      var phase = 'menu';
      var balls = [], players = [{ group: null }, { group: null }];
      var turn = 0, isBreak = true, ballInHand = false;
      var aim = 0, power = 0, kbPower = 0.5;
      var shot = null, strokeT0 = 0, strokePower = 0, ai = null, aiPlaceT0 = 0;
      var landscape = true;
      var k = 1, dpr = 1, cw = 0, ch = 0;           // render scale: table units -> backing pixels
      var tableCv = null, sprites = [];
      var toastTimer = null;
      var guide = { t: 0, hit: -1, gx: 0, gy: 0 };

      /* ---------- DOM ---------- */

      var exitBtn = el('button', { class: 'btn small', type: 'button', text: 'EXIT', onclick: function () { api.exit(); } });
      var menuBtn = el('button', { class: 'btn small', type: 'button', text: 'MENU', onclick: function () { openMenu(); } });
      var trays = [[], []];
      function makeTray(i) {
        var box = el('div', { class: 'tray' }), s, cv;
        for (s = 0; s < 8; s++) {
          cv = el('canvas', { width: 28, height: 28 });
          trays[i].push(cv);
          box.appendChild(cv);
        }
        return box;
      }
      var nameEls = [el('span', { class: 'pname', text: 'P1' }), el('span', { class: 'pname', text: 'P2' })];
      var p0 = el('div', { class: 'pl' }, [nameEls[0], makeTray(0)]);
      var p1 = el('div', { class: 'pl' }, [nameEls[1], makeTray(1)]);
      var statusEl = el('div', { class: 'status', text: '' });
      var hud = el('div', { class: 'hud' }, [exitBtn, p0, statusEl, p1, menuBtn]);

      var dialLbl = el('div', { class: 'lbl', text: 'FINE' });
      var dial = el('div', { class: 'dial' });
      var okBtn = el('button', { class: 'btn primary ok hidden', type: 'button', text: 'OK', onclick: confirmPlace });
      var left = el('div', { class: 'side left' }, [dialLbl, dial, okBtn]);

      var canvas = el('canvas', { class: 'table' });
      var ctx = canvas.getContext('2d');
      var toastEl = el('div', { class: 'toast' });
      var tableWrap = el('div', { class: 'tablewrap' }, [canvas, toastEl]);

      var powerFill = el('div', { class: 'pfill' });
      var powerBar = el('div', { class: 'pbar' }, [powerFill]);
      var powerLbl = el('div', { class: 'lbl', text: 'POWER' });
      var right = el('div', { class: 'side right' }, [powerLbl, powerBar]);

      var main = el('div', { class: 'main' }, [left, tableWrap, right]);

      var diffBtns = {};
      var diffRow = el('div', { class: 'row' });
      ['easy', 'normal', 'hard'].forEach(function (d) {
        diffBtns[d] = el('button', { class: 'btn small chip', type: 'button', text: d.toUpperCase(), onclick: function () { setDifficulty(d); } });
        diffRow.appendChild(diffBtns[d]);
      });
      var menu = el('div', { class: 'overlay hidden' }, [
        el('h2', { text: '8-BALL POOL' }),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn primary', type: 'button', text: 'VS COMPUTER', onclick: function () { newGame('cpu'); } }),
          el('button', { class: 'btn primary', type: 'button', text: '2 PLAYERS', onclick: function () { newGame('two'); } })
        ]),
        el('p', { text: 'Computer level' }),
        diffRow,
        el('div', { class: 'row' }, [el('button', { class: 'btn small', type: 'button', text: 'EXIT TO HUB', onclick: function () { api.exit(); } })])
      ]);

      var overTitle = el('h2'), overMsg = el('p');
      var over = el('div', { class: 'overlay hidden' }, [
        overTitle, overMsg,
        el('div', { class: 'row' }, [
          el('button', { class: 'btn primary', type: 'button', text: 'REMATCH', onclick: function () { newGame(mode); } }),
          el('button', { class: 'btn', type: 'button', text: 'MENU', onclick: function () { openMenu(); } })
        ])
      ]);

      var rotate = el('div', { class: 'overlay rotate hidden' }, [
        el('div', { class: 'phone', html: GameHub.pixelIcon([
          '..aaaaaaaa..', '..a......a..', '..a......a..', '..a......a..', '..a......a..',
          '..a......a..', '..a......a..', '..a......a..', '..a......a..', '..aaaaaaaa..'
        ], { a: '#eef0ff' }) }),
        el('h2', { text: 'ROTATE YOUR PHONE' }),
        el('p', { text: 'Pool is played in landscape.' }),
        el('div', { class: 'row' }, [el('button', { class: 'btn small', type: 'button', text: 'EXIT', onclick: function () { api.exit(); } })])
      ]);

      var root = el('div', { class: 'gpool' }, [hud, main, menu, over, rotate]);
      container.appendChild(root);

      /* ---------- sizing + cached art ---------- */

      function fit() {
        var W = root.clientWidth, H = root.clientHeight;
        var hudH = hud.offsetHeight, sideL = 56, sideR = 64, pad = 6;
        var availW = W - sideL - sideR - pad * 2, availH = H - hudH - pad * 2;
        var s, i;
        landscape = W > H;
        s = Math.min(availW / TW, availH / TH);
        if (!(s > 0.1)) { s = 0.1; }
        cw = Math.floor(TW * s);
        ch = Math.floor(TH * s);
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        k = canvas.width / TW;
        left.style.height = ch + 'px';
        right.style.height = ch + 'px';
        main.style.height = (H - hudH) + 'px';
        buildTable();
        sprites = [];
        for (i = 0; i < 16; i++) { sprites.push(makeBallSprite(i)); }
        rotate.className = landscape ? 'overlay rotate hidden' : 'overlay rotate';
        drawTrays();
      }

      function buildTable() {
        var g, x, y, i, p;
        tableCv = document.createElement('canvas');
        tableCv.width = canvas.width;
        tableCv.height = canvas.height;
        g = tableCv.getContext('2d');
        g.scale(k, k);

        g.fillStyle = '#4a2f17';                        // wood
        g.fillRect(0, 0, TW, TH);
        g.fillStyle = '#7a5128';
        g.fillRect(0, 0, TW, 3); g.fillRect(0, 0, 3, TH);
        g.fillStyle = '#2c1a0a';
        g.fillRect(0, TH - 3, TW, 3); g.fillRect(TW - 3, 0, 3, TH);

        g.translate(RAIL, RAIL);                        // from here on: table units, origin at the surface

        g.fillStyle = '#0e7d5f';                        // cloth
        g.fillRect(0, 0, FW, FH);
        g.fillStyle = 'rgba(255,255,255,0.035)';        // pixel-checker texture
        for (y = 0; y < FH; y += 10) {
          for (x = 0; x < FW; x += 10) { if (((x + y) / 10) % 2 === 0) { g.fillRect(x, y, 10, 10); } }
        }
        g.strokeStyle = 'rgba(255,255,255,0.14)';       // head string
        g.lineWidth = 1.5;
        g.setLineDash ? g.setLineDash([6, 6]) : null;
        g.beginPath(); g.moveTo(HEAD.x, 8); g.lineTo(HEAD.x, FH - 8); g.stroke();
        g.setLineDash ? g.setLineDash([]) : null;
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(HEAD.x - 2, HEAD.y - 2, 4, 4);
        g.fillRect(FOOT.x - 2, FOOT.y - 2, 4, 4);

        g.fillStyle = '#0a5e48';                        // cushions (they sit outside the surface edge)
        g.fillRect(MOUTH_C, -10, FW / 2 - MOUTH_S - MOUTH_C, 10);
        g.fillRect(FW / 2 + MOUTH_S, -10, FW / 2 - MOUTH_S - MOUTH_C, 10);
        g.fillRect(MOUTH_C, FH, FW / 2 - MOUTH_S - MOUTH_C, 10);
        g.fillRect(FW / 2 + MOUTH_S, FH, FW / 2 - MOUTH_S - MOUTH_C, 10);
        g.fillRect(-10, MOUTH_C, 10, FH - 2 * MOUTH_C);
        g.fillRect(FW, MOUTH_C, 10, FH - 2 * MOUTH_C);
        g.fillStyle = '#12a07a';                        // cushion nose
        g.fillRect(MOUTH_C, -2, FW / 2 - MOUTH_S - MOUTH_C, 2);
        g.fillRect(FW / 2 + MOUTH_S, -2, FW / 2 - MOUTH_S - MOUTH_C, 2);
        g.fillRect(MOUTH_C, FH, FW / 2 - MOUTH_S - MOUTH_C, 2);
        g.fillRect(FW / 2 + MOUTH_S, FH, FW / 2 - MOUTH_S - MOUTH_C, 2);
        g.fillRect(-2, MOUTH_C, 2, FH - 2 * MOUTH_C);
        g.fillRect(FW, MOUTH_C, 2, FH - 2 * MOUTH_C);

        g.fillStyle = '#ffb703';                        // rail diamonds
        for (i = 1; i < 8; i++) {
          if (i === 4) { continue; }
          diamond(g, FW * i / 8, -18); diamond(g, FW * i / 8, FH + 18);
        }
        for (i = 1; i < 4; i++) { diamond(g, -18, FH * i / 4); diamond(g, FW + 18, FH * i / 4); }

        for (i = 0; i < POCKETS.length; i++) {          // pockets
          p = POCKETS[i];
          g.fillStyle = '#050308';
          g.beginPath(); g.arc(p.x, p.y, p.r - 1, 0, TAU); g.fill();
          g.strokeStyle = '#c9a45c';
          g.lineWidth = 2;
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.stroke();
        }
      }

      function diamond(g, x, y) {
        g.beginPath();
        g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y);
        g.closePath();
        g.fill();
      }

      /* One flat-shaded sprite per ball. The rolling number disc is drawn live on top (see drawBall). */
      function makeBallSprite(n) {
        var d = Math.ceil((2 * R + 4) * k);
        var cv = document.createElement('canvas'), g;
        cv.width = cv.height = d;
        g = cv.getContext('2d');
        g.scale(d / (2 * R + 4), d / (2 * R + 4));
        g.translate(R + 2, R + 2);
        g.fillStyle = n > 8 ? '#f4f4ff' : colorOf(n);
        g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        if (n > 8) {                                     // stripe band
          g.save();
          g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
          g.fillStyle = colorOf(n);
          g.fillRect(-R, -R * 0.52, 2 * R, R * 1.04);
          g.restore();
        }
        g.save();                                        // dark crescent: flat, pixel-art style shading
        g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
        g.fillStyle = 'rgba(0,0,0,0.32)';
        g.beginPath();
        g.rect(-R, -R, 2 * R, 2 * R);
        g.arc(-R * 0.28, -R * 0.28, R * 0.95, 0, TAU, true);
        g.fill('evenodd');
        g.restore();
        g.fillStyle = 'rgba(255,255,255,0.9)';           // square highlight
        g.fillRect(-R * 0.58, -R * 0.62, R * 0.3, R * 0.3);
        g.strokeStyle = 'rgba(0,0,0,0.65)';
        g.lineWidth = 1;
        g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
        return cv;
      }

      /* ---------- balls ---------- */

      function newBall(n) {
        var a = Math.random() * TAU, z = 0.55 + Math.random() * 0.4, rr = Math.sqrt(1 - z * z);
        return { n: n, x: 0, y: 0, vx: 0, vy: 0, on: true, pock: null, sx: Math.cos(a) * rr, sy: Math.sin(a) * rr, sz: z };
      }

      function rack() {
        var i, r, c, idx = 0, layout = new Array(15), solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15], pool = [], b;
        shuffle(solids); shuffle(stripes);
        layout[4] = 8;                                   // 8-ball in the middle of the triangle
        layout[10] = solids.pop();                       // back corners: one of each kind
        layout[14] = stripes.pop();
        pool = shuffle(solids.concat(stripes));
        for (i = 0; i < 15; i++) { if (layout[i] === undefined) { layout[i] = pool.pop(); } }

        balls = [newBall(0)];
        balls[0].x = HEAD.x; balls[0].y = HEAD.y;
        for (r = 0; r < 5; r++) {
          for (c = 0; c <= r; c++) {
            b = newBall(layout[idx++]);
            b.x = FOOT.x + r * (2 * R * 0.866 + 0.4);
            b.y = FOOT.y + (c - r / 2) * (2 * R + 0.4);
            balls[b.n] = b;
          }
        }
      }

      function onTable(n) { return balls[n].on; }

      function ownLeft(group) {
        var n, c = 0;
        for (n = 1; n <= 15; n++) { if (n !== 8 && groupOf(n) === group && balls[n].on) { c++; } }
        return c;
      }

      /* First-contact targets that are legal for this player right now. */
      function legalTargets(p) {
        var g = players[p].group, out = [], n;
        if (g && ownLeft(g) === 0) { return [8]; }
        for (n = 1; n <= 15; n++) {
          if (!balls[n].on || n === 8) { continue; }
          if (!g || groupOf(n) === g) { out.push(n); }
        }
        return out.length ? out : [8];
      }

      /* ---------- physics ---------- */

      function roll(b, dx, dy) {
        var d = Math.sqrt(dx * dx + dy * dy), th, kx, ky, c, s, dot, len, vx, vy, vz;
        if (d <= 0) { return; }
        th = d / R; kx = -dy / d; ky = dx / d; c = Math.cos(th); s = Math.sin(th);
        vx = b.sx; vy = b.sy; vz = b.sz;
        dot = kx * vx + ky * vy;
        b.sx = vx * c + ky * vz * s + kx * dot * (1 - c);
        b.sy = vy * c - kx * vz * s + ky * dot * (1 - c);
        b.sz = vz * c + (kx * vy - ky * vx) * s;
        len = Math.sqrt(b.sx * b.sx + b.sy * b.sy + b.sz * b.sz) || 1;
        b.sx /= len; b.sy /= len; b.sz /= len;
      }

      function pocketBall(b, p) {
        b.on = false;
        b.vx = b.vy = 0;
        b.pock = { t0: clock, x0: b.x, y0: b.y, px: p.x, py: p.y, done: false };
        if (shot) {
          shot.pocketed.push(b.n);
          if (b.n === 0) { shot.cueIn = true; }
        }
      }

      function railHit(b) {
        if (shot && shot.firstHit !== -1 && Math.abs(b.vx) + Math.abs(b.vy) > 20) { shot.rail = true; }
      }

      function physics(dt) {
        var i, j, a, b, sp, ns, f, dx, dy, d2, d, nx, ny, vn, imp, over2, mx, my, p;

        for (i = 0; i < 16; i++) {
          b = balls[i];
          if (!b.on) { continue; }
          sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          if (sp === 0) { continue; }
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          roll(b, b.vx * dt, b.vy * dt);
          ns = (sp - DECEL * dt) * (1 - DRAG * dt);
          if (ns < STOP) { b.vx = 0; b.vy = 0; } else { f = ns / sp; b.vx *= f; b.vy *= f; }
        }

        for (i = 0; i < 16; i++) {
          a = balls[i];
          if (!a.on) { continue; }
          for (j = i + 1; j < 16; j++) {
            b = balls[j];
            if (!b.on) { continue; }
            dx = b.x - a.x; dy = b.y - a.y;
            d2 = dx * dx + dy * dy;
            if (d2 >= 4 * R * R || d2 === 0) { continue; }
            d = Math.sqrt(d2);
            nx = dx / d; ny = dy / d;
            over2 = (2 * R - d) / 2;                     // push apart
            a.x -= nx * over2; a.y -= ny * over2;
            b.x += nx * over2; b.y += ny * over2;
            vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (vn > 0) {                                // equal masses: swap the normal components
              imp = (1 + E_BALL) * 0.5 * vn;
              a.vx -= imp * nx; a.vy -= imp * ny;
              b.vx += imp * nx; b.vy += imp * ny;
              if (shot && shot.firstHit === -1) {
                if (i === 0) { shot.firstHit = j; } else if (j === 0) { shot.firstHit = i; }
              }
            }
          }
        }

        for (i = 0; i < 16; i++) {
          b = balls[i];
          if (!b.on) { continue; }
          mx = b.x < MOUTH_C || b.x > FW - MOUTH_C || Math.abs(b.x - FW / 2) < MOUTH_S;   // inside a pocket opening
          my = b.y < MOUTH_C || b.y > FH - MOUTH_C;
          if (b.y < R && !mx) { b.y = R; b.vy = -b.vy * E_WALL; b.vx *= 0.985; railHit(b); }
          else if (b.y > FH - R && !mx) { b.y = FH - R; b.vy = -b.vy * E_WALL; b.vx *= 0.985; railHit(b); }
          if (b.x < R && !my) { b.x = R; b.vx = -b.vx * E_WALL; b.vy *= 0.985; railHit(b); }
          else if (b.x > FW - R && !my) { b.x = FW - R; b.vx = -b.vx * E_WALL; b.vy *= 0.985; railHit(b); }

          for (j = 0; j < POCKETS.length; j++) {
            p = POCKETS[j];
            dx = b.x - p.x; dy = b.y - p.y;
            if (dx * dx + dy * dy < p.r * p.r) { pocketBall(b, p); break; }
          }
          if (b.on && (b.x < -3 || b.x > FW + 3 || b.y < -3 || b.y > FH + 3)) {    // slipped out through a mouth
            p = POCKETS[0];
            for (j = 1; j < POCKETS.length; j++) {
              if (Math.abs(POCKETS[j].x - b.x) + Math.abs(POCKETS[j].y - b.y) < Math.abs(p.x - b.x) + Math.abs(p.y - b.y)) { p = POCKETS[j]; }
            }
            pocketBall(b, p);
          }
        }
      }

      function settled() {
        var i, b;
        for (i = 0; i < 16; i++) {
          b = balls[i];
          if (b.on && (b.vx !== 0 || b.vy !== 0)) { return false; }
          if (b.pock && !b.pock.done) { return false; }
        }
        return true;
      }

      /* ---------- game flow ---------- */

      function names() { return mode === 'cpu' ? ['YOU', 'CPU'] : ['P1', 'P2']; }
      function isCpu(p) { return mode === 'cpu' && p === 1; }

      function newGame(m) {
        mode = m;
        rack();
        players = [{ group: null }, { group: null }];
        turn = 0;
        isBreak = true;
        ballInHand = false;
        shot = null;
        ai = null;
        power = 0;
        aim = 0;
        phase = 'aim';
        menu.className = 'overlay hidden';
        over.className = 'overlay hidden';
        nameEls[0].textContent = names()[0];
        nameEls[1].textContent = names()[1];
        toast(names()[0] + ' BREAKS!', 1400);
        updateHud();
      }

      function openMenu() {
        phase = 'menu';
        over.className = 'overlay hidden';
        menu.className = 'overlay';
        okBtn.className = 'btn primary ok hidden';
        refreshDiff();
        updateHud();
      }

      function setDifficulty(d) {
        difficulty = d;
        store.set('difficulty', d);
        refreshDiff();
      }
      function refreshDiff() {
        var d;
        for (d in diffBtns) {
          if (Object.prototype.hasOwnProperty.call(diffBtns, d)) { diffBtns[d].className = 'btn small chip' + (d === difficulty ? ' on' : ''); }
        }
      }

      function toast(text, ms) {
        toastEl.textContent = text;
        toastEl.className = 'toast show';
        if (toastTimer) { clearTimeout(toastTimer); }
        toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, ms || 1500);
      }

      function startShot(p) {
        strokePower = p;
        phase = 'shoot';
        strokeT0 = -1;
        okBtn.className = 'btn primary ok hidden';
      }

      function launch() {
        var cue = balls[0], v = MIN_V + (MAX_V - MIN_V) * strokePower;
        shot = {
          firstHit: -1, pocketed: [], cueIn: false, rail: false,
          legal: legalTargets(turn),
          ownLeftBefore: players[turn].group ? ownLeft(players[turn].group) : -1,
          groupBefore: players[turn].group
        };
        cue.vx = Math.cos(aim) * v;
        cue.vy = Math.sin(aim) * v;
        power = 0;
        acc = 0;
        phase = 'roll';
        updateHud();
      }

      function respotEight() {
        var b = balls[8], x = FOOT.x, y = FOOT.y, tries = 0, i, clear;
        do {
          clear = true;
          for (i = 0; i < 16; i++) {
            if (i !== 8 && balls[i].on && Math.abs(balls[i].x - x) < 2 * R && Math.abs(balls[i].y - y) < 2 * R) { clear = false; }
          }
          if (!clear) { x += 2 * R + 1; }
          tries++;
        } while (!clear && tries < 8);
        b.on = true; b.pock = null; b.x = x; b.y = y; b.vx = b.vy = 0;
      }

      function endShot() {
        var s = shot, me = players[turn], opp = players[1 - turn];
        var foul = false, why = '', made = [], i, assigned = false, keep = false, eightIn, legalEight, n;

        if (s.cueIn) { foul = true; why = 'SCRATCH'; }
        else if (s.firstHit === -1) { foul = true; why = 'MISSED EVERYTHING'; }
        else if (s.legal.indexOf(s.firstHit) < 0) { foul = true; why = 'WRONG BALL FIRST'; }
        else if (!s.pocketed.length && !s.rail) { foul = true; why = 'NO RAIL AFTER CONTACT'; }

        eightIn = s.pocketed.indexOf(8) >= 0;
        if (eightIn && isBreak) {                        // 8 on the break is spotted again
          respotEight();
          eightIn = false;
        }
        if (eightIn) {
          legalEight = !foul && s.groupBefore && s.ownLeftBefore === 0;
          gameOver(legalEight ? turn : 1 - turn,
            legalEight ? 'SANK THE 8 BALL' : (foul ? 'FOUL ON THE 8 BALL (' + why + ')' : '8 BALL SUNK TOO EARLY'));
          return;
        }

        for (i = 0; i < s.pocketed.length; i++) { n = s.pocketed[i]; if (n !== 0 && n !== 8) { made.push(n); } }

        if (!foul && !me.group && !isBreak && made.length) {      // first legal pot on an open table picks the groups
          me.group = made[0] < 8 ? 'solid' : 'stripe';
          opp.group = me.group === 'solid' ? 'stripe' : 'solid';
          assigned = true;
        }

        if (!foul) {
          if (isBreak) { keep = made.length > 0; }
          else if (assigned) { keep = true; }
          else if (me.group) {
            for (i = 0; i < made.length; i++) { if (groupOf(made[i]) === me.group) { keep = true; } }
          }
        }

        isBreak = false;

        if (s.cueIn) {                                   // cue ball comes back; the next player places it
          balls[0].on = true; balls[0].pock = null;
          balls[0].x = HEAD.x; balls[0].y = HEAD.y; balls[0].vx = balls[0].vy = 0;
        }

        if (foul) {
          turn = 1 - turn;
          ballInHand = true;
          toast('FOUL: ' + why, 1900);
        } else if (!keep) {
          turn = 1 - turn;
          ballInHand = false;
        } else {
          ballInHand = false;
          if (assigned) { toast(names()[turn] + ' = ' + (me.group === 'solid' ? 'SOLIDS' : 'STRIPES'), 1700); }
        }

        shot = null;
        ai = null;
        aiPlaceT0 = 0;
        power = 0;
        if (ballInHand) { phase = 'place'; if (!isCpu(turn)) { okBtn.className = 'btn primary ok'; } }
        else { phase = 'aim'; pointAimAtTarget(); }
        updateHud();
      }

      function gameOver(winner, reason) {
        phase = 'over';
        shot = null;
        okBtn.className = 'btn primary ok hidden';
        if (mode === 'cpu' && winner === 0) { store.set('wins', store.get('wins', 0) + 1); }
        overTitle.textContent = (mode === 'cpu' ? (winner === 0 ? 'YOU WIN!' : 'CPU WINS') : names()[winner] + ' WINS!');
        overTitle.className = winner === 0 || mode === 'two' ? 'win' : 'lose';
        overMsg.textContent = reason;
        over.className = 'overlay';
        updateHud();
      }

      function pointAimAtTarget() {
        var t = legalTargets(turn), cue = balls[0], best = -1, bd = 1e9, i, d;
        if (isBreak) { aim = Math.atan2(FOOT.y - cue.y, FOOT.x - cue.x); return; }
        for (i = 0; i < t.length; i++) {
          d = Math.abs(balls[t[i]].x - cue.x) + Math.abs(balls[t[i]].y - cue.y);
          if (d < bd) { bd = d; best = t[i]; }
        }
        if (best > 0) { aim = Math.atan2(balls[best].y - cue.y, balls[best].x - cue.x); }
      }

      function confirmPlace() {
        if (phase !== 'place' || isCpu(turn)) { return; }
        okBtn.className = 'btn primary ok hidden';
        phase = 'aim';
        pointAimAtTarget();
        updateHud();
      }

      /* ---------- HUD ---------- */

      function updateHud() {
        var nm = names(), g, txt = '';
        nameEls[0].className = 'pname' + (turn === 0 && phase !== 'menu' ? ' on' : '');
        nameEls[1].className = 'pname' + (turn === 1 && phase !== 'menu' ? ' on' : '');
        if (phase === 'menu' || phase === 'over') { txt = ''; }
        else if (phase === 'place') { txt = nm[turn] + ': PLACE THE CUE BALL' + (isCpu(turn) ? '' : ', THEN OK'); }
        else {
          g = players[turn].group;
          txt = nm[turn] + (g ? ' - ' + (ownLeft(g) === 0 ? 'SHOOT THE 8' : (g === 'solid' ? 'SOLIDS' : 'STRIPES')) : ' - OPEN TABLE');
        }
        statusEl.textContent = txt;
        drawTrays();
      }

      function drawTrays() {
        var i, s, g, cv, c2, nums, n, alive;
        for (i = 0; i < 2; i++) {
          g = players[i].group;
          nums = g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : (g === 'stripe' ? [9, 10, 11, 12, 13, 14, 15] : null);
          for (s = 0; s < 8; s++) {
            cv = trays[i][s];
            c2 = cv.getContext('2d');
            c2.clearRect(0, 0, 28, 28);
            n = s === 7 ? 8 : (nums ? nums[s] : 0);
            if (!nums && s < 7) {                        // group not decided yet: empty slots
              c2.fillStyle = 'rgba(255,255,255,0.12)';
              c2.fillRect(9, 9, 10, 10);
              continue;
            }
            alive = balls.length ? balls[n].on : true;
            c2.globalAlpha = alive ? 1 : 0.22;
            if (sprites[n]) { c2.drawImage(sprites[n], 0, 0, 28, 28); }
            c2.globalAlpha = 1;
          }
        }
      }

      /* ---------- aiming helpers ---------- */

      /* Where the cue ball's line first meets a ball or a cushion. Results go into `guide`. */
      function castAim(ox, oy, a) {
        var dx = Math.cos(a), dy = Math.sin(a), bt = 1e9, hit = -1, i, b, fx, fy, proj, d2, t, tw = 1e9;
        for (i = 1; i < 16; i++) {
          b = balls[i];
          if (!b.on) { continue; }
          fx = b.x - ox; fy = b.y - oy;
          proj = fx * dx + fy * dy;
          if (proj <= 0) { continue; }
          d2 = fx * fx + fy * fy - proj * proj;
          if (d2 >= 4 * R * R) { continue; }
          t = proj - Math.sqrt(4 * R * R - d2);
          if (t < bt) { bt = t; hit = i; }
        }
        if (dx > 0.0001) { tw = Math.min(tw, (FW - R - ox) / dx); } else if (dx < -0.0001) { tw = Math.min(tw, (R - ox) / dx); }
        if (dy > 0.0001) { tw = Math.min(tw, (FH - R - oy) / dy); } else if (dy < -0.0001) { tw = Math.min(tw, (R - oy) / dy); }
        if (hit >= 0 && bt < tw) { guide.t = bt; guide.hit = hit; }
        else { guide.t = Math.max(0, tw); guide.hit = -1; }
        guide.gx = ox + dx * guide.t;
        guide.gy = oy + dy * guide.t;
        return guide;
      }

      function placeCue(x, y) {
        var c = balls[0], i, b, dx, dy, d, pass;
        c.x = clamp(x, R, FW - R);
        c.y = clamp(y, R, FH - R);
        for (pass = 0; pass < 3; pass++) {               // slide out of any ball we landed on
          for (i = 1; i < 16; i++) {
            b = balls[i];
            if (!b.on) { continue; }
            dx = c.x - b.x; dy = c.y - b.y;
            d = Math.sqrt(dx * dx + dy * dy);
            if (d < 2 * R + 1) {
              if (d < 0.001) { dx = 1; dy = 0; d = 1; }
              c.x = b.x + dx / d * (2 * R + 1.5);
              c.y = b.y + dy / d * (2 * R + 1.5);
              c.x = clamp(c.x, R, FW - R);
              c.y = clamp(c.y, R, FH - R);
            }
          }
        }
      }

      /* ---------- computer opponent ---------- */

      function segDist(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t, cx, cy;
        if (l2 === 0) { return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay)); }
        t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
        cx = ax + dx * t; cy = ay + dy * t;
        return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
      }

      function pathClear(ax, ay, bx, by, skipA, skipB) {
        var i, b;
        for (i = 0; i < 16; i++) {
          b = balls[i];
          if (!b.on || i === skipA || i === skipB) { continue; }
          if (segDist(b.x, b.y, ax, ay, bx, by) < 2 * R - 1) { return false; }
        }
        return true;
      }

      /* Best pot from a cue position: aim through the "ghost ball" behind a target, towards a pocket. */
      function bestShotFrom(cx, cy, targets) {
        var best = null, bs = -1e9, ti, pi, t, p, dx, dy, dl, gx, gy, cgx, cgy, cgl, cosv, dTP, score, v0, need;
        for (ti = 0; ti < targets.length; ti++) {
          t = balls[targets[ti]];
          for (pi = 0; pi < POCKETS.length; pi++) {
            p = POCKETS[pi];
            dx = p.x - t.x; dy = p.y - t.y; dl = Math.sqrt(dx * dx + dy * dy);
            dx /= dl; dy /= dl;
            gx = t.x - dx * 2 * R; gy = t.y - dy * 2 * R;
            if (gx < R || gx > FW - R || gy < R || gy > FH - R) { continue; }
            cgx = gx - cx; cgy = gy - cy; cgl = Math.sqrt(cgx * cgx + cgy * cgy);
            if (cgl < 1) { continue; }
            cosv = (cgx / cgl) * dx + (cgy / cgl) * dy;  // 1 = dead straight, 0 = 90 degree cut
            if (cosv < 0.25) { continue; }
            if (!pathClear(cx, cy, gx, gy, 0, t.n)) { continue; }
            if (!pathClear(t.x, t.y, p.x, p.y, t.n, 0)) { continue; }
            dTP = dl;
            score = cosv * 60 - cgl * 0.02 - dTP * 0.04;
            if (score > bs) {
              bs = score;
              need = Math.sqrt(800 * dTP) * 1.18 / cosv;          // speed the cue ball needs at contact
              v0 = Math.sqrt(need * need + 800 * cgl);
              best = { angle: Math.atan2(cgy, cgx), power: clamp((v0 - MIN_V) / (MAX_V - MIN_V), 0.14, 1), score: score, target: t.n };
            }
          }
        }
        return best;
      }

      function aiPlanShot() {
        var cue = balls[0], targets = legalTargets(turn), plan, bi, bd = 1e9, d, i, sigma, pw;
        if (isBreak) {
          plan = { angle: Math.atan2(FOOT.y - cue.y, FOOT.x - cue.x), power: 0.97 };
        } else {
          plan = bestShotFrom(cue.x, cue.y, targets);
          if (!plan) {                                   // nothing to pot: tap the nearest legal ball
            for (i = 0; i < targets.length; i++) {
              d = Math.abs(balls[targets[i]].x - cue.x) + Math.abs(balls[targets[i]].y - cue.y);
              if (d < bd) { bd = d; bi = targets[i]; }
            }
            plan = { angle: Math.atan2(balls[bi].y - cue.y, balls[bi].x - cue.x), power: 0.4 };
          }
        }
        sigma = difficulty === 'easy' ? 0.07 : (difficulty === 'normal' ? 0.022 : 0.006);
        plan.angle += gauss() * sigma;
        pw = difficulty === 'easy' ? 0.12 : (difficulty === 'normal' ? 0.05 : 0.02);
        plan.power = clamp(plan.power * (1 + gauss() * pw), 0.1, 1);
        return plan;
      }

      /* Ball in hand: try a grid of spots and keep the one with the best available shot. */
      function aiPickSpot() {
        var targets = legalTargets(turn), cue = balls[0], x, y, i, ok, b, sh, bestSc = -1e9, bx = HEAD.x, by = HEAD.y;
        for (x = 40; x < FW - 20; x += 40) {
          for (y = 40; y < FH - 20; y += 40) {
            ok = true;
            for (i = 1; i < 16; i++) {
              b = balls[i];
              if (b.on && Math.abs(b.x - x) < 2 * R + 2 && Math.abs(b.y - y) < 2 * R + 2) { ok = false; break; }
            }
            if (!ok) { continue; }
            sh = bestShotFrom(x, y, targets);
            if (sh && sh.score + Math.random() * 3 > bestSc) { bestSc = sh.score + Math.random() * 3; bx = x; by = y; }
          }
        }
        cue.vx = cue.vy = 0;
        placeCue(bx, by);
      }

      function runAi() {
        var t, e;
        if (phase === 'place') {
          if (!aiPlaceT0) { aiPlaceT0 = clock; }
          if (clock - aiPlaceT0 > 900) {
            aiPickSpot();
            phase = 'aim';
            ai = null;
            updateHud();
          }
          return;
        }
        if (!ai) { ai = { t0: clock, from: aim, plan: aiPlanShot(), done: false }; }
        t = clock - ai.t0;
        if (t < 900) {                                   // swing the cue round to the target
          e = ease(t / 900);
          aim = ai.from + angleDiff(ai.from, ai.plan.angle) * e;
          power = 0;
        } else if (t < 1450) {                           // draw back
          aim = ai.plan.angle;
          power = ai.plan.power * ease((t - 900) / 550);
        } else if (!ai.done) {
          ai.done = true;
          aim = ai.plan.angle;
          startShot(ai.plan.power);
        }
      }

      function angleDiff(a, b) {
        var d = (b - a) % TAU;
        if (d > Math.PI) { d -= TAU; } else if (d < -Math.PI) { d += TAU; }
        return d;
      }

      /* ---------- drawing ---------- */

      function drawBall(b) {
        var x = b.x, y = b.y, sc = 1, u, half = R + 2, rr, px, py, ang, face;
        if (!b.on) {
          if (!b.pock || b.pock.done) { return; }
          u = (clock - b.pock.t0) / 260;
          if (u >= 1) { b.pock.done = true; return; }
          x = b.pock.x0 + (b.pock.px - b.pock.x0) * u;
          y = b.pock.y0 + (b.pock.py - b.pock.y0) * u;
          sc = 1 - 0.55 * u;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.arc(x + 2.5, y + 3.5, R * sc, 0, TAU); ctx.fill();
        ctx.drawImage(sprites[b.n], x - half * sc, y - half * sc, half * 2 * sc, half * 2 * sc);
        if (b.sz > 0.12) {                               // number disc, foreshortened as it rolls round the ball
          rr = (b.n === 0 ? 0.2 : 0.46) * R * sc;
          px = x + b.sx * R * sc; py = y + b.sy * R * sc;
          ang = Math.atan2(b.sy, b.sx);
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang);
          ctx.scale(b.sz, 1);
          ctx.fillStyle = b.n === 0 ? '#ff4d6d' : '#fdfdff';
          ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
          ctx.restore();
          face = b.n > 0 && b.sz > 0.72 && sc > 0.8;
          if (face) {
            ctx.fillStyle = '#17151f';
            ctx.font = 'bold ' + Math.round(R * 0.62) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(b.n), px, py + 0.5);
          }
        }
      }

      function dots(x0, y0, x1, y1, color, step) {
        var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy), n = Math.floor(len / step), i;
        ctx.fillStyle = color;
        for (i = 1; i <= n; i++) { ctx.fillRect(x0 + dx / n * i - 1.2, y0 + dy / n * i - 1.2, 2.4, 2.4); }
      }

      function drawGuide() {
        var c = balls[0], g = castAim(c.x, c.y, aim), o, nx, ny, dx, dy, cross, tx, ty, tl;
        dots(c.x, c.y, g.gx, g.gy, 'rgba(255,255,255,0.75)', 9);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(g.gx, g.gy, R, 0, TAU); ctx.stroke();
        if (g.hit > 0) {
          o = balls[g.hit];
          nx = o.x - g.gx; ny = o.y - g.gy;
          tl = Math.sqrt(nx * nx + ny * ny) || 1; nx /= tl; ny /= tl;
          dots(o.x, o.y, o.x + nx * 90, o.y + ny * 90, '#ffb703', 8);          // where the object ball goes
          dx = Math.cos(aim); dy = Math.sin(aim);
          cross = dx * ny - dy * nx;
          if (Math.abs(cross) > 0.06) {                                         // where the cue ball goes (no spin)
            tx = dx - (dx * nx + dy * ny) * nx; ty = dy - (dx * nx + dy * ny) * ny;
            tl = Math.sqrt(tx * tx + ty * ty) || 1;
            dots(g.gx, g.gy, g.gx + tx / tl * 55, g.gy + ty / tl * 55, '#05e6e6', 8);
          }
        }
      }

      function drawCue(pull) {
        var c = balls[0], gap = R + 4 + pull, len = 340;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(aim);
        ctx.fillStyle = '#eef0ff';                       // tip
        ctx.fillRect(-gap - 5, -2, 5, 4);
        ctx.fillStyle = '#05e6e6';                       // ferrule
        ctx.fillRect(-gap - 10, -2.2, 5, 4.4);
        ctx.fillStyle = '#ffd79a';                       // shaft, slightly tapered
        ctx.beginPath();
        ctx.moveTo(-gap - 10, -2.2); ctx.lineTo(-gap - len * 0.66, -3.4);
        ctx.lineTo(-gap - len * 0.66, 3.4); ctx.lineTo(-gap - 10, 2.2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff2ec4';                       // trim ring
        ctx.fillRect(-gap - len * 0.66, -3.6, 5, 7.2);
        ctx.fillStyle = '#7a4b1e';                       // butt
        ctx.beginPath();
        ctx.moveTo(-gap - len * 0.66 - 5, -3.6); ctx.lineTo(-gap - len, -5);
        ctx.lineTo(-gap - len, 5); ctx.lineTo(-gap - len * 0.66 - 5, 3.6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      function render() {
        var i, pull = 0, c = balls[0], mine;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(tableCv, 0, 0);
        if (!balls.length) { return; }
        ctx.setTransform(k, 0, 0, k, RAIL * k, RAIL * k);
        for (i = 15; i >= 0; i--) { if (i !== 0) { drawBall(balls[i]); } }
        drawBall(c);

        mine = !isCpu(turn);
        if (phase === 'aim' || phase === 'shoot') {
          if (phase === 'aim') { pull = power * PULL; }
          if (phase === 'shoot') {
            pull = strokePower * PULL * (1 - ease((clock - strokeT0) / 110));
          }
          if (phase === 'aim' && mine) { drawGuide(); }
          drawCue(pull);
        } else if (phase === 'place' && mine) {          // pulsing ring while the cue ball is being placed
          ctx.strokeStyle = 'rgba(255,183,3,' + (0.55 + 0.45 * Math.sin(clock / 120)) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(c.x, c.y, R + 4, 0, TAU); ctx.stroke();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      /* ---------- main loop ---------- */

      function frame(t) {
        var dt, steps = 0;
        raf = window.requestAnimationFrame(frame);
        dt = (t - last) / 1000;
        last = t;
        if (!(dt > 0)) { dt = 0; }
        if (dt > 0.05) { dt = 0.05; }
        clock = t;

        if (landscape && phase !== 'menu' && phase !== 'over') {
          if (phase === 'roll') {
            acc += dt;
            while (acc >= DT && steps < MAX_STEPS) { physics(DT); acc -= DT; steps++; }
            if (steps === MAX_STEPS) { acc = 0; }
            if (settled()) { endShot(); }
          } else if (phase === 'shoot') {
            if (strokeT0 < 0) { strokeT0 = t; }
            if (t - strokeT0 >= 110) { launch(); }
          } else if ((phase === 'aim' || phase === 'place') && isCpu(turn)) {
            runAi();
          }
        }
        if (!landscape) { last = t; }
        powerFill.style.height = (phase === 'aim' ? power * 100 : 0) + '%';
        render();
      }

      /* ---------- input ---------- */

      var mouseDrag = null;

      function bindDrag(elm, handlers) {
        var active = false;
        elm.addEventListener('touchstart', function (e) {
          e.preventDefault();
          if (e.touches.length !== 1) { return; }
          active = true;
          handlers.start(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });
        elm.addEventListener('touchmove', function (e) {
          e.preventDefault();
          if (active && e.touches.length === 1) { handlers.move(e.touches[0].clientX, e.touches[0].clientY); }
        }, { passive: false });
        elm.addEventListener('touchend', function (e) {
          e.preventDefault();
          if (!active) { return; }
          active = false;
          handlers.end(e.changedTouches[0].clientX, e.changedTouches[0].clientY, false);
        }, { passive: false });
        elm.addEventListener('touchcancel', function (e) {
          if (!active) { return; }
          active = false;
          handlers.end(0, 0, true);
        }, false);
        elm.addEventListener('mousedown', function (e) {
          handlers.start(e.clientX, e.clientY);
          mouseDrag = handlers;
        }, false);
      }

      function onDocMouseMove(e) { if (mouseDrag) { mouseDrag.move(e.clientX, e.clientY); } }
      function onDocMouseUp(e) {
        var h = mouseDrag;
        mouseDrag = null;
        if (h) { h.end(e.clientX, e.clientY, false); }
      }

      function humanTurn() { return !isCpu(turn) && landscape; }

      function toTable(clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: (clientX - rect.left) * (TW / rect.width) - RAIL,
          y: (clientY - rect.top) * (TH / rect.height) - RAIL
        };
      }

      function tableHandler(clientX, clientY) {
        var p = toTable(clientX, clientY), c = balls[0];
        if (!humanTurn()) { return; }
        if (phase === 'aim') {
          if (Math.abs(p.x - c.x) + Math.abs(p.y - c.y) > 12) { aim = Math.atan2(p.y - c.y, p.x - c.x); }
        } else if (phase === 'place') {
          placeCue(p.x, p.y);
        }
      }

      bindDrag(canvas, {
        start: tableHandler,
        move: tableHandler,
        end: function () {}
      });

      var dialY = 0;
      bindDrag(dial, {
        start: function (x, y) { dialY = y; },
        move: function (x, y) {
          if (humanTurn() && phase === 'aim') { aim += (y - dialY) * 0.0012; }
          dial.style.backgroundPosition = '0 ' + Math.round((y % 12)) + 'px';
          dialY = y;
        },
        end: function () {}
      });

      function powerFrom(y) {
        var rect = powerBar.getBoundingClientRect();
        return clamp((y - rect.top) / rect.height, 0, 1);
      }
      bindDrag(powerBar, {
        start: function (x, y) { if (humanTurn() && phase === 'aim') { power = powerFrom(y); } },
        move: function (x, y) { if (humanTurn() && phase === 'aim') { power = powerFrom(y); } },
        end: function (x, y, cancel) {
          var p = power;
          if (!humanTurn() || phase !== 'aim') { return; }
          if (cancel || p < 0.06) { power = 0; return; }
          startShot(p);
        }
      });

      function onKeyDown(e) {
        var key = e.key;
        if (!humanTurn() || phase !== 'aim') { return; }
        if (key === 'ArrowLeft') { aim -= 0.012; e.preventDefault(); }
        else if (key === 'ArrowRight') { aim += 0.012; e.preventDefault(); }
        else if (key === 'ArrowUp') { kbPower = clamp(kbPower + 0.05, 0.1, 1); power = kbPower; e.preventDefault(); }
        else if (key === 'ArrowDown') { kbPower = clamp(kbPower - 0.05, 0.1, 1); power = kbPower; e.preventDefault(); }
        else if (key === ' ' || key === 'Enter') { e.preventDefault(); startShot(power > 0.06 ? power : kbPower); }
      }

      // iOS Safari can report the old size right at "orientationchange", so measure again a moment later.
      function onResize() {
        fit();
        setTimeout(function () { if (!dead) { fit(); } }, 300);
      }
      function stopTouch(e) { e.preventDefault(); }

      document.addEventListener('mousemove', onDocMouseMove, false);
      document.addEventListener('mouseup', onDocMouseUp, false);
      document.addEventListener('keydown', onKeyDown, false);
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      root.addEventListener('touchmove', stopTouch, { passive: false });   // no page rubber-banding behind the game

      /* ---------- boot ---------- */

      rack();                                            // so the table shows behind the menu
      fit();
      refreshDiff();
      openMenu();
      raf = window.requestAnimationFrame(function (t) { last = t; frame(t); });

      return {
        destroy: function () {
          dead = true;
          if (raf !== null) { window.cancelAnimationFrame(raf); raf = null; }
          if (toastTimer) { clearTimeout(toastTimer); }
          document.removeEventListener('mousemove', onDocMouseMove, false);
          document.removeEventListener('mouseup', onDocMouseUp, false);
          document.removeEventListener('keydown', onKeyDown, false);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('orientationchange', onResize);
        }
      };
    }
  });
})();
