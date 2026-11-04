// snake/js/core.js —— 游戏引擎：地图 / 蛇 / 苹果 / 碰撞 / 计步 / 重开
// 纯逻辑，不依赖 DOM，浏览器与 Node 共用。

export const DIR_UP = 0, DIR_RIGHT = 1, DIR_DOWN = 2, DIR_LEFT = 3;
export const DIR_VECTORS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const DIR_NAMES = ['up', 'right', 'down', 'left'];

/** 可复现随机数（mulberry32） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const idxOf = (cols, x, y) => y * cols + x;
export const xOf = (cols, i) => i % cols;
export const yOf = (cols, i) => (i - (i % cols)) / cols;

/**
 * 建局。坐标 0..cols-1 / 0..rows-1 全部可走，越界即撞墙。
 * 蛇长 3、随机位置随机朝向；苹果不重叠、不落在蛇身上。
 */
export function createGame(opts = {}) {
  const cols = opts.cols != null ? opts.cols : 100;
  const rows = opts.rows != null ? opts.rows : 100;
  const seed = opts.seed != null ? opts.seed : 1;
  const snakeLen = Math.max(2, opts.snakeLen != null ? opts.snakeLen : 3);
  const appleCount = opts.apples != null ? opts.apples : 10;
  const rng = mulberry32(seed);
  const N = cols * rows;

  if (N < snakeLen + appleCount) throw new Error('地图太小，放不下蛇和苹果');

  // —— 放蛇 ——
  let snake = null;
  let dir = DIR_RIGHT;
  for (let attempt = 0; attempt < 5000 && !snake; attempt++) {
    const d = Math.floor(rng() * 4);
    const [dx, dy] = DIR_VECTORS[d];
    const x = Math.floor(rng() * cols);
    const y = Math.floor(rng() * rows);
    const cells = [];
    let ok = true;
    for (let k = 0; k < snakeLen; k++) {
      const cx = x - dx * k;
      const cy = y - dy * k;
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) { ok = false; break; }
      cells.push(cy * cols + cx);
    }
    if (ok) { snake = cells; dir = d; }
  }
  if (!snake) throw new Error('无法放置蛇：地图过小或退化');

  // —— 撒苹果 ——
  const apples = new Set();
  let guard = 0;
  while (apples.size < appleCount && guard++ < 1e6) {
    const idx = Math.floor(rng() * N);
    let occupied = false;
    for (let k = 0; k < snake.length; k++) if (snake[k] === idx) { occupied = true; break; }
    if (!occupied) apples.add(idx);
  }

  return {
    cols, rows, seed, snakeLen, snake, dir,
    apples, initialApples: apples.size, eaten: 0,
    steps: 0,
    status: 'running',   // running | won | dead
    reason: null,        // wall | self
    moves: [],
  };
}

/**
 * 走一步。返回同一个 state（就地修改）。
 * 规则：越界=撞墙；头部进入"移动后的身体"=撞自己；吃苹果时尾巴不动。
 */
export function step(state, dir) {
  if (state.status !== 'running') return state;

  if (!Number.isInteger(dir) || dir < 0 || dir > 3) dir = state.dir;
  if ((dir + 2) % 4 === state.dir) dir = state.dir;  // 禁止 180° 反向

  const { cols, rows, snake, apples } = state;
  const [dx, dy] = DIR_VECTORS[dir];
  const head = snake[0];
  const hx = head % cols;
  const hy = (head - hx) / cols;
  const nx = hx + dx;
  const ny = hy + dy;

  state.dir = dir;
  state.steps++;
  state.moves.push(dir);

  if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
    state.status = 'dead';
    state.reason = 'wall';
    return state;
  }

  const ni = ny * cols + nx;
  const willEat = apples.has(ni);
  // 不吃苹果时尾巴会让位；吃苹果时尾巴不动，整条身体都要判。
  const bodyLen = willEat ? snake.length : snake.length - 1;
  for (let k = 0; k < bodyLen; k++) {
    if (snake[k] === ni) {
      state.status = 'dead';
      state.reason = 'self';
      return state;
    }
  }

  snake.unshift(ni);
  if (willEat) {
    apples.delete(ni);
    state.eaten++;
    if (apples.size === 0) state.status = 'won';
  } else {
    snake.pop();
  }
  return state;
}

export function headOf(state) { return state.snake[0]; }

export function appleList(state) { return [...state.apples]; }

/** 撞墙/撞自己后本局无效 */
export function isValidRun(state) {
  return state.status === 'won' && state.apples.size === 0;
}
