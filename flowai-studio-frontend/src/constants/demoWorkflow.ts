/**
 * 示例工作流数据：包含全部 7 种节点类型的完整流程
 *
 * 流程图：
 *   开始 → 用户输入 → RAG 知识检索 ─┐
 *                   │               │
 *                   └──→ 大模型回答 ←─┘
 *                          │
 *                     条件分支（判断是否需要工具）
 *                      ├─ 是 → 工具调用 → 输出A（工具增强回答）
 *                      └─ 否 → 输出B（直接回答）
 */

export const DEMO_NODES = [
  {
    id: 'start_1',
    type: 'start',
    position: { x: 40, y: 200 },
    data: { label: '开始' },
  },
  {
    id: 'userInput_1',
    type: 'userInput',
    position: { x: 240, y: 200 },
    data: { label: '用户输入', inputField: 'question' },
  },
  {
    id: 'rag_1',
    type: 'rag',
    position: { x: 470, y: 80 },
    data: {
      label: 'RAG 知识检索',
      knowledgeBaseId: '',
      query: '{{userInput_1.question}}',
      topK: 3,
      similarityThreshold: 0.7,
    },
  },
  {
    id: 'llm_1',
    type: 'llm',
    position: { x: 470, y: 280 },
    data: {
      label: '大模型回答',
      model: 'qwen-turbo',
      systemPrompt: '你是一个智能助手。如果有参考资料请据此回答，否则用自己的知识回答。',
      userPrompt: '参考资料：{{rag_1.documents}}\n\n用户问题：{{userInput_1.question}}',
      temperature: 0.7,
      maxTokens: 1024,
    },
  },
  {
    id: 'condition_1',
    type: 'condition',
    position: { x: 740, y: 280 },
    data: {
      label: '是否需要工具',
      conditions: '[{"variable":"{{llm_1.result}}","operator":"contains","value":"需要计算"}]',
    },
  },
  {
    id: 'skill_1',
    type: 'skill',
    position: { x: 1000, y: 160 },
    data: {
      label: '工具调用',
      skillId: '',
      skillType: 'builtin',
      parameters: '{}',
    },
  },
  {
    id: 'output_1',
    type: 'output',
    position: { x: 1260, y: 160 },
    data: {
      label: '输出（工具增强）',
      outputValue: '工具结果：{{skill_1.result}}\n\nAI回答：{{llm_1.result}}',
    },
  },
  {
    id: 'output_2',
    type: 'output',
    position: { x: 1000, y: 400 },
    data: {
      label: '输出（直接回答）',
      outputValue: '{{llm_1.result}}',
    },
  },
]

export const DEMO_EDGES = [
  { id: 'e-start-input', source: 'start_1', target: 'userInput_1' },
  { id: 'e-input-rag', source: 'userInput_1', target: 'rag_1' },
  { id: 'e-input-llm', source: 'userInput_1', target: 'llm_1' },
  { id: 'e-rag-llm', source: 'rag_1', target: 'llm_1' },
  { id: 'e-llm-cond', source: 'llm_1', target: 'condition_1' },
  { id: 'e-cond-skill', source: 'condition_1', target: 'skill_1', sourceHandle: 'true', label: '是' },
  { id: 'e-cond-out2', source: 'condition_1', target: 'output_2', sourceHandle: 'false', label: '否' },
  { id: 'e-skill-out1', source: 'skill_1', target: 'output_1' },
]

/** 示例应用名称标记，用于识别是否已创建过 */
export const DEMO_APP_NAME = '📖 示例应用（全节点演示）'
