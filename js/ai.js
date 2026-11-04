// snake/js/ai.js —— 自动玩：精确最优序（Held-Karp）+ 避身寻路（BFS）+ 两个对照基线
//
// 核心结论：地图 100×100、蛇最长 13 格，占用率 0.13%，
// 若蛇身不构成阻碍，一条吃完所有苹果的路线的最短步数恰好等于
//   min over 访问顺序 π  [ d(head,a_π1) + Σ d(a_πi,a_πi+1) ]
// 其中 d 为曼哈顿距离。这是**可达的下界**：按该顺序逐段走最短路拼接即可。
// 于是"理论最少步数"可以毫秒级精确算出，实测步数只会因为避身绕行而略高。

import { DIR_VECTORS, idxOf, createGame, step } from './core.js';

/* ---------------- 曼哈顿距离 ---------------- */
export function l1(cols, a, b) {
  const ax = a % cols, ay = (a - ax) / cols;
  const bx = b % cols, by = (b - bx) / cols;
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/* ---------------- 近似：最近邻 + 2-opt（苹果太多时的降级） ---------------- */
export function pathCost(head, targets, order, cols) {
  let c = 0, cur = head;
  for (const i of order) { c += l1(cols, cur, targets[i]); cur = targets[i]; }
  return c;
}

function nearestNeighborOrder(head, targets, cols) {
  const n = targets.length;
  const used = new Array(n).fill(false);
  const order = [];
  let cur = head;
  for (let k = 0; k < n; k++) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const d = l1(cols, cur, targets[i]);
      if (d < bd) { bd = d; best = i; }
    }
    used[best] = true;
    order.push(best);
    cur = targets[best];
  }
  return order;
}

function twoOptPath(head, targets, order, cols) {
  const n = order.length;
  let best = order.slice();
  let bestCost = pathCost(head, targets, best, cols);
  let improved = true, guard = 0;
  while (improved && guard++ < 40) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const c = pathCost(head, targets, cand, cols);
        if (c < bestCost - 1e-9) { best = cand; bestCost = c; improved = true; }
      }
    }
  }
  return { order: best, cost: bestCost };
}

/* ---------------- Held-Karp：最短访问顺序 ---------------- */
/**
 * @param {number} head  起点格索引
 * @param {number[]} targets 苹果格索引
 * @param {number} cols
 * @param {number} maxExact 超过这个数量就不跑精确解，降级为 最近邻 + 2-opt
 * @returns {{order:number[], cost:number, exact:boolean}}  order 是 targets 的下标序列
 */
export function optimalOrder(head, targets, cols, maxExact = 12) {
  const n = targets.length;
  if (n === 0) return { order: [], cost: 0, exact: true };
  if (n === 1) return { order: [0], cost: l1(cols, head, targets[0]), exact: true };

  if (n > maxExact) {
    const nn = nearestNeighborOrder(head, targets, cols);
    const r = twoOptPath(head, targets, nn, cols);
    return { order: r.order, cost: r.cost, exact: false };
  }

  const full = 1 << n;
  const INF = Infinity;
  const dp = new Float64Array(full * n).fill(INF);
  const par = new Int8Array(full * n).fill(-1);

  for (let i = 0; i < n; i++) dp[(1 << i) * n + i] = l1(cols, head, targets[i]);

  for (let mask = 1; mask < full; mask++) {
    const base = mask * n;
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) === 0) continue;
      const cur = dp[base + i];
      if (cur === INF) continue;
      const ti = targets[i];
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        const nm = mask | (1 << j);
        const v = cur + l1(cols, ti, targets[j]);
        const pos = nm * n + j;
        if (v < dp[pos]) { dp[pos] = v; par[pos] = i; }
      }
    }
  }

  let best = INF, bi = -1;
  const last = (full - 1) * n;
  for (let i = 0; i < n; i++) {
    if (dp[last + i] < best) { best = dp[last + i]; bi = i; }
  }

  const order = [];
  let mask = full - 1, i = bi;
  while (i >= 0) {
    order.push(i);
    const p = par[mask * n + i];
    mask &= ~(1 << i);
    i = p;
  }
  order.reverse();
  return { order, cost: best, exact: true };
}

/**
 * 整局「理论最少步数」。
 * exact=true 时是**严格下界**（可达）；exact=false 时只是近似路线的代价，不能当下界用。
 */
export function lowerBound(state, maxExact = 12) {
  const r = optimalOrder(state.snake[0], [...state.apples], state.cols, maxExact);
  return { cost: r.cost, exact: r.exact };
}

/* ---------------- BFS 寻路（可复用缓冲区） ---------------- */
export class PathFinder {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.N = cols * rows;
    this.mark = new Int32Array(this.N);
    this.prev = new Int32Array(this.N);
    this.queue = new Int32Array(this.N);
    this.dist = new Int32Array(this.N);
    this.free = new Int32Array(this.N);      // 该格在第几步之后让开
    this.freeMark = new Int32Array(this.N);
    this.stamp = 0;
  }

  /**
   * 时间相关 BFS：身体不是静态墙，而是每走一步往后缩一格。
   *
   * 蛇身第 k 节（0=头）在 t 步后已被挤到第 k+t 节，身体共 L 节，
   * 所以它在 t >= L-k 时才让开。于是「第 t 步能否进入格 c」= t >= freeTime(c)。
   *
   * 这一条把"绕自己一圈"的代价消掉了：头可以直接追着尾巴走。
   */
  findTimeAware(start, goal, snake) {
    const { cols, rows, mark, prev, queue, dist, free, freeMark } = this;
    const L = snake.length;

    this.stamp = (this.stamp + 1) | 0;
    if (this.stamp >= 0x7fffffff) { mark.fill(0); freeMark.fill(0); this.stamp = 1; }
    const st = this.stamp;

    for (let k = 0; k < L; k++) { free[snake[k]] = L - k; freeMark[snake[k]] = st; }

    mark[start] = st;
    prev[start] = -1;
    dist[start] = 0;

    let qh = 0, qt = 0;
    queue[qt++] = start;
    let reached = false;

    while (qh < qt) {
      const cur = queue[qh++];
      if (cur === goal) { reached = true; break; }
      const nd = dist[cur] + 1;
      const cx = cur % cols;
      const cy = (cur - cx) / cols;

      for (let d = 0; d < 4; d++) {
        const dx = DIR_VECTORS[d][0], dy = DIR_VECTORS[d][1];
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const nb = ny * cols + nx;
        if (mark[nb] === st) continue;
        if (freeMark[nb] === st && nd < free[nb]) continue;   // 还没让开
        mark[nb] = st;
        dist[nb] = nd;
        prev[nb] = cur;
        queue[qt++] = nb;
      }
    }

    if (!reached) return null;

    const path = [];
    let cur = goal;
    while (cur !== -1) { path.push(cur); cur = prev[cur]; }
    path.reverse();
    return path;
  }

  /**
   * 从 start 到 goal 的最短路，blocked 前 blockedLen 个格视为障碍。
   * 返回格索引数组（含首尾），不可达返回 null。
   */
  find(start, goal, blocked, blockedLen) {
    const { cols, rows, mark, prev, queue } = this;
    this.stamp = (this.stamp + 1) | 0;
    if (this.stamp >= 0x7fffffff) { mark.fill(0); this.stamp = 1; }
    const st = this.stamp;

    for (let k = 0; k < blockedLen; k++) mark[blocked[k]] = st;
    mark[start] = st;
    prev[start] = -1;

    let qh = 0, qt = 0;
    queue[qt++] = start;
    let reached = false;

    while (qh < qt) {
      const cur = queue[qh++];
      if (cur === goal) { reached = true; break; }
      const cx = cur % cols;
      const cy = (cur - cx) / cols;

      if (cy > 0) { const nb = cur - cols; if (mark[nb] !== st) { mark[nb] = st; prev[nb] = cur; queue[qt++] = nb; } }
      if (cy + 1 < rows) { const nb = cur + cols; if (mark[nb] !== st) { mark[nb] = st; prev[nb] = cur; queue[qt++] = nb; } }
      if (cx > 0) { const nb = cur - 1; if (mark[nb] !== st) { mark[nb] = st; prev[nb] = cur; queue[qt++] = nb; } }
      if (cx + 1 < cols) { const nb = cur + 1; if (mark[nb] !== st) { mark[nb] = st; prev[nb] = cur; queue[qt++] = nb; } }
    }

    if (!reached) return null;

    const path = [];
    let cur = goal;
    while (cur !== -1) { path.push(cur); cur = prev[cur]; }
    path.reverse();
    return path;
  }

  /** 统计从 start 出发（避开 blocked）能走到的空格数 */
  reachable(start, blocked, blockedLen, limit = Infinity) {
    const { cols, rows, mark, queue } = this;
    this.stamp = (this.stamp + 1) | 0;
    const st = this.stamp;
    for (let k = 0; k < blockedLen; k++) mark[blocked[k]] = st;
    mark[start] = st;
    let qh = 0, qt = 0, count = 0;
    queue[qt++] = start;
    while (qh < qt && count < limit) {
      const cur = queue[qh++];
      count++;
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      if (cy > 0) { const nb = cur - cols; if (mark[nb] !== st) { mark[nb] = st; queue[qt++] = nb; } }
      if (cy + 1 < rows) { const nb = cur + cols; if (mark[nb] !== st) { mark[nb] = st; queue[qt++] = nb; } }
      if (cx > 0) { const nb = cur - 1; if (mark[nb] !== st) { mark[nb] = st; queue[qt++] = nb; } }
      if (cx + 1 < cols) { const nb = cur + 1; if (mark[nb] !== st) { mark[nb] = st; queue[qt++] = nb; } }
    }
    return count;
  }
}

/* ---------------- 通用移动工具 ---------------- */
export function dirTo(cols, from, to) {
  const fx = from % cols, fy = (from - fx) / cols;
  const tx = to % cols, ty = (to - tx) / cols;
  const dx = tx - fx, dy = ty - fy;
  for (let d = 0; d < 4; d++) if (DIR_VECTORS[d][0] === dx && DIR_VECTORS[d][1] === dy) return d;
  return -1;
}

export function adjacent(cols, a, b) {
  return l1(cols, a, b) === 1;
}

/* ---------------- 基准：跟随计划 ---------------- */
class FollowAI {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.pf = new PathFinder(cols, rows);
    this.plan = [];
    this.appleKey = -1;
    this.planCost = 0;
  }

  reset() { this.plan = []; this.appleKey = -1; this.planCost = 0; }

  /** 子类实现：返回本次要去的目标格 */
  pickTarget(/* state, apples, order */) { return -1; }

  replan(state, apples) {
    const head = state.snake[0];
    const target = this.pickTarget(state, apples);
    this.appleKey = apples.length;
    this.plan = [];
    if (target < 0) return;
    const bodyLen = state.snake.length - 1;  // 尾巴这会走开，不算障碍
    const path = this.pf.find(head, target, state.snake, bodyLen);
    if (path && path.length > 1) this.plan = path.slice(1);
  }

  planValid(state, apples) {
    if (this.plan.length === 0) return false;
    if (apples.length !== this.appleKey) return false;
    const head = state.snake[0];
    const nxt = this.plan[0];
    if (!adjacent(this.cols, head, nxt)) return false;
    // 下一步不能进身体（尾巴除外）
    const bodyLen = state.snake.length - 1;
    for (let k = 0; k < bodyLen; k++) if (state.snake[k] === nxt) return false;
    const d = dirTo(this.cols, head, nxt);
    if (d < 0) return false;
    if ((d + 2) % 4 === state.dir) return false;
    return true;
  }

  /** 四条路都被堵时的兜底：选可达空间最大的方向 */
  survive(state) {
    const head = state.snake[0];
    const bodyLen = state.snake.length - 1;
    let best = -1, bestScore = -1;
    for (let d = 0; d < 4; d++) {
      if ((d + 2) % 4 === state.dir) continue;
      const nx = (head % state.cols) + DIR_VECTORS[d][0];
      const ny = ((head - (head % state.cols)) / state.cols) + DIR_VECTORS[d][1];
      if (nx < 0 || nx >= state.cols || ny < 0 || ny >= state.rows) continue;
      const ni = ny * state.cols + nx;
      let blocked = false;
      for (let k = 0; k < bodyLen; k++) if (state.snake[k] === ni) { blocked = true; break; }
      if (blocked) continue;
      const score = this.pf.reachable(ni, state.snake, bodyLen, 10000);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best < 0 ? state.dir : best;
  }

  move(state) {
    const apples = [...state.apples];
    if (apples.length === 0) return state.dir;
    if (!this.planValid(state, apples)) this.replan(state, apples);
    if (this.plan.length) {
      const next = this.plan.shift();
      return dirTo(this.cols, state.snake[0], next);
    }
    return this.survive(state);
  }
}

/* ---------------- 最优 AI ---------------- */
export class OptimalAI extends FollowAI {
  constructor(cols, rows, maxExact = 12) {
    super(cols, rows);
    this.maxExact = maxExact;
    this.exact = true;
  }

  pickTarget(state, apples) {
    const head = state.snake[0];
    const { order, cost, exact } = optimalOrder(head, apples, this.cols, this.maxExact);
    this.planCost = cost;
    this.order = order;
    this.exact = exact;
    // 若首选目标暂时不可达，顺延到次优目标
    for (let k = 0; k < order.length; k++) {
      const t = apples[order[k]];
      const path = this.pf.findTimeAware(head, t, state.snake)
        || this.pf.find(head, t, state.snake, state.snake.length - 1);
      if (path) { this.plan = path.slice(1); this.appleKey = apples.length; return -1; }
    }
    return -1;
  }

  replan(state, apples) {
    this.plan = [];
    this.pickTarget(state, apples);
  }
}

/* ---------------- 贪心基线：最近邻 ---------------- */
export class GreedyAI extends FollowAI {
  pickTarget(state, apples) {
    const head = state.snake[0];
    let best = -1, bestD = Infinity;
    for (const a of apples) {
      const d = l1(this.cols, head, a);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }
}

/* ---------------- 随机基线 ---------------- */
export class RandomAI {
  constructor(cols, rows, seed = 12345) {
    this.cols = cols;
    this.rows = rows;
    this.s = seed >>> 0;
  }
  reset() {}
  rnd() {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  move(state) {
    const head = state.snake[0];
    const bodyLen = state.snake.length - 1;
    const options = [];
    for (let d = 0; d < 4; d++) {
      if ((d + 2) % 4 === state.dir) continue;
      const x = (head % this.cols) + DIR_VECTORS[d][0];
      const y = ((head - (head % this.cols)) / this.cols) + DIR_VECTORS[d][1];
      if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) continue;
      const ni = y * this.cols + x;
      let blocked = false;
      for (let k = 0; k < bodyLen; k++) if (state.snake[k] === ni) { blocked = true; break; }
      if (!blocked) options.push(d);
    }
    if (options.length === 0) return state.dir;
    return options[Math.floor(this.rnd() * options.length)];
  }
}

/* ---------------- 单局执行器 ---------------- */
/**
 * 跑完一局，返回统计。
 * @param {object} opts {seed, cols, rows, apples, snakeLen, maxSteps}
 * @param {object} ai  具备 move(state) 的对象
 */
export function runGame(opts, ai) {
  const game = createGame(opts);
  const b = lowerBound(game, opts.maxExact != null ? opts.maxExact : 12);
  const bound = b.cost;
  const maxSteps = opts.maxSteps != null ? opts.maxSteps : 200000;
  if (ai.reset) ai.reset();
  while (game.status === 'running' && game.steps < maxSteps) {
    const d = ai.move(game);
    step(game, d);
  }
  return {
    seed: opts.seed,
    status: game.status,
    reason: game.reason,
    steps: game.steps,
    eaten: game.eaten,
    bound,
    boundExact: b.exact,
    gap: game.status === 'won' && b.exact ? game.steps - bound : null,
    moves: game.moves,
    game,
  };
}
