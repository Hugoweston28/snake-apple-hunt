// snake/tools/inspect_worst.js —— 找出差距最大的几局，拆解多走的那几步出在哪一段
import { createGame, step } from '../js/core.js';
import { OptimalAI, lowerBound, l1 } from '../js/ai.js';

const RUNS = Number(process.argv[2] ?? 1000);
const TOP = Number(process.argv[3] ?? 5);

function runOnce(seed) {
  const game = createGame({ seed, cols: 100, rows: 100, apples: 10, snakeLen: 3 });
  const bound = lowerBound(game).cost;
  const ai = new OptimalAI(100, 100);
  const marks = [];
  let prevHead = game.snake[0];
  let prevSteps = 0;
  let prevApples = game.apples.size;

  while (game.status === 'running') {
    const d = ai.move(game);
    step(game, d);
    if (game.apples.size < prevApples) {
      marks.push({
        at: game.steps,
        seg: game.steps - prevSteps,
        l1: l1(100, prevHead, game.snake[0]),
        applesLeft: game.apples.size,
      });
      prevHead = game.snake[0];
      prevSteps = game.steps;
      prevApples = game.apples.size;
    }
  }
  return { seed, status: game.status, steps: game.steps, bound, gap: game.steps - bound, marks };
}

const results = [];
for (let i = 0; i < RUNS; i++) results.push(runOnce(1 + i));

results.sort((a, b) => b.gap - a.gap);
console.log(`最差 ${TOP} 局（共 ${RUNS} 局，平均差距 ${(results.reduce((s, r) => s + r.gap, 0) / results.length).toFixed(3)}）`);
console.log('');
for (const r of results.slice(0, TOP)) {
  console.log(`seed=${r.seed}  步数=${r.steps}  下界=${r.bound}  多走=${r.gap}`);
  console.log('  段序  该段步数  曼哈顿  多走  剩余苹果');
  r.marks.forEach((m, k) => {
    console.log(`  ${String(k + 1).padStart(4)}  ${String(m.seg).padStart(8)}  ${String(m.l1).padStart(6)}  ${String(m.seg - m.l1).padStart(4)}  ${String(m.applesLeft).padStart(8)}`);
  });
  console.log('');
}

const gaps = results.map((r) => r.gap);
const even = gaps.every((g) => g % 2 === 0);
const hist = new Map();
for (const g of gaps) hist.set(g, (hist.get(g) ?? 0) + 1);
console.log('差距分布:', [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `+${k}:${v}`).join('  '));
console.log('所有差距是否都是偶数:', even ? '是（网格二分图的必然结果）' : '否 —— 需要检查');
