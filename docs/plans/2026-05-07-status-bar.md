# 状态栏实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `codex-autopilot-npm` 的自动跑轮次阶段增加一个轻量实时状态栏，同时保持现有 CLI 结构与输出可读性。

**Architecture:** 在 `src` 下新增一个小型状态栏渲染器，负责单行刷新、清理和普通输出包裹；`src/autopilot.js` 在主循环的关键节点更新状态，并通过状态栏安全输出横幅和消息。测试继续使用注入式 `writeHost`，在 `tests/autopilot.test.js` 中先写失败用例，再补最小实现。

**Tech Stack:** Node.js CommonJS、`node:test`、PowerShell/Windows 控制台兼容输出、无额外依赖

---

### Task 1: 为状态栏抽象写失败测试

**Files:**
- Modify: `tests/autopilot.test.js`
- Test: `tests/autopilot.test.js`

**Step 1: Write the failing test**

增加一个测试，运行单轮 autopilot，断言输出包含单行状态栏文本，并且在完成后有收尾换行。

**Step 2: Run test to verify it fails**

Run: `node --test tests/autopilot.test.js`
Expected: FAIL，当前输出中不存在状态栏相关内容

**Step 3: Write minimal implementation**

先不改业务逻辑，只实现最小状态栏骨架，保证测试可以开始驱动真实行为。

**Step 4: Run test to verify it passes**

Run: `node --test tests/autopilot.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/autopilot.test.js src/status-line.js src/autopilot.js
git commit -m "feat: 增加自动运行状态栏骨架"
```

### Task 2: 在运行主循环接入状态栏

**Files:**
- Create: `src/status-line.js`
- Modify: `src/autopilot.js`
- Test: `tests/autopilot.test.js`

**Step 1: Write the failing test**

增加测试覆盖：

- 轮次开始时显示 `运行中`
- 休眠前显示 `休眠中`
- 失败时显示 `失败`
- 输出普通文本前会清理状态栏，不污染横幅和最后消息

**Step 2: Run test to verify it fails**

Run: `node --test tests/autopilot.test.js`
Expected: FAIL，阶段文本和输出顺序不符合预期

**Step 3: Write minimal implementation**

在 `src/status-line.js` 实现：

- `createStatusLine({ writeHost })`
- `render(status)`
- `clear()`
- `println(message)`
- `finish(status?)`

在 `src/autopilot.js` 中：

- 创建状态栏实例
- 用状态栏包裹原来的 `writeHost`
- 在开始、重试、休眠、失败、完成节点更新状态

**Step 4: Run test to verify it passes**

Run: `node --test tests/autopilot.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/status-line.js src/autopilot.js tests/autopilot.test.js
git commit -m "feat: 接入自动运行状态栏"
```

### Task 3: 补充文案与回归验证

**Files:**
- Modify: `src/ui.js`
- Modify: `README.md`
- Test: `tests/autopilot.test.js`

**Step 1: Write the failing test**

如果状态栏阶段文案从 `ui` 导出，则补一个测试验证默认阶段文本可用；如果不需要独立测试，则先新增 README 预期说明，再以回归测试兜底。

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，直到状态栏文案和说明补齐

**Step 3: Write minimal implementation**

- 在 `src/ui.js` 补充状态栏阶段文案常量（如有需要）
- 在 `README.md` 的功能说明中补充自动运行状态栏描述

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ui.js README.md tests/autopilot.test.js
git commit -m "docs: 补充状态栏说明"
```

### Task 4: 最终验证

**Files:**
- Verify only

**Step 1: Run targeted tests**

Run: `node --test tests/autopilot.test.js`
Expected: PASS

**Step 2: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Run a manual smoke check**

Run: `node src/cli.js --help`
Expected: 正常输出帮助，不受状态栏改动影响

**Step 4: Review git diff**

Run: `git diff --stat`
Expected: 只包含状态栏相关代码、测试和文档改动

**Step 5: Commit**

```bash
git add .
git commit -m "feat: 增加自动运行状态栏"
```
