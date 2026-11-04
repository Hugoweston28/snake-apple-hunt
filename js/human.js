// snake/js/human.js —— 人类可玩：键盘输入缓冲 + 实时最优对照
//
// 关键设计：
// 1) 输入缓冲队列（最多 2 个转向）。不做的话，16ms 内连按两个方向会丢输入，
//    玩家会被迫走反方向撞自己——这是最劝退的体验 bug。
// 2) 禁止 180° 反向：按反方向直接忽略，不惩罚。
// 3) 实时幽灵路线：从"你当前的位置"出发重新算最优，而不是回放 AI 自己的那局。
//    所以看到的是"如果现在交给 AI，它怎么走"，以及"你还能做到的最好成绩"。

import { createGame, step } from './core.js';
import { optimalOrder, PathFinder, lowerBound } from './ai.js';

export const KEY_DIR = {
  ArrowUp: 0, KeyW: 0,
  ArrowRight: 1, KeyD: 1,
  ArrowDown: 2, KeyS: 2,
  ArrowLeft: 3, KeyA: 3,
};

/** 实时最优顾问：给定当前局面，算出剩余最短步数与路线 */
export class Advisor {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.pf = new PathFinder(cols, rows);
    this.key = '';
    this.plan = [];
    this.cost = 0;
  }

  update(state) {
    const apples = [...state.apples].sort((a, b) => a - b);
    const key = state.snake[0] + '|' + apples.join(',');
    if (key === this.key) return this;
    this.key = key;

    if (apples.length === 0) { this.plan = []; this.cost = 0; return this; }

    const { order, cost } = optimalOrder(state.snake[0], apples, this.cols);
    this.cost = cost;
    this.plan = [];
    for (let k = 0; k < order.length; k++) {
      const target = apples[order[k]];
      const path = this.pf.find(state.snake[0], target, state.snake, state.snake.length - 1);
      if (path && path.length > 1) { this.plan = path.slice(1); break; }
    }
    return this;
  }
}

/** 一局人类对局 */
export class HumanSession {
  constructor(opts = {}) {
    this.cols = opts.cols != null ? opts.cols : 100;
    this.rows = opts.rows != null ? opts.rows : 100;
    this.snakeLen = opts.snakeLen != null ? opts.snakeLen : 3;
    this.apples = opts.apples != null ? opts.apples : 10;

    this.game = createGame({
      cols: this.cols, rows: this.rows,
      seed: opts.seed != null ? opts.seed : 1,
      apples: this.apples,
      snakeLen: this.snakeLen,
    });
    const b0 = lowerBound(this.game);
    this.bound0 = b0.cost;
    this.bound0Exact = b0.exact;
    this.advisor = new Advisor(this.cols, this.rows);

    this.buffer = [];
    this.script = [];        // 复核用的按键序列
    this.sps = 8;
    this.acc = 0;
    this.paused = false;
    this.finished = false;
  }

  get won() { return this.game.status === 'won'; }
  get dead() { return this.game.status === 'dead'; }

  /** 入队一个转向；返回是否被接受 */
  queue(dir) {
    if (this.finished) return false;
    const last = this.buffer.length ? this.buffer[this.buffer.length - 1] : this.game.dir;
    if (dir === last) return false;
    if ((dir + 2) % 4 === last) return false;   // 180° 反向直接忽略
    if (this.buffer.length >= 2) return false;
    this.buffer.push(dir);
    return true;
  }

  /** 走一步；返回是否真的走了 */
  advanceOne() {
    if (this.finished) return false;
    let d;
    if (this.script.length) d = this.script.shift();
    else if (this.buffer.length) d = this.buffer.shift();
    else d = this.game.dir;
    step(this.game, d);
    if (this.game.status !== 'running') this.finished = true;
    return true;
  }

  advance(dt) {
    if (this.finished || this.paused) return;
    this.acc += dt * this.sps;
    let guard = 0;
    while (this.acc >= 1 && !this.finished && guard++ < 400) {
      this.acc -= 1;
      this.advanceOne();
    }
  }

  /** 立即推进 n 步（复核用） */
  stepN(n) {
    for (let i = 0; i < n && !this.finished; i++) this.advanceOne();
  }

  /** 交给渲染器的帧，形状与 AI 回放完全一致 */
  frame() {
    this.advisor.update(this.game);
    return {
      steps: this.game.steps,
      snake: this.game.snake,
      apples: [...this.game.apples],
      eaten: this.game.eaten,
      status: this.game.status,
      reason: this.game.reason,
      dir: this.game.dir,
      plan: this.advisor.plan,
    };
  }

  /** 剩余最优步数（从当前位置出发） */
  get remainingBest() {
    return this.advisor.update(this.game).cost;
  }

  /** 你还能做到的最好总步数 */
  get bestReachableTotal() {
    return this.game.steps + this.remainingBest;
  }

  /** 按键序列 -> 方向数组（U/D/L/R） */
  static parseKeys(str) {
    const map = { U: 0, R: 1, D: 2, L: 3, u: 0, r: 1, d: 2, l: 3 };
    const out = [];
    for (const ch of String(str || '')) {
      if (map[ch] !== undefined) out.push(map[ch]);
    }
    return out;
  }

  /** 方向数组 -> 按键序列 */
  static toKeys(dirs) {
    return dirs.map((d) => 'URDL'[d]).join('');
  }
}
