/**
 * board.js — Board data model and serialization
 *
 * Each cell: { stone: null|"black"|"white", terrain: "empty"|"river"|"mountain", height: number }
 * Height is 0 for empty/river, >=1 for mountain.
 */

export function createBoard(size) {
  const cells = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      row.push({ stone: null, terrain: 'empty', height: 0 });
    }
    cells.push(row);
  }
  return { size, cells };
}

/** Deep-copy a board (terrain + stones). */
export function cloneBoard(board) {
  const cells = board.cells.map(row =>
    row.map(cell => ({ ...cell }))
  );
  return { size: board.size, cells };
}

export function getCell(board, x, y) {
  if (x < 0 || y < 0 || x >= board.size || y >= board.size) return null;
  return board.cells[y][x];
}

export function setCell(board, x, y, partial) {
  Object.assign(board.cells[y][x], partial);
}

/**
 * Stable board hash for Ko detection.
 * Encodes stone positions (terrain is fixed during play).
 */
export function boardHash(board) {
  let s = '';
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const c = board.cells[y][x];
      s += c.stone === 'black' ? 'B' : c.stone === 'white' ? 'W' : '.';
    }
  }
  return s;
}

/** Copy only stone data from src into dst (terrain stays). */
export function applyStonesToBoard(dst, src) {
  for (let y = 0; y < dst.size; y++) {
    for (let x = 0; x < dst.size; x++) {
      dst.cells[y][x].stone = src.cells[y][x].stone;
    }
  }
}

/** Returns array of {x,y} for the 4 orthogonal neighbors that are in-bounds. */
export function neighbors(board, x, y) {
  const result = [];
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < board.size && ny < board.size) {
      result.push({ x: nx, y: ny });
    }
  }
  return result;
}
