线上偶发读到天文数字的长度，进程直接被撑爆。varintscan 是 Node.js 22 的流式
varint 解码器（ESM，只用 node: 内置模块，没有第三方依赖），自检走 `scripts/check.sh`
（`check/` 是固定验收程序，别改）。

`tests/scan.test.mjs` 的 15 个用例当前全绿，但它们都把整段数据一次性喂进来。
`repro.mjs` 是线上抓下来的复现：同一段数据按两种切法喂，结果就不一样。

任务：把 `src/varintscan.mjs` 里违反 README「对外契约」的地方找出来并修好，
既有用例保持全绿，固定件全过。

验收：
- node --test 退出码 0（仓库根目录裸跑）；
- node repro.mjs 退出码 0（两种切法结果一致）；
- node check/check.mjs 退出码 0，11 个场景全过（slicing 3 + bounds 3 + type 2 + errors 2 + isolation 1）。

约束：
1. 不改 `check/`、不改 `repro.mjs`、不改 `src/errors.mjs`、不改 `tests/scan.test.mjs`。
2. 只用 `node:` 内置模块，`package.json` 里不许出现 `dependencies`。
3. 不许用 `Buffer.readBigUInt64LE` 之类现成接口绕过流式累积 —— 允许用，但必须自己处理切点。
4. 公开的导出名与签名不变（可新增内部函数）。
