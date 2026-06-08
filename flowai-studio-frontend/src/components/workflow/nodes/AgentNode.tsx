import { Handle, Position } from '@xyflow/react'
import { RobotOutlined } from '@ant-design/icons'
import BaseNode from './BaseNode'
import { AgentNodeData } from '../../../types'

interface AgentNodeProps {
  data: AgentNodeData
  id: string
  selected?: boolean
}

const AgentNode: React.FC<AgentNodeProps> = ({ data, id }) => {
  const modeLabel = data.agentMode === 'supervisor' ? '多智能体' : '单智能体'
  const workerCount = data.agentMode === 'supervisor' ? (data.workers?.length || 0) : 0

  return (
    <BaseNode
      id={id}
      label={data.label || '智能体'}
      icon={<RobotOutlined />}
      color="#8b5cf6"
      width={200}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ padding: '4px 0', fontSize: 12, color: '#666' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{modeLabel}</span>
          <span>{data.model || 'qwen-turbo'}</span>
        </div>
        {data.agentMode === 'supervisor' && workerCount > 0 && (
          <div style={{ marginTop: 2, color: '#8b5cf6' }}>
            {workerCount} 个 Worker
          </div>
        )}
        {data.ragEnabled && (
          <div style={{ marginTop: 2, color: '#d97706', fontSize: 11 }}>
            📚 RAG 已启用
          </div>
        )}
        {(data.toolIds && data.toolIds.length > 0) && (
          <div style={{ marginTop: 2, color: '#0891b2', fontSize: 11 }}>
            🔧 {data.toolIds.length} 个工具
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </BaseNode>
  )
}

export default AgentNode
