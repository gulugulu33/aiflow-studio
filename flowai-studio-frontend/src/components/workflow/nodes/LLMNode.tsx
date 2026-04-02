import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { RobotOutlined } from '@ant-design/icons';
import BaseNode from './BaseNode';

const LLMNode = ({ id, data }: { id: string; data: any }) => {
  return (
    <BaseNode id={id} label={data.label || '大语言模型'} icon={<RobotOutlined />} color="#52c41a" width={250}>
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} />
    </BaseNode>
  );
};

export default memo(LLMNode);
