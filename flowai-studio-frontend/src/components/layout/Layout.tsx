import { useState } from 'react'
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown, Space } from 'antd'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined, LogoutOutlined, HomeOutlined, AppstoreOutlined, BookOutlined, ToolOutlined, CodeOutlined } from '@ant-design/icons'
import { useStore } from '../../store'
import './Layout.css'

const { Header, Sider, Content } = AntLayout

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

  // 计算当前选中的菜单项，处理子路由情况
  const selectedKey = '/' + (location.pathname.split('/')[1] || 'apps')

  return (
    <AntLayout className="layout-container">
      <Sider trigger={null} collapsible collapsed={collapsed} width={240} className="sidebar">
        <div className="logo">
          <h1 className="logo-text">FlowAI Studio</h1>
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
          className="menu"
        />
      </Sider>
      <AntLayout>
        <Header className="header">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={handleToggle}
            className="trigger"
          />
          <div className="header-right">
            <Dropdown
              menu={{ items: userMenu, onClick: handleUserMenuClick }}
              trigger={['click']}
            >
              <Space>
                <Avatar icon={<UserOutlined />} />
                <span className="username">{user?.username || '用户'}</span>
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
