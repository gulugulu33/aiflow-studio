import { useState } from 'react'
import { Button, Table, Typography, Space, Empty } from 'antd'
import {
  PlusOutlined,
  ToolOutlined,
  ApiOutlined,
  CodeOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  DeleteOutlined,
  EditOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useStore } from '../store'
import './Tools.css'

const { Text, Paragraph } = Typography

interface Tool {
  id: string
  name: string
  description: string
}

const BUILTIN_TOOLS: Tool[] = [
  { id: '1', name: '获取当前时间', description: '获取当前的日期和时间信息，支持时区转换' },
  { id: '2', name: 'HTTP 请求', description: '发送 HTTP 请求到指定 URL，支持 GET / POST / PUT / DELETE' },
  { id: '3', name: 'JSON 解析', description: '解析或序列化 JSON 数据，支持路径提取' },
  { id: '4', name: '正则匹配', description: '使用正则表达式匹配和提取文本内容' },
]

const TOOL_ICONS: Record<string, React.ReactNode> = {
  '1': <ClockCircleOutlined />,
  '2': <GlobalOutlined />,
  '3': <CodeOutlined />,
  '4': <ApiOutlined />,
}

const Tools: React.FC = () => {
  const { isLoading } = useStore()
  const [activeTab, setActiveTab] = useState<'builtin' | 'custom'>('builtin')
  const [customTools] = useState<Tool[]>([])

  const builtinColumns = [
    {
      title: '工具名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Tool) => (
        <div className="tool-table-name">
          <div className="tool-table-icon">
            {TOOL_ICONS[record.id] || <ToolOutlined />}
          </div>
          <div>
            <Text strong style={{ color: 'var(--c-text-primary)' }}>{text}</Text>
            <div className="tool-table-desc">{record.description}</div>
          </div>
        </div>
      ),
    },
    {
      title: '类型',
      key: 'type',
      width: 100,
      render: () => <span className="tool-badge tool-badge--builtin">内置</span>,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: () => <span className="tool-badge tool-badge--active">可用</span>,
    },
  ]

  const customColumns = [
    {
      title: '工具名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Tool) => (
        <div className="tool-table-name">
          <div className="tool-table-icon tool-table-icon--custom">
            <ApiOutlined />
          </div>
          <div>
            <Text strong style={{ color: 'var(--c-text-primary)' }}>{text}</Text>
            <div className="tool-table-desc">{record.description}</div>
          </div>
        </div>
      ),
    },
    {
      title: '类型',
      key: 'type',
      width: 100,
      render: () => <span className="tool-badge tool-badge--custom">自定义</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: () => (
        <Space size="small">
          <Button size="small" type="text" icon={<EditOutlined />} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Space>
      ),
    },
  ]

  return (
    <div className="tools-page">
      {/* Page header */}
      <div className="tools-page-header">
        <div>
          <h2 className="tools-page-title">工具管理</h2>
          <p className="tools-page-desc">管理内置能力与自定义工具，供工作流节点调用。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />}>
          新建自定义工具
        </Button>
      </div>

      {/* Stats */}
      <div className="tools-stats-row">
        <div className="tools-stat-card">
          <span className="tools-stat-label">内置工具</span>
          <span className="tools-stat-value">{BUILTIN_TOOLS.length}</span>
        </div>
        <div className="tools-stat-card">
          <span className="tools-stat-label">自定义工具</span>
          <span className="tools-stat-value tools-stat-value--accent">{customTools.length}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tools-tab-bar">
        <button
          className={`tools-tab ${activeTab === 'builtin' ? 'tools-tab--active' : ''}`}
          onClick={() => setActiveTab('builtin')}
        >
          <ThunderboltOutlined />
          内置工具
        </button>
        <button
          className={`tools-tab ${activeTab === 'custom' ? 'tools-tab--active' : ''}`}
          onClick={() => setActiveTab('custom')}
        >
          <ApiOutlined />
          自定义工具
        </button>
      </div>

      {/* Table card */}
      <div className="tools-table-card">
        {activeTab === 'builtin' ? (
          <Table
            columns={builtinColumns}
            dataSource={BUILTIN_TOOLS}
            rowKey="id"
            loading={isLoading}
            pagination={false}
          />
        ) : customTools.length > 0 ? (
          <Table
            columns={customColumns}
            dataSource={customTools}
            rowKey="id"
            loading={isLoading}
          />
        ) : (
          <Empty
            description={
              <span style={{ color: 'var(--c-text-secondary)' }}>
                还没有自定义工具，点击右上角「新建自定义工具」创建
              </span>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '48px 0' }}
          />
        )}
      </div>
    </div>
  )
}

export default Tools
