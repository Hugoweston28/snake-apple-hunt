// snake/build.js —— 把拆分源码内联成可双击打开的单文件 HTML
//
// 为什么要打包：浏览器在 file:// 下会按 CORS 拦掉 ES Module，
// 拆分版本（template.html + js/*.js）双击必然是白屏。
// 所以 template.html 只用于开发（配合静态服务器），
// index.html 与 dist/snake.html 都是这里生成的、内联好脚本的单文件。
//
// 关键设计：自检浮层（#boot）**保留**在产物里，只有首帧真正画出来后才由 app.js 撤掉。
// 这样任何一步失败都会停留在浮层上并显示原因，而不是给用户一片黑屏。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(ROOT, 'template.html');
const OUTS = ['index.html', path.join('dist', 'snake.html')];

// 依赖顺序：被依赖的放前面
const MODULES = [
  'js/core.js',
  'js/skins.js',
  'js/ai.js',
  'js/human.js',
  'js/render.js',
  'js/replay.js',
  'js/app.js',
];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function stripModuleSyntax(src) {
  return src
    .replace(/^\s*import\s[^\n]*?;\s*$/gm, '')          // 去掉 import 行
    .replace(/^export\s+(?=(const|let|var|function|async\s+function|class))/gm, '')  // 去掉 export 关键字
    .replace(/^export\s*\{[^}]*\};\s*$/gm, '');         // 去掉残留的 export 列表
}

function build() {
  const html = fs.readFileSync(TEMPLATE, 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const build = stamp();

  let js = '';
  for (const m of MODULES) {
    const code = fs.readFileSync(path.join(ROOT, m), 'utf8');
    js += `\n/* ===== ${m} ===== */\n` + stripModuleSyntax(code) + '\n';
  }

  const out = html
    .replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
    .replace('<script type="module" src="js/app.js"></script>', '<script>\n' + js + '\n</script>')
    .replace(/__BUILD__/g, build);

  if (out.includes('type="module"')) throw new Error('仍有 type="module" 未被替换');
  if (!out.includes('__SNAKE_OK')) throw new Error('自检浮层脚本缺失');

  for (const rel of OUTS) {
    const dest = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out, 'utf8');
    const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
    console.log(`已生成 ${rel}  (${kb} KB, ${MODULES.length} 个模块, build ${build})`);
  }
  return out;
}

build();
