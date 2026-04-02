import { memo, ReactNode } from 'react';
import { Card, Typography, Spin } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useStore } from '../../../store';

const { Text } = Typography;

interface BaseNodeProps {
  id: string;
  label: string;
  icon: ReactNode;
  children?: ReactNode;
  color?: string;
  width?: number;
}

const BaseNode = ({ id, label, icon, children, color = '#d9d9d9', width = 200 }: BaseNodeProps) => {
  const executionState = useStore((state) => state.executionStates[id]);
  const status = executionState?.status || 'pending';

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />;
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'failed':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  return (
    <Card 
      size="small" 
      style={{ 
        width, 
        border: status === 'running' ? '2px solid #1890ff' : `1px solid ${color}`,
        boxShadow: status === 'running' ? '0 0 10px rgba(24, 144, 255, 0.3)' : 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: children ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color }}>{icon}</span>
          <Text strong>{label}</Text>
        </div>
        {getStatusIcon()}
      </div>
      {children}
    </Card>
  );
};

export default memo(BaseNode);
