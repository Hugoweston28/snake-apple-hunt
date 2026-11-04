// snake/js/app.js —— 界面装配：模式（AI 自动 / 人类游玩）、控件、HUD、主循环

import { Renderer } from './render.js';
import { Replay, recordRun } from './replay.js';
import { SKINS, getSkin } from './skins.js';
import { HumanSession, KEY_DIR } from './human.js';
import { TouchSteer } from './touch.js';

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $('board'),
  steps: $('stat-steps'),
  bound: $('stat-bound'),
  gap: $('stat-gap'),
  gapLabel: $('stat-gap-label'),
  apples: $('stat-apples'),
  len: $('stat-len'),
  status: $('stat-status'),
  progress: $('progress'),
  play: $('btn-play'),
  step: $('btn-step'),
  back: $('btn-back'),
  replay: $('btn-replay'),
  newGame: $('btn-new'),
  algo: $('algo'),
  speed: $('speed'),
  seed: $('seed'),
  seedApply: $('btn-seed'),
  skins: $('skins'),
  plan: $('show-plan'),
  note: $('note'),
  copy: $('btn-copy'),
  modes: Array.from(document.querySelectorAll('.modes .mode')),
  boundLabel: $('stat-bound-label'),
  applesSel: $('apples'),
  snakeSel: $('snakeLen'),
  advHint: $('adv-hint'),
};

const state = {
  mode: 'ai',          // ai | human
  skinId: 'neon',
  algo: 'optimal',
  speedMul: 1,
  seed: 1,
  apples: 10,
  snakeLen: 3,
  MAX_EXACT: 12,
  run: null,
  replay: null,
  human: null,
  lastHudKey: '',
};

const renderer = new Renderer(els.canvas);

/* ---------------- 触摸转向 + 划痕 ---------------- */
const coarse = typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches;

const steer = new TouchSteer(document.getElementById('board-wrap'), document.getElementById('fx'), {
  isEnabled: function () {
    return state.mode === 'human' && state.human != null && !state.human.finished;
  },
  getSkin: function () { return renderer.skin; },
  onTurn: function (dir) {
    const s = state.human;
    if (!s) return;
    // 手机上暂停按钮在棋盘下方、不在视野内，滑动就当作"继续"
    if (s.paused) { s.paused = false; syncPlayButton(); }
    s.queue(dir);
  },
});

/* ---------------- 皮肤 ---------------- */
function swatchCss(list) {
  if (list.length === 1) return list[0];
  return `linear-gradient(135deg, ${list.join(', ')})`;
}

function buildSkinButtons() {
  els.skins.innerHTML = '';
  for (const s of SKINS) {
    const b = document.createElement('div');
    b.className = 'skin' + (s.id === state.skinId ? ' active' : '');
    b.dataset.id = s.id;
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = swatchCss(s.swatch);
    const nm = document.createElement('span');
    nm.textContent = s.name;
    b.appendChild(sw);
    b.appendChild(nm);
    b.addEventListener('click', () => selectSkin(s.id));
    els.skins.appendChild(b);
  }
}

function selectSkin(id) {
  state.skinId = id;
  renderer.setSkin(getSkin(id));
  renderer.resize();
  for (const el of els.skins.children) el.classList.toggle('active', el.dataset.id === id);
  try { localStorage.setItem('snake.skin', id); } catch (e) { /* file:// 下可能不可用 */ }
}

/* ---------------- AI 模式 ---------------- */
function startRun(seed, autoPlay = true) {
  const run = recordRun({
    seed,
    cols: 100,
    rows: 100,
    apples: state.apples,
    snakeLen: state.snakeLen,
    algo: state.algo,
    maxExact: state.MAX_EXACT,
  });

  state.seed = seed;
  state.run = run;
  state.replay = new Replay(run);
  state.replay.sps = 40 * state.speedMul;

  renderer.setBoard(run.cols, run.rows);
  renderer.resize();

  els.seed.value = String(seed);
  els.progress.max = String(run.frames.length - 1);
  els.progress.value = '0';
  state.lastHudKey = '';

  if (autoPlay) state.replay.play();
  syncPlayButton();
  updateHud(true);
  renderNote();
}

/* ---------------- 人类模式 ---------------- */
function startHuman(seed, opts = {}) {
  const s = new HumanSession({
    seed,
    cols: 100,
    rows: 100,
    apples: state.apples,
    snakeLen: state.snakeLen,
  });
  s.sps = 8 * state.speedMul;
  state.seed = seed;
  state.human = s;
  state.lastHudKey = '';

  renderer.setBoard(100, 100);
  renderer.resize();

  els.seed.value = String(seed);
  els.progress.max = '0';
  els.progress.value = '0';

  if (opts.keys) s.script = HumanSession.parseKeys(opts.keys);
  if (opts.frame != null && opts.frame > 0) { s.stepN(opts.frame); s.paused = true; }

  syncPlayButton();
  updateHud(true);
  renderNote();
}

/* ---------------- 模式切换 ---------------- */
function setMode(mode, opts = {}) {
  state.mode = mode;
  for (const b of els.modes) b.classList.toggle('active', b.dataset.mode === mode);

  if (mode === 'ai') {
    state.human = null;
    startRun(opts.seed != null ? opts.seed : state.seed, opts.frame == null);
    if (opts.frame != null) {
      state.replay.pause();
      state.replay.seek(opts.frame);
      syncPlayButton();
      updateHud(true);
    }
  } else {
    state.run = null;
    state.replay = null;
    startHuman(opts.seed != null ? opts.seed : state.seed, { keys: opts.keys, frame: opts.frame });
  }

  els.progress.disabled = mode === 'human';
  els.back.disabled = mode === 'human';
  els.copy.hidden = true;
  renderNote();
}

/* ---------------- HUD ---------------- */
function statusText(status, reason) {
  if (status === 'won') return '通关';
  if (status === 'dead') return reason === 'wall' ? '撞墙' : '撞身';
  return '进行中';
}

function colourStatus(el, text) {
  el.textContent = text;
  el.className = text === '通关' ? 'good' : text === '进行中' ? '' : 'bad';
}

function updateHud(force = false) {
  if (state.mode === 'ai') {
    const rp = state.replay, run = state.run;
    if (!rp || !run) return;
    const f = rp.frame;
    const key = `a|${rp.i}|${state.algo}|${state.seed}`;
    if (!force && key === state.lastHudKey) return;
    state.lastHudKey = key;

    els.steps.textContent = String(f.steps);
    els.apples.textContent = String(f.apples.length);
    els.len.textContent = String(f.snake.length);
    els.bound.textContent = String(run.bound);
    els.boundLabel.textContent = run.boundExact === false ? '近似值' : '理论最优';
    els.gapLabel.textContent = '差距';
    colourStatus(els.status, statusText(f.status, f.reason));

    if (rp.atEnd && run.won && run.gap != null) {
      els.gap.textContent = '+' + run.gap;
      els.gap.className = run.gap === 0 ? 'good' : run.gap <= 6 ? 'good' : 'warn';
    } else {
      els.gap.textContent = '—';
      els.gap.className = '';
    }
    els.progress.value = String(rp.i);
    syncPlayButton();
    return;
  }

  const s = state.human;
  if (!s) return;
  const g = s.game;
  const key = `h|${g.steps}|${g.status}|${g.apples.size}`;
  if (!force && key === state.lastHudKey) return;
  state.lastHudKey = key;

  els.steps.textContent = String(g.steps);
  els.apples.textContent = String(g.apples.size);
  els.len.textContent = String(g.snake.length);
  els.bound.textContent = String(s.bound0);
  els.boundLabel.textContent = s.bound0Exact === false ? '近似值' : '理论最优';
  colourStatus(els.status, statusText(g.status, g.reason));

  if (g.status === 'won') {
    els.gapLabel.textContent = '差距';
    const gap = g.steps - s.bound0;
    els.gap.textContent = s.bound0Exact === false ? '—' : '+' + gap;
    els.gap.className = s.bound0Exact === false ? '' : gap === 0 ? 'good' : gap <= 6 ? 'good' : 'warn';
  } else if (g.status === 'dead') {
    els.gapLabel.textContent = '差距';
    els.gap.textContent = '—';
    els.gap.className = '';
  } else {
    // 还没走完：显示"你还能做到的最好总步数"
    els.gapLabel.textContent = '最佳可达';
    els.gap.textContent = String(s.bestReachableTotal);
    els.gap.className = s.bestReachableTotal === s.bound0 ? 'good' : 'warn';
  }
  syncPlayButton();
}

function syncPlayButton() {
  if (state.mode === 'ai') {
    const rp = state.replay;
    if (!rp) return;
    els.play.textContent = rp.playing ? '暂停' : rp.atEnd ? '重播' : '播放';
    return;
  }
  const s = state.human;
  if (!s) return;
  if (s.finished) els.play.textContent = '再来一局';
  else els.play.textContent = s.paused ? '继续' : '暂停';
}

function renderNote() {
  if (state.mode === 'ai') {
    const run = state.run;
    if (!run) return;
    const algoName = { optimal: '最优', greedy: '贪心', random: '随机' }[state.algo] || state.algo;
    const verdict = run.won
      ? `<span class="ok">通关</span> · 实走 <b>${run.steps}</b> 步 · 理论最优 <b>${run.bound}</b> 步 · 差距 <b>+${run.gap}</b> 步（+${((run.gap / run.bound) * 100).toFixed(1)}%）`
      : `<span class="no">${run.reason === 'wall' ? '撞墙' : '撞身'}</span> · 第 ${run.steps} 步出局 · 本局成绩无效 · 理论最优 ${run.bound} 步`;
    els.note.innerHTML =
      `<b>seed ${run.seed}</b> · 算法 ${algoName}<br>` +
      `${verdict}<br>` +
      `整局计算耗时 ${run.computeMs.toFixed(1)} ms（含 ${run.frames.length - 1} 次决策）` +
      (run.boundExact === false
        ? `<br><span class="no">苹果 ${run.apples} > ${state.MAX_EXACT}：已降级为「最近邻 + 2-opt」，上面的"近似值"不是严格下界。</span>`
        : '');
    return;
  }

  const s = state.human;
  if (!s) return;
  const g = s.game;

  if (g.status === 'won') {
    const gap = g.steps - s.bound0;
    els.note.innerHTML =
      `<b>seed ${g.seed}</b> · 人类通关<br>` +
      `<span class="ok">通关</span> · 实走 <b>${g.steps}</b> 步 · 理论最优 <b>${s.bound0}</b> 步 · 差距 <b>+${gap}</b> 步（+${((gap / s.bound0) * 100).toFixed(1)}%）`;
    els.copy.hidden = false;
  } else if (g.status === 'dead') {
    els.note.innerHTML =
      `<b>seed ${g.seed}</b> · 人类对局<br>` +
      `<span class="no">${g.reason === 'wall' ? '撞墙' : '撞身'}</span> · 第 <b>${g.steps}</b> 步出局 · <span class="no">本局成绩无效</span><br>` +
      `该 seed 理论最优 <b>${s.bound0}</b> 步`;
    els.copy.hidden = false;
  } else {
    els.note.innerHTML =
      `<b>seed ${g.seed}</b> · 人类对局<br>` +
      (coarse
        ? '手指在棋盘任意位置滑动转向 · 不抬手可连续转<br>'
        : '方向键 / WASD 控制，也可在棋盘上按住拖动<br>') +
      `虚线是<span class="ok">从你当前位置出发</span>的最优路线，不是 AI 自己的那局。`;
    els.copy.hidden = true;
  }
}

/* ---------------- 复核链接 ---------------- */
function replayUrl() {
  const s = state.human;
  if (!s) return '';
  const keys = HumanSession.toKeys(s.game.moves);
  const base = (typeof location !== 'undefined' ? location.href.split('#')[0] : '');
  return `${base}#mode=human&seed=${s.game.seed}&keys=${keys}`;
}

function copyLink() {
  const url = replayUrl();
  if (!url) return;
  const done = () => { els.copy.textContent = '已复制'; setTimeout(() => (els.copy.textContent = '复制复核链接'), 1500); };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => fallbackCopy(url, done));
    } else fallbackCopy(url, done);
  } catch (e) { fallbackCopy(url, done); }
}

function fallbackCopy(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  } catch (e) {
    els.note.innerHTML += '<br><span class="no">复制失败，请手动从地址栏复制</span>';
  }
}

/* ---------------- 高级设置 ---------------- */
function updateAdvHint() {
  if (state.apples > state.MAX_EXACT) {
    els.advHint.className = 'hint warn';
    els.advHint.textContent =
      `苹果 ${state.apples} > ${state.MAX_EXACT}：Held-Karp 已关闭，改用「最近邻 + 2-opt」。`
      + `此时"理论最优"变成近似值，不能再当严格下界用。`;
  } else {
    els.advHint.className = 'hint';
    els.advHint.textContent = `${state.apples} 个苹果 / 初始蛇长 ${state.snakeLen} 格，Held-Karp 精确求解。`;
  }
}

els.applesSel.addEventListener('change', () => {
  state.apples = Number(els.applesSel.value);
  updateAdvHint();
  if (state.mode === 'ai') startRun(state.seed); else startHuman(state.seed);
});

els.snakeSel.addEventListener('change', () => {
  state.snakeLen = Number(els.snakeSel.value);
  updateAdvHint();
  if (state.mode === 'ai') startRun(state.seed); else startHuman(state.seed);
});

/* ---------------- 主循环 ---------------- */
let lastT = 0;
let tick0 = 0;
let bootCleared = false;

function currentFrame() {
  if (state.mode === 'ai') return state.replay ? state.replay.frame : null;
  return state.human ? state.human.frame() : null;
}

function loop(t) {
  if (!lastT) lastT = t;
  if (!tick0) tick0 = t;
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;

  if (state.mode === 'ai' && state.replay) {
    const wasFinished = state.replay.atEnd;
    state.replay.advance(dt);
    if (!wasFinished && state.replay.atEnd) syncPlayButton();
  } else if (state.mode === 'human' && state.human) {
    const wasFinished = state.human.finished;
    state.human.advance(dt);
    if (!wasFinished && state.human.finished) { syncPlayButton(); renderNote(); }
  }

  const f = currentFrame();
  if (f) {
    if (!steer.size || steer.size[0] !== els.canvas.clientWidth || steer.size[1] !== els.canvas.clientHeight) {
      steer.resize();
    }
    renderer.draw(f, (t - tick0) / 1000);
    steer.render();
    updateHud();
    // 首帧画完才撤掉"启动自检"浮层：中途任何一步抛错，浮层会保留并显示原因
    if (!bootCleared) {
      bootCleared = true;
      if (typeof window !== 'undefined' && window.__SNAKE_OK) window.__SNAKE_OK();
    }
  }
  requestAnimationFrame(loop);
}

/* ---------------- 事件 ---------------- */
els.play.addEventListener('click', () => {
  if (state.mode === 'ai') {
    const rp = state.replay;
    if (!rp) return;
    rp.toggle();
  } else {
    const s = state.human;
    if (!s) return;
    if (s.finished) { startHuman(s.game.seed); return; }
    s.paused = !s.paused;
  }
  syncPlayButton();
});

els.step.addEventListener('click', () => {
  if (state.mode === 'ai' && state.replay) state.replay.stepOnce();
  else if (state.human && !state.human.finished) { state.human.paused = true; state.human.advanceOne(); }
  syncPlayButton();
  updateHud(true);
  renderNote();
});

els.back.addEventListener('click', () => {
  if (state.replay) state.replay.backOnce();
  updateHud(true);
});

els.replay.addEventListener('click', () => {
  if (state.mode === 'ai') {
    const rp = state.replay;
    if (!rp) return;
    rp.seek(0);
    rp.play();
  } else {
    startHuman(state.seed);
  }
  syncPlayButton();
  updateHud(true);
  renderNote();
});

els.newGame.addEventListener('click', () => {
  const seed = newSeed();
  if (state.mode === 'ai') startRun(seed);
  else startHuman(seed);
});

els.algo.addEventListener('change', () => {
  state.algo = els.algo.value;
  if (state.mode === 'ai') startRun(state.seed);
});

els.speed.addEventListener('change', () => {
  state.speedMul = Number(els.speed.value);
  if (state.replay) state.replay.sps = 40 * state.speedMul;
  if (state.human) state.human.sps = 8 * state.speedMul;
});

els.seedApply.addEventListener('click', () => {
  const v = Math.max(1, Math.floor(Number(els.seed.value) || 1));
  if (state.mode === 'ai') startRun(v);
  else startHuman(v);
});

els.progress.addEventListener('input', () => {
  const rp = state.replay;
  if (!rp) return;
  rp.pause();
  rp.seek(Number(els.progress.value));
  syncPlayButton();
  updateHud(true);
});

els.plan.addEventListener('change', () => {
  renderer.showPlan = els.plan.checked;
});

els.copy.addEventListener('click', copyLink);

for (const b of els.modes) {
  b.addEventListener('click', () => setMode(b.dataset.mode));
}

window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;

  if (state.mode === 'human') {
    const d = KEY_DIR[e.code];
    if (d !== undefined) {
      e.preventDefault();
      if (state.human) state.human.queue(d);
      return;
    }
  }

  if (e.code === 'Space') { e.preventDefault(); els.play.click(); }
  else if (e.code === 'ArrowRight' && state.mode === 'ai') { e.preventDefault(); els.step.click(); }
  else if (e.code === 'ArrowLeft' && state.mode === 'ai') { e.preventDefault(); els.back.click(); }
  else if (e.code === 'KeyR') { e.preventDefault(); els.replay.click(); }
});

window.addEventListener('resize', () => {
  renderer.resize();
  steer.resize();
});

/* ---------------- 启动 ---------------- */
function newSeed() {
  return 1 + Math.floor(Math.random() * 999999);
}

function readHashParams() {
  try {
    if (typeof location === 'undefined') return {};
    const h = String(location.hash || '').replace(/^#/, '');
    if (!h) return {};
    const p = new URLSearchParams(h);
    return {
      seed: p.get('seed') != null ? Number(p.get('seed')) : undefined,
      algo: p.get('algo') || undefined,
      skin: p.get('skin') || undefined,
      frame: p.get('frame') != null ? Number(p.get('frame')) : undefined,
      frameInHuman: p.get('frame') != null ? Number(p.get('frame')) : undefined,
      plan: p.get('plan'),
      mode: p.get('mode') || undefined,
      keys: p.get('keys') || undefined,
      apples: p.get('apples') || undefined,
      snake: p.get('snake') || undefined,
    };
  } catch (e) { return {}; }
}

try {
  const saved = localStorage.getItem('snake.skin');
  if (saved && SKINS.some((s) => s.id === saved)) state.skinId = saved;
  const savedSeed = Number(localStorage.getItem('snake.seed'));
  if (savedSeed > 0) state.seed = savedSeed;
} catch (e) { /* file:// 下可能不可用 */ }

const hp = readHashParams();
if (hp.skin && SKINS.some((s) => s.id === hp.skin)) state.skinId = hp.skin;
if (hp.algo && ['optimal', 'greedy', 'random'].includes(hp.algo)) {
  state.algo = hp.algo;
  els.algo.value = hp.algo;
}
if (hp.apples) { state.apples = Number(hp.apples); els.applesSel.value = String(state.apples); }
if (hp.snake) { state.snakeLen = Number(hp.snake); els.snakeSel.value = String(state.snakeLen); }
if (hp.plan === '0') {
  els.plan.checked = false;
  renderer.showPlan = false;
}

buildSkinButtons();
renderer.setSkin(getSkin(state.skinId));
renderer.setBoard(100, 100);
renderer.resize();
updateAdvHint();

setMode(hp.mode === 'human' ? 'human' : 'ai', {
  seed: hp.seed != null ? hp.seed : state.seed,
  frame: hp.frameInHuman,
  keys: hp.keys,
});

// 调试/自动化钩子
if (typeof window !== 'undefined') {
  window.SNAKE = { state, els, renderer, steer, setMode, startHuman, startRun, HumanSession };
}

requestAnimationFrame(loop);
