/*
 * GameHub app: draws the hub screen and routes between hub and games.
 * Routes are URL hashes: "#/" (or empty) = hub, "#/<game-id>" = that game.
 */
(function () {
  'use strict';

  var el = GameHub.el;

  var hubView = document.getElementById('hub');
  var playView = document.getElementById('play');
  var grid = document.getElementById('gameGrid');
  var stage = document.getElementById('stage');
  var playTitle = document.getElementById('playTitle');
  var howto = document.getElementById('howto');
  var backBtn = document.getElementById('backBtn');

  var running = null;      // { game, instance } while a game is open
  var cameFromHub = false; // true once we navigated hub -> game inside this page

  /* ---------- hub screen ---------- */

  var MARK = {
    rows: [
      '..bbbbbbbbb..',
      '.bbbbbbbbbbb.',
      'bbbwbbbbbmbbb',
      'bbwwwbbbmbcbb',
      'bbbwbbbbbcbbb',
      'bbbbbbbbbbbbb',
      '.bbb.....bbb.',
      '..bb.....bb..'
    ],
    palette: { b: '#8b5cf6', w: '#eef0ff', c: '#05e6e6', m: '#ff2ec4' }
  };

  var LOCKED_ICON = {
    rows: [
      '..aaaaa..',
      '.aa...aa.',
      '.aa...aa.',
      '.....aa..',
      '....aa...',
      '....aa...',
      '.........',
      '....aa...',
      '....aa...'
    ],
    palette: { a: '#716f95' }
  };

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function bestFor(game) {
    if (!game.scoreKey) { return null; }
    var v = GameHub.makeStore(game.id).get(game.scoreKey, 0);
    return v > 0 ? v : null;
  }

  function buildCard(game) {
    var best = bestFor(game);
    var card = el('a', { class: 'card', href: '#/' + game.id, 'data-game': game.id }, [
      el('div', { class: 'ico', html: game.icon ? GameHub.pixelIcon(game.icon.rows, game.icon.palette) : '' }),
      el('div', { class: 'name', text: game.name }),
      el('div', { class: 'tag', text: game.tagline || '' }),
      el('div', { class: 'meta' }, [
        el('span', { class: 'cat', text: (game.category || 'Game').toUpperCase() }),
        el('span', { class: 'best', text: best === null ? '' : 'BEST ' + best })
      ])
    ]);
    if (game.accent) { card.style.setProperty('--accent', game.accent); }
    return card;
  }

  function buildLockedCard() {
    return el('div', { class: 'card locked' }, [
      el('div', { class: 'ico', html: GameHub.pixelIcon(LOCKED_ICON.rows, LOCKED_ICON.palette) }),
      el('div', { class: 'name', text: '???' }),
      el('div', { class: 'tag', text: 'More games soon' }),
      el('div', { class: 'meta' }, [el('span', { class: 'cat', text: 'LOCKED' })])
    ]);
  }

  function renderHub() {
    var list = GameHub.list();
    var i;
    grid.innerHTML = '';
    for (i = 0; i < list.length; i++) { grid.appendChild(buildCard(list[i])); }
    grid.appendChild(buildLockedCard());
    document.getElementById('gameCount').textContent = pad2(list.length);
  }

  /* ---------- routing ---------- */

  function closeGame() {
    if (!running) { return; }
    try {
      if (running.instance && typeof running.instance.destroy === 'function') { running.instance.destroy(); }
    } catch (err) {
      if (window.console) { console.error('GameHub: destroy failed for ' + running.game.id, err); }
    }
    running = null;
    stage.innerHTML = '';
  }

  function showHub() {
    closeGame();
    playView.className = 'view hidden';
    hubView.className = 'view';
    document.title = 'GAMEHUB';
    renderHub();
    window.scrollTo(0, 0);
  }

  function openGame(game) {
    closeGame();
    hubView.className = 'view hidden';
    playView.className = 'view';
    playTitle.textContent = game.name;
    howto.textContent = game.instructions || '';
    document.title = game.name + ' - GAMEHUB';
    window.scrollTo(0, 0);

    var api = {
      el: GameHub.el,
      store: GameHub.makeStore(game.id),
      exit: goBack
    };
    var instance = null;
    try {
      instance = game.start(stage, api);
    } catch (err) {
      stage.appendChild(el('p', { class: 'howto', text: 'THIS GAME HIT A SNAG: ' + err.message }));
      if (window.console) { console.error('GameHub: start failed for ' + game.id, err); }
    }
    running = { game: game, instance: instance };
  }

  function route() {
    var m = /^#\/([\w-]+)/.exec(window.location.hash);
    var game = m ? GameHub.get(m[1]) : null;
    if (game) { openGame(game); } else { showHub(); }
  }

  function goBack() {
    if (cameFromHub && window.history.length > 1) { window.history.back(); }
    else { window.location.hash = '#/'; }
  }

  grid.addEventListener('click', function (e) {
    var node = e.target;
    while (node && node !== grid) {
      if (node.className && String(node.className).indexOf('card') !== -1 && node.getAttribute('data-game')) {
        cameFromHub = true;
        return;
      }
      node = node.parentNode;
    }
  });

  backBtn.addEventListener('click', goBack);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.key === 'Esc') && running) { goBack(); }
  });
  window.addEventListener('hashchange', route);

  document.getElementById('hubMark').innerHTML = GameHub.pixelIcon(MARK.rows, MARK.palette);

  route();
})();
