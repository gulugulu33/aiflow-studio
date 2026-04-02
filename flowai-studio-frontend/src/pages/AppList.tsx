import { useState, useEffect } from 'react'
import { Card, Button, Table, Typography, Space, Modal, Form, Input, message, Tooltip, Popconfirm, Empty } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, RightOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Application } from '../types'
import './AppList.css'

const { Title, Text } = Typography
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
    ? apps.filter((app) =>
        app.name.toLowerCase().includes(searchText.toLowerCase()) ||
        (app.description && app.description.toLowerCase().includes(searchText.toLowerCase()))
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
    } catch (error) {
      message.error('操作失败，请重试')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteApp(id)
      message.success('应用删除成功')
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const handleEnterEditor = (appId: string) => {
    navigate(`/apps/${appId}/editor`)
  }

  const columns = [
    {
      title: '应用名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Application) => (
        <Space>
          <AppstoreOutlined className="app-icon" />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => text || <Text type="secondary">无描述</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap = {
          draft: <Text>草稿</Text>,
          published: <Text type="success">已发布</Text>,
          archived: <Text type="secondary">已归档</Text>,
        }
        return statusMap[status as keyof typeof statusMap] || status
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Application) => (
        <Space size="middle">
          <Tooltip title="编辑">
            <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          </Tooltip>
          {record.status === 'draft' ? (
            <Button
              type="primary"
              size="small"
              onClick={async () => {
                try {
                  await publishApp(record.id)
                  message.success('应用发布成功')
                } catch (error) {
                  message.error('发布失败，请重试')
                }
              }}
            >
              发布
            </Button>
          ) : record.status === 'published' ? (
            <Button
              size="small"
              onClick={async () => {
                try {
                  await unpublishApp(record.id)
                  message.success('应用已下线')
                } catch (error) {
                  message.error('下线失败，请重试')
                }
              }}
            >
              下线
            </Button>
          ) : null}
          <Popconfirm
            title="确定要删除这个应用吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
          <Button
            type="primary"
            icon={<RightOutlined />}
            size="small"
            onClick={() => handleEnterEditor(record.id)}
          >
            进入编辑器
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="app-list">
      <div className="app-list-header">
        <Title level={4}>我的应用</Title>
        <Space>
          <Search
            placeholder="搜索应用"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建应用
          </Button>
        </Space>
      </div>

      <Card className="app-list-card">
        {filteredApps.length > 0 ? (
          <Table
            columns={columns}
            dataSource={filteredApps}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 10 }}
          />
        ) : (
          <Empty description="暂无应用" />
        )}
      </Card>

      <Modal
        title={isEditing ? '编辑应用' : '新建应用'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="应用名称"
            rules={[{ required: true, message: '请输入应用名称' }]}
          >
            <Input placeholder="请输入应用名称" />
          </Form.Item>

          <Form.Item
            name="description"
            label="应用描述"
          >
            <Input.TextArea placeholder="请输入应用描述" rows={3} />
          </Form.Item>

          <Form.Item
            name="icon"
            label="应用图标"
          >
            <Input placeholder="请输入图标URL" />
          </Form.Item>

          <Form.Item className="form-footer">
            <Button onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isLoading}>
              {isEditing ? '更新' : '创建'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AppList
