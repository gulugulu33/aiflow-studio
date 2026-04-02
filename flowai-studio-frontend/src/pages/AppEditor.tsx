import { useState, useEffect } from 'react'
import { Layout, Card, Button, Typography, Space, message, Tabs, Tag } from 'antd'
import { SaveOutlined, PlayCircleOutlined, StopOutlined, AppstoreOutlined, SettingOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { ReactFlowProvider } from '@xyflow/react'
import WorkflowCanvas from '../components/workflow/WorkflowCanvas'
import NodePanel from '../components/workflow/NodePanel'
import ConfigPanel from '../components/workflow/ConfigPanel'
import './AppEditor.css'

const { Title, Text } = Typography
const { Content } = Layout

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
    runWorkflow, 
    streamRunWorkflow,
    executionStatus, 
    setExecutionStatus, 
    setExecutionStates 
  } = useStore()
  
  const [activeTab, setActiveTab] = useState('workflow')
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    const initEditor = async () => {
      if (appId) {
        try {
          await fetchAppById(appId)
          const workflows = await fetchWorkflows(appId) as any
          
          if (workflows && workflows.length > 0) {
            await fetchWorkflowById(workflows[0].id)
          } else {
            // 如果没有工作流，创建一个默认的
            await createWorkflow(appId, { 
              name: '默认工作流', 
              description: '自动创建的默认工作流' 
            })
          }
        } catch (error) {
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
    } catch (error) {
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
      // 使用流式执行
      await streamRunWorkflow(workflowId, {})
      message.success('工作流执行完成')
    } catch (error) {
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

  return (
    <div className="app-editor">
      <div className="app-editor-header">
        <Title level={4}>
          <AppstoreOutlined className="mr-2" />
          {currentApp?.name || '应用编辑器'}
          {executionStatus && (
            <Tag className="ml-2" color={executionStatus === 'success' ? 'green' : executionStatus === 'failed' ? 'red' : 'blue'}>
              {executionStatus === 'running' ? '运行中' : executionStatus === 'success' ? '成功' : executionStatus === 'failed' ? '失败' : '已停止'}
            </Tag>
          )}
        </Title>
        <Space>
          <Button type="default" icon={<SaveOutlined />} onClick={handleSave} loading={isLoading}>
            保存
          </Button>
          {isRunning ? (
            <Button danger icon={<StopOutlined />} onClick={handleStop}>
              停止
            </Button>
          ) : (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRun}>
              运行
            </Button>
          )}
        </Space>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} className="app-editor-tabs">
        <Tabs.TabPane key="workflow" tab="工作流画布">
          <ReactFlowProvider>
            <div className="workflow-container">
              <NodePanel />
              <div className="canvas-container">
                <WorkflowCanvas />
              </div>
              <ConfigPanel />
            </div>
          </ReactFlowProvider>
        </Tabs.TabPane>
        
        <Tabs.TabPane key="settings" tab="应用设置">
          <Card>
            <Text>应用设置页面</Text>
          </Card>
        </Tabs.TabPane>
        
        <Tabs.TabPane key="debug" tab="调试">
          <Card>
            <Text>调试面板</Text>
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}

export default AppEditor
