import { useState, useEffect, useRef } from 'react'
import { Button, Modal, Form, Input, message, Empty, Dropdown, Spin } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  AppstoreOutlined,
  SearchOutlined,
  RocketOutlined,
  MoreOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Application } from '../types'
import { DEMO_APP_NAME, DEMO_NODES, DEMO_EDGES } from '../constants/demoWorkflow'
import './AppList.css'

const { Search } = Input

const AppList: React.FC = () => {
  const navigate = useNavigate()
  const {
    apps, isLoading, fetchApps, createApp, updateApp, deleteApp, publishApp, unpublishApp,
    createWorkflow,
  } = useStore()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [currentApp, setCurrentApp] = useState<Application | null>(null)
  const [form] = Form.useForm()
  const [searchText, setSearchText] = useState('')
  const initDone = useRef(false) // 防止 StrictMode 重复执行

  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    const initAppList = async () => {
      // 1. 先拉取应用列表
      const fetchedApps = await fetchApps()
      const safeApps = Array.isArray(fetchedApps) ? fetchedApps : []

      // 2. 列表为空时自动创建示例应用
      if (safeApps.length === 0) {
        try {
          const demoApp = await createApp({
            name: DEMO_APP_NAME,
            description: '一个可直接运行的 AI 问答工作流，包含用户输入、大模型回答和条件分支。在调试面板输入 {"question": "你的问题"} 即可运行。',
          })
          await createWorkflow(demoApp.id, {
            name: '示例工作流 — AI 智能问答',
            description: '用户输入 → 大模型回答 → 条件分支 → 输出',
            nodes: DEMO_NODES as any,
            edges: DEMO_EDGES as any,
          })
          message.success('已为你创建示例应用，点击查看完整工作流 🎉')
        } catch {
          console.warn('示例应用创建失败')
        }
      }
    }
    initAppList()
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

  const handleDelete = async (id: string, e?: any) => {
    // 阻止事件冒泡，防止触发卡片的 onClick 跳转到编辑器
    e?.domEvent?.stopPropagation?.()
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

  const getCardMenu = (app: Application) => ({
    items: [
      {
        key: 'edit',
        label: '编辑信息',
        icon: <EditOutlined />,
        onClick: (e: any) => {
          e?.domEvent?.stopPropagation?.()
          handleEdit(app)
        },
      },
      app.status === 'draft'
        ? {
            key: 'publish',
            label: '发布',
            onClick: async (e: any) => {
              e?.domEvent?.stopPropagation?.()
              try {
                await publishApp(app.id)
                message.success('应用发布成功')
              } catch {
                message.error('发布失败')
              }
            },
          }
        : app.status === 'published'
        ? {
            key: 'unpublish',
            label: '下线',
            onClick: async (e: any) => {
              e?.domEvent?.stopPropagation?.()
              try {
                await unpublishApp(app.id)
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
        onClick: (e: any) => handleDelete(app.id, e),
      },
    ].filter(Boolean),
  })

  const statusMap: Record<string, { label: string; cls: string }> = {
    draft: { label: '草稿', cls: 'status-badge--draft' },
    published: { label: '已发布', cls: 'status-badge--published' },
    archived: { label: '已归档', cls: 'status-badge--archived' },
  }

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

      {/* Card grid */}
      {isLoading ? (
        <div className="app-grid-loading">
          <Spin size="large" />
        </div>
      ) : filteredApps.length > 0 ? (
        <div className="app-card-grid">
          {/* New app card */}
          <button className="app-card app-card--new" onClick={handleCreate}>
            <div className="app-card-new-icon">
              <PlusOutlined />
            </div>
            <span className="app-card-new-label">创建新应用</span>
          </button>

          {filteredApps.map((app) => {
            const status = statusMap[app.status]
            return (
              <div
                key={app.id}
                className="app-card"
                onClick={() => handleEnterEditor(app.id)}
              >
                {/* Card header */}
                <div className="app-card-header">
                  <div className="app-card-icon">
                    {app.icon ? (
                      <img src={app.icon} alt="" className="app-card-icon-img" />
                    ) : (
                      <AppstoreOutlined />
                    )}
                  </div>
                  <Dropdown
                    menu={getCardMenu(app)}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <button
                      className="app-card-menu-btn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreOutlined />
                    </button>
                  </Dropdown>
                </div>

                {/* Card body */}
                <div className="app-card-body">
                  <h3 className="app-card-name">{app.name}</h3>
                  <p className="app-card-desc">
                    {app.description || '暂无描述'}
                  </p>
                </div>

                {/* Card footer */}
                <div className="app-card-footer">
                  {status && (
                    <span className={`status-badge ${status.cls}`}>
                      {status.label}
                    </span>
                  )}
                  <span className="app-card-time">
                    {new Date(app.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                  <span className="app-card-enter">
                    编辑 <ArrowRightOutlined />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="app-empty-wrapper">
          <Empty
            description="暂无应用，点击「新建应用」开始搭建"
            style={{ padding: '56px 0' }}
          />
        </div>
      )}

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
