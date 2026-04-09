import { useState, useEffect } from 'react'
import { Button, Table, Typography, Space, Modal, Form, Input, message, Tooltip, Popconfirm, Empty, Tag, Dropdown } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  RightOutlined,
  AppstoreOutlined,
  SearchOutlined,
  RocketOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Application } from '../types'
import './AppList.css'

const { Text } = Typography
const { Search } = Input

const AppList: React.FC = () => {
  const navigate = useNavigate()
  const { apps, isLoading, fetchApps, createApp, updateApp, deleteApp, publishApp, unpublishApp } = useStore()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [currentApp, setCurrentApp] = useState<Application | null>(null)
  const [form] = Form.useForm()
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    fetchApps()
  }, [])

  const filteredApps = Array.isArray(apps)
    ? apps.filter(
        (app) =>
          app.name.toLowerCase().includes(searchText.toLowerCase()) ||
          (app.description && app.description.toLowerCase().includes(searchText.toLowerCase())),
      )
    : []

  const handleCreate = () => {
    form.resetFields()
    setIsEditing(false)
    setCurrentApp(null)
    setIsModalOpen(true)
  }

  const handleEdit = (app: Application) => {
    form.setFieldsValue({ name: app.name, description: app.description, icon: app.icon })
    setIsEditing(true)
    setCurrentApp(app)
    setIsModalOpen(true)
  }

  const handleSubmit = async (values: { name: string; description?: string; icon?: string }) => {
    try {
      if (isEditing && currentApp) {
        await updateApp(currentApp.id, values)
        message.success('应用更新成功')
      } else {
        await createApp(values)
        message.success('应用创建成功')
      }
      setIsModalOpen(false)
    } catch {
      message.error('操作失败，请重试')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteApp(id)
      message.success('应用删除成功')
    } catch {
      message.error('删除失败，请重试')
    }
  }

  const handleEnterEditor = (appId: string) => {
    navigate(`/apps/${appId}/editor`)
  }

  const getRowMenu = (record: Application) => ({
    items: [
      {
        key: 'edit',
        label: '编辑',
        icon: <EditOutlined />,
        onClick: () => handleEdit(record),
      },
      record.status === 'draft'
        ? {
            key: 'publish',
            label: '发布',
            onClick: async () => {
              try {
                await publishApp(record.id)
                message.success('应用发布成功')
              } catch {
                message.error('发布失败')
              }
            },
          }
        : record.status === 'published'
        ? {
            key: 'unpublish',
            label: '下线',
            onClick: async () => {
              try {
                await unpublishApp(record.id)
                message.success('应用已下线')
              } catch {
                message.error('下线失败')
              }
            },
          }
        : null,
      { type: 'divider' as const },
      {
        key: 'delete',
        label: '删除',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => handleDelete(record.id),
      },
    ].filter(Boolean),
  })

  const columns = [
    {
      title: '应用名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Application) => (
        <div className="app-table-name">
          <div className="app-table-icon">
            <AppstoreOutlined />
          </div>
          <div>
            <div className="app-table-title">{text}</div>
            <div className="app-table-desc">{record.description || '暂无描述'}</div>
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const map: Record<string, { label: string; cls: string }> = {
          draft: { label: '草稿', cls: 'status-badge--draft' },
          published: { label: '已发布', cls: 'status-badge--published' },
          archived: { label: '已归档', cls: 'status-badge--archived' },
        }
        const s = map[status]
        return s ? <span className={`status-badge ${s.cls}`}>{s.label}</span> : <Tag>{status}</Tag>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 110,
      render: (time: string) => (
        <Text style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>
          {new Date(time).toLocaleDateString('zh-CN')}
        </Text>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 140,
      render: (_: any, record: Application) => (
        <div className="app-row-actions">
          <Button
            size="small"
            icon={<RightOutlined />}
            className="action-btn-enter"
            onClick={() => handleEnterEditor(record.id)}
          >
            进入编辑器
          </Button>
          <Dropdown menu={getRowMenu(record)} trigger={['click']} placement="bottomRight">
            <Button size="small" type="text" icon={<MoreOutlined />} className="action-btn-more" />
          </Dropdown>
        </div>
      ),
    },
  ]

  return (
    <div className="app-list-page">
      {/* Toolbar */}
      <div className="app-toolbar">
        <div className="app-toolbar-left">
          <h2 className="app-page-title">我的应用</h2>
          <span className="app-count-badge">{filteredApps.length}</span>
        </div>
        <div className="app-toolbar-right">
          <Search
            placeholder="搜索应用…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="app-search"
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--c-text-tertiary)' }} />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建应用
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="app-table-card">
        {filteredApps.length > 0 ? (
          <Table
            columns={columns}
            dataSource={filteredApps}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
          />
        ) : (
          <Empty
            description="暂无应用，点击「新建应用」开始搭建"
            style={{ padding: '56px 0' }}
          />
        )}
      </div>

      {/* Modal */}
      <Modal
        title={isEditing ? '编辑应用' : '新建应用'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={480}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="应用名称" rules={[{ required: true, message: '请输入应用名称' }]}>
            <Input placeholder="给这个应用起个名字" />
          </Form.Item>
          <Form.Item name="description" label="应用描述">
            <Input.TextArea placeholder="简单描述这个应用的用途" rows={3} />
          </Form.Item>
          <Form.Item name="icon" label="图标 URL（可选）">
            <Input placeholder="https://..." />
          </Form.Item>
          <div className="modal-footer">
            <Button onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isLoading} icon={<RocketOutlined />}>
              {isEditing ? '保存修改' : '创建应用'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default AppList
