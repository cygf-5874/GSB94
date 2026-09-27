/**
 * varintscan 的错误类型。
 *
 * 契约（见 README「约定」）：
 * - 继承 `Error`；
 * - 实例满足 `err instanceof VarintError`；
 * - `err.name === 'VarintError'`。
 *
 * 解码器对外一律只抛 `VarintError`（见 README「对外契约」第 6 条），
 * 不用 RangeError / TypeError 等原生错误代替。
 */
export class VarintError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'VarintError';
  }
}
