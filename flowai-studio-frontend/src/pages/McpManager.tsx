import { useState, useEffect } from 'react'
import { Button, Input, message, Modal, Select, Empty, Dropdown, Spin, Tag, Form, Switch } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  ApiOutlined,
  LinkOutlined,
  DisconnectOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  CodeOutlined,
} from '@ant-design/icons'
import request from '../utils/axios'
import './McpManager.css'

const { TextArea } = Input

interface McpServer {
  id: string
  name: string
  description?: string
  transportType: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  isActive: boolean
  isConnected: boolean
  createdAt: string
}

interface McpTool {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, any>
    required?: string[]
  }
}

const McpManager: React.FC = () => {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServer | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    transportType: 'stdio' as 'stdio' | 'sse',
    command: '',
    args: '',
    url: '',
  })

  // 工具面板
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null)
  const [tools, setTools] = useState<McpTool[]>([])
  const [toolsPanelVisible, setToolsPanelVisible] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)

  // 工具执行
  const [execModalVisible, setExecModalVisible] = useState(false)
  const [execTool, setExecTool] = useState<McpTool | null>(null)
  const [execServerId, setExecServerId] = useState<string>('')
  const [execParams, setExecParams] = useState('{}')
  const [execResult, setExecResult] = useState<any>(null)
  const [executing, setExecuting] = useState(false)

  useEffect(() => {
    fetchServers()
  }, [])

  const fetchServers = async () => {
    setLoading(true)
    try {
      const res = await request.get('/mcp/servers') as any
      setServers(Array.isArray(res.data) ? res.data : [])
    } catch {
      message.error('获取 MCP 服务器列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingServer(null)
    setFormData({ name: '', description: '', transportType: 'stdio', command: '', args: '', url: '' })
    setModalVisible(true)
  }

  const handleEdit = (server: McpServer) => {
    setEditingServer(server)
    setFormData({
      name: server.name,
      description: server.description || '',
      transportType: server.transportType,
      command: server.command || '',
      args: Array.isArray(server.args) ? server.args.join(' ') : '',
      url: server.url || '',
    })
    setModalVisible(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      message.error('请输入服务器名称')
      return
    }
    if (formData.transportType === 'stdio' && !formData.command.trim()) {
      message.error('请输入启动命令')
      return
    }

    const payload: any = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      transportType: formData.transportType,
    }

    if (formData.transportType === 'stdio') {
      payload.command = formData.command.trim()
      payload.args = formData.args.trim() ? formData.args.trim().split(/\s+/) : []
    } else {
      payload.url = formData.url.trim()
    }

    try {
      if (editingServer) {
        await request.put(`/mcp/servers/${editingServer.id}`, payload)
        message.success('服务器更新成功')
      } else {
        await request.post('/mcp/servers', payload)
        message.success('服务器创建成功')
      }
      setModalVisible(false)
      fetchServers()
    } catch {
      message.error('操作失败，请重试')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await request.delete(`/mcp/servers/${id}`)
      message.success('服务器已删除')
      fetchServers()
    } catch {
      message.error('删除失败')
    }
  }

  const handleConnect = async (server: McpServer) => {
    setConnectingId(server.id)
    try {
      const res = await request.post(`/mcp/servers/${server.id}/connect`) as any
      message.success(`已连接到「${server.name}」，发现 ${res.data?.tools?.length || 0} 个工具`)
      fetchServers()

      // 自动显示工具面板
      setSelectedServer(server)
      setTools(res.data?.tools || [])
      setToolsPanelVisible(true)
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '连接失败'
      message.error(msg)
    } finally {
      setConnectingId(null)
    }
  }

  const handleDisconnect = async (server: McpServer) => {
    try {
      await request.post(`/mcp/servers/${server.id}/disconnect`)
      message.success('已断开连接')
      fetchServers()
      if (selectedServer?.id === server.id) {
        setToolsPanelVisible(false)
        setTools([])
        setSelectedServer(null)
      }
    } catch {
      message.error('断开失败')
    }
  }

  const handleViewTools = async (server: McpServer) => {
    if (!server.isConnected) {
      message.warning('请先连接该服务器')
      return
    }
    try {
      const res = await request.get(`/mcp/servers/${server.id}/tools`) as any
      setSelectedServer(server)
      setTools(Array.isArray(res.data) ? res.data : [])
      setToolsPanelVisible(true)
    } catch {
      message.error('获取工具列表失败')
    }
  }

  const handleExecTool = (tool: McpTool, serverId: string) => {
    setExecTool(tool)
    setExecServerId(serverId)
    setExecResult(null)

    // 根据 inputSchema 生成示例参数
    if (tool.inputSchema?.properties) {
      const example: Record<string, any> = {}
      for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
        const s = schema as any
        if (s.type === 'string') example[key] = ''
        else if (s.type === 'number') example[key] = 0
        else if (s.type === 'boolean') example[key] = false
        else example[key] = null
      }
      setExecParams(JSON.stringify(example, null, 2))
    } else {
      setExecParams('{}')
    }

    setExecModalVisible(true)
  }

  const handleRunExec = async () => {
    if (!execTool) return
    setExecuting(true)
    try {
      let args = {}
      try {
        args = JSON.parse(execParams)
      } catch {
        message.error('参数格式错误，请输入合法的 JSON')
        setExecuting(false)
        return
      }

      const res = await request.post(`/mcp/servers/${execServerId}/tools/call`, {
        toolName: execTool.name,
        args,
      }) as any
      setExecResult(res.data)
      message.success('工具执行成功')
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '执行失败'
      setExecResult({ error: msg })
      message.error(msg)
    } finally {
      setExecuting(false)
    }
  }

  const getCardMenu = (server: McpServer) => ({
    items: [
      { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleEdit(server) } },
      ...(server.isConnected
        ? [
            { key: 'tools', label: '查看工具', icon: <CodeOutlined />, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleViewTools(server) } },
            { key: 'disconnect', label: '断开连接', icon: <DisconnectOutlined />, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleDisconnect(server) } },
          ]
        : [
            { key: 'connect', label: '连接', icon: <LinkOutlined />, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleConnect(server) } },
          ]
      ),
      { type: 'divider' as const },
      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: (e: any) => { e.domEvent?.stopPropagation(); handleDelete(server.id) } },
    ],
  })

  return (
    <div className="mcp-page">
      {/* Toolbar */}
      <div className="skill-toolbar">
        <div className="skill-toolbar-left">
          <h2 className="skill-page-title">MCP 服务器</h2>
          <span className="skill-count-badge">{servers.length}</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加服务器
        </Button>
      </div>

      {/* Card Grid */}
      {loading ? (
        <div className="skill-grid-loading"><Spin size="large" /></div>
      ) : servers.length > 0 ? (
        <div className="skill-card-grid">
          {/* New card */}
          <button className="skill-card skill-card--new" onClick={handleAdd}>
            <div className="skill-card-new-icon"><PlusOutlined /></div>
            <span className="skill-card-new-label">添加 MCP 服务器</span>
          </button>

          {servers.map((server) => (
            <div
              key={server.id}
              className="skill-card"
              onClick={() => server.isConnected ? handleViewTools(server) : handleConnect(server)}
            >
              {/* Header */}
              <div className="skill-card-header">
                <div className={`skill-card-icon ${server.isConnected ? '' : 'skill-card-icon--custom'}`}>
                  <ApiOutlined />
                </div>
                <Dropdown menu={getCardMenu(server)} trigger={['click']} placement="bottomRight">
                  <button className="skill-card-menu-btn" onClick={(e) => e.stopPropagation()}>
                    <MoreOutlined />
                  </button>
                </Dropdown>
              </div>

              {/* Body */}
              <div className="skill-card-body">
                <h3 className="skill-card-name">{server.name}</h3>
                <p className="skill-card-desc">
                  {server.description || (server.transportType === 'stdio'
                    ? `${server.command} ${(server.args || []).join(' ')}`
                    : server.url || '暂无描述')}
                </p>
              </div>

              {/* Footer */}
              <div className="skill-card-footer">
                <span className="skill-type-badge skill-type-badge--custom">
                  {server.transportType.toUpperCase()}
                </span>
                <span className="skill-status-dot">
                  {connectingId === server.id ? (
                    <><Spin size="small" style={{ marginRight: 4 }} /> 连接中</>
                  ) : server.isConnected ? (
                    <><CheckCircleOutlined style={{ color: 'var(--c-green)', fontSize: 12 }} /> 已连接</>
                  ) : (
                    <><CloseCircleOutlined style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }} /> 未连接</>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="skill-empty-wrapper">
          <Empty
            description={
              <span>
                暂无 MCP 服务器配置
                <br />
                <span style={{ color: 'var(--c-text-tertiary)', fontSize: 13 }}>
                  MCP (Model Context Protocol) 让 AI 可以连接外部工具和数据源
                </span>
              </span>
            }
            style={{ padding: '56px 0' }}
          />
        </div>
      )}

      {/* Tools Panel Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ApiOutlined style={{ color: 'var(--c-accent)' }} />
            <span>{selectedServer?.name} — 工具列表</span>
            <Tag color="purple">{tools.length} 个工具</Tag>
          </div>
        }
        open={toolsPanelVisible}
        onCancel={() => setToolsPanelVisible(false)}
        footer={null}
        width={720}
      >
        <div className="mcp-tools-panel">
          {tools.length > 0 ? (
            <div className="mcp-tools-list">
              {tools.map((tool) => (
                <div key={tool.name} className="mcp-tool-item">
                  <div className="mcp-tool-info">
                    <div className="mcp-tool-name">
                      <CodeOutlined style={{ marginRight: 6, color: 'var(--c-accent)' }} />
                      {tool.name}
                    </div>
                    <div className="mcp-tool-desc">{tool.description || '暂无描述'}</div>
                    {tool.inputSchema?.properties && (
                      <div className="mcp-tool-params">
                        参数：{Object.keys(tool.inputSchema.properties).map((p) => (
                          <Tag key={p} style={{ fontSize: 11 }}>
                            {p}
                            {tool.inputSchema?.required?.includes(p) ? ' *' : ''}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<PlayCircleOutlined />}
                    onClick={() => handleExecTool(tool, selectedServer!.id)}
                  >
                    测试
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="该服务器没有提供工具" style={{ padding: '32px 0' }} />
          )}
        </div>
      </Modal>

      {/* Create/Edit Server Modal */}
      <Modal
        title={editingServer ? '编辑 MCP 服务器' : '添加 MCP 服务器'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={520}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="服务器名称" required>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="如：文件系统工具"
            />
          </Form.Item>
          <Form.Item label="描述">
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="简单描述这个 MCP 服务器的用途"
            />
          </Form.Item>
          <Form.Item label="传输方式">
            <Select
              value={formData.transportType}
              onChange={(v) => setFormData({ ...formData, transportType: v })}
            >
              <Select.Option value="stdio">STDIO（命令行启动）</Select.Option>
              <Select.Option value="sse" disabled>SSE（HTTP 连接）— 即将支持</Select.Option>
            </Select>
          </Form.Item>
          {formData.transportType === 'stdio' && (
            <>
              <Form.Item label="启动命令" required
                extra="MCP Server 的启动命令，如: npx -y @modelcontextprotocol/server-filesystem"
              >
                <Input
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem"
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
              <Form.Item label="命令参数" extra="空格分隔的参数列表，如: /tmp /home/user/documents">
                <Input
                  value={formData.args}
                  onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                  placeholder="/tmp /home/user/documents"
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
            </>
          )}
          {formData.transportType === 'sse' && (
            <Form.Item label="服务器 URL" required>
              <Input
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="http://localhost:3001/mcp"
              />
            </Form.Item>
          )}
          <div className="modal-footer">
            <Button onClick={() => setModalVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSave}>
              {editingServer ? '保存修改' : '添加服务器'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Tool Execution Modal */}
      <Modal
        title={`执行工具: ${execTool?.name || ''}`}
        open={execModalVisible}
        onCancel={() => setExecModalVisible(false)}
        footer={null}
        width={640}
      >
        <div className="exec-modal-body">
          {execTool?.description && (
            <p style={{ color: 'var(--c-text-secondary)', margin: 0 }}>{execTool.description}</p>
          )}
          <div className="exec-section">
            <h4 className="exec-section-title">执行参数</h4>
            <TextArea
              value={execParams}
              onChange={(e) => setExecParams(e.target.value)}
              placeholder='{"param1": "value1"}'
              rows={6}
              className="exec-textarea"
            />
          </div>
          {execResult && (
            <div className="exec-section">
              <h4 className="exec-section-title">执行结果</h4>
              <pre className="exec-result-pre">
                {typeof execResult === 'string' ? execResult : JSON.stringify(execResult, null, 2)}
              </pre>
            </div>
          )}
          <div className="modal-footer">
            <Button onClick={() => setExecModalVisible(false)}>关闭</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRunExec} loading={executing}>
              执行
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default McpManager
