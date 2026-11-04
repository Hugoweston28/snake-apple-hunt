// snake/bench.js —— 批量跑分：验证算法正确性 + 统计实测步数与理论下界的差距
// 用法：node bench.js [--runs 1000] [--seed 1] [--apples 10] [--cols 100] [--rows 100] [--snake 3] [--json out.json]

import { OptimalAI, GreedyAI, RandomAI, lowerBound, runGame } from './js/ai.js';
import { createGame } from './js/core.js';
import { verifyRun } from './verify.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = isNaN(Number(next)) ? next : Number(next); i++; }
    else out[key] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const RUNS = args.runs ?? 1000;
const SEED0 = args.seed ?? 1;
const APPLES = args.apples ?? 10;
const COLS = args.cols ?? 100;
const ROWS = args.rows ?? 100;
const SNAKE = args.snake ?? 3;

function stats(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const sum = s.reduce((x, y) => x + y, 0);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return {
    n: s.length,
    mean: sum / s.length,
    min: s[0],
    p50: q(0.5),
    p95: q(0.95),
    max: s[s.length - 1],
  };
}

function fmt(x, d = 1) {
  return x == null ? '-' : Number(x).toFixed(d);
}

function pad(s, w) {
  s = String(s);
  const len = [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
  return s + ' '.repeat(Math.max(0, w - len));
}

const ALGOS = [
  { key: 'optimal', name: '最优(Held-Karp)', make: () => new OptimalAI(COLS, ROWS) },
  { key: 'greedy', name: '贪心最近邻', make: () => new GreedyAI(COLS, ROWS) },
  { key: 'random', name: '随机游走', make: () => new RandomAI(COLS, ROWS, 999) },
];

const report = {
  config: { runs: RUNS, seed0: SEED0, apples: APPLES, cols: COLS, rows: ROWS, snake: SNAKE },
  algos: {},
};

console.log('');
console.log('贪吃蛇吃豆 · 批量跑分');
console.log(`局数 ${RUNS} · 地图 ${COLS}×${ROWS} · 苹果 ${APPLES} · 初始蛇长 ${SNAKE} · seed ${SEED0}..${SEED0 + RUNS - 1}`);
console.log('');

const header = pad('算法', 20) + pad('通关', 8) + pad('失败', 8) + pad('平均步数', 11) +
  pad('中位', 8) + pad('最少', 8) + pad('最多', 8) + pad('平均Gap', 10) + pad('最大Gap', 10) + pad('耗时', 9);
console.log(header);
console.log('-'.repeat(104));

const perAlgo = {};

for (const algo of ALGOS) {
  const t0 = Date.now();
  const stepsList = [];
  const gaps = [];
  const bounds = [];
  const failures = [];
  let wins = 0, deaths = 0, verifyFails = 0;
  const gapHist = new Map();

  for (let i = 0; i < RUNS; i++) {
    const seed = SEED0 + i;
    const opts = { seed, cols: COLS, rows: ROWS, apples: APPLES, snakeLen: SNAKE, maxExact: 12 };
    const ai = algo.make();
    const res = runGame(opts, ai);

    if (res.status === 'won') {
      wins++;
      stepsList.push(res.steps);
      bounds.push(res.bound);
      if (res.gap != null) {
        gaps.push(res.gap);
        gapHist.set(res.gap, (gapHist.get(res.gap) ?? 0) + 1);
      }
      // 独立重演校验
      const v = verifyRun({ seed, moves: res.moves, cols: COLS, rows: ROWS, apples: APPLES, snakeLen: SNAKE, reportedSteps: res.steps });
      if (!v.ok) { verifyFails++; if (verifyFails <= 3) console.log('  校验失败 seed=' + seed, v.issues.slice(0, 3)); }
    } else {
      deaths++;
      failures.push({ seed, reason: res.reason, steps: res.steps, eaten: res.eaten });
    }
  }

  const st = stats(stepsList);
  const gs = stats(gaps);
  const elapsed = Date.now() - t0;

  perAlgo[algo.key] = {
    name: algo.name, wins, deaths, verifyFails,
    steps: st, gap: gs, elapsedMs: elapsed,
    gapHist: Object.fromEntries([...gapHist.entries()].sort((a, b) => a[0] - b[0])),
    failures: failures.slice(0, 5),
  };
  report.algos[algo.key] = perAlgo[algo.key];

  console.log(
    pad(algo.name, 20) + pad(wins, 8) + pad(deaths, 8) +
    pad(fmt(st?.mean), 11) + pad(st?.p50 ?? '-', 8) + pad(st?.min ?? '-', 8) + pad(st?.max ?? '-', 8) +
    pad(fmt(gs?.mean, 2), 10) + pad(gs?.max ?? '-', 10) + pad(elapsed + 'ms', 9)
  );
}

console.log('');

const opt = perAlgo.optimal;
if (opt && opt.steps) {
  const hit = opt.gapHist[0] ?? 0;
  const total = opt.wins;
  console.log('最优算法细节');
  console.log(`  通关率          ${opt.wins}/${RUNS}  (${(opt.wins / RUNS * 100).toFixed(2)}%)`);
  console.log(`  重演校验失败    ${opt.verifyFails}`);
  console.log(`  步数 均值/中位  ${fmt(opt.steps.mean, 2)} / ${opt.steps.p50}`);
  if (opt.gap) {
    console.log(`  与下界差距     均值 ${fmt(opt.gap.mean, 3)}  最大 ${opt.gap.max}`);
    console.log(`  恰好达到下界   ${hit}/${total}  (${(hit / total * 100).toFixed(1)}%)`);
    console.log(`  差距分布       ${Object.entries(opt.gapHist).map(([k, v]) => `+${k}:${v}`).join('  ')}`);
  } else {
    console.log(`  ⚠️ 苹果数 ${APPLES} > 12，已降级为「最近邻 + 2-opt」，此处不再与下界比较`);
  }
  console.log('');
}

const greedy = perAlgo.greedy;
if (greedy && opt && greedy.steps && opt.steps) {
  const ratio = (greedy.steps.mean / opt.steps.mean - 1) * 100;
  console.log(`贪心 vs 最优：平均多走 ${fmt(greedy.steps.mean - opt.steps.mean, 2)} 步（+${fmt(ratio)}%）`);
  console.log('');
}

if (perAlgo.random && perAlgo.random.deaths > 0) {
  console.log(`随机游走：${perAlgo.random.deaths}/${RUNS} 局撞死，通关的也平均要走 ${fmt(perAlgo.random.steps?.mean)} 步`);
  console.log('');
}

const badOpt = perAlgo.optimal.verifyFails;
const badWins = RUNS - perAlgo.optimal.wins;
if (badOpt === 0 && badWins === 0) {
  console.log('✅ 最优算法：全部通关，重演校验 0 失败');
} else {
  console.log(`⚠️ 最优算法：未通关 ${badWins} 局，校验失败 ${badOpt} 局`);
}

if (args.json) {
  const fs = await import('node:fs');
  fs.writeFileSync(args.json, JSON.stringify(report, null, 2), 'utf8');
  console.log('结果已写入 ' + args.json);
}
