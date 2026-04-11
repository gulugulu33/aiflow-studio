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
    description: '集中管理应用、版本状态与 AI 工作流，保持编排入口整洁清晰。',
    badge: 'Workspace',
  },
  '/knowledge-bases': {
    title: '知识库中心',
    description: '维护文档、分块与检索素材，让 RAG 链路始终稳定可控。',
    badge: 'Knowledge',
  },
  '/tools': {
    title: '工具管理',
    description: '统一管理技能与工具，把可执行能力收敛到一个清晰面板。',
    badge: 'Tools',
  },
  '/debug': {
    title: '调试中心',
    description: '在同一工作区里验证会话、节点执行和接口行为。',
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
      <Sider trigger={null} collapsible collapsed={collapsed} width={280} className="sidebar">
        <div className="sidebar-shell">
          <div className="logo">
            <div className="logo-mark">
              <RadarChartOutlined />
            </div>
            {!collapsed && (
              <div className="logo-copy">
                <h1 className="logo-text">FlowAI Studio</h1>
                <span>Build · Retrieve · Orchestrate</span>
              </div>
            )}
          </div>

          <div className="sidebar-section-label">Navigation</div>
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
                <strong>Studio rhythm</strong>
                <p>先把页面骨架统一，产品质感会比单点修饰提升得更明显。</p>
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
              <Title level={3}>{pageMeta.title}</Title>
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
