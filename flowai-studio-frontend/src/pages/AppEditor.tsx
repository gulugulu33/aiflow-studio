import { useState, useEffect } from 'react'
import { Button, message, Tag, Tooltip } from 'antd'
import {
  SaveOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ArrowLeftOutlined,
  AppstoreOutlined,
  BugOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { ReactFlowProvider } from '@xyflow/react'
import WorkflowCanvas from '../components/workflow/WorkflowCanvas'
import NodePanel from '../components/workflow/NodePanel'
import ConfigPanel from '../components/workflow/ConfigPanel'
import RunPanel from '../components/workflow/RunPanel'
import './AppEditor.css'

type RightPanel = 'config' | 'debug'

/**
 * 示例工作流：包含所有 7 种节点类型的完整流程
 * 流程：开始 → 用户输入 → RAG检索 → 大模型 → 条件分支
 *       ├─ true  → 工具调用 → 输出A（工具增强回答）
 *       └─ false → 输出B（直接回答）
 */
const DEMO_NODES = [
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

const DEMO_EDGES = [
  { id: 'e-start-input', source: 'start_1', target: 'userInput_1' },
  { id: 'e-input-rag', source: 'userInput_1', target: 'rag_1' },
  { id: 'e-input-llm', source: 'userInput_1', target: 'llm_1' },
  { id: 'e-rag-llm', source: 'rag_1', target: 'llm_1' },
  { id: 'e-llm-cond', source: 'llm_1', target: 'condition_1' },
  { id: 'e-cond-skill', source: 'condition_1', target: 'skill_1', sourceHandle: 'true', label: '是' },
  { id: 'e-cond-out2', source: 'condition_1', target: 'output_2', sourceHandle: 'false', label: '否' },
  { id: 'e-skill-out1', source: 'skill_1', target: 'output_1' },
]

const AppEditor: React.FC = () => {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()
  const {
    currentApp,
    fetchAppById,
    currentWorkflow,
    fetchWorkflows,
    fetchWorkflowById,
    createWorkflow,
    nodes,
    edges,
    isLoading,
    saveWorkflow,
    streamRunWorkflow,
    executionStatus,
    setExecutionStatus,
  } = useStore()

  const [isRunning, setIsRunning] = useState(false)
  const [rightPanel, setRightPanel] = useState<RightPanel>('config')

  useEffect(() => {
    const initEditor = async () => {
      if (appId) {
        try {
          await fetchAppById(appId)
          const workflows = (await fetchWorkflows(appId)) as any

          if (workflows && workflows.length > 0) {
            const preferredWorkflow =
              workflows.find((workflow: any) => workflow.name?.includes('RAG')) || workflows[0]
            await fetchWorkflowById(preferredWorkflow.id)
          } else {
            // 新应用：创建包含所有节点类型的示例工作流
            const createdWorkflow = await createWorkflow(appId, {
              name: '示例工作流（全节点演示）',
              description: '包含开始、用户输入、RAG、大模型、条件分支、工具、输出全部7种节点的示例工作流',
            })
            // 写入预置节点和连线
            await saveWorkflow(createdWorkflow.id, {
              nodes: DEMO_NODES,
              edges: DEMO_EDGES,
            })
            await fetchWorkflowById(createdWorkflow.id)
          }
        } catch {
          message.error('初始化编辑器失败')
        }
      }
    }
    initEditor()
  }, [appId])

  const handleSave = async () => {
    const workflowId = currentWorkflow?.id
    if (!workflowId) {
      message.error('未找到有效的工作流')
      return
    }
    try {
      await saveWorkflow(workflowId, { nodes, edges })
      message.success('工作流保存成功')
    } catch {
      message.error('保存失败，请重试')
    }
  }

  const handleRun = async () => {
    const workflowId = currentWorkflow?.id
    if (!workflowId) {
      message.error('未找到有效的工作流')
      return
    }
    try {
      setIsRunning(true)
      setRightPanel('debug') // Auto-switch to debug panel
      await streamRunWorkflow(workflowId, {})
      message.success('工作流执行完成')
    } catch {
      message.error('执行失败，请检查工作流配置')
    } finally {
      setIsRunning(false)
    }
  }

  const handleStop = () => {
    setIsRunning(false)
    setExecutionStatus('stopped')
    message.info('工作流已停止')
  }

  const statusTagMap: Record<string, { color: string; label: string }> = {
    running: { color: 'processing', label: '运行中' },
    success: { color: 'success', label: '成功' },
    failed: { color: 'error', label: '失败' },
    stopped: { color: 'default', label: '已停止' },
  }

  const tag = executionStatus ? statusTagMap[executionStatus] : null

  return (
    <div className="editor-root">
      {/* ---- Top bar ---- */}
      <header className="editor-topbar">
        <div className="editor-topbar-left">
          <Tooltip title="返回应用列表">
            <button className="editor-back-btn" onClick={() => navigate('/apps')}>
              <ArrowLeftOutlined />
            </button>
          </Tooltip>
          <div className="editor-topbar-divider" />
          <div className="editor-app-info">
            <span className="editor-app-icon">
              <AppstoreOutlined />
            </span>
            <span className="editor-app-name">{currentApp?.name || '应用编辑器'}</span>
            {tag && <Tag color={tag.color}>{tag.label}</Tag>}
          </div>
        </div>

        <div className="editor-topbar-center">
          <div className="editor-panel-tabs">
            <button
              className={`editor-panel-tab ${rightPanel === 'config' ? 'editor-panel-tab--active' : ''}`}
              onClick={() => setRightPanel('config')}
            >
              <SettingOutlined /> 配置
            </button>
            <button
              className={`editor-panel-tab ${rightPanel === 'debug' ? 'editor-panel-tab--active' : ''}`}
              onClick={() => setRightPanel('debug')}
            >
              <BugOutlined /> 调试
            </button>
          </div>
        </div>

        <div className="editor-topbar-right">
          <Button
            size="small"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={isLoading}
            className="editor-action-btn"
          >
            保存
          </Button>
          {isRunning ? (
            <Button size="small" danger icon={<StopOutlined />} onClick={handleStop} className="editor-action-btn">
              停止
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRun}
              className="editor-action-btn"
            >
              运行
            </Button>
          )}
        </div>
      </header>

      {/* ---- Editor body ---- */}
      <ReactFlowProvider>
        <div className="editor-body">
          <NodePanel />
          <div className="editor-canvas-wrapper">
            <WorkflowCanvas />
          </div>
          {rightPanel === 'config' ? <ConfigPanel /> : <RunPanel />}
        </div>
      </ReactFlowProvider>
    </div>
  )
}

export default AppEditor
