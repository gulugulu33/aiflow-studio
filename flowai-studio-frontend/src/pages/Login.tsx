import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Typography, Alert, Checkbox, Space, Divider } from 'antd'
import { LockOutlined, UserOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store'
import './Auth.css'

const { Title, Text } = Typography

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError } = useStore()
  const [form] = Form.useForm()
  const [showError, setShowError] = useState(false)

  // 监听错误变化
  useEffect(() => {
    if (error) {
      setShowError(true)
    }
  }, [error])

  // 清除错误
  const handleClearError = () => {
    setShowError(false)
    clearError()
  }

  // 根据错误类型获取Alert类型
  const getAlertType = () => {
    if (!error) return 'error'
    
    switch (error.type) {
      case 'VALIDATION':
      case 'AUTHENTICATION':
        return 'error'
      case 'LOCKED':
        return 'warning'
      case 'NETWORK':
      case 'SERVER':
        return 'info'
      default:
        return 'error'
    }
  }

  const onSubmit = async (values: { username: string; password: string; remember?: boolean }) => {
    handleClearError()
    
    try {
      // 只发送 username 和 password，不包含 remember 字段
      const { username, password } = values
      await login({ username, password })
      navigate('/apps')
    } catch (err: any) {
      // 错误已经在store中处理，这里不需要额外处理
      console.error('Login error:', err)
    }
  }

  return (
    <div className="auth-container">
      <Card className="auth-card" title={<Title level={3} className="auth-title">FlowAI Studio</Title>}>
        <Text className="auth-subtitle">AI应用低代码编排平台</Text>
        
        {showError && error && (
          <Alert
            message={
              error.type === 'LOCKED' ? '账户锁定' : 
              error.type === 'NETWORK' ? '网络错误' :
              error.type === 'SERVER' ? '服务器错误' :
              '登录失败'
            }
            description={
              <div>
                <div>{error.message}</div>
                {error.type === 'NETWORK' && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    请检查网络连接或联系管理员
                  </div>
                )}
                {error.type === 'SERVER' && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    服务器暂时不可用，请稍后重试
                  </div>
                )}
              </div>
            }
            type={getAlertType()}
            showIcon
            className="mb-4"
            closable
            onClose={handleClearError}
          />
        )}
        
        <Form
          form={form}
          onFinish={onSubmit}
          layout="vertical"
          className="auth-form"
          onValuesChange={handleClearError}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名长度至少为3个字符' },
              { max: 20, message: '用户名长度不能超过20个字符' },
              {
                pattern: /^[a-zA-Z0-9_]+$/,
                message: '用户名只能包含字母、数字和下划线'
              }
            ]}
            validateTrigger="onBlur"
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="请输入用户名" 
              disabled={isLoading}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码长度至少为6个字符' }
            ]}
            validateTrigger="onBlur"
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="请输入密码" 
              disabled={isLoading}
            />
          </Form.Item>

          <Form.Item name="remember" valuePropName="checked" noStyle>
            <Checkbox disabled={isLoading}>记住我</Checkbox>
          </Form.Item>

          <Form.Item style={{ marginTop: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              className="auth-button"
              loading={isLoading}
              disabled={isLoading}
              block
              icon={isLoading ? null : <LockOutlined />}
            >
              {isLoading ? '登录中...' : '登录'}
            </Button>
          </Form.Item>
        </Form>

        <Divider>
          <Text type="secondary">或</Text>
        </Divider>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Text className="auth-link">
            还没有账号？ <Link to="/register">立即注册</Link>
          </Text>
          
          <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
            忘记密码？请联系系统管理员重置
          </Text>
        </Space>
      </Card>
    </div>
  )
}

export default Login