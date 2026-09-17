// 本地媒体库测试（MEDIA-001）。
//
// 两条最要紧的性质各自成组：
//   · EXIF 策略 —— 原图留、派生物不留（**隐私**：手机照片带 GPS）
//   · 崩溃恢复 —— 进程在任意时刻被杀，库与磁盘都不该留下半成品

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { openDatabase } from '../db/schema.mjs';
import { createNote } from '../db/store.mjs';
import {
  mediaIdOf,
  mediaPath,
  importMedia,
  importMediaFile,
  describeMedia,
  listMedia,
  derivativeOf,
  resolveMediaFile,
  linkMedia,
  unlinkMedia,
  referencesTo,
  unreferenced,
  verifyStore,
  adoptOrphan,
  cleanupTemp,
} from './library.mjs';

const fresh = () => openDatabase(':memory:');

// ⚠️ 必须 `await fn(dir)`。写成 `return fn(dir)` 的话 `finally` 会在
// **回调的 promise 兑现之前**就删掉临时目录 —— 异步用例于是在一个
// 已经不存在的目录里跑。之前有一批用例因此是靠 importMedia 顺手
// `mkdirSync` 重建目录才「通过」的，而先写文件再导入的用例直接 ENOENT。
async function withStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'media-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 造一张指定颜色的图。 */
const makeImage = (color = '#315cff', size = 60) =>
  sharp({
    create: { width: size, height: size / 2, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();

/** 造一张带 EXIF 的图。 */
const makeWithExif = async (marker = 'SECRETMARKER') =>
  sharp(await makeImage())
    .withExif({ IFD0: { Copyright: marker } })
    .jpeg()
    .toBuffer();

/**
 * 手拼一个 TIFF/EXIF 载荷。
 *
 * 为什么要手拼：sharp 的 `withExif({ GPS: ... })` **静默忽略 GPS 键** ——
 * 实测输出里根本没有 0x8825 那一项，于是「造一张带 GPS 的图」造出来的
 * 其实是一张不带 GPS 的图，用例会因为**错误的原因**通过。
 * 而且真机里 Canon / Nikon 写的是大端（`MM`），只测小端等于只测了一半。
 */
function buildExifPayload({ little = true, gps = true } = {}) {
  const t = Buffer.alloc(64);
  const u16 = (at, v) =>
    little ? t.writeUInt16LE(v, at) : t.writeUInt16BE(v, at);
  const u32 = (at, v) =>
    little ? t.writeUInt32LE(v, at) : t.writeUInt32BE(v, at);

  t.write(little ? 'II' : 'MM', 0, 'latin1'); // 字节序标记
  u16(2, 0x2a); // TIFF 固定标记
  u32(4, 8); // IFD0 的偏移
  u16(8, gps ? 1 : 0); // IFD0 的条目数
  if (gps) {
    u16(10, 0x8825); // GPS IFD 指针
    u16(12, 4); // LONG
    u32(14, 1);
    u32(18, 26); // → GPS IFD 的偏移
  }
  u32(22, 0); // 没有下一个 IFD
  u16(26, 1); // GPS IFD：一项
  u16(28, 0x0001); // GPSLatitudeRef
  u16(30, 2); // ASCII
  u32(32, 2);
  t.write('N\0', 36, 'latin1');
  return t;
}

/** 把 EXIF 作为 APP1 段插到 SOI 之后 —— 真机就是这么放的。 */
function withExifSegment(jpeg, payload) {
  const body = Buffer.concat([Buffer.from('Exif\0\0'), payload]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length + 2); // 长度含这两个字节自身
  return Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1]),
    len,
    body,
    jpeg.subarray(2),
  ]);
}

const makeWithGps = async ({ little = true } = {}) =>
  withExifSegment(await makeImage(), buildExifPayload({ little, gps: true }));

const makeExifNoGps = async ({ little = true } = {}) =>
  withExifSegment(await makeImage(), buildExifPayload({ little, gps: false }));

/**
 * 把 XMP 作为 APP1 段插进去。
 *
 * XMP 是**另一条会带位置信息的通路** —— Lightroom 之类的工具往这里写经纬度，
 * 而不是写进 EXIF。只查 EXIF 就会在「这张图带不带拍摄地点」上答错。
 */
function withXmpSegment(jpeg, xml) {
  const body = Buffer.concat([
    Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'),
    Buffer.from(xml, 'utf8'),
  ]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length + 2);
  return Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1]),
    len,
    body,
    jpeg.subarray(2),
  ]);
}

const xmpPacket = (description) =>
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">` +
  `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${description}</rdf:RDF>` +
  `</x:xmpmeta><?xpacket end="w"?>`;

const makeWithXmpGps = async () =>
  withXmpSegment(
    await makeImage(),
    xmpPacket(
      '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" ' +
        'exif:GPSLatitude="31,14.0N" exif:GPSLongitude="121,28.0E"/>',
    ),
  );

const makeWithXmpNoGps = async () =>
  withXmpSegment(
    await makeImage(),
    xmpPacket(
      '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="someone"/>',
    ),
  );

// ── 稳定 id ──

test('id 只由内容决定：改名、改路径都不影响', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const buf = await makeImage('#f00');
    const a = await importMedia(db, {
      buffer: buf,
      filename: 'a.jpg',
      storeDir: dir,
    });
    const b = await importMedia(db, {
      buffer: buf,
      filename: '完全不同的名字.jpg',
      storeDir: dir,
    });
    assert.equal(a.media.id, b.media.id, '同样的字节必须是同一个 id');
    assert.equal(b.deduped, true);
    assert.equal(listMedia(db).length, 1);
  });
  db.close();
});

test('内容不同则 id 不同 —— 改一个像素就是另一张图', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const a = await importMedia(db, {
      buffer: await makeImage('#f00'),
      storeDir: dir,
    });
    const b = await importMedia(db, {
      buffer: await makeImage('#00f'),
      storeDir: dir,
    });
    assert.notEqual(a.media.id, b.media.id);
    assert.equal(listMedia(db).length, 2);
  });
  db.close();
});

test('mediaIdOf 是纯函数：同样的字节任何时候算出来一样', async () => {
  const buf = await makeImage();
  assert.equal(mediaIdOf(buf), mediaIdOf(Buffer.from(buf)));
  assert.notEqual(mediaIdOf(buf), mediaIdOf(await makeImage('#123456')));
});

// ── 元数据 ──

test('记下尺寸、类型与字节数', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const buf = await makeImage('#315cff', 80);
    const { media } = await importMedia(db, {
      buffer: buf,
      filename: 'x.jpg',
      storeDir: dir,
    });
    assert.equal(media.width, 80);
    assert.equal(media.height, 40);
    assert.equal(media.mime, 'image/jpeg');
    assert.equal(media.bytes, buf.length);
    assert.ok(media.importedAt);
  });
  db.close();
});

test('不是图片的字节被拒绝，不会留下垃圾记录', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    await assert.rejects(
      () =>
        importMedia(db, { buffer: Buffer.from('这不是图片'), storeDir: dir }),
      /不是能识别的图片|读不出图片尺寸/,
    );
    assert.equal(listMedia(db).length, 0);
  });
  db.close();
});

test('空数据与超大文件被拒绝', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    await assert.rejects(
      () => importMedia(db, { buffer: Buffer.alloc(0), storeDir: dir }),
      /需要图片数据/,
    );
    await assert.rejects(
      () =>
        importMedia(db, {
          buffer: Buffer.alloc(70 * 1024 * 1024),
          storeDir: dir,
        }),
      /文件过大/,
    );
  });
  db.close();
});

// ── EXIF 策略（隐私） ──

test('原图**保留** EXIF —— 它是母版，抹掉就是毁数据', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const buf = await makeWithExif('MASTERMARKER');
    const { media } = await importMedia(db, {
      buffer: buf,
      filename: 'p.jpg',
      storeDir: dir,
    });
    assert.equal(media.hasExif, true, '要能识别出它带了元数据');

    const path = resolveMediaFile(db, { id: media.id, storeDir: dir });
    assert.ok(
      readFileSync(path).includes(Buffer.from('MASTERMARKER')),
      '原图必须逐字节保留 —— 库里存的是母版',
    );
  });
  db.close();
});

test('**派生物不含任何 EXIF** —— 那是会离开这台机器的文件', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const buf = await makeWithExif('SECRETCOPYRIGHT');
    const { media } = await importMedia(db, {
      buffer: buf,
      filename: 'p.jpg',
      storeDir: dir,
    });
    const d = await derivativeOf(db, {
      id: media.id,
      storeDir: dir,
      width: 30,
    });
    const out = readFileSync(d.path);

    assert.ok(
      !out.includes(Buffer.from('SECRETCOPYRIGHT')),
      '派生物里不该有原图的元数据',
    );
    assert.ok(!out.includes(Buffer.from('Exif')), '连 Exif 标记都不该有');
  });
  db.close();
});

test('无 EXIF 的图如实标为 false，不猜', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeImage(),
      filename: 'clean.jpg',
      storeDir: dir,
    });
    assert.equal(media.hasExif, false);
    assert.equal(media.hasGps, false);
  });
  db.close();
});

test('**识别出 GPS 坐标** —— 这是用户最该知道的一件事', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeWithGps(),
      filename: 'phone.jpg',
      storeDir: dir,
    });
    assert.equal(
      media.hasGps,
      true,
      '照片带着拍摄地点，而这个字段是唯一会说出来的人',
    );
    assert.equal(media.hasExif, true);
  });
  db.close();
});

test('大端（MM）的 GPS 同样识别 —— 只认小端会漏掉一半的相机', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeWithGps({ little: false }),
      filename: 'canon.jpg',
      storeDir: dir,
    });
    assert.equal(
      media.hasGps,
      true,
      '大端机器上标签是反着存的，靠搜字节会漏报',
    );
  });
  db.close();
});

test('有 EXIF 但没 GPS 时，不能谎报有位置', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeExifNoGps(),
      filename: 'no-location.jpg',
      storeDir: dir,
    });
    assert.equal(media.hasExif, true, '它确实带了元数据');
    assert.equal(media.hasGps, false, '但里面没有位置 —— 报成有会让用户白紧张');
  });
  db.close();
});

test('**XMP 里的 GPS 也要认** —— 位置不止 EXIF 一条通路', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeWithXmpGps(),
      filename: 'lightroom.jpg',
      storeDir: dir,
    });
    assert.equal(
      media.hasGps,
      true,
      '只查 EXIF 的话，这类图会被答成「不含位置」然后发出去',
    );
  });
  db.close();
});

test('只有 XMP、且里面没有位置时，hasExif 为真而 hasGps 为假', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeWithXmpNoGps(),
      filename: 'xmp-only.jpg',
      storeDir: dir,
    });
    assert.equal(media.hasExif, true, 'XMP 也是像素之外的元数据，会跟着文件走');
    assert.equal(media.hasGps, false);
  });
  db.close();
});

test('GPS 派生物同样不带位置信息（这条是整条策略的落点）', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeWithGps(),
      filename: 'phone.jpg',
      storeDir: dir,
    });
    const d = await derivativeOf(db, {
      id: media.id,
      storeDir: dir,
      width: 30,
    });
    const out = readFileSync(d.path);
    assert.ok(
      !out.includes(Buffer.from('Exif')),
      '派生物里不该有任何 EXIF 标记',
    );
    assert.ok(
      !out.includes(Buffer.from([0x88, 0x25])) &&
        !out.includes(Buffer.from([0x25, 0x88])),
      '连 GPS 标签的字节都不该出现',
    );
  });
  db.close();
});

// ── 派生物 ──

test('派生物按 (media, kind, width) 去重', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeImage(),
      storeDir: dir,
    });
    const a = await derivativeOf(db, {
      id: media.id,
      storeDir: dir,
      width: 30,
    });
    const b = await derivativeOf(db, {
      id: media.id,
      storeDir: dir,
      width: 30,
    });
    assert.equal(a.deduped, false);
    assert.equal(b.deduped, true, '同一个尺寸不该重算');
    const c = await derivativeOf(db, {
      id: media.id,
      storeDir: dir,
      width: 20,
    });
    assert.equal(c.deduped, false, '不同尺寸是另一个派生物');
  });
  db.close();
});

test('派生物不放大原图', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeImage('#0f0', 40),
      storeDir: dir,
    });
    const d = await derivativeOf(db, {
      id: media.id,
      storeDir: dir,
      width: 4000,
    });
    const meta = await sharp(d.path).metadata();
    assert.ok(meta.width <= 40, `不该放大（实际 ${meta.width}）`);
  });
  db.close();
});

test('给不存在的图做派生物会明确报错', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    await assert.rejects(
      () => derivativeOf(db, { id: '不存在', storeDir: dir }),
      /没有这张图/,
    );
  });
  db.close();
});

// ── 反向引用 ──

test('能查出这张图被谁引用', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const note = createNote(db, { title: '用了这张图', body: '', tags: [] });
    const { media } = await importMedia(db, {
      buffer: await makeImage(),
      storeDir: dir,
    });

    assert.deepEqual(referencesTo(db, media.id), []);
    linkMedia(db, { mediaId: media.id, ownerKind: 'note', ownerId: note.id });

    const refs = referencesTo(db, media.id);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].ownerKind, 'note');
    assert.equal(refs[0].ownerId, note.id);
  });
  db.close();
});

test('重复建同一条引用不会变成两条', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeImage(),
      storeDir: dir,
    });
    linkMedia(db, { mediaId: media.id, ownerKind: 'note', ownerId: 'n1' });
    linkMedia(db, { mediaId: media.id, ownerKind: 'note', ownerId: 'n1' });
    assert.equal(referencesTo(db, media.id).length, 1);
  });
  db.close();
});

test('取消引用，并列出没人用的图（不自动删）', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeImage(),
      storeDir: dir,
    });
    linkMedia(db, { mediaId: media.id, ownerKind: 'note', ownerId: 'n1' });
    assert.equal(unreferenced(db).length, 0);

    assert.equal(
      unlinkMedia(db, { mediaId: media.id, ownerKind: 'note', ownerId: 'n1' }),
      true,
    );
    assert.equal(unreferenced(db).length, 1);
    assert.equal(
      listMedia(db).length,
      1,
      '没人用不等于该删 —— 那是一个人的判断',
    );
  });
  db.close();
});

// ── 崩溃恢复 ──

test('库里有、磁盘上没有 → 报 missing（那是真的丢了）', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const { media } = await importMedia(db, {
      buffer: await makeImage(),
      storeDir: dir,
    });
    rmSync(resolveMediaFile(db, { id: media.id, storeDir: dir }));

    const v = verifyStore(db, dir);
    assert.deepEqual(v.missing, [media.id]);
    assert.equal(v.ok, false);
  });
  db.close();
});

test('磁盘上有、库里没有 → 报 orphan（那是崩溃的残留，不是丢失）', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    // 模拟「文件已落位、记录还没写」时被杀
    const buf = await makeImage('#abc');
    const id = mediaIdOf(buf);
    const path = mediaPath(dir, id, '.jpg');
    mkdirSync(join(dir, id.slice(0, 2)), { recursive: true });
    writeFileSync(path, buf);

    const v = verifyStore(db, dir);
    assert.deepEqual(v.orphan, [id]);
    assert.deepEqual(v.missing, [], '两种不一致的含义完全不同，必须分开报');
  });
  db.close();
});

test('孤儿可以被收养，且收养时校验内容与 id 是否相符', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const buf = await makeImage('#abc');
    const id = mediaIdOf(buf);
    mkdirSync(join(dir, id.slice(0, 2)), { recursive: true });
    writeFileSync(mediaPath(dir, id, '.jpg'), buf);

    const adopted = await adoptOrphan(db, { id, storeDir: dir });
    assert.equal(adopted.media.id, id);
    assert.equal(verifyStore(db, dir).ok, true, '收养后应当一致');
  });
  db.close();
});

test('文件被改过时拒绝收养 —— 内容与 id 不符说明有人动过手脚', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const buf = await makeImage('#abc');
    const id = mediaIdOf(buf);
    mkdirSync(join(dir, id.slice(0, 2)), { recursive: true });
    writeFileSync(
      mediaPath(dir, id, '.jpg'),
      Buffer.concat([buf, Buffer.from('附加')]),
    );

    await assert.rejects(
      () => adoptOrphan(db, { id, storeDir: dir }),
      /内容与它的 id 不符/,
    );
  });
  db.close();
});

test('tmp 目录里的半成品不算孤儿，且可清理', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    mkdirSync(join(dir, 'tmp'), { recursive: true });
    writeFileSync(join(dir, 'tmp', 'half-written.jpg'), 'half');

    assert.deepEqual(
      verifyStore(db, dir).orphan,
      [],
      '落盘的中间态不该被当成媒体',
    );
    assert.equal(cleanupTemp(dir), 1);
    assert.equal(existsSync(join(dir, 'tmp', 'half-written.jpg')), false);
  });
  db.close();
});

test('干净的一套库与磁盘互相一致', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    await importMedia(db, { buffer: await makeImage('#111'), storeDir: dir });
    await importMedia(db, { buffer: await makeImage('#222'), storeDir: dir });
    const v = verifyStore(db, dir);
    assert.deepEqual(v, { missing: [], orphan: [], ok: true });
  });
  db.close();
});

// ── 文件导入 ──

test('从磁盘文件导入，文件名默认取路径尾部', async () => {
  const db = fresh();
  await withStore(async (dir) => {
    const src = join(dir, '来源图.jpg');
    writeFileSync(src, await makeImage('#777'));
    const { media } = await importMediaFile(db, {
      path: src,
      storeDir: join(dir, 'store'),
    });
    assert.equal(media.filename, '来源图.jpg');
    assert.ok(
      existsSync(
        resolveMediaFile(db, { id: media.id, storeDir: join(dir, 'store') }),
      ),
    );
  });
  db.close();
});

test('describeMedia 对不存在的 id 返回 null', () => {
  const db = fresh();
  assert.equal(describeMedia(db, '不存在'), null);
  db.close();
});
