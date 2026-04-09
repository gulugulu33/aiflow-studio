import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  PlayCircleOutlined,
  UserOutlined,
  MessageOutlined,
  BookOutlined,
  ToolOutlined,
  BranchesOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import './NodePanel.css'

interface NodeType {
  type: string
  label: string
  icon: React.ReactNode
  color: string
}

const nodeTypes: NodeType[] = [
  { type: 'start', label: '开始', icon: <PlayCircleOutlined />, color: '#7c3aed' },
  { type: 'userInput', label: '用户输入', icon: <UserOutlined />, color: '#059669' },
  { type: 'llm', label: '大模型', icon: <MessageOutlined />, color: '#7c3aed' },
  { type: 'rag', label: 'RAG检索', icon: <BookOutlined />, color: '#d97706' },
  { type: 'skill', label: '工具', icon: <ToolOutlined />, color: '#0891b2' },
  { type: 'condition', label: '条件分支', icon: <BranchesOutlined />, color: '#dc2626' },
  { type: 'output', label: '输出', icon: <ExportOutlined />, color: '#059669' },
]

const NodePanel: React.FC = () => {
  const { setNodes } = useReactFlow()

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
