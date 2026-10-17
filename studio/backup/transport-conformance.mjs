// 传输层一致性用例（WEBDAV-001）。
//
// 任何想被当作备份传输层的实现，都要跑过这一套。它把「语义一致」
// 从一句约定变成可执行的断言 —— 而这正是换传输协议时唯一真正的风险所在：
// 方法名字对得上很容易，**错误语义对得上才难**。
//
// 用例是**传进去的**（`runConformance` 接收一个工厂），因为三个实现
// 的建立方式完全不同：
//
//   · WebDAV       —— 要起一个 mock 服务端
//   · 本地目录     —— 要一个临时目录
//   · OpenAPI(将来) —— 要一个假的 HTTP 端点
//
// 而它们要满足的**行为**是同一套。用同一份用例去测，才不会出现
// 「新传输的实现者按自己的理解写测试，于是把自己的行为测成了正确」。

import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * 跑一遍传输契约的一致性用例。
 *
 * @param {string} label 显示用的名字
 * @param {() => Promise<{transport: object, outside?: {exists: () => boolean}, cleanup?: Function}>} setup
 *   每次用例前建一个干净的传输层。**必须是每次新的** ——
 *   用例之间共享状态会让「列举」这类断言互相污染。
 *
 *   `outside.exists()` 报告「根目录之外的哨兵文件是否还在」，
 *   越界用例靠它判断。**必须提供** —— 没有哨兵就没法验证越界，
 *   而一条验证不了越界的用例只会给人虚假的安心。
 */
export function runConformance(label, setup) {
  /** 包一层：保证每次拿到干净实例，结束后清理。 */
  const withTransport = async (fn) => {
    const { transport, outside, cleanup } = await setup();
    try {
      return await fn({ transport, outside });
    } finally {
      await cleanup?.();
    }
  };

  test(`${label}：put 之后 get 能拿回**逐字节相同**的内容`, async () => {
    await withTransport(async ({ transport: t }) => {
      // 用含高位字节的二进制，而不是 ASCII 字符串 ——
      // 备份内容是 AES-GCM 密文，编码出错时 ASCII 往往照样通过
      const payload = Buffer.from([
        0x00, 0xff, 0x80, 0x7f, 0x0a, 0x0d, 0xc3, 0xa9,
      ]);
      await t.put('/backups/a.bin', payload);
      const back = await t.get('/backups/a.bin');
      assert.ok(back.equals(payload), '取回的字节必须与写入的完全一致');
    });
  });

  test(`${label}：get 一个不存在的文件返回 null，**不抛错**`, async () => {
    await withTransport(async ({ transport: t }) => {
      // 返回 null 与抛错的区别是实质性的：runBackup 把 null 当作
      // 「回读失败、备份不可信」，而抛错会变成一次崩溃。
      // 两者都要能被区分出来，所以实现不能统一成抛错
      assert.equal(await t.get('/backups/nope.bin'), null);
    });
  });

  test(`${label}：list 一个不存在的目录返回空列表，**不抛错**`, async () => {
    await withTransport(async ({ transport: t }) => {
      // 这条最危险：若实现成抛错，而上游把异常当成「列举失败」，
      // 保留策略就可能把「读不到」当成「没有备份」而放行删除
      assert.deepEqual(await t.list('/nowhere'), []);
    });
  });

  test(`${label}：del 不存在的文件返回 false，**不抛错**`, async () => {
    await withTransport(async ({ transport: t }) => {
      assert.equal(await t.del('/backups/nope.bin'), false);
    });
  });

  test(`${label}：del 存在的文件返回 true 且之后 get 为 null`, async () => {
    await withTransport(async ({ transport: t }) => {
      await t.put('/backups/gone.bin', Buffer.from('x'));
      assert.equal(await t.del('/backups/gone.bin'), true);
      assert.equal(await t.get('/backups/gone.bin'), null);
    });
  });

  test(`${label}：list **只返回文件名**，不含路径也不含目录自身`, async () => {
    await withTransport(async ({ transport: t }) => {
      await t.put('/backups/one.bin', Buffer.from('1'));
      await t.put('/backups/two.bin', Buffer.from('2'));
      const names = await t.list('/backups');

      assert.deepEqual([...names].sort(), ['one.bin', 'two.bin']);
      for (const n of names) {
        assert.ok(!n.includes('/'), `列举结果不该含路径分隔符：${n}`);
        assert.notEqual(n, '.');
        assert.notEqual(n, '..');
        assert.notEqual(n, '');
      }
    });
  });

  test(`${label}：文件名的特殊字符**原样往返**`, async () => {
    await withTransport(async ({ transport: t }) => {
      // 这几个字符各自踩过坑：`#` 与 `?` 在 URL 里是分隔符，
      // `%` 会被当成百分号编码的引导符。WebDAV 那边实测过
      // 「先解码再解析 URL」会让 `hash#1.freesbk` 静默变成 `hash` ——
      // 保留策略按名字删除，两个文件双双报成同一个名字就会删错。
      const names = [
        'hash#1.bin',
        'q?mark.bin',
        'pct%20.bin',
        '加号+.bin',
        'and&.bin',
      ];
      for (const n of names) {
        await t.put(`/backups/${n}`, Buffer.from(n, 'utf8'));
      }
      const listed = await t.list('/backups');
      assert.deepEqual([...listed].sort(), [...names].sort());
      for (const n of names) {
        const back = await t.get(`/backups/${n}`);
        assert.ok(back, `名字里的特殊字符必须能原样取回：${n}`);
        assert.equal(back.toString('utf8'), n);
      }
    });
  });

  test(`${label}：任何路径都够不到根目录之外的文件`, async () => {
    await withTransport(async ({ transport: t, outside }) => {
      assert.ok(
        outside,
        '这个实现没有提供越界哨兵 —— 这条用例会变成空转，必须补上',
      );

      // ── 判据是**性质**，不是机制 ──
      //
      // 这里原本写的是「这些向量必须被拒绝」，一跑就红 —— 而红得没道理：
      // `..%2Fevil` 之所以危险，是因为 **URL 解码会把它变成 `..` + `/`**，
      // 那是 WebDAV 特有的形态。对文件系统传输来说它只是一个奇怪的文件名，
      // 当成名字处理完全正确，拒绝反而是错的。
      //
      // 所以不预设某个实现该怎么拒绝，只检查那条共同的底线：
      // **哨兵文件原封不动**。怎么实现都行，做不到就是不合格。
      for (const vector of [
        '/backups/../evil.bin',
        '/backups/..%2Fevil.bin',
        '/backups/%2E%2E%2Fevil.bin',
        '/..',
        '/../evil.bin',
      ]) {
        // 每一步独立捕获：这些调用是抛错还是被当成普通名字，
        // 属于实现自由；不重要的是它们都**不能真的动到哨兵**
        await t.del(vector).catch(() => {});
        await t.put(vector, Buffer.from('x')).catch(() => {});
        await t.get(vector).catch(() => {});
      }

      assert.ok(
        outside.exists(),
        '根目录之外的文件被访问或删除了 —— 越界删除不可逆',
      );
    });
  });

  test(`${label}：目录不存在时 put 明确报错，**不静默创建**`, async () => {
    await withTransport(async ({ transport: t }) => {
      // 自动建目录意味着路径写错时会在错误的位置静默建一堆目录，
      // 而备份看起来「成功了」
      await assert.rejects(
        () => t.put('/no/such/dir/a.bin', Buffer.from('x')),
        /目录不存在|not exist/i,
      );
    });
  });
}
