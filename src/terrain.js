/**
 * terrain.js — Terrain editor logic and random terrain generation
 */

import { setCell } from './board.js';

/**
 * Apply a terrain paint operation to a single cell.
 * Clears any stone that might be on that cell (terrain edit resets stones).
 */
export function paintCell(board, x, y, tool, height) {
  if (tool === 'empty') {
    setCell(board, x, y, { terrain: 'empty', height: 0, stone: null });
  } else if (tool === 'river') {
    setCell(board, x, y, { terrain: 'river', height: 0, stone: null });
  } else if (tool === 'mountain') {
    setCell(board, x, y, { terrain: 'mountain', height: Math.max(1, height), stone: null });
  }
}

/**
 * Clear all terrain back to empty.
 */
export function clearTerrain(board) {
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      setCell(board, x, y, { terrain: 'empty', height: 0, stone: null });
    }
  }
}

/**
 * Generate random terrain with rivers and mountains.
 * Uses a simple blob-fill approach for natural-looking regions.
 *
 * @param {object} board
 * @param {number} maxHeight
 */
export function randomTerrain(board, maxHeight) {
  clearTerrain(board);
  const { size } = board;

  // Place a few river blobs
  const numRiverBlobs = Math.floor(size / 4);
  for (let i = 0; i < numRiverBlobs; i++) {
    const cx = Math.floor(Math.random() * size);
    const cy = Math.floor(Math.random() * size);
    const blobSize = 2 + Math.floor(Math.random() * 4);
    floodBlob(board, cx, cy, blobSize, (board, x, y) => {
      setCell(board, x, y, { terrain: 'river', height: 0, stone: null });
    });
  }

  // Place mountain clusters with graduated heights
  const numMtnClusters = Math.floor(size / 5);
  for (let i = 0; i < numMtnClusters; i++) {
    const cx = Math.floor(Math.random() * size);
    const cy = Math.floor(Math.random() * size);
    const peakHeight = 1 + Math.floor(Math.random() * maxHeight);

    // Paint concentric rings from peak outward with decreasing height
    for (let h = peakHeight; h >= 1; h--) {
      const radius = peakHeight - h + 1;
      floodBlob(board, cx, cy, radius, (board, x, y) => {
        const cell = board.cells[y][x];
        // Only overwrite empty cells (don't clobber rivers or higher peaks)
        if (cell.terrain === 'empty') {
          setCell(board, x, y, { terrain: 'mountain', height: h, stone: null });
        }
      });
    }
  }
}

/** Paint a rough circular blob of cells. */
function floodBlob(board, cx, cy, radius, paintFn) {
  const { size } = board;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx*dx + dy*dy > radius*radius) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && y >= 0 && x < size && y < size) {
        paintFn(board, x, y);
      }
    }
  }
}
