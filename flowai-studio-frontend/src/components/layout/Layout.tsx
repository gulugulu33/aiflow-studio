import { useMemo, useState } from 'react'
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown, Space, Typography, Tag } from 'antd'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  HomeOutlined,
  BookOutlined,
  ToolOutlined,
  CodeOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useStore } from '../../store'
import './Layout.css'

const { Header, Sider, Content } = AntLayout
const { Title, Text } = Typography

const routeMeta: Record<string, { title: string; description: string; badge: string }> = {
  '/apps': {
    title: '应用工作台',
    description: '集中管理你的应用、版本状态与 AI 工作流入口。',
    badge: 'Workspace',
  },
  '/knowledge-bases': {
    title: '知识库中心',
    description: '整理文档、维护索引，让检索链路保持可用且清晰。',
    badge: 'Knowledge',
  },
  '/tools': {
    title: '工具管理',
    description: '统一维护内置与自定义工具，保持执行链路稳定。',
    badge: 'Tools',
  },
  '/debug': {
    title: '调试中心',
    description: '验证聊天、执行工作流、排查接口与编排问题。',
    badge: 'Debug',
  },
}

const Layout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { globalConfig, toggleSidebar, user, logout } = useStore()
  const [collapsed, setCollapsed] = useState(globalConfig.sidebarCollapsed)

  const handleToggle = () => {
    setCollapsed(!collapsed)
    toggleSidebar()
  }

  const menuItems = [
    {
      key: '/apps',
      icon: <HomeOutlined />,
      label: '工作台',
    },
    {
      key: '/knowledge-bases',
      icon: <BookOutlined />,
      label: '知识库',
    },
    {
      key: '/tools',
      icon: <ToolOutlined />,
      label: '工具管理',
    },
    {
      key: '/debug',
      icon: <CodeOutlined />,
      label: '调试中心',
    },
  ]

  const userMenu = [
    {
      key: 'profile',
      label: '个人资料',
    },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
    },
  ]

  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      logout()
      navigate('/login')
    }
  }

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  const selectedKey = '/' + (location.pathname.split('/')[1] || 'apps')
  const pageMeta = useMemo(() => routeMeta[selectedKey] || routeMeta['/apps'], [selectedKey])

  return (
    <AntLayout className="layout-container">
      <Sider trigger={null} collapsible collapsed={collapsed} width={264} className="sidebar">
        <div className="sidebar-shell">
          <div className="logo">
            <div className="logo-mark">
              <RadarChartOutlined />
            </div>
            {!collapsed && (
              <div className="logo-copy">
                <h1 className="logo-text">FlowAI Studio</h1>
                <span>AI Workflow Console</span>
              </div>
            )}
          </div>

          <div className="sidebar-section-label">导航</div>
          <Menu
            mode="inline"
            theme="dark"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={handleMenuClick}
            className="menu"
          />

          {!collapsed && (
            <div className="sidebar-footer-card">
              <div className="sidebar-footer-icon">
                <ThunderboltOutlined />
              </div>
              <div>
                <strong>保持工作流可读</strong>
                <p>先整理骨架，再优化节点和交互，页面体验会稳定很多。</p>
              </div>
            </div>
          )}
        </div>
      </Sider>

      <AntLayout className="layout-main">
        <Header className="header">
          <div className="header-left">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={handleToggle}
              className="trigger"
            />
            <div className="header-copy">
              <div className="header-badge">{pageMeta.badge}</div>
              <Title level={4}>{pageMeta.title}</Title>
              <Text>{pageMeta.description}</Text>
            </div>
          </div>

          <div className="header-right">
            <Tag bordered={false} className="header-status-tag">
              在线工作区
            </Tag>
            <Dropdown menu={{ items: userMenu, onClick: handleUserMenuClick }} trigger={['click']}>
              <Space className="profile-chip">
                <Avatar icon={<UserOutlined />} />
                <div className="profile-copy">
                  <span className="username">{user?.username || '用户'}</span>
                  <small>Workspace Owner</small>
                </div>
              </Space>
            </Dropdown>
          </div>
        </Header>

        <Content className="content">
          <div className="content-container">
            <Outlet />
          </div>
        </Content>
      </AntLayout>
    </AntLayout>
  )
}

export default Layout
