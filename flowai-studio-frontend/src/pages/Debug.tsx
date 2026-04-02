import { useState, useRef, useEffect } from 'react'
import { Card, Typography, Input, Button, Space, message, Tabs, Select, Divider } from 'antd'
import { CodeOutlined, SendOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import request from '../utils/axios'
import { createParser } from 'eventsource-parser'
import './Debug.css'

const { Title, Text, Paragraph } = Typography
const { Option } = Select

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  references?: {
    documentId: string
    documentName: string
    content: string
    similarity: number
  }[]
  toolCalls?: {
    toolName: string
    params: Record<string, any>
    result: any
  }[]
}

const Debug: React.FC = () => {
  const { isLoading, setIsLoading, apps, fetchApps, knowledgeBases, fetchKnowledgeBases } = useStore()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeTab, setActiveTab] = useState('chat')
  const [selectedAppId, setSelectedAppId] = useState<string>('')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [workflows, setWorkflows] = useState<any[]>([])
  const [selectedKbId, setSelectedKbId] = useState<string>('')
  const [workflowInputs] = useState<Record<string, any>>({})
  const [workflowResult, setWorkflowResult] = useState<any>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchApps()
    fetchKnowledgeBases()
  }, [fetchApps, fetchKnowledgeBases])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingContent])

  const handleAppChange = async (appId: string) => {
    setSelectedAppId(appId)
    setSelectedWorkflowId('')
    setWorkflows([])

    if (appId) {
      try {
        const response = await request.get(`/workflows/app/${appId}`) as any
        setWorkflows(response.data || [])
      } catch (error) {
        message.error('获取工作流失败')
      }
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return

    const currentInput = input
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: currentInput,
      createdAt: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')

    const assistantMessageId = Date.now().toString() + '-assistant'

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          message: currentInput,
          history: messages.map(msg => ({ role: msg.role, content: msg.content })),
          knowledgeBaseId: selectedKbId,
        }),
      })

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      let accumulatedContent = ''
      let references: any[] = []

      const parser = createParser((event) => {
        if (event.type === 'event') {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'text') {
              accumulatedContent += data.content
              setStreamingContent(accumulatedContent)
            } else if (data.type === 'done') {
              references = data.references || []
              const assistantMessage: ChatMessage = {
                id: assistantMessageId,
                role: 'assistant',
                content: accumulatedContent,
                createdAt: new Date().toISOString(),
                references: references,
              }
              setMessages(prev => [...prev, assistantMessage])
              setIsStreaming(false)
              setStreamingContent('')
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error)
          }
        }
      })

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value))
      }
    } catch (error) {
      console.error('Error sending message:', error)
      message.error('发送消息失败')
      setIsStreaming(false)
      setStreamingContent('')
    }
  }

  const handleRunWorkflow = async () => {
    if (!selectedWorkflowId) {
      message.error('请选择工作流')
      return
    }

    setIsLoading(true)
    setWorkflowResult(null)

    try {
      const response = await request.post(`/workflows/${selectedWorkflowId}/run`, {
        inputs: workflowInputs,
      }) as any

      setWorkflowResult(response.data)
      message.success('工作流执行成功')
    } catch (error) {
      message.error('工作流执行失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="debug">
      <div className="debug-header">
        <Title level={4}>
          <CodeOutlined className="mr-2" />
          调试中心
        </Title>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} className="debug-tabs">
        <Tabs.TabPane tab="AI 聊天" key="chat">
          <Card className="debug-card">
            <div className="chat-container">
              {messages.length === 0 && !streamingContent && (
                <div style={{ textAlign: 'center', marginTop: 100 }}>
                  <Text type="secondary">发送消息开始调试</Text>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role}`}>
                  <div className="message-role">
                    {msg.role === 'user' ? '我' : 'AI'}
                  </div>
                  <div className="message-content">
                    <Paragraph>{msg.content}</Paragraph>
                    {msg.references && msg.references.length > 0 && (
                      <div className="message-references">
                        <Divider orientation="left">参考文档</Divider>
                        {msg.references.map((ref, idx) => (
                          <div key={idx} className="reference-item">
                            <Text strong>{ref.documentName}</Text>
                            <Paragraph ellipsis={{ rows: 2 }}>
                              {ref.content}
                            </Paragraph>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              相似度: {Math.round(ref.similarity * 100)}%
                            </Text>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isStreaming && (
                <div className="message assistant">
                  <div className="message-role">AI</div>
                  <div className="message-content">
                    <Paragraph>{streamingContent}</Paragraph>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-header">
              <Select
                style={{ width: 200 }}
                placeholder="关联知识库 (可选)"
                allowClear
                value={selectedKbId}
                onChange={setSelectedKbId}
              >
                {Array.isArray(knowledgeBases) && knowledgeBases.map(kb => (
                  <Option key={kb.id} value={kb.id}>{kb.name}</Option>
                ))}
              </Select>
            </div>
            <div className="chat-input">
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入消息..."
                autoSize={{ minRows: 2, maxRows: 6 }}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSendMessage}
                loading={isStreaming}
                disabled={!input.trim()}
              >
                发送
              </Button>
            </div>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab="工作流执行" key="workflow">
          <Card className="debug-card">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <Select
                  style={{ width: 200 }}
                  placeholder="选择应用"
                  onChange={handleAppChange}
                  value={selectedAppId}
                >
                  {apps.map(app => (
                    <Option key={app.id} value={app.id}>{app.name}</Option>
                  ))}
                </Select>
                <Select
                  style={{ width: 200 }}
                  placeholder="选择工作流"
                  onChange={setSelectedWorkflowId}
                  value={selectedWorkflowId}
                  disabled={!selectedAppId}
                >
                  {workflows.map(wf => (
                    <Option key={wf.id} value={wf.id}>{wf.name}</Option>
                  ))}
                </Select>
                <Button 
                  type="primary" 
                  onClick={handleRunWorkflow} 
                  loading={isLoading}
                  disabled={!selectedWorkflowId}
                >
                  执行工作流
                </Button>
              </div>

              {workflowResult && (
                <div className="workflow-result">
                  <Divider>执行结果</Divider>
                  <pre style={{ 
                    background: '#f5f5f5', 
                    padding: '16px', 
                    borderRadius: '8px',
                    maxHeight: '400px',
                    overflow: 'auto'
                  }}>
                    {JSON.stringify(workflowResult, null, 2)}
                  </pre>
                </div>
              )}
            </Space>
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}

export default Debug
