import { useCallback, useRef } from 'react'
import { ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../../store'
import StartNode from './nodes/StartNode'
import UserInputNode from './nodes/UserInputNode'
import LLMNode from './nodes/LLMNode'
import RAGNode from './nodes/RAGNode'
import SkillNode from './nodes/SkillNode'
import ConditionNode from './nodes/ConditionNode'
import OutputNode from './nodes/OutputNode'
import { NodeExecutionStatus } from '../../types'
import './WorkflowCanvas.css'

// 自定义节点类型
const nodeTypes = {
  start: StartNode,
  userInput: UserInputNode,
  llm: LLMNode,
  rag: RAGNode,
  skill: SkillNode,
  condition: ConditionNode,
  output: OutputNode,
}

const WorkflowCanvas: React.FC = () => {
  const { 
    nodes, 
    edges, 
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setSelectedNode, 
    executionStates 
  } = useStore()

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    setSelectedNode(node)
  }, [setSelectedNode])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow')

      // check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      
      const newNode = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: { label: `${type} node` },
      }

      setNodes([...nodes, newNode])
    },
    [screenToFlowPosition, nodes, setNodes]
  )

  return (
    <div className="workflow-canvas" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="top-right"
      >
        <Background color="#f0f0f0" gap={16} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}

export default WorkflowCanvas
