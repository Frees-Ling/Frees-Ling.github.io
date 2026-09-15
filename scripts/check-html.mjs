// 断言每个构建产物的 `</html>` 是文档的最后一个非空白内容。
//
// 为什么需要这个：Astro 组件里写在 `</Layout>` 之后的节点会被渲染到 `</html>` 之外，
// 属于无效 HTML，会触发浏览器解析器的重新定位。这类问题在源码里看不出来 ——
// `/search/` 页曾因此有 858 字符的内容落在 `</html>` 之后。
//
// 根因通常是 Layout 缺少 head/scripts 注入点，页面只能往组件外面写。
//
// 用法：node scripts/check-html.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

// history/ 是只读的旧站归档快照，不参与当前站点构建，也不该被修改
const SKIP_DIRS = new Set(['history', 'pagefind', '_astro']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(DIST);
const violations = [];

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const index = html.lastIndexOf('</html>');
  const rel = relative(DIST, file);

  if (index === -1) {
    violations.push(`${rel}  缺少 </html>`);
    continue;
  }

  const trailing = html.slice(index + '</html>'.length).trim();
  if (trailing) {
    violations.push(
      `${rel}  </html> 之后还有 ${trailing.length} 字符：${JSON.stringify(trailing.slice(0, 80))}`,
    );
  }
}

if (violations.length) {
  console.error(`\n✗ HTML 结构检查失败（${violations.length} 个文件）：\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    '\n提示：页面里可能有节点写在了 </Layout> 之后。' +
      '应改用 <Fragment slot="head"> 或 <Fragment slot="scripts">。\n',
  );
  process.exit(1);
}

console.log(`\n✓ HTML 结构检查通过（${files.length} 个文件）\n`);
