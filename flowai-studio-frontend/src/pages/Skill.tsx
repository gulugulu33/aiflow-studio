import { useState, useEffect } from 'react'
import { Button, Input, message, Modal, Select, Switch, Form, Empty, Dropdown, Spin } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ToolOutlined,
  PlayCircleOutlined,
  MoreOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { useStore } from '../store'
import './Skill.css'

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
    getBuiltinSkills,
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
      const data = await getBuiltinSkills()
      setBuiltinSkills(Array.isArray(data) ? data : [])
    } catch {
      message.error('获取内置工具列表失败')
    }
  }

  const handleAddSkill = () => {
    setEditingSkill(null)
    setFormData({ name: '', description: '', type: 'builtin', builtinType: '', isActive: true })
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
    } catch {
      message.error('操作失败，请重试')
    }
  }

  const handleDeleteSkill = async (id: string) => {
    try {
      await deleteSkill(id)
      message.success('工具删除成功')
    } catch {
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
    } catch {
      message.error('执行失败，请重试')
    }
  }

  const getCardMenu = (skill: any) => ({
    items: [
      { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleEditSkill(skill) } },
      { key: 'run', label: '执行', icon: <PlayCircleOutlined />, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleExecuteSkill(skill) } },
      { type: 'divider' as const },
      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleDeleteSkill(skill.id) } },
    ],
  })

  return (
    <div className="skill-page">
      {/* Toolbar */}
      <div className="skill-toolbar">
        <div className="skill-toolbar-left">
          <h2 className="skill-page-title">工具管理</h2>
          <span className="skill-count-badge">{safeSkills.length}</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddSkill}>
          新建工具
        </Button>
      </div>

      {/* Card grid */}
      {isLoading ? (
        <div className="skill-grid-loading"><Spin size="large" /></div>
      ) : safeSkills.length > 0 ? (
        <div className="skill-card-grid">
          {/* New tool card */}
          <button className="skill-card skill-card--new" onClick={handleAddSkill}>
            <div className="skill-card-new-icon"><PlusOutlined /></div>
            <span className="skill-card-new-label">新建工具</span>
          </button>

          {safeSkills.map((skill: any) => (
            <div key={skill.id} className="skill-card" onClick={() => handleExecuteSkill(skill)}>
              {/* Header */}
              <div className="skill-card-header">
                <div className={`skill-card-icon ${skill.type === 'builtin' ? '' : 'skill-card-icon--custom'}`}>
                  {skill.type === 'builtin' ? <ThunderboltOutlined /> : <ApiOutlined />}
                </div>
                <Dropdown menu={getCardMenu(skill)} trigger={['click']} placement="bottomRight">
                  <button className="skill-card-menu-btn" onClick={(e) => e.stopPropagation()}>
                    <MoreOutlined />
                  </button>
                </Dropdown>
              </div>

              {/* Body */}
              <div className="skill-card-body">
                <h3 className="skill-card-name">{skill.name}</h3>
                <p className="skill-card-desc">{skill.description || '暂无描述'}</p>
              </div>

              {/* Footer */}
              <div className="skill-card-footer">
                <span className={`skill-type-badge skill-type-badge--${skill.type}`}>
                  {skill.type === 'builtin' ? '内置' : '自定义'}
                </span>
                <span className="skill-status-dot">
                  {skill.isActive ? (
                    <><CheckCircleOutlined style={{ color: 'var(--c-green)', fontSize: 12 }} /> 启用</>
                  ) : (
                    <><CloseCircleOutlined style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }} /> 禁用</>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="skill-empty-wrapper">
          <Empty
            description="暂无工具，点击「新建工具」开始创建"
            style={{ padding: '56px 0' }}
          />
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal
        title={editingSkill ? '编辑工具' : '新建工具'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={480}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="工具名称" required>
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
              placeholder="简单描述这个工具的用途"
              rows={3}
            />
          </Form.Item>
          <Form.Item label="工具类型">
            <Select
              value={formData.type}
              onChange={(value) => setFormData({ ...formData, type: value })}
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
                placeholder="请选择内置工具类型"
              >
                {builtinSkills.map((s) => (
                  <Select.Option key={s.type} value={s.type}>{s.name}</Select.Option>
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
          <div className="modal-footer">
            <Button onClick={() => setModalVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSaveSkill} loading={isLoading}>
              {editingSkill ? '保存修改' : '创建工具'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Execution modal */}
      <Modal
        title={`执行工具: ${selectedSkill?.name || ''}`}
        open={executionModalVisible}
        onCancel={() => setExecutionModalVisible(false)}
        footer={null}
        width={640}
      >
        <div className="exec-modal-body">
          <div className="exec-section">
            <h4 className="exec-section-title">执行参数</h4>
            <TextArea
              value={JSON.stringify(executionParams, null, 2)}
              onChange={(e) => {
                try { setExecutionParams(JSON.parse(e.target.value)) } catch { /* ignore */ }
              }}
              placeholder='{"param1": "value1"}'
              rows={6}
              className="exec-textarea"
            />
          </div>

          {executionResult && (
            <div className="exec-section">
              <h4 className="exec-section-title">执行结果</h4>
              <pre className="exec-result-pre">
                {JSON.stringify(executionResult, null, 2)}
              </pre>
            </div>
          )}

          <div className="modal-footer">
            <Button onClick={() => setExecutionModalVisible(false)}>取消</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRunExecution} loading={isLoading}>
              执行
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Skill
