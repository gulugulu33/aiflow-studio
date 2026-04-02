import { useState, useEffect } from 'react'
import { Card, Button, Input, Table, Tag, message, Modal, Space, Typography, Spin, Select, Switch, Form, Col, Row } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ToolOutlined, PlayCircleOutlined, CodeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import './Skill.css'

const { Title, Text } = Typography
const { TextArea } = Input

const Skill: React.FC = () => {
  const { 
    skills, 
    isLoading, 
    fetchSkills, 
    createSkill, 
    updateSkill, 
    deleteSkill, 
    executeSkill, 
    getBuiltinSkills 
  } = useStore()
  const [modalVisible, setModalVisible] = useState(false)
  const [executionModalVisible, setExecutionModalVisible] = useState(false)
  const [editingSkill, setEditingSkill] = useState<any>(null)
  const [selectedSkill, setSelectedSkill] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'builtin',
    builtinType: '',
    isActive: true,
  })
  const [executionParams, setExecutionParams] = useState<Record<string, any>>({})
  const [builtinSkills, setBuiltinSkills] = useState<any[]>([])
  const [executionResult, setExecutionResult] = useState<any>(null)

  useEffect(() => {
    fetchSkills()
    fetchBuiltinSkills()
  }, [])

  const safeSkills = Array.isArray(skills) ? skills : []

  const fetchBuiltinSkills = async () => {
    try {
      const skills = await getBuiltinSkills()
      setBuiltinSkills(Array.isArray(skills) ? skills : [])
    } catch (error) {
      message.error('获取内置工具列表失败')
    }
  }

  const handleAddSkill = () => {
    setEditingSkill(null)
    setFormData({ 
      name: '',
      description: '',
      type: 'builtin',
      builtinType: '',
      isActive: true,
    })
    setModalVisible(true)
  }

  const handleEditSkill = (skill: any) => {
    setEditingSkill(skill)
    setFormData({
      name: skill.name,
      description: skill.description || '',
      type: skill.type,
      builtinType: skill.builtinType || '',
      isActive: skill.isActive,
    })
    setModalVisible(true)
  }

  const handleSaveSkill = async () => {
    if (!formData.name) {
      message.error('请输入工具名称')
      return
    }

    if (formData.type === 'builtin' && !formData.builtinType) {
      message.error('请选择内置工具类型')
      return
    }

    try {
      if (editingSkill) {
        await updateSkill(editingSkill.id, formData)
        message.success('工具更新成功')
      } else {
        await createSkill(formData)
        message.success('工具创建成功')
      }
      setModalVisible(false)
    } catch (error) {
      message.error('操作失败，请重试')
    }
  }

  const handleDeleteSkill = async (id: string) => {
    try {
      await deleteSkill(id)
      message.success('工具删除成功')
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const handleExecuteSkill = (skill: any) => {
    setSelectedSkill(skill)
    setExecutionParams({})
    setExecutionResult(null)
    setExecutionModalVisible(true)
  }

  const handleRunExecution = async () => {
    if (!selectedSkill) return

    try {
      const result = await executeSkill(selectedSkill.id, executionParams)
      setExecutionResult(result)
      message.success('工具执行成功')
    } catch (error) {
      message.error('执行失败，请重试')
    }
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <div>
          <Text strong>{text}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: '12px' }}>{record.description || '无描述'}</Text>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (text: string, record: any) => (
        <Tag color={text === 'builtin' ? 'blue' : 'green'}>
          {text === 'builtin' ? '内置' : '自定义'}
        </Tag>
      ),
    },
    {
      title: '内置类型',
      dataIndex: 'builtinType',
      key: 'builtinType',
      render: (text: string) => (
        <Text>{text || '-'}</Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (text: boolean) => (
        <Tag color={text ? 'green' : 'red'}>
          {text ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space size="middle">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEditSkill(record)}
          >
            编辑
          </Button>
          <Button 
            type="text" 
            icon={<PlayCircleOutlined />} 
            onClick={() => handleExecuteSkill(record)}
          >
            执行
          </Button>
          <Button 
            type="text" 
            danger 
            icon={<DeleteOutlined />} 
            onClick={() => handleDeleteSkill(record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="skill-page">
      <div className="skill-header">
        <Title level={4}>
          <ToolOutlined style={{ marginRight: 8 }} />
          工具管理
        </Title>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={handleAddSkill}
        >
          新建工具
        </Button>
      </div>

      <Card className="skill-card">
        <Table 
          columns={columns} 
          dataSource={safeSkills} 
          rowKey="id" 
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无工具' }}
        />
      </Card>

      {/* 新建/编辑工具模态框 */}
      <Modal
        title={editingSkill ? '编辑工具' : '新建工具'}
        open={modalVisible}
        onOk={handleSaveSkill}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="工具名称">
            <Input 
              value={formData.name} 
              onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
              placeholder="请输入工具名称"
            />
          </Form.Item>
          <Form.Item label="工具描述">
            <TextArea 
              value={formData.description} 
              onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
              placeholder="请输入工具描述"
              rows={3}
            />
          </Form.Item>
          <Form.Item label="工具类型">
            <Select 
              value={formData.type} 
              onChange={(value) => setFormData({ ...formData, type: value })}
              style={{ width: '100%' }}
            >
              <Select.Option value="builtin">内置工具</Select.Option>
              <Select.Option value="custom">自定义工具</Select.Option>
            </Select>
          </Form.Item>
          {formData.type === 'builtin' && (
            <Form.Item label="内置工具类型">
              <Select 
                value={formData.builtinType} 
                onChange={(value) => setFormData({ ...formData, builtinType: value })}
                style={{ width: '100%' }}
                placeholder="请选择内置工具类型"
              >
                {builtinSkills.map((skill) => (
                  <Select.Option key={skill.type} value={skill.type}>
                    {skill.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item label="状态">
            <Switch 
              checked={formData.isActive} 
              onChange={(checked) => setFormData({ ...formData, isActive: checked })}
              checkedChildren="启用" 
              unCheckedChildren="禁用"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 执行工具模态框 */}
      <Modal
        title={`执行工具: ${selectedSkill?.name}`}
        open={executionModalVisible}
        onCancel={() => setExecutionModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExecutionModalVisible(false)}>
            取消
          </Button>,
          <Button key="run" type="primary" onClick={handleRunExecution}>
            执行
          </Button>,
        ]}
        width={800}
      >
        <div className="execution-modal">
          <div className="execution-params">
            <h5>执行参数</h5>
            <TextArea 
              value={JSON.stringify(executionParams, null, 2)} 
              onChange={(e) => {
                try {
                  setExecutionParams(JSON.parse(e.target.value))
                } catch (error) {
                  // 忽略解析错误
                }
              }} 
              placeholder="请输入JSON格式的执行参数"
              rows={6}
              style={{ fontFamily: 'monospace' }}
            />
          </div>
          {executionResult && (
            <div className="execution-result">
              <h5>执行结果</h5>
              <pre style={{ 
                background: '#f5f5f5', 
                padding: '16px', 
                borderRadius: '4px', 
                overflow: 'auto',
                maxHeight: '300px'
              }}>
                {JSON.stringify(executionResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default Skill
