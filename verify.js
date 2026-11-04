// snake/verify.js —— 独立验证器：拿回放重演一遍，逐条核对规则。
// 不信任执行器给的任何统计，只信任 moves 本身。

import { createGame, step } from './js/core.js';

/**
 * @param {object} run  {seed, moves, cols, rows, apples, snakeLen}
 * @returns {{ok:boolean, issues:string[], detail:object}}
 */
export function verifyRun(run) {
  const cols = run.cols ?? 100;
  const rows = run.rows ?? 100;
  const snakeLen = run.snakeLen ?? 3;
  const moveList = run.moves;
  const issues = [];

  if (!Array.isArray(moveList)) return { ok: false, issues: ['moves 不是数组'], detail: {} };

  const g = createGame({ cols, rows, seed: run.seed, apples: run.apples, snakeLen });

  // 1) 初始状态合法性
  if (g.snake.length !== snakeLen) issues.push(`初始蛇长 ${g.snake.length} != ${snakeLen}`);
  if (g.apples.size === 0) issues.push('初始没有苹果');
  const initialAppleSet = new Set(g.apples);
  if (initialAppleSet.size !== g.apples.size) issues.push('苹果初始化时出现重复'); // Set 本身去重，留作断言位

  // 2) 逐帧重演
  for (let i = 0; i < moveList.length; i++) {
    const d = moveList[i];
    if (!Number.isInteger(d) || d < 0 || d > 3) { issues.push(`第 ${i + 1} 步方向非法: ${d}`); break; }
    if (g.status !== 'running') { issues.push(`第 ${i + 1} 步时游戏已结束(${g.status})`); break; }

    const prevDir = g.dir;
    // 反向必须被引擎忽略；若回放里含反向，说明生成端与规则不一致
    if ((d + 2) % 4 === prevDir) issues.push(`第 ${i + 1} 步是 180° 反向（${prevDir}->${d}）`);

    const beforeSteps = g.steps;
    const beforeLen = g.snake.length;
    const beforeApples = g.apples.size;

    step(g, d);

    if (g.steps !== beforeSteps + 1) issues.push(`第 ${i + 1} 步后步数异常: ${g.steps}`);

    if (g.status === 'dead') {
      issues.push(`第 ${i + 1} 步撞${g.reason === 'wall' ? '墙' : '自己'}，本局成绩无效`);
      break;
    }

    const ate = beforeApples - g.apples.size;
    if (ate > 1) issues.push(`第 ${i + 1} 步吃了 ${ate} 个苹果`);
    if (g.snake.length !== beforeLen + (ate > 0 ? 1 : 0)) {
      issues.push(`第 ${i + 1} 步蛇长变化异常: ${beforeLen} -> ${g.snake.length}（吃 ${ate} 个）`);
    }
    // 蛇身无重复格
    if (new Set(g.snake).size !== g.snake.length) issues.push(`第 $\{i + 1\} 步蛇身出现重叠格`);
  }

  // 3) 终局核对
  if (g.status !== 'won') issues.push(`未通关：status=${g.status}${g.reason ? ' reason=' + g.reason : ''}`);
  if (g.apples.size !== 0) issues.push(`仍有 ${g.apples.size} 个苹果未吃`);
  if (g.eaten !== g.initialApples) issues.push(`吃苹果数 ${g.eaten} != 初始 ${g.initialApples}`);
  if (g.snake.length !== snakeLen + g.eaten) issues.push(`终局蛇长 ${g.snake.length} != ${snakeLen}+${g.eaten}`);
  if (g.steps !== moveList.length) issues.push(`步数 ${g.steps} != 回放长度 ${moveList.length}`);
  if (run.reportedSteps != null && run.reportedSteps !== g.steps) {
    issues.push(`上报步数 ${run.reportedSteps} != 重演步数 ${g.steps}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    detail: {
      seed: run.seed,
      steps: g.steps,
      eaten: g.eaten,
      snakeLen: g.snake.length,
      status: g.status,
    },
  };
}
