import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { PlayCircleOutlined } from '@ant-design/icons';
import BaseNode from './BaseNode';

const StartNode = ({ id, data }: { id: string; data: any }) => {
  return (
    <BaseNode id={id} label={data.label || '开始'} icon={<PlayCircleOutlined />} color="#7c3aed">
      <Handle type="source" position={Position.Right} />
    </BaseNode>
  );
};

export default memo(StartNode);
