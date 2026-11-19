'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Índice 0 = null; los colores se leen de las variables CSS --piece-N (según el tema).
const COLORS = [null, '', '', '', '', '', '', ''];
let gridColor = '#22222e';
let highlightColor = 'rgba(255,255,255,0.12)';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

const MAX_START_LEVEL = 15;
let startLevel = 1; // nivel con el que empieza la próxima partida
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsEl = document.getElementById('records');
const recordsList = document.getElementById('records-list');
const recordsStats = document.getElementById('records-stats');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, bestCombo, pendingScore = null;

function intervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  // Combo = bloqueos consecutivos que limpian línea
  combo = cleared ? combo + 1 : 0;
  bestCombo = Math.max(bestCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalForLevel(level);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// Cada skin dibuja un bloque en (px, py) con lado `size` y color CSS `color`.
const SKINS = {
  retro(context, px, py, size, color) {
    context.fillStyle = color;
    context.fillRect(px + 1, py + 1, size - 2, size - 2);
    context.fillStyle = highlightColor;
    context.fillRect(px + 1, py + 1, size - 2, 4);
  },
  neon(context, px, py, size, color) {
    context.shadowColor = color;
    context.shadowBlur = 14;
    context.fillStyle = 'rgba(0,0,0,0.85)';
    context.fillRect(px + 3, py + 3, size - 6, size - 6);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(px + 3, py + 3, size - 6, size - 6);
    context.shadowBlur = 0;
    context.fillStyle = color;
    context.globalAlpha *= 0.35;
    context.fillRect(px + 6, py + 6, size - 12, size - 12);
  },
  pastel(context, px, py, size, color) {
    const r = size * 0.3;
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(px + 2, py + 2, size - 4, size - 4, r);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.35)';
    context.beginPath();
    context.roundRect(px + 5, py + 5, size - 14, size * 0.28, r / 2);
    context.fill();
  },
  pixel(context, px, py, size, color) {
    const u = Math.max(2, Math.floor(size / 6)); // tamaño del "píxel"
    const n = Math.floor((size - 2) / u);
    const x0 = px + 1, y0 = py + 1;
    context.fillStyle = color;
    context.fillRect(x0, y0, n * u, n * u);
    // textura: damero sutil
    context.fillStyle = 'rgba(0,0,0,0.14)';
    for (let i = 1; i < n - 1; i++)
      for (let j = 1; j < n - 1; j++)
        if ((i + j) % 2 === 0) context.fillRect(x0 + i * u, y0 + j * u, u, u);
    // bisel: claro arriba/izquierda, oscuro abajo/derecha
    context.fillStyle = 'rgba(255,255,255,0.45)';
    context.fillRect(x0, y0, n * u, u);
    context.fillRect(x0, y0, u, n * u);
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.fillRect(x0, y0 + (n - 1) * u, n * u, u);
    context.fillRect(x0 + (n - 1) * u, y0, u, n * u);
  },
};
let currentSkin = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  SKINS[currentSkin](context, x * size, y * size, size, COLORS[colorIndex]);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Tabla de records (localStorage) ----
function loadRecords() {
  const rec = { scores: [], bestCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.scores)) {
      rec.scores = data.scores
        .filter(s => s && typeof s.name === 'string' && Number.isFinite(s.score))
        .slice(0, MAX_RECORDS);
    }
    if (data && Number.isFinite(data.bestCombo)) rec.bestCombo = data.bestCombo;
    if (data && Number.isFinite(data.maxLines)) rec.maxLines = data.maxLines;
  } catch (e) { /* almacenamiento no disponible o datos corruptos */ }
  return rec;
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) { /* sin almacenamiento */ }
}

function qualifies(rec, s) {
  return s > 0 && (rec.scores.length < MAX_RECORDS || s > rec.scores[rec.scores.length - 1].score);
}

// Inserta tras las puntuaciones iguales o mayores (el empate más antiguo queda por delante).
function insertScore(scores, entry) {
  let i = scores.findIndex(s => s.score < entry.score);
  if (i === -1) i = scores.length;
  const out = scores.slice();
  out.splice(i, 0, entry);
  return { list: out.slice(0, MAX_RECORDS), index: i };
}

function renderRecords(rec, list, highlight) {
  recordsList.textContent = '';
  for (let i = 0; i < MAX_RECORDS; i++) {
    const li = document.createElement('li');
    const e = list[i];
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.className = 'name';
    const pts = document.createElement('span');
    pts.className = 'pts';
    if (e) {
      name.textContent = e.name;
      pts.textContent = e.score.toLocaleString();
    } else {
      li.classList.add('empty');
      name.textContent = '---';
    }
    if (i === highlight) li.classList.add('highlight');
    li.append(rank, name, pts);
    recordsList.append(li);
  }
  recordsStats.textContent = `Mejor combo: ×${rec.bestCombo} · Líneas máx: ${rec.maxLines}`;
}

function showOverlay(title, scoreText, withRecords) {
  overlayTitle.textContent = title;
  overlayScore.textContent = scoreText;
  recordsEl.classList.toggle('hidden', !withRecords);
  nameForm.classList.add('hidden');
  overlay.classList.remove('hidden');
}

function showStart() {
  cancelAnimationFrame(animId);
  gameOver = true; // bloquea las teclas de juego hasta pulsar "Jugar"
  draw();
  showOverlay('TETRIS', '', true);
  const rec = loadRecords();
  renderRecords(rec, rec.scores, -1);
  restartBtn.textContent = 'Jugar';
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, bestCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  showOverlay('GAME OVER', `Puntuación: ${score.toLocaleString()}`, true);
  restartBtn.textContent = 'Reiniciar';
  if (qualifies(rec, score)) {
    pendingScore = score;
    const { list, index } = insertScore(rec.scores, { name: '???', score, lines });
    renderRecords(rec, list, index);
    nameForm.classList.remove('hidden');
    nameInput.value = '';
    nameInput.focus();
  } else {
    pendingScore = null;
    renderRecords(rec, rec.scores, -1);
  }
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (pendingScore === null) return;
  const name = nameInput.value.trim().slice(0, 12) || 'ANON';
  const rec = loadRecords();
  const { list, index } = insertScore(rec.scores, { name, score: pendingScore, lines });
  rec.scores = list;
  saveRecords(rec);
  pendingScore = null;
  nameForm.classList.add('hidden');
  renderRecords(rec, rec.scores, index);
  restartBtn.focus();
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  const rec = { scores: [], bestCombo: 0, maxLines: 0 };
  saveRecords(rec);
  pendingScore = null; // ya no hay top al que entrar
  nameForm.classList.add('hidden');
  renderRecords(rec, rec.scores, -1);
});

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    startLevelSelect.value = String(startLevel);
    pauseControls.hidden = true;
    controlsBtn.setAttribute('aria-expanded', 'false');
    pauseMenu.classList.remove('hidden');
    resumeBtn.focus();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  bestCombo = 0;
  pendingScore = null;
  paused = false;
  gameOver = false;
  dropInterval = intervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === themeToggle || e.target === skinSelect) return; // con el switch enfocado, no hay teclas de juego
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();
    return;
  }
  // Con el menú abierto (o game over) las teclas de juego no hacen nada
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => {
  pauseControls.hidden = !pauseControls.hidden;
  controlsBtn.setAttribute('aria-expanded', String(!pauseControls.hidden));
});
for (let i = 1; i <= MAX_START_LEVEL; i++) startLevelSelect.add(new Option(i, i));
startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
});

// Relee colores del canvas desde CSS y redibuja (tema y skin comparten esto).
function refreshCanvasColors() {
  const css = getComputedStyle(document.documentElement);
  for (let i = 1; i < COLORS.length; i++) COLORS[i] = css.getPropertyValue(`--piece-${i}`).trim();
  gridColor = css.getPropertyValue('--grid').trim();
  highlightColor = css.getPropertyValue('--highlight').trim();
  // En pausa/game over el loop no redibuja: refrescar manualmente
  if (current && next) { draw(); drawNext(); }
}

function applyTheme(theme, persist) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-checked', String(theme === 'light'));
  if (persist) {
    try { localStorage.setItem('theme', theme); } catch (e) { /* almacenamiento no disponible */ }
  }
  refreshCanvasColors();
}

function applySkin(skin, persist) {
  if (!SKINS[skin]) skin = 'retro';
  currentSkin = skin;
  document.documentElement.dataset.skin = skin;
  skinSelect.value = skin;
  if (persist) {
    try { localStorage.setItem('skin', skin); } catch (e) { /* almacenamiento no disponible */ }
  }
  refreshCanvasColors();
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value, true);
  skinSelect.blur(); // devuelve el control al juego
});

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  applyTheme(isLight ? 'dark' : 'light', true);
  themeToggle.blur(); // devuelve el control al juego
});

applySkin(document.documentElement.dataset.skin, false);
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);
init();
showStart();
