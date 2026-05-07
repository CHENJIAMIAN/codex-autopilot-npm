# 标题栏进度实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `codex-autopilot-npm` 的自动跑轮次阶段在窗口标题中展示阶段、轮次、重试次数和会话摘要。

**Architecture:** 扩展 `src/autopilot.js` 的标题生成与刷新逻辑，使标题栏与状态栏共用相同的运行状态来源；测试通过注入 `setWindowTitle` 捕获标题更新内容，不依赖真实窗口。

**Tech Stack:** Node.js CommonJS、`node:test`、无额外依赖

---

### Task 1: 为标题栏格式写失败测试

**Files:**
- Modify: `tests/autopilot.test.js`
- Modify: `src/autopilot.js`

**Step 1: Write the failing test**

- 增加 `getWindowTitle()` 格式测试
- 增加 `invokeCodexAutopilot()` 运行流程测试，断言标题包含 `retry` 和 `session`

**Step 2: Run test to verify it fails**

Run: `node --test tests/autopilot.test.js`
Expected: FAIL，当前标题格式过于简单

**Step 3: Write minimal implementation**

扩展 `getWindowTitle()` 和调用点，补足标题字段。

**Step 4: Run test to verify it passes**

Run: `node --test tests/autopilot.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/autopilot.js tests/autopilot.test.js
git commit -m "feat: 增强标题栏进度显示"
```

### Task 2: 最终验证

**Files:**
- Verify only

**Step 1: Run targeted tests**

Run: `node --test tests/autopilot.test.js`
Expected: PASS

**Step 2: Run full test suite**

Run: `npm test`
Expected: PASS
