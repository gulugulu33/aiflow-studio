import { useState } from 'react'
import { Card, Form, Input, Button, Typography, Alert, Space, Divider, message } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store'
import './Auth.css'

const { Title, Text } = Typography

const Register: React.FC = () => {
  const navigate = useNavigate()
  const { register, isLoading } = useStore()
  const [form] = Form.useForm()
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (values: { username: string; password: string; confirmPassword: string }) => {
    setError(null)
    try {
      // 只发送 username 和 password，不包含 confirmPassword
      const { username, password } = values
      await register({ username, password })
      message.success('注册成功，请登录')
      navigate('/login')
    } catch (err) {
      setError('注册失败，请检查输入信息')
    }
  }

  return (
    <div className="auth-container">
      <Card className="auth-card" title={<Title level={3} className="auth-title">注册账号</Title>}>
        <Text className="auth-subtitle">创建FlowAI Studio账号</Text>
        
        {error && (
          <Alert
            message="注册失败"
            description={error}
            type="error"
            showIcon
            className="mb-4"
          />
        )}
        
        <Form
          form={form}
          onFinish={onSubmit}
          layout="vertical"
          className="auth-form"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名长度至少为3个字符' },
              { max: 20, message: '用户名长度不能超过20个字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码长度至少为6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请再次输入密码" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="auth-button"
              loading={isLoading}
              block
            >
              注册
            </Button>
          </Form.Item>
        </Form>

        <Divider>
          <Text>或</Text>
        </Divider>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Text className="auth-link">
            已有账号？ <Link to="/login">立即登录</Link>
          </Text>
        </Space>
      </Card>
    </div>
  )
}

export default Register
