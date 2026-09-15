// 设计 token 闸门。
//
// 为什么需要这个脚本：CSS 变量引用未定义时**完全不报错**，属性会静默变成无效值。
// 全站 22 个 .astro 文件、上百处 token 引用，靠人工同步不可能不出错。
// 而且颜色字面量一旦散开就会固化，最终导致 light/dark 双主题里只有一套是对的。
//
// 四项检查：
//   ① var() 引用完整性          error —— 价值最高
//   ② 断点白名单                error
//   ③ 颜色字面量只允许在 tokens.css  error（--strict）／warning（默认）
//   ④ 间距裸 px 值              warning
//
// 用法：
//   node scripts/check-tokens.mjs            # 迁移期：颜色只警告
//   node scripts/check-tokens.mjs --strict   # 清理完成后：颜色也报错

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const TOKENS_FILE = 'src/styles/tokens.css';
const STRICT = process.argv.includes('--strict');

// 迁移期允许多份样式文件；tokens.css 落地后所有字面量都应集中到这里
const LITERAL_ALLOWLIST = [TOKENS_FILE, 'src/styles/global.css'];

// CSS 变量不能用在 @media 里，只能在 tokens.css 顶部以注释记录
const ALLOWED_BREAKPOINTS = new Set([640, 900, 1200, 1440]);

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.astro',
  'archives',
  '_backups',
]);

// ---------- 收集文件 ----------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (['.astro', '.css'].includes(extname(entry.name))) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// .astro 里只检查 <style> 块，避免把模板中 SVG 的 fill="#fff" 误判为硬编码颜色
function extractStyleBlocks(source, ext) {
  if (ext === '.css') return [{ code: source, offset: 0 }];
  const blocks = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m = re.exec(source);
  while (m !== null) {
    blocks.push({ code: m[1], offset: m.index + m[0].indexOf(m[1]) });
    m = re.exec(source);
  }
  return blocks;
}

// 声明可能出现在 <style> 里，也可能出现在模板的内联 style 属性里
// （例如 SoundLab 用 style={`--h:${n}%`} 生成波形柱高度）
function extractDeclarations(source) {
  const names = new Set();
  for (const m of source.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1]);
  return names;
}

function extractUses(code) {
  const uses = [];
  // 匹配 var(--name) 与 var(--name, fallback)
  const re = /var\(\s*(--[\w-]+)\s*(,)?/g;
  let m = re.exec(code);
  while (m !== null) {
    const line = code.slice(0, m.index).split('\n').length;
    uses.push({ name: m[1], hasFallback: Boolean(m[2]), line });
    m = re.exec(code);
  }
  return uses;
}

const COLOR_RE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\s*\(/g;

const SPACING_RE =
  /(?:^|[;{\s])(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left)(?:-[\w]+)?\s*:\s*[^;{}]*?\b\d+px/g;

// ---------- 主流程 ----------
const files = walk(SRC);
const errors = [];
const warnings = [];

// 先收集全站声明，再做引用检查 —— 变量可能声明在别处、用在别处。
// 注意：Set.prototype.add 只接受一个参数，不能用 add(...set) 展开。
const allDeclarations = new Set();
for (const file of files) {
  for (const name of extractDeclarations(readFileSync(file, 'utf8'))) {
    allDeclarations.add(name);
  }
}

let colorLiteralCount = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, 'utf8');
  const ext = extname(file);

  for (const { code, offset } of extractStyleBlocks(source, ext)) {
    const baseLine = source.slice(0, offset).split('\n').length - 1;

    // ① var() 引用完整性
    for (const use of extractUses(code)) {
      if (allDeclarations.has(use.name)) continue;
      // var(--x, fallback) 是合法的渐进增强写法，有默认值就不算未定义
      if (use.hasFallback) continue;
      errors.push(
        `${rel}:${baseLine + use.line}  引用了未定义的 token \`${use.name}\``,
      );
    }

    // ③ 颜色字面量
    const allowed = LITERAL_ALLOWLIST.includes(rel);
    if (!allowed) {
      for (const m of code.matchAll(COLOR_RE)) {
        const line = code.slice(0, m.index).split('\n').length;
        colorLiteralCount++;
        warnings.push(
          `${rel}:${baseLine + line}  颜色字面量 \`${m[0].trim()}\` —— 应改为语义 token`,
        );
      }
    }

    // ② 断点白名单
    for (const m of code.matchAll(
      /@media[^{]*?\(\s*(?:max|min)-width\s*:\s*(\d+)px/g,
    )) {
      const bp = Number(m[1]);
      if (!ALLOWED_BREAKPOINTS.has(bp)) {
        const line = code.slice(0, m.index).split('\n').length;
        errors.push(
          `${rel}:${baseLine + line}  断点 ${bp}px 不在白名单 {${[...ALLOWED_BREAKPOINTS].join(', ')}} 内`,
        );
      }
    }

    // ④ 间距裸 px（仅警告）
    for (const m of code.matchAll(SPACING_RE)) {
      const line = code.slice(0, m.index).split('\n').length;
      warnings.push(`${rel}:${baseLine + line}  间距裸值 —— 应考虑 --space-*`);
    }
  }
}

// ---------- 输出 ----------
const uniq = (arr) => [...new Set(arr)];

if (errors.length) {
  console.error(`\n✗ token 检查失败（${errors.length} 项）：\n`);
  for (const e of uniq(errors).slice(0, 40)) console.error(`  ${e}`);
  if (errors.length > 40) console.error(`  … 另有 ${errors.length - 40} 项`);
}

const warningList = uniq(warnings);
if (warningList.length) {
  const label = STRICT ? '✗' : '⚠';

  // 按类别与文件汇总，比逐条罗列更可读（逐条会淹没在几百行里）
  const byKind = { 颜色字面量: 0, 间距裸值: 0 };
  const colorByFile = new Map();
  for (const w of warningList) {
    if (w.includes('颜色字面量')) {
      byKind.颜色字面量++;
      const file = w.split(':')[0];
      colorByFile.set(file, (colorByFile.get(file) ?? 0) + 1);
    } else if (w.includes('间距裸值')) {
      byKind.间距裸值++;
    }
  }

  console.log(`\n${label} token 警告（共 ${warningList.length} 项）：\n`);
  console.log(`  颜色字面量  ${byKind.颜色字面量}`);
  for (const [file, n] of [...colorByFile].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(3)}  ${file}`);
  }
  console.log(`  间距裸值    ${byKind.间距裸值}`);
  console.log('\n  样例：');
  for (const w of warningList.slice(0, 5)) console.log(`    ${w}`);
}

const colorErrors = STRICT
  ? warnings.filter((w) => w.includes('颜色字面量'))
  : [];

if (errors.length || colorErrors.length) {
  console.error(
    `\n检查未通过${STRICT ? '（--strict 模式：颜色字面量也视为错误）' : ''}。\n`,
  );
  process.exit(1);
}

console.log(
  `\n✓ token 检查通过（${files.length} 个文件，颜色字面量 ${colorLiteralCount} 处${
    STRICT ? '' : '（迁移期仅警告）'
  }）\n`,
);
