// snake/tools/touch_probe.mjs —— 用 CDP 真发触摸事件，验证"滑动转向 + 划痕"
//
// 为什么不用普通截图：手指滑动是输入事件，headless 的 --screenshot 拍不到。
// 这里起一个带 remote-debugging 的 Chrome，用 Input.dispatchTouchEvent 真的把手指按下去划，
// 再 Page.captureScreenshot 拍下来。看到的就是玩家在手机上会看到的画面。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const OUT = path.join(ROOT, 'preview', 'shot_touch.png');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch() {
  const ud = path.join(ROOT, 'dist', '.cdp-profile');
  fs.rmSync(ud, { recursive: true, force: true });
  const args = [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${ud}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars',
    'about:blank',
  ];
  const p = spawn(CHROME, args, { stdio: 'ignore', windowsHide: true });
  return p;
}

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('CDP 端口没起来');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(new Error('ws error')));
  });
}

async function main() {
  const chrome = launch();
  const url = await wsUrl();
  const ws = await openWs(url);
  const cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // 模拟一部手机竖屏
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const file = path.join(ROOT, 'dist', 'snake.html');
  const target = pathToFileURL(file).href + '#mode=human&seed=7&skin=neon';
  await cdp.send('Page.navigate', { url: target });
  await sleep(1800);

  // 确认进入人类模式
  const probe = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const S = window.SNAKE; if (!S) return 'no-hook'; return S.state.mode + '|' + (S.state.human ? 'human-ok' : 'no-human') + '|steps=' + (S.state.human ? S.state.human.game.steps : -1); })()`,
    returnByValue: true,
  });
  console.log('页面状态:', probe.result.value);

  // 手指按在棋盘中下部，先向上划，再向右划 —— 不抬手，连续两个转向
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
  });

  // 手机上棋盘在页面顶部，必须按真实位置算坐标（写死像素会划到侧栏上）
  const rectRes = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const r = document.getElementById('board-wrap').getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height }); })()`,
    returnByValue: true,
  });
  const rect = JSON.parse(rectRes.result.value);
  console.log('棋盘区域:', rect);

  const x0 = Math.round(rect.x + rect.w * 0.30);
  const y0 = Math.round(rect.y + rect.h * 0.80);
  const STEP = 20;
  await touch('touchStart', x0, y0);
  await sleep(30);
  for (let i = 1; i <= 9; i++) {
    await touch('touchMove', x0, y0 - i * STEP);
    await sleep(16);
  }
  // 停一下让第一次转向生效
  await sleep(120);
  for (let i = 1; i <= 7; i++) {
    await touch('touchMove', x0 + i * STEP, y0 - 9 * STEP);
    await sleep(16);
  }

  // 手指还没抬起来就截图：这时划痕、涟漪、方向切口都还在
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('已保存', OUT);

  // 再确认转向真的进了游戏
  const after = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const S = window.SNAKE; const h = S.state.human; return JSON.stringify({ strokes: S.steer.strokes, dir: h.game.dir, steps: h.game.steps, buffer: h.buffer.length }); })()`,
    returnByValue: true,
  });
  console.log('转向统计:', after.result.value);

  await touch('touchEnd');
  await sleep(600);

  // 抬手后划痕应当淡出
  const faded = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT.replace('.png', '_after.png'), Buffer.from(faded.data, 'base64'));

  ws.close();
  chrome.kill();
  await sleep(300);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
