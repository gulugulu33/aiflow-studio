import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { Form, Input, InputNumber, Select, Slider, Switch, Typography, Empty, Button, Card, Space, Divider, Tag } from 'antd'
import { PlusOutlined, DeleteOutlined, RobotOutlined } from '@ant-design/icons'
import './ConfigPanel.css'

const { Text } = Typography
const { Option } = Select

const ConfigPanel: React.FC = () => {
  const { selectedNode, updateNodeData, knowledgeBases, fetchKnowledgeBases, skills, fetchSkills } = useStore()
  const [form] = Form.useForm()
  const [workers, setWorkers] = useState<any[]>([])

  useEffect(() => {
    fetchKnowledgeBases()
    fetchSkills()
  }, [fetchKnowledgeBases, fetchSkills])

  useEffect(() => {
    if (selectedNode) {
      form.setFieldsValue(selectedNode.data)
      if (selectedNode.type === 'agent' && (selectedNode.data as any).workers) {
        setWorkers((selectedNode.data as any).workers || [])
      }
    } else {
      form.resetFields()
      setWorkers([])
    }
  }, [selectedNode, form])

  const handleValuesChange = (_changedValues: any, allValues: any) => {
    if (selectedNode) {
      updateNodeData(selectedNode.id, allValues)
    }
  }

  const addWorker = () => {
    const newWorker = {
      id: `worker_${Date.now()}`,
      name: `Worker ${workers.length + 1}`,
      description: '',
      systemPrompt: '',
      model: 'qwen-turbo',
      temperature: 0.7,
      maxTokens: 2048,
      toolIds: [],
      knowledgeBaseIds: [],
      ragEnabled: false,
    }
    const updatedWorkers = [...workers, newWorker]
    setWorkers(updatedWorkers)
    if (selectedNode) {
      updateNodeData(selectedNode.id, { ...selectedNode.data, workers: updatedWorkers })
    }
  }

  const removeWorker = (index: number) => {
    const updatedWorkers = workers.filter((_, i) => i !== index)
    setWorkers(updatedWorkers)
    if (selectedNode) {
      updateNodeData(selectedNode.id, { ...selectedNode.data, workers: updatedWorkers })
    }
  }

  const updateWorker = (index: number, field: string, value: any) => {
    const updatedWorkers = workers.map((w, i) =>
      i === index ? { ...w, [field]: value } : w
    )
    setWorkers(updatedWorkers)
    if (selectedNode) {
      updateNodeData(selectedNode.id, { ...selectedNode.data, workers: updatedWorkers })
    }
  }

  const renderAgentConfig = (commonFields: React.ReactNode) => {
    const agentMode = Form.useWatch('agentMode', form) || 'single'

    return (
      <>
        {commonFields}
        <Divider orientation="left" style={{ margin: '8px 0 12px' }}>
          <RobotOutlined /> Agent 基础配置
        </Divider>
        <Form.Item name="agentMode" label="Agent 模式" initialValue="single">
          <Select>
            <Option value="single">
              <Space><Tag color="blue">单智能体</Tag><Text type="secondary" style={{ fontSize: 12 }}>一个 Agent 完成所有任务</Text></Space>
            </Option>
            <Option value="supervisor">
              <Space><Tag color="purple">多智能体</Tag><Text type="secondary" style={{ fontSize: 12 }}>Supervisor 协调多个 Worker</Text></Space>
            </Option>
          </Select>
        </Form.Item>
        <Form.Item name="strategy" label="执行策略" initialValue="react">
          <Select>
            <Option value="react">ReAct (推理+行动)</Option>
            <Option value="plan-and-execute">Plan & Execute (规划+执行)</Option>
            <Option value="reflection">Reflection (反思优化)</Option>
          </Select>
        </Form.Item>
        <Form.Item name="model" label="模型" initialValue="qwen-turbo">
          <Select>
            <Option value="qwen-turbo">Qwen Turbo (快速)</Option>
            <Option value="qwen-plus">Qwen Plus (高质量)</Option>
          </Select>
        </Form.Item>
        <Form.Item name="systemPrompt" label="系统提示词">
          <Input.TextArea rows={4} placeholder="定义 Agent 的角色、能力和行为规范" />
        </Form.Item>
        <Form.Item name="userPrompt" label="用户提示词" rules={[{ required: true }]}>
          <Input.TextArea rows={4} placeholder="Agent 的任务输入，可使用 {{变量}} 引用上下文" />
        </Form.Item>
        <Form.Item name="temperature" label="温度" initialValue={0.7}>
          <Slider min={0} max={1} step={0.1} />
        </Form.Item>
        <Form.Item name="maxTokens" label="最大 Token 数" initialValue={2048}>
          <InputNumber min={256} max={8192} step={256} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="maxIterations" label="最大迭代轮数" initialValue={10}>
          <InputNumber min={1} max={50} step={1} style={{ width: '100%' }} />
        </Form.Item>
        <Divider orientation="left" style={{ margin: '12px 0 12px' }}>🔧 工具与知识库</Divider>
        <Form.Item name="ragEnabled" label="启用 RAG" valuePropName="checked" initialValue={false}>
          <Switch />
        </Form.Item>
        <Form.Item name="knowledgeBaseIds" label="关联知识库">
          <Select mode="multiple" placeholder="选择知识库（多选）">
            {Array.isArray(knowledgeBases) && knowledgeBases.map(kb => (
              <Option key={kb.id} value={kb.id}>{kb.name}</Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="toolIds" label="可用工具">
          <Select mode="multiple" placeholder="选择工具（多选，留空则使用全部内置工具）">
            {Array.isArray(skills) && skills.map(s => (
              <Option key={s.id} value={s.id}>{s.name}</Option>
            ))}
          </Select>
        </Form.Item>
        <Divider orientation="left" style={{ margin: '12px 0 12px' }}>🧠 记忆</Divider>
        <Form.Item name="memoryEnabled" label="启用记忆" valuePropName="checked" initialValue={false}>
          <Switch />
        </Form.Item>
        <Form.Item name="memoryWindowSize" label="记忆窗口大小" initialValue={10}>
          <InputNumber min={1} max={100} step={1} style={{ width: '100%' }} />
        </Form.Item>

        {agentMode === 'supervisor' && (
          <>
            <Divider orientation="left" style={{ margin: '12px 0 12px' }}>👑 Supervisor 配置</Divider>
            <Form.Item name="supervisorPrompt" label="Supervisor 提示词">
              <Input.TextArea rows={4} placeholder="定义 Supervisor 的协调策略，留空使用默认" />
            </Form.Item>
            <Divider orientation="left" style={{ margin: '12px 0 12px' }}>🤖 Workers ({workers.length})</Divider>
            {workers.map((worker, index) => (
              <Card
                key={worker.id}
                size="small"
                title={
                  <Space>
                    <Tag color="purple">Worker {index + 1}</Tag>
                    <Input value={worker.name} onChange={(e) => updateWorker(index, 'name', e.target.value)} placeholder="Worker 名称" style={{ width: 120 }} size="small" />
                  </Space>
                }
                extra={<Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeWorker(index)} />}
                style={{ marginBottom: 8 }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Input value={worker.description} onChange={(e) => updateWorker(index, 'description', e.target.value)} placeholder="Worker 职责描述" size="small" />
                  <Input.TextArea value={worker.systemPrompt} onChange={(e) => updateWorker(index, 'systemPrompt', e.target.value)} placeholder="Worker 系统提示词" rows={2} style={{ fontSize: 12 }} />
                  <Space>
                    <Select value={worker.model} onChange={(v) => updateWorker(index, 'model', v)} size="small" style={{ width: 140 }}>
                      <Option value="qwen-turbo">Qwen Turbo</Option>
                      <Option value="qwen-plus">Qwen Plus</Option>
                    </Select>
                    <Text type="secondary" style={{ fontSize: 11 }}>温度:</Text>
                    <InputNumber value={worker.temperature} onChange={(v) => updateWorker(index, 'temperature', v)} min={0} max={1} step={0.1} size="small" style={{ width: 60 }} />
                  </Space>
                </Space>
              </Card>
            ))}
            <Button type="dashed" onClick={addWorker} icon={<PlusOutlined />} block style={{ marginTop: 4 }}>添加 Worker</Button>
          </>
        )}
      </>
    )
  }

  const renderConfigForm = () => {
    if (!selectedNode) {
      return <Empty description="选择节点以编辑配置" className="config-panel-empty" />
    }

    const commonFields = (
      <Form.Item name="label" label="节点名称">
        <Input placeholder="输入节点名称" />
      </Form.Item>
    )

    switch (selectedNode.type) {
      case 'start':
        return <>{commonFields}<Text type="secondary">此节点为工作流的起点。</Text></>
      case 'userInput':
        return <>{commonFields}<Form.Item name="inputField" label="输入字段" rules={[{ required: true }]}><Input placeholder="例如: question" /></Form.Item></>
      case 'llm':
        return (
          <>
            {commonFields}
            <Form.Item name="model" label="模型" initialValue="qwen-turbo"><Select><Option value="qwen-turbo">Qwen Turbo</Option><Option value="qwen-plus">Qwen Plus</Option></Select></Form.Item>
            <Form.Item name="systemPrompt" label="系统提示词"><Input.TextArea rows={4} placeholder="定义模型的角色和行为" /></Form.Item>
            <Form.Item name="userPrompt" label="用户提示词" rules={[{ required: true }]}><Input.TextArea rows={6} placeholder="输入用户的问题，可使用 {{变量}} 引用上下文" /></Form.Item>
            <Form.Item name="temperature" label="温度" initialValue={0.7}><Slider min={0} max={1} step={0.1} /></Form.Item>
            <Form.Item name="maxTokens" label="最大 Token 数" initialValue={1024}><InputNumber min={1} max={8192} step={256} style={{ width: '100%' }} /></Form.Item>
          </>
        )
      case 'agent':
        return renderAgentConfig(commonFields)
      case 'rag':
        return (
          <>
            {commonFields}
            <Form.Item name="knowledgeBaseId" label="知识库" rules={[{ required: true }]}>
              <Select placeholder="选择一个知识库">{Array.isArray(knowledgeBases) && knowledgeBases.map(kb => (<Option key={kb.id} value={kb.id}>{kb.name}</Option>))}</Select>
            </Form.Item>
            <Form.Item name="query" label="检索查询" rules={[{ required: true }]}><Input.TextArea placeholder="输入检索内容，可使用 {{变量}}" /></Form.Item>
            <Form.Item name="topK" label="Top K" initialValue={5}><Slider min={1} max={10} step={1} /></Form.Item>
          </>
        )
      case 'skill':
        return (
          <>
            {commonFields}
            <Form.Item name="skillId" label="选择工具" rules={[{ required: true }]}>
              <Select placeholder="选择一个内置或自定义工具">{Array.isArray(skills) && skills.map(s => (<Option key={s.id} value={s.id}>{s.name}</Option>))}</Select>
            </Form.Item>
            <Form.Item label="工具参数 (JSON)"><Form.Item name="parameters" noStyle><Input.TextArea rows={6} placeholder='{"param1": "value1"}' /></Form.Item></Form.Item>
          </>
        )
      case 'condition':
        return (
          <>
            {commonFields}
            <Text type="secondary">配置分支判断逻辑。</Text>
            <Form.Item name="conditions" label="判断条件 (JSON)"><Input.TextArea rows={6} placeholder='[{"variable": "{{llm_1.result}}", "operator": "contains", "value": "yes"}]' /></Form.Item>
          </>
        )
      case 'output':
        return <>{commonFields}<Form.Item name="outputValue" label="输出内容" rules={[{ required: true }]}><Input.TextArea rows={4} placeholder="最终输出给用户的内容，支持 {{变量}}" /></Form.Item></>
      default:
        return <Empty description={`暂不支持 ${selectedNode.type} 节点的配置`} />
    }
  }

  return (
    <div className="config-panel">
      <div className="config-panel-header">
        <h3>{selectedNode ? '节点配置' : '配置'}</h3>
      </div>
      <div className="config-panel-body">
        <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
          {renderConfigForm()}
        </Form>
      </div>
    </div>
  )
}

export default ConfigPanel
