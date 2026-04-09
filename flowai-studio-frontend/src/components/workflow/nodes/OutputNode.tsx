import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FlagOutlined } from '@ant-design/icons';
import BaseNode from './BaseNode';

const OutputNode = ({ id, data }: { id: string; data: any }) => {
  return (
    <BaseNode id={id} label={data.label || '结束'} icon={<FlagOutlined />} color="#059669">
      <Handle type="target" position={Position.Left} />
    </BaseNode>
  );
};

export default memo(OutputNode);
