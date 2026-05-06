const ui = {
  resumePrompt: '1.先用上帝视角看当前状态距离最终阶段的最终目标多远 2.提交所有更改作为新征程的基线 3.继续推进新征程,要高效利用子代理加速推进速度',
  resumePromptShort: '继续',
  resumePromptOkay: '好,可以,继续',
  selectPromptPrompt: '选择提示语: ',
  selectMaxTurnsPrompt: '选择轮次数: ',
  noPromptSelected: '未选择任何提示语。',
  noMaxTurnsSelected: '未选择任何轮次数。',
  promptHelp: '使用上/下方向键选择，回车确认。',
  maxTurnsHelp: '使用上/下方向键选择，回车确认。',
  promptLabelDefault: '详细提示语',
  promptLabelShort: '简短提示语：继续',
  promptLabelOkay: '简短提示语：好,可以,继续',
  maxTurnsLabelDefault: '50（默认）',
  noSessionsFound: '未找到 Codex 会话。',
  noSessionSelected: '未选择任何会话。',
  noSessionWorkingDirectory: '选中的会话没有记录工作目录。',
  selectSessionPrompt: '选择会话: ',
  recentSessions: '最近的会话：',
  selectSessionNumber: '请输入会话编号',
  invalidSelection: '输入无效。',
  resumingSession: '继续会话：{0}',
  execExitCode: 'codex exec 以退出码 {0} 结束，停止执行。',
  lastMessageHeader: '--- 模型的最后消息 ---',
  maxTurnsReached: '已达到最大轮次 ({0})，停止执行以避免失控。'
};

function getDefaultResumePromptOptions() {
  return [ui.resumePrompt, ui.resumePromptShort, ui.resumePromptOkay];
}

function getDefaultMaxTurnOptions() {
  return [50, 15, 10, 5, 3];
}

module.exports = {
  ui,
  getDefaultResumePromptOptions,
  getDefaultMaxTurnOptions
};
