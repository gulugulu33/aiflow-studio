import { useState, useEffect } from 'react'
import { Form, Input, Button, Alert, Checkbox } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store'
import './Auth.css'

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login, isLoading, authError, clearError } = useStore()
  const [form] = Form.useForm()
  const [showError, setShowError] = useState(false)

  useEffect(() => {
    if (authError) setShowError(true)
  }, [authError])

  const handleClearError = () => {
    setShowError(false)
    clearError()
  }

  const getAlertType = () => {
    if (!authError) return 'error' as const
    switch (authError.type) {
      case 'LOCKED':
        return 'warning' as const
      case 'NETWORK':
      case 'SERVER':
        return 'info' as const
      default:
        return 'error' as const
    }
  }

  const onSubmit = async (values: { username: string; password: string; remember?: boolean }) => {
    handleClearError()
    try {
      const { username, password } = values
      await login({ username, password })
      navigate('/apps')
    } catch (err) {
      console.error('Login error:', err)
    }
  }

  return (
    <div className="auth-page">
      {/* Left brand panel */}
      <div className="auth-brand">
        <div className="auth-brand-content">
          <div className="auth-brand-logo">✦</div>
          <h1 className="auth-brand-title">FlowAI Studio</h1>
          <p className="auth-brand-desc">
            可视化 AI 应用低代码编排平台
            <br />
            拖拽式工作流 · RAG 知识库 · 多模型接入
          </p>
        </div>
        <div className="auth-brand-footer">
          <span>© 2024 FlowAI Studio</span>
        </div>
      </div>

      {/* Right form panel */}
      <div className="auth-form-panel">
        <div className="auth-form-wrapper">
          <h2 className="auth-heading">登录</h2>
          <p className="auth-subheading">欢迎回来，请登录你的账号</p>

          {showError && authError && (
            <Alert
              message={authError.message}
              type={getAlertType()}
              showIcon
              closable
              onClose={handleClearError}
              style={{ marginBottom: 20, borderRadius: 10 }}
            />
          )}

          <Form
            form={form}
            onFinish={onSubmit}
            layout="vertical"
            className="auth-form"
            onValuesChange={handleClearError}
            requiredMark={false}
          >
            <Form.Item
              name="username"
              label="用户名"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少 3 个字符' },
                { max: 20, message: '用户名不超过 20 个字符' },
                { pattern: /^[a-zA-Z0-9_]+$/, message: '仅支持字母、数字和下划线' },
              ]}
              validateTrigger="onBlur"
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="请输入用户名"
                disabled={isLoading}
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 个字符' },
              ]}
              validateTrigger="onBlur"
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                disabled={isLoading}
                size="large"
              />
            </Form.Item>

            <div className="auth-form-extra">
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox disabled={isLoading}>记住我</Checkbox>
              </Form.Item>
            </div>

            <Form.Item style={{ marginTop: 24 }}>
              <Button
                type="primary"
                htmlType="submit"
                className="auth-submit-btn"
                loading={isLoading}
                disabled={isLoading}
                block
                size="large"
              >
                {isLoading ? '登录中…' : '登  录'}
              </Button>
            </Form.Item>
          </Form>

          <div className="auth-switch">
            还没有账号？ <Link to="/register">立即注册</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
