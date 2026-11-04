// snake/js/touch.js —— 手指滑动转向 + 划痕特效
//
// 交互设计（"任意位置滑动"）：
//   · 手指按在棋盘任意位置，以【按下点】为锚点，不占用任何固定 UI
//   · 手指相对锚点位移超过阈值 → 取主轴方向发一次转向，并把锚点移到当前点
//   · 所以不抬手也能连续转向（上 → 右 → 下 …），这正是蛇需要的手感
//   · 不设固定 D-pad：100×100 在手机上，拇指一按就盖住一大片棋盘
//
// 视觉反馈（"划痕"）：
//   · 光带：沿手指轨迹的两层描边（宽而淡的光晕 + 窄而亮的核心），随时间收细、变暗
//   · 涟漪：每次真正发出转向的位置炸开一个扩散圆环 + 一道方向切口
//   · 深色皮肤用 'lighter' 叠加，浅色皮肤用普通叠加（否则在白底上会洗成一片白）

const THRESH = 24;      // 触发一次转向所需的最小位移（CSS px）
const LIFE = 0.45;      // 划痕存活时间（秒）
const MAXPTS = 64;      // 最多保留的轨迹点

function hexRgb(s) {
  if (typeof s !== 'string') return [0, 0, 0];
  let h = s.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum(hex) {
  const c = hexRgb(hex);
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

export class TouchSteer {
  constructor(host, overlay, opts) {
    opts = opts || {};
    this.host = host;
    this.canvas = overlay;
    this.ctx = overlay.getContext('2d');
    this.onTurn = opts.onTurn || function () {};
    this.isEnabled = opts.isEnabled || function () { return true; };
    this.getSkin = opts.getSkin || function () { return null; };

    this.pid = null;
    this.anchor = null;
    this.rect = null;
    this.pts = [];
    this.ripples = [];
    this.size = null;
    this.dpr = 1;
    this.strokes = 0;   // 统计：本次会话发出过多少次转向（调试用）

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);

    const h = this.host;
    h.addEventListener('pointerdown', this._down, { passive: false });
    h.addEventListener('pointermove', this._move, { passive: false });
    h.addEventListener('pointerup', this._up);
    h.addEventListener('pointercancel', this._up);
    h.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  resize() {
    const c = this.canvas;
    const host = this.host;
    const w = host.clientWidth || c.clientWidth || 640;
    const h = host.clientHeight || c.clientHeight || 640;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.dpr = dpr;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = [w, h];
    this.rect = host.getBoundingClientRect();
  }

  _pos(e) {
    const r = this.rect || this.host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _down(e) {
    if (!this.isEnabled()) return;
    if (this.pid !== null) return;              // 只跟第一根手指
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    this.rect = this.host.getBoundingClientRect();
    this.pid = e.pointerId;
    const p = this._pos(e);
    this.anchor = { x: p.x, y: p.y };
    this.cur = { x: p.x, y: p.y };
    this.pts.length = 0;
    this.pts.push({ x: p.x, y: p.y, t: performance.now() / 1000 });
    this.ripples.length = 0;
    try { this.host.setPointerCapture(e.pointerId); } catch (err) { /* 不支持就算了 */ }
  }

  _move(e) {
    if (this.pid === null || e.pointerId !== this.pid || !this.anchor) return;
    e.preventDefault();

    const p = this._pos(e);
    const now = performance.now() / 1000;
    this.cur = { x: p.x, y: p.y };
    // 手指停住时事件会连发同一坐标，不去重的话光带会在原地堆成一块亮斑
    const last = this.pts.length ? this.pts[this.pts.length - 1] : null;
    if (!last || Math.abs(p.x - last.x) + Math.abs(p.y - last.y) >= 2.5) {
      this.pts.push({ x: p.x, y: p.y, t: now });
      while (this.pts.length > MAXPTS) this.pts.shift();
    }

    const dx = p.x - this.anchor.x;
    const dy = p.y - this.anchor.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < THRESH) return;

    const dir = ax > ay ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    this.onTurn(dir);
    this.strokes++;
    this.ripples.push({ x: this.anchor.x, y: this.anchor.y, t: now, dir: dir });

    // 锚点移到当前点：不抬手就能连续转向
    this.anchor = { x: p.x, y: p.y };
  }

  _up(e) {
    if (this.pid === null || e.pointerId !== this.pid) return;
    this.pid = null;
    this.anchor = null;
    this.cur = null;
    try { this.host.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  /** 每帧调用：把划痕画到叠加层上 */
  render() {
    const ctx = this.ctx;
    if (!this.size) return;
    const w = this.size[0];
    const h = this.size[1];
    ctx.clearRect(0, 0, w, h);

    const now = performance.now() / 1000;
    while (this.pts.length && now - this.pts[0].t > LIFE) this.pts.shift();
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      if (now - this.ripples[i].t > LIFE * 1.3) this.ripples.splice(i, 1);
    }
    if (!this.pts.length && !this.ripples.length) return;

    const skin = this.getSkin();
    const S = skin ? skin.snake : null;
    const col = S && S.colors && S.colors.length ? S.colors[0] : '#7fd3ff';
    const additive = skin ? lum(skin.bg) < 0.35 : true;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (additive) ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col;
    ctx.fillStyle = col;

    // ① 光带：整条轨迹一次成型的划痕
    //    逐段描边会让每段端点重复叠加，出现"虚线 + 亮点"的假纹路；
    //    所以整条 path 画一遍，用最新点的新鲜度统一控制粗细和亮度。
    if (this.pts.length > 1) {
      let kmax = 0;
      for (let i = 0; i < this.pts.length; i++) {
        const k = 1 - (now - this.pts[i].t) / LIFE;
        if (k > kmax) kmax = k;
      }
      for (let pass = 0; pass < 2; pass++) {
        const halo = pass === 0;
        ctx.globalAlpha = halo ? kmax * 0.12 : kmax * 0.62;
        ctx.lineWidth = halo ? 3 + 13 * kmax : 1.2 + 3.2 * kmax;
        ctx.beginPath();
        ctx.moveTo(this.pts[0].x, this.pts[0].y);
        for (let i = 1; i < this.pts.length; i++) ctx.lineTo(this.pts[i].x, this.pts[i].y);
        ctx.stroke();
      }
    }

    // ② 指尖落点：一小点 + 一圈光晕，手指在哪一眼能看见
    if (this.pid !== null && this.cur) {
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      ctx.arc(this.cur.x, this.cur.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(this.cur.x, this.cur.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // ③ 涟漪 + 方向切口
    const DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let i = 0; i < this.ripples.length; i++) {
      const r = this.ripples[i];
      const age = now - r.t;
      const k = 1 - age / (LIFE * 1.3);
      if (k <= 0) continue;
      const rad = 3 + 13 * (1 - k);

      ctx.globalAlpha = Math.min(0.75, k * k * 0.85);
      ctx.lineWidth = 0.8 + 1.5 * k;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();

      // 朝转过去的方向划一道，告诉玩家"这次转向被吃到了"
      const d = DV[r.dir];
      const len = 7 + 15 * (1 - k);
      ctx.globalAlpha = Math.min(0.9, k * 0.85);
      ctx.lineWidth = 1.4 + 2 * k;
      ctx.beginPath();
      ctx.moveTo(r.x + d[0] * 3, r.y + d[1] * 3);
      ctx.lineTo(r.x + d[0] * len, r.y + d[1] * len);
      ctx.stroke();
    }

    ctx.restore();
  }
}
