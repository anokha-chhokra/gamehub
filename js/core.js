/*
 * GameHub core: the game registry plus small helpers shared by every game.
 * ES5 on purpose (target: iPhone 6 Plus, Safari 12).
 *
 * A game registers itself with GameHub.register({...}); see README.md.
 */
(function (global) {
  'use strict';

  var games = [];
  var byId = {};

  /* el('div', {class: 'x', text: 'hi', onclick: fn}, [child, 'text']) */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    var key, val, i, c;
    attrs = attrs || {};
    for (key in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, key)) { continue; }
      val = attrs[key];
      if (val === null || val === undefined) { continue; }
      if (key === 'class') { node.className = val; }
      else if (key === 'text') { node.textContent = val; }
      else if (key === 'html') { node.innerHTML = val; }
      else if (key.indexOf('on') === 0 && typeof val === 'function') { node.addEventListener(key.slice(2), val); }
      else { node.setAttribute(key, val); }
    }
    if (children !== null && children !== undefined) {
      if (!Array.isArray(children)) { children = [children]; }
      for (i = 0; i < children.length; i++) {
        c = children[i];
        if (c === null || c === undefined) { continue; }
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  /* Per-game localStorage namespace: keys look like "gamehub.<id>.<key>". */
  function makeStore(id) {
    var prefix = 'gamehub.' + id + '.';
    return {
      get: function (key, fallback) {
        try {
          var raw = localStorage.getItem(prefix + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (key, value) {
        try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch (e) { /* private mode / full */ }
      },
      remove: function (key) {
        try { localStorage.removeItem(prefix + key); } catch (e) { /* ignore */ }
      }
    };
  }

  /*
   * Turn ASCII art into crisp SVG markup.
   *   rows:    ['aab', 'a.b']      one string per pixel row
   *   palette: { a: '#fff', b: '#f0f' }   '.' (or any unmapped char) = transparent
   */
  function pixelIcon(rows, palette) {
    var h = rows.length;
    var w = rows[0].length;
    var rects = '';
    var x, y, color;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        color = palette[rows[y].charAt(x)];
        if (color) {
          rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + color + '"/>';
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
      '" shape-rendering="crispEdges" aria-hidden="true">' + rects + '</svg>';
  }

  function register(def) {
    if (!def || !def.id || !def.name || typeof def.start !== 'function') {
      throw new Error('GameHub.register needs { id, name, start(container, api) }');
    }
    if (byId[def.id]) { throw new Error('GameHub: duplicate game id "' + def.id + '"'); }
    byId[def.id] = def;
    games.push(def);
  }

  global.GameHub = {
    register: register,
    list: function () { return games.slice(); },
    get: function (id) { return byId[id] || null; },
    el: el,
    pixelIcon: pixelIcon,
    makeStore: makeStore
  };
})(window);
