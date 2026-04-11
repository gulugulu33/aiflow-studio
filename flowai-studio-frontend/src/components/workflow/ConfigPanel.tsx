import { useEffect } from 'react'
import { useStore } from '../../store'
import { Form, Input, Select, Slider, Typography, Empty } from 'antd'
import './ConfigPanel.css'

const { Text } = Typography
const { Option } = Select

const ConfigPanel: React.FC = () => {
  const { selectedNode, updateNodeData, knowledgeBases, fetchKnowledgeBases, skills, fetchSkills } = useStore()
  const [form] = Form.useForm()

  // 加载知识库和工具列表
  useEffect(() => {
    fetchKnowledgeBases()
    fetchSkills()
  }, [fetchKnowledgeBases, fetchSkills])

  useEffect(() => {
    if (selectedNode) {
      form.setFieldsValue(selectedNode.data)
    } else {
      form.resetFields()
    }
  }, [selectedNode, form])

  const handleValuesChange = (_changedValues: any, allValues: any) => {
    if (selectedNode) {
      updateNodeData(selectedNode.id, allValues)
    }
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
        return (
          <>
            {commonFields}
            <Text type="secondary">此节点为工作流的起点。</Text>
          </>
        )
      case 'userInput':
        return (
          <>
            {commonFields}
            <Form.Item name="inputField" label="输入字段" rules={[{ required: true }]}>
              <Input placeholder="例如: question" />
            </Form.Item>
          </>
        )
      case 'llm':
        return (
          <>
            {commonFields}
            <Form.Item name="model" label="模型" initialValue="qwen-turbo">
              <Select>
                <Option value="qwen-turbo">Qwen Turbo</Option>
                <Option value="qwen-plus">Qwen Plus</Option>
              </Select>
            </Form.Item>
            <Form.Item name="systemPrompt" label="系统提示词">
              <Input.TextArea rows={4} placeholder="定义模型的角色和行为" />
            </Form.Item>
            <Form.Item name="userPrompt" label="用户提示词" rules={[{ required: true }]}>
              <Input.TextArea rows={6} placeholder="输入用户的问题，可使用 {{变量}} 引用上下文" />
            </Form.Item>
            <Form.Item name="temperature" label="温度" initialValue={0.7}>
              <Slider min={0} max={1} step={0.1} />
            </Form.Item>
          </>
        )
      case 'rag':
        return (
          <>
            {commonFields}
            <Form.Item name="knowledgeBaseId" label="知识库" rules={[{ required: true }]}>
              <Select placeholder="选择一个知识库">
                {Array.isArray(knowledgeBases) && knowledgeBases.map(kb => (
                  <Option key={kb.id} value={kb.id}>{kb.name}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="query" label="检索查询" rules={[{ required: true }]}>
              <Input.TextArea placeholder="输入检索内容，可使用 {{变量}}" />
            </Form.Item>
            <Form.Item name="topK" label="Top K" initialValue={5}>
              <Slider min={1} max={10} step={1} />
            </Form.Item>
          </>
        )
      case 'skill':
        return (
          <>
            {commonFields}
            <Form.Item name="skillId" label="选择工具" rules={[{ required: true }]}>
              <Select placeholder="选择一个内置或自定义工具">
                {Array.isArray(skills) && skills.map(s => (
                  <Option key={s.id} value={s.id}>{s.name}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="工具参数 (JSON)">
              <Form.Item name="parameters" noStyle>
                <Input.TextArea rows={6} placeholder='{"param1": "value1"}' />
              </Form.Item>
            </Form.Item>
          </>
        )
      case 'condition':
        return (
          <>
            {commonFields}
            <Text type="secondary">配置分支判断逻辑。</Text>
            <Form.Item name="conditions" label="判断条件 (JSON)">
              <Input.TextArea
                rows={6}
                placeholder='[{"variable": "{{llm_1.result}}", "operator": "contains", "value": "yes"}]'
              />
            </Form.Item>
          </>
        )
      case 'output':
        return (
          <>
            {commonFields}
            <Form.Item name="outputValue" label="输出内容" rules={[{ required: true }]}>
              <Input.TextArea rows={4} placeholder="最终输出给用户的内容，支持 {{变量}}" />
            </Form.Item>
          </>
        )
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
