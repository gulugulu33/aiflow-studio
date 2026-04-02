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
import { NodeType, WorkflowNode } from '../../types'
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

const createNodeData = (type: NodeType): WorkflowNode['data'] => {
  switch (type) {
    case 'start':
      return { label: '开始', variables: [] }
    case 'userInput':
      return { label: '用户输入', inputField: '' }
    case 'llm':
      return {
        label: '大模型',
        model: 'qwen-turbo',
        systemPrompt: '',
        userPrompt: '',
        temperature: 0.7,
        maxTokens: 1024,
      }
    case 'rag':
      return {
        label: 'RAG检索',
        knowledgeBaseId: '',
        query: '',
        topK: 3,
        similarityThreshold: 0.7,
      }
    case 'skill':
      return {
        label: '工具',
        skillId: '',
        skillType: 'builtin',
        parameters: {},
      }
    case 'condition':
      return { label: '条件分支', conditions: [] }
    case 'output':
      return { label: '输出', outputValue: '' }
  }
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

      const type = event.dataTransfer.getData('application/reactflow') as NodeType

      // check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      
      const newNode: WorkflowNode = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: createNodeData(type),
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
