// snake/tools/serve.js —— 极简静态服务器
// 用法：
//   node tools/serve.js            默认 8123 端口
//   node tools/serve.js 8080       指定端口
//   node tools/serve.js --open     启动后自动打开浏览器
// 端口被占用时会自动往后找可用端口。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const OPEN = argv.includes('--open');
const portArg = argv.find((a) => /^\d+$/.test(a));
const START_PORT = portArg ? Number(portArg) : 8123;
const MAX_TRIES = 12;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

function handler(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('403 forbidden');
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('404 ' + rel);
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
}

function openBrowser(url) {
  try {
    const opt = { detached: true, stdio: 'ignore' };
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], opt).unref();
    else if (process.platform === 'darwin') spawn('open', [url], opt).unref();
    else spawn('xdg-open', [url], opt).unref();
  } catch (e) { /* 打不开就算了，地址已经打印出来 */ }
}

function tryListen(port, attempt) {
  const server = http.createServer(handler);
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_TRIES) {
      console.log('端口 ' + port + ' 被占用，换 ' + (port + 1));
      tryListen(port + 1, attempt + 1);
    } else {
      console.error('服务器启动失败：' + err.message);
      process.exitCode = 1;
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + port + '/';
    console.log('目录  ' + ROOT);
    console.log('地址  ' + url);
    console.log('关闭这个窗口即停止服务');
    if (OPEN) setTimeout(() => openBrowser(url), 300);
  });
}

tryListen(START_PORT, 0);
