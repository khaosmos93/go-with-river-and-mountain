/**
 * rules.js — Core Go rule engine with terrain extensions
 *
 * Placement rules:
 *   - River cells: always blocked
 *   - Empty cells (height 0): standard Go placement (suicide check)
 *   - Mountain cells (height h >= 1): ONLY valid if at least one orthogonal
 *     neighbor contains a stone of the same color at height h OR h-1.
 *     Height jumps are still forbidden: 0 → 2 is invalid.
 *
 * All other rules (capture, liberty, Ko) follow standard Go.
 */

import { cloneBoard, getCell, setCell, boardHash, neighbors } from './board.js';

// ─── Liberty & Group Detection ────────────────────────────────────────────────

/**
 * BFS to find all stones in the connected group containing (x, y).
 * Connectivity is purely 4-directional by stone color; height is irrelevant.
 * Returns array of {x, y}.
 */
export function findGroup(board, x, y) {
  const color = getCell(board, x, y).stone;
  if (!color) return [];

  const visited = new Set();
  const queue = [{ x, y }];
  const group = [];
  const key = (x, y) => `${x},${y}`;

  visited.add(key(x, y));
  while (queue.length > 0) {
    const cur = queue.shift();
    group.push(cur);
    for (const nb of neighbors(board, cur.x, cur.y)) {
      const k = key(nb.x, nb.y);
      if (!visited.has(k) && getCell(board, nb.x, nb.y).stone === color) {
        visited.add(k);
        queue.push(nb);
      }
    }
  }
  return group;
}

/**
 * Count liberties of the group starting at (x, y).
 * A liberty is an empty adjacent cell that is NOT a river.
 * Empty mountain cells without stones ARE liberties.
 */
export function countLiberties(board, x, y) {
  const group = findGroup(board, x, y);
  const libSet = new Set();
  const key = (x, y) => `${x},${y}`;

  for (const stone of group) {
    for (const nb of neighbors(board, stone.x, stone.y)) {
      const cell = getCell(board, nb.x, nb.y);
      // Liberty: unoccupied and not a river
      if (!cell.stone && cell.terrain !== 'river') {
        libSet.add(key(nb.x, nb.y));
      }
    }
  }
  return libSet.size;
}

// ─── Height-Based Placement Check ────────────────────────────────────────────

/**
 * Check the mountain height placement rule.
 *
 * A stone can be placed on a mountain cell of height h if there exists at
 * least one orthogonal neighbor containing a friendly stone where:
 *   - neighbor.height == h      (same level — always ok)
 *   - neighbor.height == h - 1  (one level below — climb up by 1)
 *   - neighbor.height  > h      (any higher level — descending freely)
 *
 * Upward jumps of more than one level are the only forbidden case:
 *   0→2, 1→3, etc. are invalid.
 *
 * Examples:
 *   0→1 ✓  1→1 ✓  1→2 ✓  3→2 ✓  5→0 ✓  0→2 ✗  1→3 ✗
 */
function hasHeightSupport(board, x, y, player) {
  const h = getCell(board, x, y).height;

  for (const nb of neighbors(board, x, y)) {
    const nbCell = getCell(board, nb.x, nb.y);
    if (nbCell.stone === player &&
        (nbCell.height === h || nbCell.height === h - 1 || nbCell.height > h)) {
      return true;
    }
  }
  return false;
}

// ─── Placement Validation ─────────────────────────────────────────────────────

/**
 * Full placement check. Returns { valid: bool, reason: string }.
 *
 * Steps:
 *   1. Cell out of bounds or already occupied → invalid
 *   2. River cell → invalid
 *   3. Mountain cell (h >= 1) → height support check
 *   4. Simulate placement, check for suicide (group has 0 liberties after
 *      any opponent captures that would result from this move)
 *   5. Ko check (caller provides koHash to compare against)
 *
 * @param {object} board
 * @param {number} x
 * @param {number} y
 * @param {string} player
 * @param {string|null} koHash  hash of the board state that is forbidden
 */
export function canPlace(board, x, y, player, koHash = null) {
  const cell = getCell(board, x, y);
  if (!cell) return { valid: false, reason: 'Out of bounds' };
  if (cell.stone)   return { valid: false, reason: 'Cell occupied' };
  if (cell.terrain === 'river') return { valid: false, reason: 'River — cannot place' };

  // Height-based mountain rule
  if (cell.terrain === 'mountain' && cell.height >= 1) {
    if (!hasHeightSupport(board, x, y, player)) {
      return {
        valid: false,
        reason: `Need adjacent friendly stone at height ≥${cell.height} or ${cell.height - 1}`,
      };
    }
  }

  // Simulate the move to check suicide and Ko
  const sim = cloneBoard(board);
  setCell(sim, x, y, { stone: player });

  // Remove any opponent groups that are now captured
  const opponent = player === 'black' ? 'white' : 'black';
  for (const nb of neighbors(sim, x, y)) {
    const nbCell = getCell(sim, nb.x, nb.y);
    if (nbCell.stone === opponent && countLiberties(sim, nb.x, nb.y) === 0) {
      removeGroup(sim, nb.x, nb.y);
    }
  }

  // Suicide check: after potential captures, does the placed stone's group
  // have any liberties?
  if (countLiberties(sim, x, y) === 0) {
    return { valid: false, reason: 'Suicide' };
  }

  // Ko check
  const newHash = boardHash(sim);
  if (koHash && newHash === koHash) {
    return { valid: false, reason: 'Ko — cannot recreate previous position' };
  }

  return { valid: true, reason: '', simBoard: sim, newHash };
}

// ─── Capture Logic ────────────────────────────────────────────────────────────

/** Remove all stones of a group from the board. Returns the count removed. */
export function removeGroup(board, x, y) {
  const group = findGroup(board, x, y);
  for (const stone of group) {
    setCell(board, stone.x, stone.y, { stone: null });
  }
  return group.length;
}

/**
 * Apply a placement move. Returns the number of captured opponent stones,
 * and mutates `board` in place.
 *
 * Precondition: canPlace() returned valid = true for this move.
 */
export function applyMove(board, x, y, player) {
  setCell(board, x, y, { stone: player });

  const opponent = player === 'black' ? 'white' : 'black';
  let captures = 0;

  for (const nb of neighbors(board, x, y)) {
    const nbCell = getCell(board, nb.x, nb.y);
    if (nbCell.stone === opponent && countLiberties(board, nb.x, nb.y) === 0) {
      captures += removeGroup(board, nb.x, nb.y);
    }
  }

  return captures;
}

// ─── Scoring (Area / Territory) ───────────────────────────────────────────────

/**
 * Simple area scoring (Chinese rules style).
 * Returns { black: number, white: number }.
 * Each player's score = stones on board + surrounded empty territory.
 * River cells are neutral and not counted.
 */
export function scoreBoard(board) {
  const { size, cells } = board;
  const visited = new Set();
  const key = (x, y) => `${x},${y}`;
  let blackScore = 0;
  let whiteScore = 0;

  // Count stones
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].stone === 'black') blackScore++;
      if (cells[y][x].stone === 'white') whiteScore++;
    }
  }

  // Flood-fill empty regions to find surrounded territory
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (visited.has(key(x, y))) continue;
      const cell = cells[y][x];
      if (cell.stone || cell.terrain === 'river') continue;

      // BFS the empty region
      const region = [];
      const borders = new Set(); // which colors border this region
      const q = [{ x, y }];
      visited.add(key(x, y));

      while (q.length) {
        const cur = q.shift();
        region.push(cur);
        for (const nb of neighborCoords(size, cur.x, cur.y)) {
          const nbCell = cells[nb.y][nb.x];
          const k = key(nb.x, nb.y);
          if (nbCell.stone) {
            borders.add(nbCell.stone);
          } else if (nbCell.terrain !== 'river' && !visited.has(k)) {
            visited.add(k);
            q.push(nb);
          }
        }
      }

      // Assign territory only if exclusively bordered by one color
      if (borders.size === 1) {
        const owner = [...borders][0];
        if (owner === 'black') blackScore += region.length;
        else whiteScore += region.length;
      }
    }
  }

  return { black: blackScore, white: whiteScore };
}

function neighborCoords(size, x, y) {
  const result = [];
  if (x > 0)       result.push({ x: x-1, y });
  if (x < size-1)  result.push({ x: x+1, y });
  if (y > 0)       result.push({ x, y: y-1 });
  if (y < size-1)  result.push({ x, y: y+1 });
  return result;
}
