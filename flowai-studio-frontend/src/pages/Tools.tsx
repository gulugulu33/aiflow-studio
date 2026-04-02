import { useState } from 'react'
import { Card, Button, Table, Typography, Space, Tabs, Empty } from 'antd'
import { PlusOutlined, ToolOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import './Tools.css'

const { Title } = Typography

const Tools: React.FC = () => {
  const { isLoading } = useStore()
  const [activeTab, setActiveTab] = useState('builtin')
  const [builtinTools] = useState([
    { id: '1', name: '获取当前时间', description: '获取当前的日期和时间信息' },
    { id: '2', name: 'HTTP请求', description: '发送HTTP请求到指定URL' },
    { id: '3', name: 'JSON解析', description: '解析或序列化JSON数据' },
    { id: '4', name: '正则匹配', description: '使用正则表达式匹配文本' },
  ])
  const [customTools] = useState([])

  return (
    <div className="tools">
      <div className="tools-header">
        <Title level={4}>
          <ToolOutlined className="mr-2" />
          工具管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />}>
          新建自定义工具
        </Button>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} className="tools-tabs">
        <Tabs.TabPane key="builtin" tab="内置工具">
          <Card>
            <Table
              columns={[
                {
                  title: '工具名称',
                  dataIndex: 'name',
                  key: 'name',
                },
                {
                  title: '描述',
                  dataIndex: 'description',
                  key: 'description',
                },
                {
                  title: '类型',
                  key: 'type',
                  render: () => '内置',
                },
              ]}
              dataSource={builtinTools}
              rowKey="id"
              loading={isLoading}
            />
          </Card>
        </Tabs.TabPane>
        
        <Tabs.TabPane key="custom" tab="自定义工具">
          <Card>
            {customTools.length > 0 ? (
              <Table
                columns={[
                  {
                    title: '工具名称',
                    dataIndex: 'name',
                    key: 'name',
                  },
                  {
                    title: '描述',
                    dataIndex: 'description',
                    key: 'description',
                  },
                  {
                    title: '操作',
                    key: 'action',
                    render: () => (
                      <Space>
                        <Button size="small">编辑</Button>
                        <Button size="small" danger>删除</Button>
                      </Space>
                    ),
                  },
                ]}
                dataSource={customTools}
                rowKey="id"
                loading={isLoading}
              />
            ) : (
              <Empty description="暂无自定义工具" />
            )}
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}

export default Tools
