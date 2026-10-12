# GameHub

A pocket arcade for the browser, built for the **iPhone 6 Plus** (414x736 viewport, iOS 12 / Safari 12). Plain HTML, CSS and JavaScript: no build step, no dependencies. The look is the 8-bit Neon Arcade theme (hard pixel edges, scanlines, Press Start 2P).

Games so far: **2048**, **Snake**, **Jewel Quest**.

## Running it

Open `index.html`, or serve the folder:

```bash
python -m http.server 5174
```

Then visit `http://localhost:5174`. On the phone, use the machine's LAN address and **Share > Add to Home Screen**.

The pixel fonts (Press Start 2P, VT323) load from Google Fonts. Offline, the app falls back to a monospace font and still works.

## Layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page shell. Lists every game's CSS and JS (see markers inside) |
| `css/hub.css` | Theme (colour variables, buttons, hub screen, play shell) |
| `js/core.js` | `GameHub` registry, DOM helper, per-game storage, pixel-icon helper |
| `js/app.js` | Hub screen and hash router (`#/` = hub, `#/<id>` = a game) |
| `games/<id>/<id>.js` | A game |
| `games/<id>/<id>.css` | That game's styles, scoped under its own class |

## Adding a game

1. Create `games/pong/pong.js` (and `pong.css` if it needs styles). `games/snake/` is a good real-time example (timer loop, swipe input, pause); `games/2048/` is a good turn-based one.
2. Register it:

   ```js
   GameHub.register({
     id: 'pong',                   // used in the URL (#/pong) and the storage key prefix
     name: 'PONG',
     tagline: 'Beat the CPU.',
     category: 'Arcade',
     accent: '#ff2ec4',            // card border / name colour
     scoreKey: 'best',             // optional: store key holding a number; shown on the hub card
     scoreLabel: 'BEST',           // optional: word shown before that number (default 'BEST')
     instructions: 'Drag to move your paddle.',
     icon: { rows: ['..aa..', '.aaaa.'], palette: { a: '#ff2ec4' } },  // ASCII pixel art, '.' = empty

     start: function (container, api) {
       // Build your UI inside `container`. Return an object with destroy().
       return { destroy: function () { /* remove listeners, clear timers */ } };
     }
   });
   ```

3. In `index.html`, add one `<link>` under **GAME STYLES** and one `<script>` under **GAMES**.

The hub card, the route, the Back button and the "More games soon" slot all update by themselves.

### What `start` receives

- `container`: an empty element to build into. The hub clears it when the game closes.
- `api.el(tag, attrs, children)`: DOM helper (`class`, `text`, `html`, `on<event>`, other attributes).
- `api.store.get(key, fallback)` / `.set(key, value)` / `.remove(key)`: JSON `localStorage` namespaced as `gamehub.<id>.<key>`. Safe if storage is blocked.
- `api.exit()`: go back to the hub.

### Rules of the road

- **Clean up in `destroy()`.** Remove `document`/`window` listeners and cancel timers and `requestAnimationFrame` loops, because the hub reuses the page.
- **Scope your CSS** under one class (`.g2048`, `.gsnake`) so games never collide. Reuse `.btn`, `.btn.primary` and the colour variables from `hub.css`.
- **Safari 12:** ES5-style JS (this codebase uses `var` and `function`; avoid `?.` and `??`), no flex `gap`, no `inset`, no `aspect-ratio`, no `clamp()`. Use `grid-gap`, `-webkit-` prefixes where Safari 12 needs them, and `touchmove` + `preventDefault()` (with `{ passive: false }`) to stop the page scrolling during swipes, since `touch-action: none` is not supported there.
- Keep tap targets at least 44px and the game within 414px wide.

## Jewel Quest notes

A match-3 adventure with 12 levels on a quest map. Swipe a jewel towards a neighbour (or tap two neighbours) to swap them; any swap that makes a line of 3+ is kept, otherwise it bounces back. Every jewel you clear turns the tile under it one step towards gold, and you win a level when every tile is gold. Later levels add armoured tiles (`2`) that need two matches.

- **Quest map:** levels unlock one at a time. Each cleared level shows 1-3 stars, based on how few moves you used (thresholds are the `STAR*` constants at the top of `jewelquest.js`).
- **Hint** highlights the swap that clears the most tiles that are not gold yet, which is the best help for stubborn corner tiles.
- If no legal swap is left, the board reshuffles itself.
- Progress is stored under `gamehub.jewelquest.progress`; the hub card shows how many levels you have cleared.
- **Adding or retuning levels:** edit `games/jewelquest/levels.js`. Each level is a name, a one-line story blurb, how many jewel kinds are in play (5-7), and an ASCII board (`#` one-match tile, `2` two-match tile, `.` hole). Keep boards at most 8 columns wide so cells stay at least 44px.
- **Test seam:** if `window.__jqDebug = {}` is set before the game opens, the game fills in `peek`, `move`, `allMoves`, `swap` and `open` on it so a script can play the game. It does nothing otherwise.

## Snake notes

- Swipe anywhere on the screen (turns chain without lifting your finger), or use arrow keys / WASD. Space or P pauses.
- Up to two turns are queued, so quick back-to-back turns are not lost. Reversing straight into yourself is ignored.
- Every 5 foods is a level and the snake speeds up (150 ms per step down to 70 ms).
- The game pauses itself when you switch apps or tabs. **Restart** asks for a second tap mid-run.

## 2048 notes

- Swipe the board, or use arrow keys / WASD. Merging is once per tile per move.
- The game autosaves after every move and resumes where you left off. **Best** score is stored separately.
- **Undo** reverses the last move (one step). **New Game** asks for a second tap so a stray tap can't wipe a game.
- Reaching 2048 offers **Keep going**.
