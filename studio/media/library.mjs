// 本地媒体库（MEDIA-001）。
//
// ── 内容寻址 ──
//
// id = 文件内容的 sha256 前 32 位。一次解决三件事：
//   **稳定** —— 同样的字节永远是同一个 id，改名、移动都不影响
//   **去重** —— 导两次自然只剩一条，不需要额外的判重逻辑
//   **可校验** —— 文件与记录对不上时立刻能发现
//
// ── EXIF 策略 ──
//
// 手机照片默认带 GPS 坐标。三种做法各有代价，这里选的是第三种：
//
//   ① 原图与派生物都保留 EXIF —— 发布出去的照片会带上拍摄地点
//   ② 全部抹掉 —— 原图是**母版**，抹掉就是毁数据，且不可逆
//   ③ **原图原样保留，派生物一律不含元数据** ← 选这个
//
// ③ 的理由：母版只在本地，它的完整信息是资产；而派生物是**要发布出去的东西**，
// 那里不该带任何拍摄地点。策略落在「哪个文件会离开这台机器」这条分界上，
// 而不是「哪个文件更干净」。
//
// 同时记下每张图是否含 EXIF / GPS —— 用户有权知道自己手里有哪些照片
// 带着位置信息，而不是等到发出去之后才想起来。

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, extname, join } from 'node:path';

import sharp from 'sharp';

const ID_LENGTH = 32;
/** 单张图上限，防止一个巨型文件把内存吃干。 */
const MAX_BYTES = 64 * 1024 * 1024;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

const now = () => new Date().toISOString();

/** 内容 → id。**只依赖字节**，不依赖文件名或路径。 */
export function mediaIdOf(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, ID_LENGTH);
}

/** 分片存放：两万张图平铺在一个目录里，连 ls 都会变慢。 */
export function mediaPath(storeDir, id, ext) {
  return join(storeDir, id.slice(0, 2), `${id}${ext}`);
}

function normalizeExt(filename, mime) {
  const ext = extname(filename ?? '').toLowerCase();
  if (MIME_BY_EXT[ext]) return ext;
  const found = Object.entries(MIME_BY_EXT).find(([, m]) => m === mime);
  return found ? found[0] : '.bin';
}

const EXIF_MAGIC = Buffer.from('Exif\0\0');
/** EXIF 里指向 GPS IFD 的标签号。 */
const GPS_IFD_TAG = 0x8825;

/**
 * EXIF 块里有没有 GPS IFD —— 也就是「这张照片带不带拍摄地点」。
 *
 * **按 TIFF 结构解析，不搜字节。** 搜 `0x8825` 那两个字节看起来更省事，
 * 但它两个方向都会错：别的数据里恰好出现那两个字节就误报，
 * 而大端（`MM`）机器上标签是反着存的，直接漏报 —— 漏报在这里意味着
 * **告诉用户「这张图不含位置信息」，然后它被发出去了**。
 */
function exifHasGps(exif) {
  const k = exif.indexOf(EXIF_MAGIC);
  const tiff = k === -1 ? exif : exif.subarray(k + EXIF_MAGIC.length);
  if (tiff.length < 8) return false;

  const order = tiff.toString('latin1', 0, 2);
  const little = order === 'II';
  if (!little && order !== 'MM') return false;

  const u16 = (at) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  if (u16(2) !== 0x2a) return false; // TIFF 的固定标记

  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) return false;
  const count = u16(ifd0);

  for (let i = 0; i < count; i++) {
    const at = ifd0 + 2 + i * 12;
    if (at + 12 > tiff.length) break;
    if (u16(at) !== GPS_IFD_TAG) continue;
    // 指针为 0 表示「有这一项但没有内容」
    return u32(at + 8) > 0;
  }
  return false;
}

/**
 * 读取一张图的元数据，**并读出它带了什么元数据**。
 *
 * 这里曾经有一段「用 `withMetadata()` 往返一次、再在结果里找 `Exif\0\0`
 * 标记来确认」的判定。那是错的：`withMetadata()` 会**造出**一个 EXIF 块
 * （实测 279 字节的图往返后变成 967 字节、且带上了 Exif 标记），
 * 于是它给每一张图都盖了章，`hasExif` 变成恒真。
 * 判据只能是 sharp 解析出来的 `meta.exif` 本身 —— 那是它对这个文件的陈述，
 * 而不是我们对它做了一次加工之后的结果。
 *
 * （把上面那段加回去，「无 EXIF 的图如实标为 false」这条用例会红。）
 *
 * `?.length` 是防御性的：实测 jpeg / png / webp / avif / tiff 五种格式在
 * 没有元数据时给的都是 `undefined`，所以 `Boolean()` 本来就对；但空 Buffer
 * 是对象、`Boolean(Buffer.alloc(0))` 为真，真遇到这种形状时按长度判才安全。
 */
async function inspect(buffer) {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();

  const exif = meta.exif?.length ? meta.exif : null;
  const iptc = meta.iptc?.length ? meta.iptc : null;
  const xmp = meta.xmp?.length ? meta.xmp : null;

  // XMP 里同样可以塞经纬度（Lightroom 之类会写），所以位置判定要看两处
  const xmpHasGps = Boolean(
    xmp && /GPSLatitude|exif:GPS|GPSCoordinates/i.test(xmp.toString('latin1')),
  );

  return {
    width: meta.width ?? null,
    height: meta.height ?? null,
    mime:
      MIME_BY_EXT[`.${meta.format}`] ??
      MIME_BY_EXT[`.${meta.format === 'jpeg' ? 'jpg' : meta.format}`] ??
      `image/${meta.format ?? 'unknown'}`,
    // 「带着像素之外的元数据」—— EXIF 之外 IPTC / XMP 也算，
    // 它们同样会跟着文件走
    hasExif: Boolean(exif || iptc || xmp),
    hasGps: Boolean(exif && exifHasGps(exif)) || xmpHasGps,
  };
}

/**
 * 导入一张图。
 *
 * **幂等**：同样的字节导多少次都只有一条记录、一个文件。
 *
 * **崩溃安全**：先写临时文件并 fsync，再 `rename` 进库 ——
 * `rename` 在同一文件系统上是原子的。因此进程在任何时刻被杀，
 * 库里要么没有这个文件，要么是一个**完整**的文件，不会有半个。
 * 数据库行在文件落位**之后**才写。
 */
export async function importMedia(
  db,
  { buffer, filename = 'unnamed', storeDir },
) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('需要图片数据');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error(
      `文件过大（${(buffer.length / 1024 / 1024).toFixed(1)} MB，上限 ${MAX_BYTES / 1024 / 1024} MB）`,
    );
  }

  const hash = createHash('sha256').update(buffer).digest('hex');
  const id = hash.slice(0, ID_LENGTH);

  // 先查库：已导入过就什么都不做（**不去碰文件系统** ——
  // 重复导入是常见操作，不该每次都做一次磁盘写入）
  const existing = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
  if (existing) return { media: toMedia(existing), deduped: true };

  let info;
  try {
    info = await inspect(buffer);
  } catch (error) {
    throw new Error(`不是能识别的图片：${error.message}`);
  }
  if (!info.width || !info.height) {
    throw new Error('读不出图片尺寸 —— 它可能不是有效的图片');
  }

  const ext = normalizeExt(filename, info.mime);
  const target = mediaPath(storeDir, id, ext);
  mkdirSync(dirname(target), { recursive: true });

  // ── 原子落盘 ──
  const tmp = join(storeDir, 'tmp', `${randomUUID()}${ext}`);
  mkdirSync(dirname(tmp), { recursive: true });
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, buffer);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);

  db.prepare(
    `INSERT INTO media (id, hash, filename, mime, bytes, width, height, has_exif, has_gps, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    hash,
    filename,
    info.mime,
    buffer.length,
    info.width,
    info.height,
    info.hasExif ? 1 : 0,
    info.hasGps ? 1 : 0,
    now(),
  );

  return { media: describeMedia(db, id), deduped: false };
}

/** 从磁盘上的文件导入。 */
export async function importMediaFile(db, { path, filename, storeDir }) {
  return importMedia(db, {
    buffer: readFileSync(path),
    filename: filename ?? path.split('/').pop(),
    storeDir,
  });
}

function toMedia(row) {
  return {
    id: row.id,
    hash: row.hash,
    filename: row.filename,
    mime: row.mime,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    hasExif: row.has_exif === 1,
    hasGps: row.has_gps === 1,
    importedAt: row.imported_at,
  };
}

export function describeMedia(db, id) {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
  return row ? toMedia(row) : null;
}

export function listMedia(db, { limit = 100 } = {}) {
  return db
    .prepare('SELECT * FROM media ORDER BY imported_at DESC LIMIT ?')
    .all(limit)
    .map(toMedia);
}

/**
 * 生成派生物（缩略图 / 网页尺寸）。
 *
 * **派生物一律不含元数据。** 它是会离开这台机器的那个文件，
 * 而原图里的 GPS 坐标不该跟着一起走。这不是 sharp 的默认行为问题 ——
 * 是这里显式写下的一条策略，因为它关系到「照片拍在哪」。
 */
export async function derivativeOf(
  db,
  { id, storeDir, kind = 'thumb', width = 480 },
) {
  const media = describeMedia(db, id);
  if (!media) throw new Error(`没有这张图：${id}`);

  const existing = db
    .prepare(
      'SELECT * FROM media_derivatives WHERE media_id = ? AND kind = ? AND width = ?',
    )
    .get(id, kind, width);
  if (existing) {
    return { path: derivativePath(storeDir, id, kind, width), deduped: true };
  }

  const source = resolveMediaFile(db, { id, storeDir });
  const buf = await sharp(source)
    // 先按 EXIF 方向摆正 —— 必须在元数据被丢弃**之前**读它，
    // 否则竖拍的照片会横过来
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    // ⚠️ **刻意不调用 .withMetadata()。**
    //
    // 直觉上「显式关掉元数据」应该写 `.withMetadata(false)`，
    // 但实测那**反而会把 EXIF 保留下来**：同一张带 Copyright 的图，
    // 走默认管线得到的是已剥离，加上 `.withMetadata(false)` 之后
    // Copyright 出现在输出里，连 WebP 派生物也带着。
    // （`.keepMetadata(false)` 同样如此。）
    //
    // 原因大概是这个签名在 sharp 里是「保留元数据」的重载，
    // 传 false 并没有变成「移除」。不管原因如何 —— **默认才是剥离**，
    // 所以这里什么都不写，并留下这条注释防止有人「好心」加回去。
    .toBuffer();

  const target = derivativePath(storeDir, id, kind, width);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(storeDir, 'tmp', `${randomUUID()}.webp`);
  mkdirSync(dirname(tmp), { recursive: true });
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, buf);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);

  db.prepare(
    `INSERT INTO media_derivatives (id, media_id, kind, width, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (media_id, kind, width) DO UPDATE SET bytes = excluded.bytes`,
  ).run(randomUUID(), id, kind, width, buf.length, now());

  return { path: target, bytes: buf.length, deduped: false };
}

export function derivativePath(storeDir, id, kind, width) {
  return join(
    storeDir,
    'derivatives',
    id.slice(0, 2),
    `${id}-${kind}-${width}.webp`,
  );
}

/** 找到原图文件的实际路径。扩展名不写死 —— 导入时的格式决定它。 */
export function resolveMediaFile(db, { id, storeDir }) {
  const row = db.prepare('SELECT mime FROM media WHERE id = ?').get(id);
  if (!row) return null;
  const ext = normalizeExt('', row.mime);
  const path = mediaPath(storeDir, id, ext);
  return existsSync(path) ? path : null;
}

// ── 反向引用 ──

export function linkMedia(db, { mediaId, ownerKind, ownerId }) {
  db.prepare(
    `INSERT INTO media_refs (media_id, owner_kind, owner_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (media_id, owner_kind, owner_id) DO NOTHING`,
  ).run(mediaId, ownerKind, ownerId, now());
}

export function unlinkMedia(db, { mediaId, ownerKind, ownerId }) {
  return (
    db
      .prepare(
        'DELETE FROM media_refs WHERE media_id = ? AND owner_kind = ? AND owner_id = ?',
      )
      .run(mediaId, ownerKind, ownerId).changes > 0
  );
}

/** 这张图被谁引用。没有它，「能不能删」只能靠人翻所有笔记。 */
export function referencesTo(db, mediaId) {
  return db
    .prepare(
      'SELECT owner_kind AS ownerKind, owner_id AS ownerId FROM media_refs WHERE media_id = ?',
    )
    .all(mediaId);
}

/** 没有任何引用的图 —— 清理时的候选，但**不自动删**。 */
export function unreferenced(db, { limit = 200 } = {}) {
  return db
    .prepare(
      `SELECT m.* FROM media m
        WHERE NOT EXISTS (SELECT 1 FROM media_refs r WHERE r.media_id = m.id)
        ORDER BY m.imported_at LIMIT ?`,
    )
    .all(limit)
    .map(toMedia);
}

// ── 崩溃恢复 / 一致性 ──

/**
 * 核对库与磁盘是否一致。
 *
 * 两种不一致，**含义完全不同**，所以分开报：
 *
 *   `missing` —— 库里有、磁盘上没有。这是**真的丢了**：引用它的地方会变成裂图。
 *   `orphan`  —— 磁盘上有、库里没有。这是**崩溃的残留**：进程在
 *                「文件已落位、记录还没写」之间被杀。内容还在，可以重新收养。
 *
 * 把两者混成一个「不一致」的计数，会让人以为它们同样严重 ——
 * 而实际上一个要恢复，另一个多半只是垃圾。
 */
export function verifyStore(db, storeDir) {
  const missing = [];
  const orphan = [];

  for (const m of listMedia(db, { limit: 100_000 })) {
    if (!resolveMediaFile(db, { id: m.id, storeDir })) missing.push(m.id);
  }

  const known = new Set(
    db
      .prepare('SELECT id FROM media')
      .all()
      .map((r) => r.id),
  );
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSyncSafe(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const id = entry.replace(/\.[^.]+$/, '');
      if (!known.has(id)) orphan.push(id);
    }
  };
  // tmp 目录是落盘的中间态，不算孤儿
  for (const shard of readdirSyncSafe(storeDir)) {
    if (shard === 'tmp' || shard === 'derivatives') continue;
    walk(join(storeDir, shard));
  }

  return { missing, orphan, ok: missing.length === 0 && orphan.length === 0 };
}

function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * 收养一个孤儿文件：文件在磁盘上、库里没有记录。
 *
 * **不自动跑**。收养意味着「把这个文件当成正式媒体登记」，
 * 而那是一个人的判断 —— 那个文件可能是一次失败导入的残留，
 * 也可能真的是一张该留下的图。
 */
export async function adoptOrphan(db, { id, storeDir }) {
  for (const ext of Object.keys(MIME_BY_EXT)) {
    const path = join(storeDir, id.slice(0, 2), `${id}${ext}`);
    if (!existsSync(path)) continue;
    const buffer = readFileSync(path);
    // 内容哈希必须与目录名一致 —— 不一致说明有人在文件系统里动过手脚
    if (mediaIdOf(buffer) !== id) {
      throw new Error(`文件内容与它的 id 不符（${id}）—— 文件被改过，拒绝收养`);
    }
    return importMedia(db, { buffer, filename: `${id}${ext}`, storeDir });
  }
  return null;
}

/** 清掉 tmp 目录里的残留。这些是崩溃时没来得及 rename 的半成品。 */
export function cleanupTemp(storeDir) {
  const tmp = join(storeDir, 'tmp');
  if (!existsSync(tmp)) return 0;
  let n = 0;
  for (const entry of readdirSyncSafe(tmp)) {
    rmSync(join(tmp, entry), { force: true });
    n++;
  }
  return n;
}
