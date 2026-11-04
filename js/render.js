// snake/js/render.js —— Canvas 渲染：网格缓存 / 蛇（胶囊链）/ 苹果 / 计划路径叠加

import { segColor, hexToRgb, rgbToCss } from './skins.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.skin = null;
    this.cols = 100;
    this.rows = 100;
    this.cell = 7;
    this.pad = 0;
    this.dpr = 1;
    this.gridCanvas = null;
    this.gridKey = '';
    this.showPlan = true;
  }

  setSkin(skin) {
    this.skin = skin;
    this.gridKey = '';
  }

  setBoard(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.gridKey = '';
  }

  resize() {
    if (!this.skin) return;
    const w = this.canvas.clientWidth || 640;
    const h = this.canvas.clientHeight || 640;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const side = Math.min(w, h);
    this.cell = Math.floor(side / this.cols);
    this.boardPx = this.cell * this.cols;
    this.boardPy = this.cell * this.rows;
    this.pad = Math.round((side - this.boardPx) / 2);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.gridKey = '';
  }

  /** 建静态层：底色 + 网格 + 边框。只在皮肤/尺寸变化时重建 */
  buildGrid() {
    const key = `${this.skin.id}|${this.cell}|${this.boardPx}|${this.cols}`;
    if (key === this.gridKey && this.gridCanvas) return;
    this.gridKey = key;

    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * this.dpr);
    cv.height = Math.round(h * this.dpr);
    const g = cv.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    g.fillStyle = this.skin.bg;
    g.fillRect(0, 0, w, h);

    const x0 = this.pad;
    const y0 = this.pad;
    const W = this.boardPx;
    const H = this.boardPy;
    const cell = this.cell;

    // 格宽够大才画细网格，否则整屏会变成噪点纹理
    const fade = Math.max(0.3, Math.min(1, (cell - 6) / 8));
    if (cell >= 9 && this.skin.grid) {
      g.strokeStyle = this.rgba(this.skin.grid, fade);
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= this.cols; i++) {
        const x = Math.round(x0 + i * cell) + 0.5;
        g.moveTo(x, y0);
        g.lineTo(x, y0 + H);
      }
      for (let j = 0; j <= this.rows; j++) {
        const y = Math.round(y0 + j * cell) + 0.5;
        g.moveTo(x0, y);
        g.lineTo(x0 + W, y);
      }
      g.stroke();
    }

    // 每 10 格辅助线
    if (this.cols > 12 && this.skin.gridMajor) {
      g.strokeStyle = this.rgba(this.skin.gridMajor, Math.max(0.55, fade));
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= this.cols; i += 10) {
        const x = Math.round(x0 + i * cell) + 0.5;
        g.moveTo(x, y0);
        g.lineTo(x, y0 + H);
      }
      for (let j = 0; j <= this.rows; j += 10) {
        const y = Math.round(y0 + j * cell) + 0.5;
        g.moveTo(x0, y);
        g.lineTo(x0 + W, y);
      }
      g.stroke();
    }

    // 墙
    g.strokeStyle = this.skin.wall;
    g.lineWidth = 2;
    g.strokeRect(x0 - 1, y0 - 1, W + 2, H + 2);

    this.gridCanvas = cv;
  }

  cx(i) { return this.pad + (i % this.cols) * this.cell + this.cell / 2; }
  cy(i) { return this.pad + Math.floor(i / this.cols) * this.cell + this.cell / 2; }

  /** {color, alpha} -> rgba 字符串 */
  rgba(spec, k = 1) {
    if (typeof spec === 'string') return spec;
    const [r, g, b] = hexToRgb(spec.color);
    return `rgba(${r},${g},${b},${(spec.alpha * k).toFixed(3)})`;
  }

  /** 画一帧 */
  draw(frame, tick) {
    if (!this.skin) return;
    this.buildGrid();
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.gridCanvas, 0, 0, w, h);

    if (this.showPlan && frame.plan && frame.plan.length) this.drawPlan(frame, tick);
    for (const a of frame.apples) this.drawApple(a, tick);
    this.drawSnake(frame.snake, tick);
  }

  /** AI 当前的计划路线 */
  drawPlan(frame, tick) {
    const ctx = this.ctx;
    const cell = this.cell;
    ctx.save();
    ctx.strokeStyle = this.skin.plan || 'rgba(140,220,255,0.30)';
    ctx.lineWidth = Math.max(1, cell * 0.14);
    ctx.setLineDash([cell * 0.5, cell * 0.45]);
    ctx.lineDashOffset = -(tick * cell * 0.6) % (cell * 0.95);
    ctx.beginPath();
    let first = true;
    for (const c of frame.plan) {
      const x = this.cx(c);
      const y = this.cy(c);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // 当前目标苹果加个环
    const target = frame.plan[frame.plan.length - 1];
    if (target != null) {
      ctx.save();
      ctx.strokeStyle = this.skin.apple.body;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, cell * 0.16);
      ctx.beginPath();
      ctx.arc(this.cx(target), this.cy(target), cell * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawApple(idx, tick) {
    const ctx = this.ctx;
    const A = this.skin.apple;
    const x = this.cx(idx);
    const y = this.cy(idx);
    const r = Math.max(1.5, this.cell * 0.32);

    if (A.pixel) {
      const u = Math.max(1, this.cell * 0.24);
      ctx.fillStyle = A.body;
      ctx.fillRect(x - u, y - u * 0.85, 2 * u, 2 * u);
      ctx.fillRect(x - u * 0.22, y - u * 0.85 - u, u * 0.44, u);
      return;
    }

    ctx.save();
    if (A.glow) {
      ctx.shadowColor = A.glow;
      ctx.shadowBlur = this.cell * 1.1;
    }
    if (A.leaf) {
      ctx.strokeStyle = '#5a3d1e';
      ctx.lineWidth = Math.max(1, this.cell * 0.06);
      ctx.beginPath();
      ctx.moveTo(x + this.cell * 0.01, y - r * 0.9);
      ctx.lineTo(x + this.cell * 0.07, y - r - this.cell * 0.17);
      ctx.stroke();
      ctx.fillStyle = A.leaf;
      ctx.beginPath();
      ctx.ellipse(x + this.cell * 0.17, y - r - this.cell * 0.1, this.cell * 0.14, this.cell * 0.075, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = A.body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(x - r * 0.4, y - r * 0.4, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSnake(cells, tick) {
    const ctx = this.ctx;
    const S = this.skin.snake;
    const n = cells.length;
    if (!n) return;
    const cell = this.cell;

    const pts = new Array(n);
    for (let i = 0; i < n; i++) pts[i] = [this.cx(cells[i]), this.cy(cells[i])];

    if (S.mode === 'classic') {
      const side = Math.max(1, cell);
      ctx.fillStyle = S.colors[0];
      for (let i = 0; i < n; i++) {
        const px = pts[i][0];
        const py = pts[i][1];
        ctx.fillRect(Math.round(px - side / 2), Math.round(py - side / 2), side, side);
      }
      this.drawHead(cells, pts, tick);
      return;
    }

    const rs = new Array(n);
    for (let i = 0; i < n; i++) {
      rs[i] = S.taper ? cell * 0.5 * (1 - 0.34 * (i / Math.max(1, n - 1))) : cell * 0.47;
    }

    ctx.save();
    if (S.glow) {
      ctx.shadowColor = S.glow;
      ctx.shadowBlur = cell * 1.4;
    }
    for (let i = n - 1; i >= 0; i--) {
      const col = segColor(S, i, n, tick);
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      if (S.outline) {
        ctx.strokeStyle = S.outline;
        ctx.fillStyle = S.outline;
        const e = rs[i] + cell * 0.035;
        if (i > 0) {
          ctx.lineWidth = rs[i] + rs[i - 1] + cell * 0.07;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pts[i][0], pts[i][1]);
          ctx.lineTo(pts[i - 1][0], pts[i - 1][1]);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], e, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
      }
      if (i > 0) {
        ctx.lineWidth = rs[i] + rs[i - 1];
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], rs[i], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    this.drawHead(cells, pts, tick);
  }

  drawHead(cells, pts, tick) {
    const ctx = this.ctx;
    const S = this.skin.snake;
    const cell = this.cell;
    const [x, y] = pts[0];
    let dv = [1, 0];
    if (cells.length > 1) {
      const hx = cells[0] % this.cols, hy = Math.floor(cells[0] / this.cols);
      const nx = cells[1] % this.cols, ny = Math.floor(cells[1] / this.cols);
      dv = [Math.sign(hx - nx), Math.sign(hy - ny)];
    }
    const pv = [-dv[1], dv[0]];

    if (S.head === 'mouth') {
      const mx = x + dv[0] * cell * 0.2;
      const my = y + dv[1] * cell * 0.2;
      const s = cell * 0.34;
      ctx.fillStyle = this.skin.bg;
      ctx.fillRect(mx - s / 2, my - s / 2, s, s);
      return;
    }

    if (S.head === 'face') {
      const r = cell * 0.44;
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = Math.max(1, cell * 0.042);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const s of [-1, 1]) {
        const ex = x + pv[0] * cell * 0.215 * s + dv[0] * cell * 0.075;
        const ey = y + pv[1] * cell * 0.215 * s + dv[1] * cell * 0.075;
        ctx.fillStyle = '#2b2b2b';
        ctx.beginPath();
        ctx.arc(ex, ey, cell * 0.115, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, ey, cell * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff6b8a';
      ctx.beginPath();
      ctx.arc(x + dv[0] * cell * 0.42, y + dv[1] * cell * 0.42, cell * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // 通用眼睛
    for (const s of [-1, 1]) {
      const ex = x + pv[0] * cell * 0.205 * s + dv[0] * cell * 0.1;
      const ey = y + pv[1] * cell * 0.205 * s + dv[1] * cell * 0.1;
      const r = cell * 0.145;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0d12';
      ctx.beginPath();
      ctx.arc(ex + dv[0] * cell * 0.02, ey + dv[1] * cell * 0.02, cell * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
