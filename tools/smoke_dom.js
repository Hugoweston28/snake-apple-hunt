// snake/tools/smoke_dom.js —— 没有浏览器时用 DOM 桩跑一遍 dist/snake.html，抓运行时错误并验证人类模式
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { verifyRun } from '../verify.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'dist', 'snake.html'), 'utf8');

// 收集全部内联脚本（第一段是 ES5 自检脚本，第二段是主程序），按顺序执行
const blocks = [];
{
  const re = /<script>\n([\s\S]*?)\n<\/script>/g;
  let mm;
  while ((mm = re.exec(html)) !== null) blocks.push(mm[1]);
}
if (blocks.length === 0) throw new Error('没找到内联脚本');

/* ---------- DOM 桩 ---------- */
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, p) { if (p in t) return t[p]; return () => {}; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function makeCanvas(w = 800, h = 800) {
  return {
    width: w, height: h, clientWidth: w, clientHeight: h, style: {},
    getContext: () => makeCtx(),
  };
}

const elements = new Map();
function makeEl(id) {
  return {
    id, className: '', textContent: '', innerHTML: '', value: '0', max: '0',
    checked: true, hidden: false, disabled: false, style: {}, dataset: {},
    children: [], tagName: 'DIV',
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    click() {},
    parentNode: { removeChild() {} },
    getBoundingClientRect: () => ({ width: 800, height: 800, left: 0, top: 0 }),
  };
}

let rafCb = null;
const store = new Map();
const bodyEl = makeEl('body');

const documentStub = {
  body: bodyEl,
  getElementById(id) {
    if (!elements.has(id)) {
      elements.set(id, (id === 'board' || id === 'fx')
        ? Object.assign(makeCanvas(), { id })
        : makeEl(id));
    }
    return elements.get(id);
  },
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return makeEl('created-' + tag);
  },
  querySelectorAll() { return []; },
};

const sandbox = {
  console,
  Math, Date, JSON, Number, String, Boolean, Array, Object, Set, Map,
  Int32Array, Float64Array, Int8Array, Uint8Array,
  URLSearchParams,
  document: documentStub,
  window: { devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} },
  navigator: { clipboard: null },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  },
  performance: { now: () => Date.now() },
  location: { href: 'file:///stub/index.html', protocol: 'file:' },
  setTimeout: () => 0,
  clearTimeout: () => 0,
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
};
sandbox.globalThis = sandbox;
sandbox.window.document = documentStub;
sandbox.window.localStorage = sandbox.localStorage;

/* ---------- 执行 ---------- */
const ctx = vm.createContext(sandbox);
blocks.forEach((src, i) => vm.runInContext(src, ctx, { filename: 'inline-' + i + '.js' }));

let t = 0;
function pump(n) {
  for (let i = 0; i < n; i++) {
    t += 16.7;
    const cb = rafCb;
    rafCb = null;
    if (!cb) break;
    cb(t);
  }
}

const problems = [];
function check(name, cond, detail) {
  if (cond) console.log('  ✅ ' + name);
  else { console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); problems.push(name); }
}

console.log('启动自检');
check('自检浮层脚本已注册 __SNAKE_OK', typeof sandbox.window.__BOOT_LOG === 'function');
pump(3);
check('首帧画完后自检浮层被撤掉', sandbox.window.__SNAKE_OK === null,
  typeof sandbox.window.__SNAKE_OK);

/* ---------- 1. AI 模式 ---------- */
console.log('AI 模式');
pump(20);
const AI = sandbox.window.SNAKE;
check('脚本执行无异常，SNAKE 钩子可用', !!AI);
const aiRun = AI.state.run;
check('已录完整局', aiRun && aiRun.frames.length > 1, aiRun && aiRun.frames.length);
check('回放推进了步数', Number(elements.get('stat-steps').textContent) > 0,
  elements.get('stat-steps').textContent);

const vAI = verifyRun({
  seed: aiRun.seed, moves: aiRun.moves, cols: 100, rows: 100, apples: 10, snakeLen: 3,
  reportedSteps: aiRun.steps,
});
check('AI 局重演校验通过', vAI.ok, vAI.issues.join('; '));

/* ---------- 2. 人类模式：输入缓冲语义 ---------- */
console.log('\n人类模式 · 输入缓冲');
AI.setMode('human', { seed: 7 });
const H = AI.state.human;
check('建立人类对局', !!H && H.game.seed === 7);

const startDir = H.game.dir;
const bufCases = [];
bufCases.push(['朝当前方向按键被忽略', H.queue(startDir) === false]);
bufCases.push(['180° 反向被忽略', H.queue((startDir + 2) % 4) === false]);
const turn = (startDir + 1) % 4;
bufCases.push(['合法转向被接受', H.queue(turn) === true]);
bufCases.push(['同一方向重复入队被拒', H.queue(turn) === false]);
bufCases.push(['反向（相对队尾）被拒', H.queue((turn + 2) % 4) === false]);
bufCases.push(['第二个转向可入队', H.queue((turn + 2) % 4 === (turn + 1) % 4 ? (turn + 1) % 4 : (turn + 1) % 4) === true]);
bufCases.push(['队列上限 2', H.queue((turn + 1) % 4) === false]);
for (const [n, ok] of bufCases) check(n, ok);

/* ---------- 3. 人类模式：用 AI 的走法跑通，验证与 AI 局完全一致 ---------- */
console.log('\n人类模式 · 与 AI 结果对齐');
const moves = aiRun.moves;
const H2 = new (sandbox.window.SNAKE.HumanSession)({ seed: aiRun.seed, cols: 100, rows: 100, apples: 10, snakeLen: 3 });
H2.script = moves.slice();
H2.stepN(moves.length);

check('复现后通关', H2.game.status === 'won', H2.game.status + '/' + H2.game.reason);
check('步数与 AI 一致', H2.game.steps === aiRun.steps, H2.game.steps + ' vs ' + aiRun.steps);
check('理论最优与 AI 一致', H2.bound0 === aiRun.bound, H2.bound0 + ' vs ' + aiRun.bound);

const vH = verifyRun({
  seed: aiRun.seed, moves: H2.game.moves, cols: 100, rows: 100, apples: 10, snakeLen: 3,
  reportedSteps: H2.game.steps,
});
check('人类局重演校验通过', vH.ok, vH.issues.join('; '));

check('复核按键串长度 = 步数', H2.game.moves.length === moves.length);
const keys = H2.constructor.toKeys(H2.game.moves);
check('按键串可往返解析', keys.length === moves.length && H2.constructor.parseKeys(keys).every((d, i) => d === moves[i]));

/* ---------- 4. 死亡判定 ---------- */
console.log('\n人类模式 · 撞墙判定');
const H3 = new (sandbox.window.SNAKE.HumanSession)({ seed: 3, cols: 20, rows: 20, apples: 4, snakeLen: 3 });
// 一直朝一个方向走，必然会撞到边界
H3.script = new Array(200).fill(H3.game.dir);
H3.stepN(200);
check('撞墙后结束', H3.game.status === 'dead' && H3.game.reason === 'wall',
  H3.game.status + '/' + H3.game.reason);
check('结束后不再前进', H3.advanceOne() === false);

/* ---------- 汇总 ---------- */
console.log('');
if (problems.length === 0) {
  console.log('✅ 全部通过');
} else {
  console.log('❌ ' + problems.length + ' 项失败：' + problems.join('、'));
  process.exitCode = 1;
}
