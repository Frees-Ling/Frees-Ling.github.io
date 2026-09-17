#!/usr/bin/env node
// 生成社交分享图（OG image）—— PERF-001。
//
// ── 为什么 OG 图必须与页面展示分开 ──
//
// 页面上那张图由 astro:assets 处理：带内容哈希、按屏宽出多档、产物是 WebP。
// 这三条对 og:image **全部有害**：
//
//   · 带哈希 → 每次重新构建 URL 就变，而社交平台会长期缓存旧的 og:image，
//     于是同一篇文章在不同平台显示不同的图
//   · 多档 srcset → OG 协议只接受一个绝对 URL，没有 srcset 这个概念
//   · WebP → 微信、Twitter 卡片对 WebP 的支持并不一致，JPEG 才是能用的那个
//
// 所以这里生成一张**固定路径、固定格式、尺寸合规**的独立资产。
//
// 尺寸取 1200×630：这是 Facebook / Twitter / 微信 都认的那个比例（1.91:1）。
// 原图是 1200×750（1.6:1），直接发出去会被各家按自己的规则裁 ——
// 裁在哪由平台决定，不由我们决定。这里先按中心裁好，让画面是我们选的。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(ROOT, 'src/assets/banner.jpg');
const OUT = join(ROOT, 'public/og/banner.jpg');
const MANIFEST = join(ROOT, 'public/og/manifest.json');

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** 上限。超过就调质量重来 —— OG 图不该比首屏 JS 还大。 */
const MAX_BYTES = 200 * 1024;

/** 原图的 sha256。用来判断产物是不是过时了。 */
export function masterHash(path = MASTER) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * 生成 OG 图。
 *
 * `withoutEnlargement` 不设：OG 必须是 1200×630，源图比这小的话
 * 唯一的办法是放大 —— 而「宁可放大也要给对尺寸」在这里是对的，
 * 因为尺寸不合规的图会被平台按自己的规则裁掉一部分。
 */
export async function buildOg({ quality = 82 } = {}) {
  const buffer = await sharp(MASTER)
    .rotate() // 先按 EXIF 摆正，再裁 —— 顺序反了会裁错边
    .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality, mozjpeg: true, progressive: true })
    // 刻意不调用 .withMetadata()：同 media/library.mjs 里的理由 ——
    // 这个调用会**保留**元数据，而 OG 图是要发到各家平台去的
    .toBuffer();

  return { buffer, quality, hash: masterHash() };
}

/** 生成并落盘，返回用了哪个质量档。 */
export async function writeOg() {
  let quality = 82;
  let result = await buildOg({ quality });

  // 质量阶梯：JPEG 的质量与体积不是线性关系，实测降到 70 通常还看不出来，
  // 而体积能掉三成。上限是硬的，质量是软的。
  while (result.buffer.length > MAX_BYTES && quality > 50) {
    quality -= 6;
    result = await buildOg({ quality });
  }
  if (result.buffer.length > MAX_BYTES) {
    throw new Error(
      `OG 图仍然过大（${(result.buffer.length / 1024).toFixed(0)} KB，上限 ${MAX_BYTES / 1024} KB）`,
    );
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, result.buffer);
  writeFileSync(
    MANIFEST,
    `${JSON.stringify(
      {
        masterHash: result.hash,
        quality,
        width: OG_WIDTH,
        height: OG_HEIGHT,
        bytes: result.buffer.length,
      },
      null,
      2,
    )}\n`,
  );

  return { quality, bytes: result.buffer.length };
}

/** 产物是否与当前原图一致。构建前与闸门都用它。 */
export function ogIsStale() {
  if (!existsSync(OUT) || !existsSync(MANIFEST)) return true;
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    return manifest.masterHash !== masterHash();
  } catch {
    return true;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { quality, bytes } = await writeOg();
  console.log(
    `✓ OG 图已生成：public/og/banner.jpg ${OG_WIDTH}×${OG_HEIGHT} ` +
      `质量 ${quality}，${(bytes / 1024).toFixed(0)} KB`,
  );
}
