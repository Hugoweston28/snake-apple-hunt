// snake/js/skins.js —— 皮肤配置（纯数据）。渲染器只消费这里的字段，逻辑层完全无感知。

export const DARK_LABEL = '#8b95a1';
export const LIGHT_LABEL = '#5c6470';

export const SKINS = [
  {
    id: 'neon',
    name: '霓虹',
    tag: '深空底 · 青蓝渐变 · 外发光',
    bg: '#0b0f14',
    grid: { color: '#ffffff', alpha: 0.06 },
    gridMajor: { color: '#ffffff', alpha: 0.15 },
    wall: 'rgba(0,229,255,0.45)',
    plan: 'rgba(140,220,255,0.32)',
    label: DARK_LABEL,
    swatch: ['#00e5ff', '#0068ff'],
    apple: { body: '#ff4d6d', leaf: '#38b000', glow: '#ff4d6d' },
    snake: {
      mode: 'gradient',
      colors: ['#00e5ff', '#0068ff'],
      taper: true,
      glow: '#00c8ff',
      head: 'eyes',
    },
  },
  {
    id: 'classic',
    name: '经典绿',
    tag: '诺基亚 3310 · LCD 单色 · 硬边方块',
    bg: '#9bbc0f',
    grid: { color: '#0f380f', alpha: 0.17 },
    gridMajor: { color: '#0f380f', alpha: 0.36 },
    wall: 'rgba(15,56,15,0.85)',
    plan: 'rgba(15,56,15,0.32)',
    label: '#3f5a0c',
    swatch: ['#9bbc0f', '#0f380f'],
    apple: { pixel: true, body: '#0f380f' },
    snake: {
      mode: 'classic',
      colors: ['#0f380f'],
      taper: false,
      glow: null,
      head: 'mouth',
    },
  },
  {
    id: 'rainbow',
    name: '彩虹',
    tag: '跑马灯 · 每段色相差 34° · 会流动',
    bg: '#101218',
    grid: { color: '#ffffff', alpha: 0.06 },
    gridMajor: { color: '#ffffff', alpha: 0.15 },
    wall: 'rgba(255,110,199,0.42)',
    plan: 'rgba(255,255,255,0.30)',
    label: DARK_LABEL,
    swatch: ['#ff3b30', '#ffd60a', '#0a84ff'],
    apple: { body: '#ff3b30', leaf: '#7bed3b', glow: '#ff3b30' },
    snake: {
      mode: 'rainbow',
      colors: ['#ff0000'],
      taper: true,
      glow: '#ff6ec7',
      head: 'eyes',
    },
  },
  {
    id: 'panda',
    name: '熊猫 emoji',
    tag: '米白底 · 黑白分段 · 表情头',
    bg: '#f7f4ee',
    grid: { color: '#000000', alpha: 0.09 },
    gridMajor: { color: '#000000', alpha: 0.2 },
    wall: 'rgba(43,43,43,0.42)',
    plan: 'rgba(43,43,43,0.26)',
    label: LIGHT_LABEL,
    swatch: ['#2b2b2b', '#ffffff'],
    apple: { body: '#e8483f', leaf: '#2f8f4e', glow: null },
    snake: {
      mode: 'panda',
      colors: ['#2b2b2b', '#ffffff'],
      taper: true,
      glow: null,
      outline: '#2b2b2b',
      head: 'face',
    },
  },
];

export function getSkin(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

/* ---------- 颜色工具 ---------- */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToCss(rgb, a = 1) {
  return a >= 1 ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

export function lerpRgb(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}

/** 单段身体颜色 */
export function segColor(snake, i, n, tick) {
  const cs = snake.colors;
  switch (snake.mode) {
    case 'gradient':
      return rgbToCss(lerpRgb(hexToRgb(cs[0]), hexToRgb(cs[1]), i / Math.max(1, n - 1)));
    case 'rainbow': {
      const h = (i * 34 + (tick || 0) * 70) % 360;
      return rgbToCss(hslToRgb(h, 0.72, 0.56));
    }
    case 'panda':
      return cs[i % 2];
    default:
      return cs[0];
  }
}
