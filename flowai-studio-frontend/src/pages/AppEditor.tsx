import { useState, useEffect, useRef } from 'react'
import { Button, message, Tag, Tooltip } from 'antd'
import {
  SaveOutlined,
  PlayCircleOutlined,
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
    executionStatus,
  } = useStore()

  const [rightPanel, setRightPanel] = useState<RightPanel>('config')

  // 使用 ref 防止 React StrictMode 下 useEffect 重复执行导致弹两次错误
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const initEditor = async () => {
      if (!appId) return
      try {
        await fetchAppById(appId)
        const workflows = (await fetchWorkflows(appId)) as any

        if (workflows && workflows.length > 0) {
          await fetchWorkflowById(workflows[0].id)
        } else {
          // 新建空白工作流
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

  const handleRun = () => {
    // 切换到调试面板，由 RunPanel 统一管理输入参数和运行
    setRightPanel('debug')
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
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleRun}
            className="editor-action-btn"
          >
            运行
          </Button>
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
