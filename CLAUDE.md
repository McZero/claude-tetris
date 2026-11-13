# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no `package.json`, no build, no lint, no tests. The README and UI text are in Spanish.

## Running

Open `index.html` directly, or serve statically (e.g. `python -m http.server 8000` and visit `http://localhost:8000`).

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, and `game.js` (all logic, loaded as a classic script with `'use strict'`; everything is global).

- `game.js` holds game state in module-level `let` variables (`board`, `current`, `next`, `score`, ...), reset by `init()`, which the restart button also calls.
- Board is a `ROWS×COLS` matrix of 0 or a color index (1–7); the same index selects the piece in `PIECES` and its color in `COLORS`. Keep those arrays aligned (index 0 is `null`).
- Piece lifecycle: `spawn()` promotes `next` to `current` and triggers `endGame()` if it collides immediately; `lockPiece()` = `merge()` → `clearLines()` → `spawn()`.
- The loop (`loop`, via `requestAnimationFrame`) only handles gravity timing and `draw()`; input is handled in the `keydown` listener. Pause cancels the animation frame and restarts `loop` on resume. `endGame()` also cancels it.
- Rotation is `rotateCW` plus horizontal-only kicks (`[0,-1,1,-2,2]`) in `tryRotate`.
- Canvas size is hardcoded in `index.html` (`board` 300×600 = `COLS×BLOCK` × `ROWS×BLOCK`; `next-canvas` 120×120). Changing `COLS`, `ROWS` or `BLOCK` requires updating those attributes.
- Speed: `max(100, 1000 - (level-1)*90)` ms, level = lines/10 + 1. Scoring uses `LINE_SCORES × level`, plus 1 point per soft-drop row and 2 per hard-drop row.
