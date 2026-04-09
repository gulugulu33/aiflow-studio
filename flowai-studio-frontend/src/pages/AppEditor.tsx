import { useState, useEffect } from 'react'
import { Button, message, Tag, Tooltip } from 'antd'
import {
  SaveOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ArrowLeftOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { ReactFlowProvider } from '@xyflow/react'
import WorkflowCanvas from '../components/workflow/WorkflowCanvas'
import NodePanel from '../components/workflow/NodePanel'
import ConfigPanel from '../components/workflow/ConfigPanel'
import './AppEditor.css'

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
            const createdWorkflow = await createWorkflow(appId, {
              name: '默认工作流',
              description: '自动创建的默认工作流',
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
          <ConfigPanel />
        </div>
      </ReactFlowProvider>
    </div>
  )
}

export default AppEditor
