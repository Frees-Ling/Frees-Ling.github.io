// 内容契约闸门。
//
// 为什么需要它：文章 frontmatter 里的 `section`、`lang`、`category` 是**人写的**，
// 而 CSS 之外的第二类静默失效就在这里 ——
//   · `section: reasearch`（拼错）不会报错，文章只是从栏目页消失；
//   · `updated` 早于 `published` 不会报错，文章会显示一个矛盾的时间；
//   · sections.ts 里写了一个不存在的标签也不会报错，那个标签永远匹配不到文章。
// 这三类都表现为「页面看起来正常，只是少了点东西」，只能靠机器检查。
//
// 检查分两级：
//   error   —— 明确的错误，退出码 1
//   warning —— 需要人看一眼的情况（例如文章没归入任何栏目），不阻断
//
// 零依赖：只读 frontmatter，不引入 YAML 解析器。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const POSTS_DIR = join(ROOT, 'src/content/posts');
const SECTIONS_FILE = 'src/data/sections.ts';

const errors = [];
const warnings = [];

// ---------- 读取栏目定义 ----------
// sections.ts 是纯数据，用正则取出每个 section 的 id / route / categories / tags，
// 避免为了一个检查脚本去搭一套 TS 运行时。
function readSections() {
  const source = readFileSync(join(ROOT, SECTIONS_FILE), 'utf8');
  const blocks = source.split(/\n  \{\n/).slice(1);
  return blocks.map((block) => {
    const id = block.match(/id:\s*'([^']+)'/)?.[1];
    const route = block.match(/route:\s*'([^']+)'/)?.[1];
    const list = (key) => {
      const m = block.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`));
      if (!m) return [];
      return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    };
    return { id, route, categories: list('categories'), tags: list('tags') };
  });
}

// ---------- 读取 frontmatter ----------
function readPost(file) {
  const source = readFileSync(join(POSTS_DIR, file), 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  const front = match ? match[1] : '';
  const scalar = (key) => {
    const m = front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    if (!m) return null;
    return m[1].trim().replace(/^["']|["']$/g, '');
  };
  const date = (key) => {
    const raw = scalar(key);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const tags = () => {
    const m = front.match(/^tags:\s*\[([\s\S]*?)\]/m);
    if (!m) return [];
    return m[1]
      .split(/[，,]/)
      .map((tag) => tag.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  };
  /**
   * 块状列表（prerequisites / related）。
   *
   * 支持两种写法：行内数组 `[a, b]` 与短横线列表。
   * 只认其中一种会让另一种写法**静默失效** —— 作者以为填了，
   * 页面上却什么也没有，而且不报错。
   */
  const idList = (key) => {
    const inline = front.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'));
    if (inline) {
      return inline[1]
        .split(/[，,]/)
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    const block = front.match(
      new RegExp(`^${key}:\\s*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'),
    );
    if (!block) return [];
    return block[1]
      .split('\n')
      .map((line) => line.replace(/^[ \t]*-[ \t]*/, '').trim())
      .map((v) => v.replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  };
  return {
    file,
    id: file.replace(/\.(md|mdx)$/i, ''),
    title: scalar('title') ?? '',
    section: scalar('section'),
    lang: scalar('lang'),
    category: scalar('category'),
    published: date('published'),
    updated: date('updated'),
    draft: scalar('draft') === 'true',
    tags: tags(),
    prerequisites: idList('prerequisites'),
    related: idList('related'),
  };
}

function normalizeCategory(value = '') {
  const category = value.trim().toLowerCase();
  if (!category) return '随笔';
  if (category === 'daily') return '生活';
  if (category === 'note' || category === 'test') return '笔记';
  if (category === 'develop log') return '开发';
  return value.trim();
}

// ---------- 检查 ----------
const sections = readSections();
const sectionIds = new Set(sections.map((s) => s.id));

// 栏目路由必须指向真实页面 —— 否则导航与页脚会指向 404
for (const section of sections) {
  const slug = section.route.replace(/^\/|\/$/g, '');
  const candidates = [
    join(ROOT, `src/pages/${slug}.astro`),
    join(ROOT, `src/pages/${slug}/index.astro`),
  ];
  if (!candidates.some((path) => existsSync(path))) {
    errors.push(
      `sections.ts 的 ${section.id} 指向 ${section.route}，但没有对应页面`,
    );
  }
}

const files = readdirSync(POSTS_DIR).filter((f) => /\.(md|mdx)$/i.test(f));
const posts = files.map(readPost);

for (const post of posts) {
  const where = `src/content/posts/${post.file}`;

  // ① 人工字段 `section` 必须是合法 id
  if (post.section && !sectionIds.has(post.section)) {
    errors.push(
      `${where}  section: '${post.section}' 不是合法栏目（合法值：${[...sectionIds].join(', ')}）`,
    );
  }

  // ② updated 不能早于 published
  if (post.published && post.updated && post.updated < post.published) {
    errors.push(
      `${where}  updated（${post.updated.toISOString().slice(0, 10)}）早于 published（${post.published.toISOString().slice(0, 10)}）`,
    );
  }

  // ③ published 不能是未来 —— 会排到列表最前面
  if (post.published && post.published > new Date()) {
    warnings.push(
      `${where}  published 在未来（${post.published.toISOString().slice(0, 10)}）`,
    );
  }

  // ④ lang 要么留空，要么是已知取值
  if (post.lang && !['zh-CN', 'en'].includes(post.lang)) {
    errors.push(`${where}  lang: '${post.lang}' 不是已知取值（zh-CN / en）`);
  }

  // ⑤ 分类拼写：英文分类必须命中已知映射
  //    中文分类是有意为之的自由取值，只检查非中文的情况。
  const raw = (post.category ?? '').trim();
  if (raw && !/[一-鿿]/.test(raw)) {
    const known = ['daily', 'note', 'test', 'develop log'];
    if (!known.includes(raw.toLowerCase())) {
      errors.push(
        `${where}  category: '${raw}' 不匹配任何已知分类（${known.join(' / ')} 或中文）`,
      );
    }
  }
}

// ⑥ sections.ts 里声明的标签必须真的存在于某篇文章上 ——
//    写错一个标签不会报错，只会让那个栏目永远少收几篇。
const allTags = new Set(posts.flatMap((post) => post.tags));
for (const section of sections) {
  for (const tag of section.tags) {
    if (!allTags.has(tag)) {
      errors.push(
        `sections.ts 的 ${section.id} 声明了标签 '${tag}'，但没有任何文章使用它（拼写错误？）`,
      );
    }
  }
}

// ⑦ 归属情况报告 —— 不阻断，但必须可见
const published = posts.filter((post) => !post.draft);
const membership = published.map((post) => {
  const matched = sections.filter((section) => {
    if (post.section) return post.section === section.id;
    if (section.categories.includes(normalizeCategory(post.category ?? ''))) {
      return true;
    }
    return section.tags.some((tag) => post.tags.includes(tag));
  });
  return { post, matched };
});

for (const { post, matched } of membership) {
  if (matched.length === 0) {
    warnings.push(
      `src/content/posts/${post.file}  未归入任何栏目（只会出现在 /blog/ 与 /archive/）`,
    );
  }
  if (matched.length > 1) {
    warnings.push(
      `src/content/posts/${post.file}  同属 ${matched.map((s) => s.id).join(' + ')} 两个栏目`,
    );
  }
}

// ---------- 知识层的悬空引用（KNOW-001）----------
//
// `prerequisites` / `related` 里写的是别的文章的 id。写错一个字母不会报错，
// 页面上只是**少了一个链接** —— 静默得没人会发现，
// 而那正是「事实来源可追溯」最容易被破坏的方式。
//
// 这是 error 而不是 warning：一条指向不存在文章的前置知识不是「风格问题」，
// 是这条知识链断了。
const knownIds = new Set(posts.map((p) => p.id.toLowerCase()));
for (const post of posts) {
  const self = post.id.toLowerCase();
  for (const [field, list] of [
    ['prerequisites', post.prerequisites],
    ['related', post.related],
  ]) {
    for (const raw of list) {
      const target = raw.replace(/\.(md|mdx)$/i, '').toLowerCase();
      if (target === self) {
        errors.push(
          `src/content/posts/${post.file}  ${field} 指向自己（${raw}）—— 自引用没有意义`,
        );
        continue;
      }
      if (!knownIds.has(target)) {
        errors.push(
          `src/content/posts/${post.file}  ${field} 指向不存在的文章「${raw}」—— ` +
            '页面上会表现为少一个链接，而不会有任何提示',
        );
      }
    }
  }
}

// 去重：同一篇的同一处问题只报一次（重复段落会让列表读起来像坏了）
const uniqueErrors = [...new Set(errors)];
errors.length = 0;
errors.push(...uniqueErrors);

// ---------- 输出 ----------
if (warnings.length) {
  console.log(`\n⚠ 内容警告（${warnings.length} 项，不阻断）：\n`);
  for (const warning of warnings) console.log(`  ${warning}`);
}

if (errors.length) {
  console.error(`\n✗ 内容检查失败（${errors.length} 项）：\n`);
  for (const error of errors) console.error(`  ${error}`);
  console.error('');
  process.exit(1);
}

const perSection = sections
  .map((section) => {
    const count = membership.filter(({ matched }) =>
      matched.some((s) => s.id === section.id),
    ).length;
    return `${section.id} ${count}`;
  })
  .join(' · ');

console.log(
  `\n✓ 内容检查通过（${posts.length} 篇${sections.length ? `，${perSection}` : ''}）\n`,
);
