#!/usr/bin/env node
/**
 * varintscan 固定验收程序（固定件）。
 *
 * 用法（在仓库根目录）：
 *   node check/check.mjs            跑全部场景
 *   node check/check.mjs -list      只列出 `组/名`
 *   node check/check.mjs --only <组>  只跑某一组
 *
 * 输出：逐场景 `PASS <组>/<名>` 或 `FAIL <组>/<名>  期望=… 实际=…`，
 * 结尾 `结果：通过 x/N`；全过 exit 0，否则 exit 1；失败不早退。
 *
 * 判据只描述**对外可见性质**（同一份数据任意切法解出的序列是否一致、是否按契约报错、
 * 返回值的类型与数值、实例之间是否互不影响），不引用任何内部实现细节。
 * 本文件不含解码实现，只有固定在源码里的测试向量与一个独立的期望编码器。
 */
import { VarintError } from '../src/errors.mjs';
import { VarintScanner } from '../src/varintscan.mjs';

/* ------------------------------------------------------------------ 工具 */

/** 期望编码器：把小端 base-128 的标准（最短）编码写出来，用于构造输入。 */
function enc(...values) {
  const out = [];
  for (const v of values) {
    let x = BigInt(v);
    for (;;) {
      const b = Number(x & 0x7fn);
      x >>= 7n;
      if (x === 0n) {
        out.push(b);
        break;
      }
      out.push(b | 0x80);
    }
  }
  return Uint8Array.from(out);
}

const bytes = (...v) => Uint8Array.from(v);

/** 按给定分段喂入，收集所有解出的数值。 */
function collect(chunks) {
  const s = new VarintScanner();
  const out = [];
  for (const c of chunks) {
    s.feed(c);
    for (;;) {
      const r = s.next();
      if (r.done) break;
      out.push(r.value);
    }
  }
  return out;
}

/** 把数据按 sizes（循环使用）切成分段。 */
function split(data, sizes) {
  const chunks = [];
  let i = 0;
  let k = 0;
  while (i < data.length) {
    const n = Math.min(sizes[k % sizes.length], data.length - i);
    chunks.push(data.subarray(i, i + n));
    i += n;
    k += 1;
  }
  return chunks;
}

const typeName = (v) => (typeof v === 'bigint' ? `bigint(${v})` : `${typeof v}(${String(v)})`);

const showSeq = (seq) => `[${seq.map(typeName).join(', ')}]`;

function sameSeq(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const fail = (msg) => {
  throw new Error(msg);
};

/** 操作必须抛 VarintError，且不得是 RangeError / TypeError 之类的原生错误。 */
function expectVarintError(fn, label) {
  let thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  if (thrown === null) {
    fail(`${label}：期望抛 VarintError，实际正常返回`);
  }
  if (!(thrown instanceof VarintError)) {
    const name = thrown && thrown.constructor ? thrown.constructor.name : typeof thrown;
    fail(`${label}：期望 VarintError 实例，实际抛了 ${name}: ${thrown && thrown.message}`);
  }
  if (thrown.name !== 'VarintError') {
    fail(`${label}：期望 err.name === 'VarintError'，实际 '${thrown.name}'`);
  }
}

/* -------------------------------------------------------------- 测试输入 */

// 一段固定数据，包含多个 varint（值 1, 300, 16384, 0, 127, 1000000）。
const DATA = enc(1, 300, 16384, 0, 127, 1000000);
const DATA_VALUES = [1, 300, 16384, 0, 127, 1000000];

// 11 个续字节 + 一个终止字节，整体一次喂入。
const ELEVEN_CONT = Uint8Array.from([...new Array(11).fill(0x80), 0x00]);

/* ---------------------------------------------------------------- 场景表 */

const scenarios = [
  {
    group: 'slicing',
    name: '逐种切法与整段一致',
    expect: `同一段数据按整段 / 每 1 / 每 2 / 每 3 / 混合 [1,3,2,1,4] 字节切分喂入，解出的序列都等于 ${showSeq(DATA_VALUES)}`,
    run() {
      const base = collect([DATA]);
      if (!sameSeq(base, DATA_VALUES)) {
        fail(`整段喂入应解出 ${showSeq(DATA_VALUES)}，实际 ${showSeq(base)}`);
      }
      const cuts = {
        每1字节: [1],
        每2字节: [2],
        每3字节: [3],
        混合切法: [1, 3, 2, 1, 4],
      };
      for (const [label, sizes] of Object.entries(cuts)) {
        const got = collect(split(DATA, sizes));
        if (!sameSeq(got, DATA_VALUES)) {
          fail(`${label}喂入应解出 ${showSeq(DATA_VALUES)}，实际 ${showSeq(got)}`);
        }
      }
    },
  },
  {
    group: 'slicing',
    name: '每字节一喂',
    expect: `把 ${DATA.length} 字节逐个 feed，解出的序列等于整段喂入的 ${showSeq(DATA_VALUES)}`,
    run() {
      const got = collect(Array.from(DATA, (b) => bytes(b)));
      if (!sameSeq(got, DATA_VALUES)) {
        fail(`逐字节喂入应解出 ${showSeq(DATA_VALUES)}，实际 ${showSeq(got)}`);
      }
    },
  },
  {
    group: 'slicing',
    name: '跨切点残片累积',
    expect: '切点落在某个 varint 中间（把两字节的 300 切成 1+1、把三字节的 16384 切成 1+2）时，解出的序列仍与整段喂入一致',
    run() {
      const got = collect([DATA.subarray(0, 2), DATA.subarray(2, 3), DATA.subarray(3)]);
      if (!sameSeq(got, DATA_VALUES)) {
        fail(`跨切点喂入应解出 ${showSeq(DATA_VALUES)}，实际 ${showSeq(got)}`);
      }
    },
  },

  {
    group: 'bounds',
    name: '第11个续字节报错',
    expect: '单个 varint 最多 10 字节；一次喂入 11 个续字节后 next() 抛 VarintError',
    run() {
      expectVarintError(() => collect([ELEVEN_CONT]), '11 个续字节');
    },
  },
  {
    group: 'bounds',
    name: '非规范编码拒绝',
    expect: '用多于必要字节数表示同一个值（多字节且终止字节为 0x00）时 next() 抛 VarintError',
    run() {
      expectVarintError(() => collect([bytes(0x80, 0x00)]), '值 0 用两字节');
      expectVarintError(() => collect([bytes(0x81, 0x00)]), '值 1 用两字节');
      expectVarintError(() => collect([bytes(0x80, 0x80, 0x00)]), '值 0 用三字节');
      expectVarintError(() => collect([bytes(0xff, 0x00)]), '值 127 用两字节');
    },
  },
  {
    group: 'bounds',
    name: 'end() 残余报错',
    expect: '缓冲区里还剩被切断的 varint 时 end() 抛 VarintError（[0x01,0xac] 与 [0x80] 两种残片）',
    run() {
      expectVarintError(() => {
        const s = new VarintScanner();
        s.feed(bytes(0x01, 0xac));
        s.end();
      }, '被切断的两字节 varint');
      expectVarintError(() => {
        const s = new VarintScanner();
        s.feed(bytes(0x80));
        s.end();
      }, '只有一个续字节');
    },
  },

  {
    group: 'type',
    name: '大值返回 bigint',
    expect: '值超过 Number.MAX_SAFE_INTEGER 时（2^53、2^60、2^63-1）next() 返回 bigint，且数值精确不丢精度',
    run() {
      const cases = [
        [9007199254740992n, '2^53'],
        [1152921504606846976n, '2^60'],
        [9223372036854775807n, '2^63-1'],
      ];
      for (const [v, label] of cases) {
        const got = collect([enc(v)]);
        if (got.length !== 1) fail(`${label}：期望解出 1 个值，实际 ${got.length} 个`);
        if (typeof got[0] !== 'bigint') {
          fail(`${label}：期望 bigint，实际 ${typeName(got[0])}`);
        }
        if (got[0] !== v) fail(`${label}：期望 ${v}n，实际 ${String(got[0])}n`);
      }
    },
  },
  {
    group: 'type',
    name: '安全范围内返回 number',
    expect: `值不超过 Number.MAX_SAFE_INTEGER 时（0,1,127,128,300,16384,2^32-1,MAX_SAFE）next() 返回 number，数值精确`,
    run() {
      const cases = [0, 1, 127, 128, 300, 16384, 4294967295, 9007199254740991];
      const got = collect([enc(...cases)]);
      if (!sameSeq(got, cases)) {
        fail(`期望 ${showSeq(cases)}，实际 ${showSeq(got)}`);
      }
      for (let i = 0; i < got.length; i++) {
        if (typeof got[i] !== 'number') {
          fail(`第 ${i} 项（${cases[i]}）：期望 number，实际 ${typeName(got[i])}`);
        }
      }
    },
  },

  {
    group: 'errors',
    name: '一律是 VarintError',
    expect: '非法入参（非 Uint8Array）、超长续字节、非规范编码，都抛 VarintError，不泄漏 RangeError / TypeError',
    run() {
      expectVarintError(() => {
        const s = new VarintScanner();
        s.feed('not-bytes');
        s.next();
      }, 'feed 非 Uint8Array');
      expectVarintError(() => collect([ELEVEN_CONT]), '11 个续字节');
      expectVarintError(() => collect([bytes(0x80, 0x00)]), '非规范编码');
    },
  },
  {
    group: 'errors',
    name: 'end() 后再 feed 报错',
    expect: 'end() 之后继续 feed 抛 VarintError',
    run() {
      expectVarintError(() => {
        const s = new VarintScanner();
        s.feed(enc(1, 2));
        for (;;) {
          if (s.next().done) break;
        }
        s.end();
        s.feed(enc(3));
      }, 'end() 后 feed');
    },
  },

  {
    group: 'isolation',
    name: '两个实例互不影响',
    expect: '两个实例各自 feed / next 交错进行，各自解出的序列与单实例独占时一致；给其中一个再喂数据不影响另一个',
    run() {
      const a = new VarintScanner();
      const b = new VarintScanner();
      const av = [1, 300];
      const bv = [16384, 7];

      a.feed(enc(...av));
      b.feed(enc(...bv));

      const gotA = [];
      const gotB = [];
      gotA.push(a.next().value);
      gotB.push(b.next().value);
      gotA.push(a.next().value);
      gotB.push(b.next().value);

      if (!sameSeq(gotA, av)) fail(`实例 A 期望 ${showSeq(av)}，实际 ${showSeq(gotA)}`);
      if (!sameSeq(gotB, bv)) fail(`实例 B 期望 ${showSeq(bv)}，实际 ${showSeq(gotB)}`);
      if (!a.next().done) fail('实例 A 应已解完');
      if (!b.next().done) fail('实例 B 应已解完');

      a.feed(enc(9));
      if (a.next().value !== 9) fail('实例 A 续喂后应解出 9');
      if (!a.next().done) fail('实例 A 续喂后应已解完');
      if (!b.next().done) fail('实例 B 不应受实例 A 续喂影响');
    },
  },
];

/* ---------------------------------------------------------------- 运行器 */

const argv = process.argv.slice(2);

if (argv.includes('-list')) {
  for (const s of scenarios) process.stdout.write(`${s.group}/${s.name}\n`);
  process.exit(0);
}

let only = null;
const onlyAt = argv.indexOf('--only');
if (onlyAt >= 0) {
  only = argv[onlyAt + 1];
  if (only === undefined) {
    process.stdout.write('用法：node check/check.mjs --only <组名>（组名：slicing / bounds / type / errors / isolation）\n');
    process.exit(1);
  }
}

const selected = only === null ? scenarios.slice() : scenarios.filter((s) => s.group === only);

if (selected.length === 0) {
  process.stdout.write(`结果：通过 0/0（没有匹配的场景：--only ${String(only)}）\n`);
  process.exit(1);
}

let passed = 0;
for (const s of selected) {
  const id = `${s.group}/${s.name}`;
  try {
    s.run();
    passed += 1;
    process.stdout.write(`PASS ${id}\n`);
  } catch (e) {
    const actual = e instanceof Error ? e.message : String(e);
    process.stdout.write(`FAIL ${id}  期望=${s.expect} 实际=${actual}\n`);
  }
}

process.stdout.write(`结果：通过 ${passed}/${selected.length}\n`);
process.exit(passed === selected.length ? 0 : 1);
