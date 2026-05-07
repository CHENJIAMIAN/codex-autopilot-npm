# 标题栏进度设计

## 背景

自动跑轮次阶段已经有实时状态栏，但窗口标题仍然只显示简单的 `Turn x/y`、`已完成` 或 `失败(exitCode)`，与状态栏的信息密度不一致。

## 目标

- 仅在自动跑轮次阶段增强窗口标题
- 让标题栏体现阶段、轮次进度、重试次数和会话摘要
- 与状态栏字段保持一致，但不在标题栏放入 `cwd`

## 选定格式

- 运行中：`codex-autopilot | 运行中 3/10 | retry 0/2 | session abcdef12`
- 重试中：`codex-autopilot | 重试中 3/10 | retry 1/2 | session abcdef12`
- 休眠中：`codex-autopilot | 休眠中 3/10 | retry 0/2 | session abcdef12`
- 已完成：`codex-autopilot | 已完成 10/10 | session abcdef12`
- 失败：`codex-autopilot | 失败 3/10 | retry 2/2 | session abcdef12 | exit 1`

## 实现方式

- 扩展 `getWindowTitle()`，让它接收 `retryAttempt`、`retryCount`、`sessionId`、`exitCode`
- 在 `src/autopilot.js` 的运行中、重试中、休眠中、完成、失败节点同步刷新标题栏
- 保持 `status-line` 逻辑不变，不引入新依赖

## 测试

- 补 `tests/autopilot.test.js` 验证自动运行时会设置包含 `retry` 与 `session` 的标题
- 补 `tests/autopilot.test.js` 或导出函数测试，验证 `getWindowTitle()` 的各阶段格式
