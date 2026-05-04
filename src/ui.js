/**
 * ui.js — Canvas rendering for both the terrain editor and the game board
 */

import { getCell, neighbors } from './board.js';
import { canPlace } from './rules.js';

// ─── Color Helpers ────────────────────────────────────────────────────────────

// Fixed grayscale palette for mountain heights 1–5.
// Heights outside this range are clamped by terrain.js before reaching here.
const MOUNTAIN_FILL  = ['', '#d4d4d4', '#a8a8a8', '#7a7a7a', '#4e4e4e', '#2a2a2a'];
const MOUNTAIN_LINES = ['', '#b8b8b8', '#8c8c8c', '#606060', '#383838', '#181818'];
// Heights 1–2 are light enough to show dark text; 3–5 need white text.
const MOUNTAIN_LABEL_DARK_MAX = 2;

function mountainColor(height) {
  return MOUNTAIN_FILL[Math.min(5, Math.max(1, height))];
}

function riverColor() { return '#2a6fbf'; }
function emptyColor() { return '#dcb46a'; }

function mountainLineColor(height) {
  return MOUNTAIN_LINES[Math.min(5, Math.max(1, height))];
}

// ─── Layout Calculation ───────────────────────────────────────────────────────

/**
 * Calculate cell size and board pixel dimensions that fit inside the canvas,
 * leaving margins for coordinates.
 */
export function calcLayout(canvasW, canvasH, boardSize) {
  const margin = 28;
  const available = Math.min(canvasW, canvasH) - margin * 2;
  const cellSize = Math.floor(available / boardSize);
  const boardPx = cellSize * boardSize;
  const offsetX = Math.floor((canvasW - boardPx) / 2);
  const offsetY = Math.floor((canvasH - boardPx) / 2);
  return { cellSize, boardPx, offsetX, offsetY };
}

/** Convert a canvas pixel position to board cell coordinates. Returns null if outside. */
export function pixelToCell(px, py, layout, boardSize) {
  const { cellSize, offsetX, offsetY } = layout;
  const cx = Math.floor((px - offsetX) / cellSize);
  const cy = Math.floor((py - offsetY) / cellSize);
  if (cx < 0 || cy < 0 || cx >= boardSize || cy >= boardSize) return null;
  return { x: cx, y: cy };
}

// ─── Board Renderer ───────────────────────────────────────────────────────────

/**
 * Render the full board onto a canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} board
 * @param {object} layout   from calcLayout()
 * @param {number} maxHeight
 * @param {object|null} hoverCell  {x,y} of the hovered cell
 * @param {string|null} hoverPlayer  "black"|"white"|null (for ghost stone)
 * @param {string|null} koHash   current Ko forbidden hash
 * @param {boolean} isEditor   if true, skip stone hover preview
 */
export function renderBoard(ctx, board, layout, maxHeight, hoverCell, hoverPlayer, koHash, isEditor) {
  const { cellSize, boardPx, offsetX, offsetY } = layout;
  const { size } = board;
  const stoneR = cellSize * 0.42;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // ── 1. Draw cells ──
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = getCell(board, x, y);
      const px = offsetX + x * cellSize;
      const py = offsetY + y * cellSize;

      // Cell background
      if (cell.terrain === 'river') {
        ctx.fillStyle = riverColor();
        ctx.fillRect(px, py, cellSize, cellSize);
        // Wave lines for river texture
        ctx.strokeStyle = 'rgba(100,180,255,0.3)';
        ctx.lineWidth = 1;
        for (let waveY = 3; waveY < cellSize; waveY += 6) {
          ctx.beginPath();
          ctx.moveTo(px + 2, py + waveY);
          ctx.bezierCurveTo(px + cellSize/3, py + waveY - 2, px + 2*cellSize/3, py + waveY + 2, px + cellSize - 2, py + waveY);
          ctx.stroke();
        }
      } else if (cell.terrain === 'mountain') {
        ctx.fillStyle = mountainColor(cell.height);
        ctx.fillRect(px, py, cellSize, cellSize);
        // Height number label
        if (cellSize >= 24) {
          ctx.fillStyle = cell.height > MOUNTAIN_LABEL_DARK_MAX ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.35)';
          ctx.font = `bold ${Math.max(9, cellSize * 0.28)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.height, px + cellSize / 2, py + cellSize / 2);
        }
      } else {
        ctx.fillStyle = emptyColor();
        ctx.fillRect(px, py, cellSize, cellSize);
      }

      // Cell border
      ctx.strokeStyle = cell.terrain === 'mountain'
        ? mountainLineColor(cell.height)
        : cell.terrain === 'river' ? '#1a5090' : '#9b7a3a';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px + 0.25, py + 0.25, cellSize - 0.5, cellSize - 0.5);
    }
  }

  // ── 2. Draw grid lines ──
  ctx.strokeStyle = 'rgba(80,50,10,0.5)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= size; i++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + i * cellSize, offsetY);
    ctx.lineTo(offsetX + i * cellSize, offsetY + boardPx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + i * cellSize);
    ctx.lineTo(offsetX + boardPx, offsetY + i * cellSize);
    ctx.stroke();
  }

  // ── 3. Draw stones ──
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = getCell(board, x, y);
      if (cell.stone) {
        drawStone(ctx, offsetX + x * cellSize + cellSize/2, offsetY + y * cellSize + cellSize/2, stoneR, cell.stone);
      }
    }
  }

  // ── 4. Hover ghost stone (game mode only) ──
  if (!isEditor && hoverCell && hoverPlayer) {
    const { x, y } = hoverCell;
    const check = canPlace(board, x, y, hoverPlayer, koHash);
    const cx = offsetX + x * cellSize + cellSize / 2;
    const cy = offsetY + y * cellSize + cellSize / 2;

    ctx.save();
    ctx.globalAlpha = 0.6;
    if (check.valid) {
      // Valid placement: show ghost stone with green highlight
      drawStone(ctx, cx, cy, stoneR, hoverPlayer);
      ctx.strokeStyle = '#44ff88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, stoneR + 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Invalid: red X indicator
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      const d = stoneR * 0.6;
      ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
      ctx.strokeStyle = '#ff4444';
      ctx.beginPath(); ctx.arc(cx, cy, stoneR, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // ── 5. Coordinate labels ──
  if (cellSize >= 20) {
    ctx.fillStyle = 'rgba(80,50,10,0.7)';
    ctx.font = `${Math.max(9, cellSize * 0.28)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = 'ABCDEFGHJKLMNOPQRST'; // standard Go column labels (skip I)
    for (let i = 0; i < size; i++) {
      // Column letters (top)
      ctx.fillText(letters[i], offsetX + i * cellSize + cellSize/2, offsetY - 10);
      // Row numbers (left)
      ctx.textAlign = 'right';
      ctx.fillText(size - i, offsetX - 6, offsetY + i * cellSize + cellSize/2);
      ctx.textAlign = 'center';
    }
  }
}

// ─── Stone Drawing ────────────────────────────────────────────────────────────

function drawStone(ctx, cx, cy, r, color) {
  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = r * 0.5;
  ctx.shadowOffsetX = r * 0.15;
  ctx.shadowOffsetY = r * 0.2;

  if (color === 'black') {
    const grad = ctx.createRadialGradient(cx - r*0.25, cy - r*0.25, r*0.05, cx, cy, r);
    grad.addColorStop(0, '#555');
    grad.addColorStop(1, '#000');
    ctx.fillStyle = grad;
  } else {
    const grad = ctx.createRadialGradient(cx - r*0.3, cy - r*0.3, r*0.05, cx, cy, r);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.7, '#ddd');
    grad.addColorStop(1, '#bbb');
    ctx.fillStyle = grad;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Subtle border for white stones
  if (color === 'white') {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Canvas Resize ────────────────────────────────────────────────────────────

/**
 * Sync the canvas pixel buffer to its CSS-rendered size.
 * Because the canvas has `width: 100%; height: 100%` in CSS, offsetWidth/Height
 * reflects the container's stable layout dimensions — no feedback loop.
 */
export function fitCanvas(canvas) {
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}
