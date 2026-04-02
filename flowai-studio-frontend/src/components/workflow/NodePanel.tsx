import { useCallback } from 'react'
import { useReactFlow, addEdge } from '@xyflow/react'
import { 
  PlayCircleOutlined, 
  UserOutlined, 
  MessageOutlined, 
  BookOutlined, 
  ToolOutlined, 
  BranchesOutlined, 
  ExportOutlined 
} from '@ant-design/icons'
import './NodePanel.css'

interface NodeType {
  type: string
  label: string
  icon: React.ReactNode
  color: string
}

const nodeTypes: NodeType[] = [
  { type: 'start', label: '开始', icon: <PlayCircleOutlined />, color: '#1677ff' },
  { type: 'userInput', label: '用户输入', icon: <UserOutlined />, color: '#52c41a' },
  { type: 'llm', label: '大模型', icon: <MessageOutlined />, color: '#722ed1' },
  { type: 'rag', label: 'RAG检索', icon: <BookOutlined />, color: '#faad14' },
  { type: 'skill', label: '工具', icon: <ToolOutlined />, color: '#13c2c2' },
  { type: 'condition', label: '条件分支', icon: <BranchesOutlined />, color: '#ff4d4f' },
  { type: 'output', label: '输出', icon: <ExportOutlined />, color: '#52c41a' },
]

const NodePanel: React.FC = () => {
  const { setNodes, getZoom, screenToFlowPosition } = useReactFlow()

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'copy'
  }, [])

  return (
    <div className="node-panel">
      <div className="node-panel-header">
        <h3>节点库</h3>
      </div>
      <div className="node-panel-content">
        {nodeTypes.map((nodeType) => (
          <div
            key={nodeType.type}
            className="node-item"
            draggable
            onDragStart={(e) => onDragStart(e, nodeType.type)}
            style={{ 
              borderLeft: `3px solid ${nodeType.color}`,
            }}
          >
            <div className="node-item-icon" style={{ color: nodeType.color }}>
              {nodeType.icon}
            </div>
            <div className="node-item-label">{nodeType.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default NodePanel
