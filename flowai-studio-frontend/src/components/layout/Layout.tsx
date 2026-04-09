import { useMemo, useState } from 'react'
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown, Typography } from 'antd'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  BookOutlined,
  ToolOutlined,
  BugOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
  CaretDownOutlined,
} from '@ant-design/icons'
import { useStore } from '../../store'
import './Layout.css'

const { Header, Sider, Content } = AntLayout
const { Title } = Typography

const routeMeta: Record<string, { title: string }> = {
  '/apps': { title: '工作台' },
  '/knowledge-bases': { title: '知识库' },
  '/tools': { title: '工具管理' },
  '/debug': { title: '调试中心' },
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
      icon: <AppstoreOutlined />,
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
      icon: <BugOutlined />,
      label: '调试中心',
    },
  ]

  const userMenu = [
    {
      key: 'profile',
      label: '个人资料',
      icon: <UserOutlined />,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      danger: true,
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
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        collapsedWidth={64}
        className="sidebar"
      >
        <div className="sidebar-shell">
          {/* Logo */}
          <div className="logo">
            <div className="logo-mark">
              <RadarChartOutlined />
            </div>
            {!collapsed && (
              <div className="logo-copy">
                <h1 className="logo-text">FlowAI Studio</h1>
                <span>AI Workflow Builder</span>
              </div>
            )}
          </div>

          {!collapsed && <div className="sidebar-section-label">Navigation</div>}

          <Menu
            mode="inline"
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
                <strong>FlowAI Studio</strong>
                <p>用 AI 工作流自动化你的业务流程。</p>
              </div>
            </div>
          )}
        </div>
      </Sider>

      <AntLayout className="layout-main">
        {/* Top bar */}
        <Header className="header">
          <div className="header-left">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={handleToggle}
              className="trigger"
            />
            <div className="header-copy">
              <Title level={3}>{pageMeta.title}</Title>
            </div>
          </div>

          <div className="header-right">
            <div className="header-online-dot">
              <span className="online-dot" />
              <span className="online-text">在线</span>
            </div>
            <Dropdown
              menu={{ items: userMenu, onClick: handleUserMenuClick }}
              trigger={['click']}
              placement="bottomRight"
            >
              <div className="profile-chip">
                <Avatar
                  size={26}
                  icon={<UserOutlined />}
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', flexShrink: 0 }}
                />
                <div className="profile-copy">
                  <span className="username">{user?.username || '用户'}</span>
                </div>
                <CaretDownOutlined className="profile-caret" />
              </div>
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
