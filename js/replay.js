// snake/js/replay.js —— 整局录制 + 回放控制（帧序列与皮肤、渲染完全解耦）

import { createGame, step } from './core.js';
import { OptimalAI, GreedyAI, RandomAI, lowerBound } from './ai.js';

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/**
 * 把一局完整跑完并录成帧。
 * 帧里除了必然的游戏状态，还带上 AI 的当前计划，供"思考过程"叠加显示。
 */
export function recordRun(opts = {}) {
  const cols = opts.cols != null ? opts.cols : 100;
  const rows = opts.rows != null ? opts.rows : 100;
  const seed = opts.seed != null ? opts.seed : 1;
  const apples = opts.apples != null ? opts.apples : 10;
  const snakeLen = opts.snakeLen != null ? opts.snakeLen : 3;
  const algo = opts.algo != null ? opts.algo : 'optimal';

  const game = createGame({ cols, rows, seed, apples, snakeLen });
  const b = lowerBound(game, opts.maxExact != null ? opts.maxExact : 12);
  const bound = b.cost;
  const boundExact = b.exact;

  let ai;
  if (algo === 'greedy') ai = new GreedyAI(cols, rows);
  else if (algo === 'random') ai = new RandomAI(cols, rows, seed * 2654435761 >>> 0);
  else ai = new OptimalAI(cols, rows);

  const frames = [];
  const snap = () => frames.push({
    steps: game.steps,
    snake: game.snake.slice(),
    apples: [...game.apples],
    eaten: game.eaten,
    status: game.status,
    reason: game.reason,
    dir: game.dir,
    plan: ai.plan ? ai.plan.slice() : [],
  });

  snap();
  const t0 = now();
  let guard = 0;
  while (game.status === 'running' && guard++ < 100000) {
    const d = ai.move(game);
    step(game, d);
    snap();
  }
  const computeMs = now() - t0;

  return {
    cols, rows, seed, apples, snakeLen, algo,
    bound,
    boundExact,
    steps: game.steps,
    status: game.status,
    reason: game.reason,
    won: game.status === 'won',
    gap: game.status === 'won' && boundExact ? game.steps - bound : null,
    computeMs,
    moves: game.moves,
    frames,
  };
}

/** 回放控制器：只管"现在演到第几帧" */
export class Replay {
  constructor(run) {
    this.run = run;
    this.i = 0;
    this.playing = false;
    this.sps = 40;      // 每秒帧数（= 每秒步数）
    this.acc = 0;
  }

  get lastIndex() { return this.run.frames.length - 1; }
  get frame() { return this.run.frames[this.i]; }
  get atEnd() { return this.i >= this.lastIndex; }

  seek(i) {
    this.i = Math.max(0, Math.min(this.lastIndex, Math.round(i)));
    this.acc = 0;
  }

  play() {
    if (this.atEnd) this.seek(0);
    this.playing = true;
  }

  pause() { this.playing = false; }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  stepOnce() {
    this.pause();
    if (!this.atEnd) this.seek(this.i + 1);
  }

  backOnce() {
    this.pause();
    if (this.i > 0) this.seek(this.i - 1);
  }

  advance(dtSeconds) {
    if (!this.playing) return;
    this.acc += dtSeconds * this.sps;
    const n = Math.floor(this.acc);
    if (n > 0) {
      this.acc -= n;
      this.i = Math.min(this.lastIndex, this.i + n);
    }
    if (this.i >= this.lastIndex) this.playing = false;
  }
}
