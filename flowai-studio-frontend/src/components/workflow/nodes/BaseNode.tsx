import { memo, ReactNode } from 'react'
import { Spin, Typography } from 'antd'
import { LoadingOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useStore } from '../../../store'

const { Text } = Typography

interface BaseNodeProps {
  id: string
  label: string
  icon: ReactNode
  children?: ReactNode
  color?: string
  width?: number
}

const BaseNode = ({ id, label, icon, children, color = '#7c3aed', width = 220 }: BaseNodeProps) => {
  const executionState = useStore((state) => state.executionStates[id])
  const status = executionState?.status || 'idle'

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Spin indicator={<LoadingOutlined style={{ fontSize: 13 }} spin />} />
      case 'success':
        return <CheckCircleOutlined style={{ color: 'var(--c-green)' }} />
      case 'failed':
        return <ExclamationCircleOutlined style={{ color: 'var(--c-red)' }} />
      default:
        return null
    }
  }

  return (
    <div
      style={{
        width,
        padding: '12px 14px',
        borderLeft: `3px solid ${color}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: children ? 8 : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color, fontSize: 15, display: 'flex' }}>{icon}</span>
          <Text strong style={{ fontSize: 13 }}>
            {label}
          </Text>
        </div>
        {getStatusIcon()}
      </div>
      {children}
    </div>
  )
}

export default memo(BaseNode)
