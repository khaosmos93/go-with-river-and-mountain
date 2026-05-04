/**
 * main.js — Application entry point
 *
 * Orchestrates the three screens: Setup → Terrain Editor → Game.
 * Wires together board.js, rules.js, terrain.js, and ui.js.
 */

import { createBoard, cloneBoard, boardHash } from './board.js';
import { canPlace, applyMove, scoreBoard } from './rules.js';
import { paintCell, clearTerrain, randomTerrain } from './terrain.js';
import { renderBoard, calcLayout, pixelToCell, fitCanvas } from './ui.js';

// ─── App State ────────────────────────────────────────────────────────────────

const state = {
  boardSize: 13,
  maxHeight: 5,
  board: null,          // live board (editor modifies this directly)
  gameBoard: null,      // board during play (starts as clone of board)
  currentPlayer: 'black',
  captures: { black: 0, white: 0 },
  koHash: null,         // board hash that is Ko-forbidden
  prevHash: null,       // hash before last move (used to set koHash)
  consecutivePasses: 0,
  moveCount: 0,
  moveLog: [],
};

// Editor paint state
const editorState = {
  tool: 'empty',
  brushHeight: 1,
  isPainting: false,
};

// ─── DOM Elements ─────────────────────────────────────────────────────────────

const screens = {
  setup:  document.getElementById('screen-setup'),
  editor: document.getElementById('screen-editor'),
  game:   document.getElementById('screen-game'),
};

const editorCanvas = document.getElementById('editor-canvas');
const gameCanvas   = document.getElementById('game-canvas');
const editorCtx    = editorCanvas.getContext('2d');
const gameCtx      = gameCanvas.getContext('2d');

// Hover tracking
let editorHover = null;
let gameHover   = null;

// ─── Screen Navigation ────────────────────────────────────────────────────────

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  if (name === 'editor') {
    fitCanvas(editorCanvas);
    renderEditor();
  }
  if (name === 'game') {
    fitCanvas(gameCanvas);
    renderGame();
  }
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

(function initSetup() {
  const sizeGrid = document.getElementById('size-grid');
  const btnStart = document.getElementById('btn-start-editor');

  // Build size buttons
  const sizes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  sizes.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'size-btn' + (s === 13 ? ' selected' : '');
    btn.textContent = `${s}×${s}`;
    btn.dataset.size = s;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.boardSize = s;
    });
    sizeGrid.appendChild(btn);
  });

  btnStart.addEventListener('click', () => {
    state.board = createBoard(state.boardSize);
    showScreen('editor');
  });
})();

// ─── Terrain Editor ───────────────────────────────────────────────────────────

(function initEditor() {
  // Tool buttons
  ['empty', 'river', 'mountain'].forEach(tool => {
    document.getElementById(`tool-${tool}`).addEventListener('click', () => {
      editorState.tool = tool;
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
      document.getElementById(`tool-${tool}`).classList.add('active');
      document.getElementById('height-section').style.display =
        tool === 'mountain' ? 'flex' : 'none';
    });
  });

  // Brush height slider
  const brushHSlide = document.getElementById('brush-height');
  const brushHVal   = document.getElementById('brush-height-value');
  brushHSlide.addEventListener('input', () => {
    editorState.brushHeight = parseInt(brushHSlide.value, 10);
    brushHVal.textContent = brushHSlide.value;
  });

  // Clear & Random
  document.getElementById('btn-clear-board').addEventListener('click', () => {
    clearTerrain(state.board);
    renderEditor();
  });
  document.getElementById('btn-random-terrain').addEventListener('click', () => {
    randomTerrain(state.board, state.maxHeight);
    renderEditor();
  });

  // Navigation
  document.getElementById('btn-back-setup').addEventListener('click', () => showScreen('setup'));
  document.getElementById('btn-start-game').addEventListener('click', startGame);

  // Canvas paint events
  editorCanvas.addEventListener('mousedown', (e) => {
    editorState.isPainting = true;
    handleEditorPaint(e);
  });
  editorCanvas.addEventListener('mousemove', (e) => {
    handleEditorHover(e);
    if (editorState.isPainting) handleEditorPaint(e);
  });
  editorCanvas.addEventListener('mouseup',   () => { editorState.isPainting = false; });
  editorCanvas.addEventListener('mouseleave',() => { editorState.isPainting = false; editorHover = null; renderEditor(); });

  // Touch support
  editorCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    editorState.isPainting = true;
    handleEditorPaint(touchToMouse(e, editorCanvas));
  }, { passive: false });
  editorCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    handleEditorPaint(touchToMouse(e, editorCanvas));
  }, { passive: false });
  editorCanvas.addEventListener('touchend', () => { editorState.isPainting = false; });
})();

function handleEditorPaint(e) {
  const layout = calcLayout(editorCanvas.width, editorCanvas.height, state.boardSize);
  const pos = canvasPos(e, editorCanvas);
  const cell = pixelToCell(pos.x, pos.y, layout, state.boardSize);
  if (!cell) return;
  paintCell(state.board, cell.x, cell.y, editorState.tool, editorState.brushHeight);
  renderEditor();
}

function handleEditorHover(e) {
  const layout = calcLayout(editorCanvas.width, editorCanvas.height, state.boardSize);
  const pos = canvasPos(e, editorCanvas);
  editorHover = pixelToCell(pos.x, pos.y, layout, state.boardSize);
  renderEditor();
}

function renderEditor() {
  fitCanvas(editorCanvas);
  const layout = calcLayout(editorCanvas.width, editorCanvas.height, state.boardSize);
  renderBoard(editorCtx, state.board, layout, state.maxHeight, editorHover, null, null, true);
}

// ─── Game Setup ───────────────────────────────────────────────────────────────

function startGame() {
  // Clone the terrain board; all stones start empty
  state.gameBoard = cloneBoard(state.board);
  state.currentPlayer = 'black';
  state.captures = { black: 0, white: 0 };
  state.koHash = null;
  state.prevHash = null;
  state.consecutivePasses = 0;
  state.moveCount = 0;
  state.moveLog = [];

  updateGameUI();
  showScreen('game');
}

// ─── Game Screen ──────────────────────────────────────────────────────────────

(function initGame() {
  document.getElementById('btn-back-editor').addEventListener('click', () => showScreen('editor'));
  document.getElementById('btn-restart').addEventListener('click', startGame);
  document.getElementById('btn-pass').addEventListener('click', handlePass);

  gameCanvas.addEventListener('click',     handleGameClick);
  gameCanvas.addEventListener('mousemove', handleGameHover);
  gameCanvas.addEventListener('mouseleave',() => { gameHover = null; renderGame(); });

  // Touch
  gameCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    handleGameClick(touchToMouse(e, gameCanvas));
  }, { passive: false });

  // Modal buttons
  document.getElementById('modal-restart').addEventListener('click', () => {
    hideModal();
    startGame();
  });
  document.getElementById('modal-edit').addEventListener('click', () => {
    hideModal();
    showScreen('editor');
  });
})();

function handleGameHover(e) {
  const layout = calcLayout(gameCanvas.width, gameCanvas.height, state.boardSize);
  const pos = canvasPos(e, gameCanvas);
  gameHover = pixelToCell(pos.x, pos.y, layout, state.boardSize);
  renderGame();
}

function handleGameClick(e) {
  const layout = calcLayout(gameCanvas.width, gameCanvas.height, state.boardSize);
  const pos = canvasPos(e, gameCanvas);
  const cell = pixelToCell(pos.x, pos.y, layout, state.boardSize);
  if (!cell) return;

  const { valid, reason } = canPlace(state.gameBoard, cell.x, cell.y, state.currentPlayer, state.koHash);
  if (!valid) {
    showStatus(reason);
    return;
  }

  // Record pre-move hash for Ko tracking
  const preHash = boardHash(state.gameBoard);

  // Apply move
  const captured = applyMove(state.gameBoard, cell.x, cell.y, state.currentPlayer);
  state.captures[state.currentPlayer] += captured;
  state.consecutivePasses = 0;
  state.moveCount++;

  // Update Ko: the new Ko-forbidden state is the position BEFORE this move
  // if this move could be immediately undone (captured exactly 1 stone).
  // Full Ko: any repeated board state is forbidden.
  state.koHash = preHash;

  const colLabel = 'ABCDEFGHJKLMNOPQRST'[cell.x];
  const rowLabel = state.boardSize - cell.y;
  const captureNote = captured > 0 ? ` (+${captured})` : '';
  logMove(`${state.moveCount}. ${state.currentPlayer === 'black' ? '⚫' : '⚪'} ${colLabel}${rowLabel}${captureNote}`);

  showStatus('');
  switchPlayer();
  renderGame();
}

function handlePass() {
  state.consecutivePasses++;
  state.moveCount++;
  logMove(`${state.moveCount}. ${state.currentPlayer === 'black' ? '⚫' : '⚪'} Pass`);

  if (state.consecutivePasses >= 2) {
    endGame();
    return;
  }

  showStatus(`${state.currentPlayer} passed.`);
  switchPlayer();
  renderGame();
}

function switchPlayer() {
  state.currentPlayer = state.currentPlayer === 'black' ? 'white' : 'black';
  updateGameUI();
}

function updateGameUI() {
  const p = state.currentPlayer;
  document.getElementById('turn-indicator').textContent =
    `${p.charAt(0).toUpperCase() + p.slice(1)}'s Turn`;

  document.getElementById('black-captures').textContent = state.captures.black;
  document.getElementById('white-captures').textContent = state.captures.white;

  document.getElementById('black-card').classList.toggle('active-turn', p === 'black');
  document.getElementById('white-card').classList.toggle('active-turn', p === 'white');
}

function renderGame() {
  fitCanvas(gameCanvas);
  const layout = calcLayout(gameCanvas.width, gameCanvas.height, state.boardSize);
  renderBoard(
    gameCtx, state.gameBoard, layout, state.maxHeight,
    gameHover, state.currentPlayer, state.koHash, false
  );
}

// ─── End Game / Scoring ───────────────────────────────────────────────────────

function endGame() {
  const score = scoreBoard(state.gameBoard);
  const diff = score.black - score.white;

  let title, body;
  if (diff > 0) {
    title = 'Black wins!';
    body = `Black ${score.black} – White ${score.white} (Black leads by ${diff})`;
  } else if (diff < 0) {
    title = 'White wins!';
    body = `Black ${score.black} – White ${score.white} (White leads by ${-diff})`;
  } else {
    title = 'Tie!';
    body = `Both players scored ${score.black} points.`;
  }

  body += `\n\nCaptures — Black: ${state.captures.black}, White: ${state.captures.white}`;
  showModal(title, body);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function showStatus(msg) {
  document.getElementById('status-msg').textContent = msg;
}

function logMove(text) {
  state.moveLog.push(text);
  const logEl = document.getElementById('move-log');
  const div = document.createElement('div');
  div.textContent = text;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function showModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

/** Get canvas-relative mouse position. */
function canvasPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** Convert a touch event to a synthetic mouse-like position object. */
function touchToMouse(e, canvas) {
  const touch = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  return { clientX: touch.clientX, clientY: touch.clientY,
           x: touch.clientX - rect.left, y: touch.clientY - rect.top };
}

// ─── Window Resize ────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const active = Object.entries(screens).find(([, el]) => el.classList.contains('active'));
  if (!active) return;
  if (active[0] === 'editor') renderEditor();
  if (active[0] === 'game')   renderGame();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

showScreen('setup');
