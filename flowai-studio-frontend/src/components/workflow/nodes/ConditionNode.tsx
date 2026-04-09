import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ApartmentOutlined } from '@ant-design/icons';
import BaseNode from './BaseNode';

const ConditionNode = ({ id, data }: { id: string; data: any }) => {
  return (
    <BaseNode id={id} label={data.label || '条件分支'} icon={<ApartmentOutlined />} color="#dc2626">
      <Handle type="source" position={Position.Right} id="true" style={{ top: '30%' }} />
      <Handle type="source" position={Position.Right} id="false" style={{ top: '70%' }} />
      <Handle type="target" position={Position.Left} />
    </BaseNode>
  );
};

export default memo(ConditionNode);
