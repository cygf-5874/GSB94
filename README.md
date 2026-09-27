# varintscan

流式无符号 LEB128 varint 解码器。Node.js 22、ESM，只用 `node:` 内置模块，**零第三方依赖**。

- 入口：`src/varintscan.mjs`（导出 `VarintScanner` / `VarintError`）
- 错误类型：`src/errors.mjs`（导出 `VarintError`）
- 既有用例：`tests/scan.test.mjs`（`node --test`）
- 复现脚本：`repro.mjs`
- 自检：`bash scripts/check.sh`（等价于在仓库根目录执行 `node check/check.mjs`）
- 固定验收程序：`check/check.mjs`（**不要修改**）

```bash
node --test                     # 跑既有用例
node repro.mjs                  # 线上复现
node check/check.mjs            # 跑全部场景
node check/check.mjs -list      # 只列出 组/名
node check/check.mjs --only slicing
bash scripts/check.sh --only errors
```

---

## 编码格式

小端 base-128（LEB128，无符号）：每个字节低 7 位是载荷，最高位（bit 7）是**续位**。

- 续位为 `1`：本值还有后续字节；
- 续位为 `0`：本字节是本值的最后一字节（**终止字节**）。

一个值的数值 = 各载荷从低到高、依次左移 `0, 7, 14, …` 位后相加。
标准（最短）编码里，多字节值的终止字节不为 `0x00`。

---

## 导出面

- `VarintScanner`
  - `feed(chunk: Uint8Array) -> void`
  - `next() -> { value: number | bigint | undefined, done: boolean }`
  - `end() -> void`
- `VarintError`（由 `src/errors.mjs` 定义，`src/varintscan.mjs` 一并再导出）

### 典型用法

```js
import { VarintScanner } from './src/varintscan.mjs';

const s = new VarintScanner();
for (const chunk of chunks) {
  s.feed(chunk);                       // 可切成任意多段喂入
  for (;;) {
    const { value, done } = s.next();
    if (done) break;                   // 当前缓冲里没有完整值了
    console.log(value);
  }
}
s.end();                               // 数据喂完时收尾
```

---

## 对外契约（8 条）

① `feed(chunk)` 可以按**任意切法**喂入；对同一段完整数据，任何切法下 `next()` 依次返回的
数值序列必须**逐个相同**。
② `next()` 返回 `{ value, done }`；`value` 是 `number`（当值 `<= Number.MAX_SAFE_INTEGER`）
或 `bigint`（超出时）——**不得静默丢精度**。
③ 单个 varint 最多 **10 字节**（64 位）；第 11 个续字节出现 → `VarintError`
（不得继续移位得到 `Infinity`）。
④ **非规范编码**（用多于必要字节数表示同一个值，即多字节值以 `0x00` 终止等）→ `VarintError`。
⑤ `end()` 时缓冲区里若有未完成的残余字节 → `VarintError`；`end()` 之后继续 `feed` → `VarintError`。
⑥ 不得抛 `RangeError` / `TypeError` 之类的原生错误代替 `VarintError`。
⑦ `feed` 必须累积残片直到能解出完整值，**不得把半截当完整值**。
⑧ 解码是单向流式：同一个实例不支持回退；无全局状态，两个实例互不影响。

### 约定

- `next()` 在当前缓冲里没有完整值可解时返回 `{ value: undefined, done: true }`，
  且**不消费**任何字节（等后续 `feed` 补齐后还能继续）。
- `feed` 只接受 `Uint8Array`（`Buffer` 是其子类，可用）；其它类型 → `VarintError`。
- `end()` 之后再 `feed` → `VarintError`。
- `VarintError`（`src/errors.mjs` 导出）必须继承 `Error`，其实例满足
  `err instanceof VarintError` 且 `err.name === 'VarintError'`。
- 输出不得依赖 `Math.random()`、`Date.now()` 等非确定来源。

---

## 约束

- 只用 `node:` 内置模块；`package.json` 里**不许出现 `dependencies`**。
- 不改 `check/`、不改 `repro.mjs`、不改 `src/errors.mjs`、不改 `tests/scan.test.mjs`。
- 公开的导出名与签名不变（可新增内部函数）。
- 结果必须确定：不许用 `Math.random`、`Date.now`。
