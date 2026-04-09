import { useState, useRef, useEffect } from 'react'
import { Typography, Input, Button, Select, Divider, message, Empty } from 'antd'
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  PlayCircleOutlined,
  FileSearchOutlined,
  MessageOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons'
import { useStore } from '../store'
import request from '../utils/axios'
import { createParser } from 'eventsource-parser'
import './Debug.css'

const { Text, Paragraph } = Typography
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
}

const Debug: React.FC = () => {
  const { isLoading, setIsLoading, apps, fetchApps, knowledgeBases, fetchKnowledgeBases } = useStore()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeTab, setActiveTab] = useState<'chat' | 'workflow'>('chat')
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
      } catch {
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
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          message: currentInput,
          history: messages.map(msg => ({ role: msg.role, content: msg.content })),
          knowledgeBaseId: selectedKbId,
        }),
      })

      if (!response.ok) throw new Error('API request failed')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

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
              setMessages(prev => [
                ...prev,
                {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: accumulatedContent,
                  createdAt: new Date().toISOString(),
                  references,
                },
              ])
              setIsStreaming(false)
              setStreamingContent('')
            }
          } catch (e) {
            console.error('SSE parse error', e)
          }
        }
      })

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value))
      }
    } catch {
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
    } catch {
      message.error('工作流执行失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="debug-page">
      {/* Page header */}
      <div className="debug-page-header">
        <div>
          <h2 className="debug-page-title">调试中心</h2>
          <p className="debug-page-desc">验证 AI 对话、工作流执行和知识库检索效果。</p>
        </div>
        <div className="debug-header-stats">
          <div className="debug-stat">
            <span className="debug-stat-label">消息数</span>
            <span className="debug-stat-value">{messages.length}</span>
          </div>
          <div className="debug-stat">
            <span className="debug-stat-label">可用应用</span>
            <span className="debug-stat-value">{Array.isArray(apps) ? apps.length : 0}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="debug-tab-bar">
        <button
          className={`debug-tab ${activeTab === 'chat' ? 'debug-tab--active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageOutlined />
          AI 对话
        </button>
        <button
          className={`debug-tab ${activeTab === 'workflow' ? 'debug-tab--active' : ''}`}
          onClick={() => setActiveTab('workflow')}
        >
          <NodeIndexOutlined />
          工作流执行
        </button>
      </div>

      {/* ===== Chat panel ===== */}
      {activeTab === 'chat' && (
        <div className="debug-chat-card">
          {/* Messages */}
          <div className="debug-messages">
            {messages.length === 0 && !streamingContent ? (
              <div className="debug-empty">
                <RobotOutlined className="debug-empty-icon" />
                <Text strong style={{ color: 'var(--c-text-primary)' }}>发送消息开始调试</Text>
                <Text style={{ color: 'var(--c-text-secondary)', fontSize: 13 }}>
                  验证 AI 回复和知识库检索效果
                </Text>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
                    <div className={`chat-avatar chat-avatar--${msg.role}`}>
                      {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                    </div>
                    <div className="chat-body">
                      <div className="chat-meta">
                        <span className="chat-name">{msg.role === 'user' ? '我' : 'AI 助手'}</span>
                        <span className="chat-time">
                          {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className={`chat-bubble chat-bubble--${msg.role}`}>
                        <Paragraph style={{ margin: 0 }}>{msg.content}</Paragraph>

                        {msg.references && msg.references.length > 0 && (
                          <div className="chat-refs">
                            <div className="chat-refs-label">
                              <FileSearchOutlined />
                              引用了 {msg.references.length} 份文档
                            </div>
                            {msg.references.map((ref, idx) => (
                              <div key={idx} className="chat-ref-item">
                                <div className="chat-ref-head">
                                  <Text strong style={{ fontSize: 12 }}>{ref.documentName}</Text>
                                  <span className="chat-ref-score">
                                    {Math.round(ref.similarity * 100)}% 相似
                                  </span>
                                </div>
                                <Paragraph
                                  ellipsis={{ rows: 2 }}
                                  style={{ margin: 0, fontSize: 12, color: 'var(--c-text-secondary)' }}
                                >
                                  {ref.content}
                                </Paragraph>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {isStreaming && (
                  <div className="chat-msg chat-msg--assistant">
                    <div className="chat-avatar chat-avatar--assistant chat-avatar--streaming">
                      <RobotOutlined />
                    </div>
                    <div className="chat-body">
                      <div className="chat-meta">
                        <span className="chat-name">AI 助手</span>
                        <span className="chat-streaming-label">生成中…</span>
                      </div>
                      <div className="chat-bubble chat-bubble--assistant">
                        <Paragraph style={{ margin: 0 }}>{streamingContent}</Paragraph>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div className="debug-input-area">
            <Select
              placeholder="关联知识库（可选）"
              allowClear
              value={selectedKbId || undefined}
              onChange={setSelectedKbId}
              style={{ width: 200 }}
              size="small"
            >
              {Array.isArray(knowledgeBases) && knowledgeBases.map(kb => (
                <Option key={kb.id} value={kb.id}>{kb.name}</Option>
              ))}
            </Select>
            <div className="debug-input-row">
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入消息，Shift+Enter 换行，Enter 发送"
                autoSize={{ minRows: 2, maxRows: 5 }}
                className="debug-textarea"
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
                className="debug-send-btn"
              >
                发送
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Workflow panel ===== */}
      {activeTab === 'workflow' && (
        <div className="debug-workflow-card">
          <div className="debug-wf-controls">
            <Select
              placeholder="选择应用"
              onChange={handleAppChange}
              value={selectedAppId || undefined}
              style={{ width: 220 }}
            >
              {apps.map(app => (
                <Option key={app.id} value={app.id}>{app.name}</Option>
              ))}
            </Select>
            <Select
              placeholder="选择工作流"
              onChange={setSelectedWorkflowId}
              value={selectedWorkflowId || undefined}
              disabled={!selectedAppId}
              style={{ width: 220 }}
            >
              {workflows.map(wf => (
                <Option key={wf.id} value={wf.id}>{wf.name}</Option>
              ))}
            </Select>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRunWorkflow}
              loading={isLoading}
              disabled={!selectedWorkflowId}
              style={{ background: 'var(--c-green)', borderColor: 'var(--c-green)' }}
            >
              执行工作流
            </Button>
          </div>

          {workflowResult ? (
            <div className="debug-wf-result">
              <Divider orientation="left" style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>
                执行结果
              </Divider>
              <pre className="debug-wf-pre">
                {JSON.stringify(workflowResult, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="debug-wf-empty">
              <Empty
                image={<PlayCircleOutlined style={{ fontSize: 36, color: 'var(--c-green)', opacity: 0.4 }} />}
                description={
                  <span style={{ color: 'var(--c-text-secondary)', fontSize: 13 }}>
                    选择应用和工作流后点击执行，结果将在这里显示
                  </span>
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Debug
