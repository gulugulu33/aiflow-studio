/**
 * 示例工作流数据：一个可直接运行的 AI 问答 + 条件分支流程
 *
 * 主路径（可直接运行）：
 *   开始 → 用户输入 → 大模型回答 → 条件分支
 *                                     ├─ 是（回答含"不确定"） → 输出A（提示用户补充信息）
 *                                     └─ 否 → 输出B（直接回答）
 *
 * 使用方法：
 *   在调试面板输入 {"question": "你好，请介绍一下自己"}，点击运行即可
 */

export const DEMO_NODES = [
  {
    id: 'start_1',
    type: 'start',
    position: { x: 60, y: 260 },
    data: {
      label: '开始',
      variables: [
        { key: 'greeting', value: '欢迎使用 AiFlow Studio 示例工作流！' },
      ],
    },
  },
  {
    id: 'userInput_1',
    type: 'userInput',
    position: { x: 280, y: 260 },
    data: {
      label: '用户输入',
      inputField: 'question',
    },
  },
  {
    id: 'llm_1',
    type: 'llm',
    position: { x: 520, y: 260 },
    data: {
      label: '大模型回答',
      model: 'qwen-turbo',
      systemPrompt:
        '你是一个友好的 AI 助手。请简洁地回答用户的问题。如果你不确定答案，请在回复中明确说"不确定"。',
      userPrompt: '{{userInput_1.question}}',
      temperature: 0.7,
      maxTokens: 512,
    },
  },
  {
    id: 'condition_1',
    type: 'condition',
    position: { x: 800, y: 260 },
    data: {
      label: '是否不确定',
      conditions: [
        {
          variable: '{{llm_1.result}}',
          operator: 'contains',
          value: '不确定',
        },
      ],
    },
  },
  {
    id: 'output_1',
    type: 'output',
    position: { x: 1100, y: 140 },
    data: {
      label: '输出（需补充）',
      outputValue:
        '⚠️ AI 表示不太确定，建议补充更多信息后再试。\n\n原始回答：{{llm_1.result}}',
    },
  },
  {
    id: 'output_2',
    type: 'output',
    position: { x: 1100, y: 380 },
    data: {
      label: '输出（直接回答）',
      outputValue: '{{llm_1.result}}',
    },
  },
]

export const DEMO_EDGES = [
  { id: 'e-start-input', source: 'start_1', target: 'userInput_1' },
  { id: 'e-input-llm', source: 'userInput_1', target: 'llm_1' },
  { id: 'e-llm-cond', source: 'llm_1', target: 'condition_1' },
  {
    id: 'e-cond-out1',
    source: 'condition_1',
    target: 'output_1',
    sourceHandle: 'true',
    label: '是',
  },
  {
    id: 'e-cond-out2',
    source: 'condition_1',
    target: 'output_2',
    sourceHandle: 'false',
    label: '否',
  },
]

/** 示例应用名称标记，用于识别是否已创建过 */
export const DEMO_APP_NAME = '📖 示例应用 — AI 智能问答'
