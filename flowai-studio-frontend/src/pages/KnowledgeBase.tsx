import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Table, message, Modal, Upload, Space, Typography, Empty, Spin, Select, Slider, InputNumber, Divider, Tag, Tooltip, Collapse } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  BookOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  InboxOutlined,
  DatabaseOutlined,
  BlockOutlined,
  ArrowLeftOutlined,
  SettingOutlined,
  CloudServerOutlined,
  RobotOutlined,
  SearchOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { useStore } from '../store'
import { DocumentChunk, EmbeddingProviderType, VectorStoreType, EMBEDDING_MODELS, VECTOR_STORE_OPTIONS, RETRIEVAL_MODE_OPTIONS } from '../types'
import './KnowledgeBase.css'

const { Text } = Typography
const { TextArea } = Input
const { Dragger } = Upload

const KnowledgeBase: React.FC = () => {
  const {
    knowledgeBases,
    isLoading,
    fetchKnowledgeBases,
    fetchKnowledgeBaseById,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    uploadDocument,
    deleteDocument,
    fetchDocumentChunks,
  } = useStore()
  const [modalVisible, setModalVisible] = useState(false)
  const [documentModalVisible, setDocumentModalVisible] = useState(false)
  const [editingKb, setEditingKb] = useState<any>(null)
  const [selectedKb, setSelectedKb] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    embeddingProvider: 'qwen' as EmbeddingProviderType,
    embeddingModel: 'text-embedding-v3',
    embeddingDimension: 1024,
    vectorStore: 'pgvector' as VectorStoreType,
    chunkSize: 500,
    chunkOverlap: 50,
    topK: 5,
    similarityThreshold: 0.7,
    retrievalMode: 'vector' as 'vector' | 'keyword' | 'hybrid',
    vectorWeight: 0.7,
    rrfK: 60,
  })
  const [documents, setDocuments] = useState<any[]>([])
  const [chunkModalVisible, setChunkModalVisible] = useState(false)
  const [chunkDocName, setChunkDocName] = useState('')
  const [chunks, setChunks] = useState<DocumentChunk[]>([])
  const [chunksLoading, setChunksLoading] = useState(false)

  useEffect(() => { fetchKnowledgeBases() }, [])

  const safeKnowledgeBases = Array.isArray(knowledgeBases) ? knowledgeBases : []
  const totalDocuments = useMemo(
    () => safeKnowledgeBases.reduce((count, kb) => count + (kb.documents?.length || 0), 0),
    [safeKnowledgeBases],
  )

  // Embedding 模型配置来自 types/index.ts 中的 EMBEDDING_MODELS 常量

  const handleAddKb = () => {
    setEditingKb(null)
    setFormData({
      name: '', description: '',
      embeddingProvider: 'qwen', embeddingModel: 'text-embedding-v3', embeddingDimension: 1024,
      vectorStore: 'pgvector',
      chunkSize: 500, chunkOverlap: 50, topK: 5, similarityThreshold: 0.7,
      retrievalMode: 'vector' as 'vector' | 'keyword' | 'hybrid',
    vectorWeight: 0.7,
    rrfK: 60,
    })
    setModalVisible(true)
  }

  const handleEditKb = (kb: any) => {
    setEditingKb(kb)
    setFormData({
      name: kb.name, description: kb.description || '',
      embeddingProvider: kb.embeddingProvider || 'qwen',
      embeddingModel: kb.embeddingModel || 'text-embedding-v3',
      embeddingDimension: kb.embeddingDimension || 1024,
      vectorStore: kb.vectorStore || 'pgvector',
      chunkSize: kb.chunkSize || 500, chunkOverlap: kb.chunkOverlap || 50,
      topK: kb.topK || 5, similarityThreshold: kb.similarityThreshold || 0.7,
      retrievalMode: kb.retrievalMode || 'vector',
      vectorWeight: kb.vectorWeight ?? 0.7,
      rrfK: kb.rrfK ?? 60,
    })
    setModalVisible(true)
  }

  const handleSaveKb = async () => {
    if (!formData.name) { message.error('请输入知识库名称'); return }
    try {
      if (editingKb) {
        await updateKnowledgeBase(editingKb.id, formData)
        message.success('知识库更新成功')
      } else {
        await createKnowledgeBase(formData)
        message.success('知识库创建成功')
      }
      setModalVisible(false)
    } catch { message.error('操作失败，请重试') }
  }

  const handleDeleteKb = async (id: string) => {
    try { await deleteKnowledgeBase(id); message.success('知识库删除成功') }
    catch { message.error('删除失败，请重试') }
  }

  const handleViewDocuments = async (kb: any) => {
    setSelectedKb(kb); setDocuments(kb.documents || []); setDocumentModalVisible(true)
  }

  const handleUploadDocument = async (options: any) => {
    const { file, onSuccess, onError } = options
    try {
      await uploadDocument(selectedKb.id, file)
      message.success('文档上传成功，正在后台处理向量化...')
      const updatedKb = await fetchKnowledgeBaseById(selectedKb.id)
      setDocuments(updatedKb.documents || [])
      onSuccess()
    } catch (error) {
      message.error((error as any)?.response?.data?.message || '上传失败，请重试')
      onError(error)
    }
  }

  const handleDeleteDocument = async (documentId: string) => {
    try {
      await deleteDocument(documentId); message.success('文档删除成功')
      const updatedKb = await fetchKnowledgeBaseById(selectedKb.id)
      setDocuments(updatedKb.documents || [])
    } catch { message.error('删除失败，请重试') }
  }

  const handleViewChunks = async (doc: any) => {
    setChunkDocName(doc.name); setChunks([]); setChunkModalVisible(true); setChunksLoading(true)
    try { const result = await fetchDocumentChunks(doc.id); setChunks(result.chunks || []) }
    catch { message.error('获取分块失败') }
    finally { setChunksLoading(false) }
  }

  const kbColumns = [
    {
      title: '知识库名称', dataIndex: 'name', key: 'name',
      render: (text: string, record: any) => (
        <div className="kb-table-name">
          <div className="kb-table-icon"><BookOutlined /></div>
          <div>
            <Text strong style={{ color: 'var(--c-text-primary)' }}>{text}</Text>
            <div className="kb-table-desc">{record.description || '暂无描述'}</div>
          </div>
        </div>
      ),
    },
    {
      title: '检索模式', dataIndex: 'retrievalMode', key: 'retrievalMode', width: 110,
      render: (mode: string) => {
        const opt = RETRIEVAL_MODE_OPTIONS.find((o) => o.value === mode) || RETRIEVAL_MODE_OPTIONS[0]
        return <Tag color={opt.color === '#1677ff' ? 'blue' : opt.color === '#52c41a' ? 'green' : 'purple'} style={{ margin: 0 }}>{opt.label}</Tag>
      },
    },
    {
      title: '向量配置', key: 'vectorConfig', width: 160,
      render: (_: any, record: any) => {
        const providerLabels: Record<string, string> = { qwen: 'Qwen', openai: 'OpenAI', ollama: 'Ollama' }
        const storeLabels: Record<string, string> = { pgvector: 'pgvector', qdrant: 'Qdrant', milvus: 'Milvus' }
        const provider = record.embeddingProvider || 'qwen'
        const store = record.vectorStore || 'pgvector'
        return (
          <Space size={4}>
            <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{providerLabels[provider] || provider}</Tag>
            <Tag color="green" style={{ fontSize: 11, margin: 0 }}>{storeLabels[store] || store}</Tag>
          </Space>
        )
      },
    },
    {
      title: '文档数量', key: 'documentCount', width: 90,
      render: (_: any, record: any) => <span className="kb-doc-count">{(record.documents || []).length} 份</span>,
    },
    {
      title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 120,
      render: (time: string) => <Text style={{ color: 'var(--c-text-secondary)', fontSize: 13 }}>{new Date(time).toLocaleDateString('zh-CN')}</Text>,
    },
    {
      title: '操作', key: 'action', width: 180,
      render: (_: any, record: any) => (
        <Space size="small" wrap>
          <Button icon={<FolderOpenOutlined />} size="small" className="action-btn action-btn--docs" onClick={() => handleViewDocuments(record)}>管理文档</Button>
          <Button icon={<EditOutlined />} size="small" type="text" className="action-btn" onClick={() => handleEditKb(record)} />
          <Button danger icon={<DeleteOutlined />} size="small" type="text" className="action-btn action-btn--danger" onClick={() => handleDeleteKb(record.id)} />
        </Space>
      ),
    },
  ]

  return (
    <div className="kb-page">
      <div className="kb-page-header">
        <div>
          <h2 className="kb-page-title">知识库</h2>
          <p className="kb-page-desc">管理文档资产，为 RAG 节点提供稳定可靠的检索素材。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddKb}>新建知识库</Button>
      </div>

      <div className="kb-stats-row">
        <div className="kb-stat-card">
          <span className="kb-stat-label">知识库总数</span>
          <span className="kb-stat-value">{safeKnowledgeBases.length}</span>
        </div>
        <div className="kb-stat-card">
          <span className="kb-stat-label">文档总量</span>
          <span className="kb-stat-value kb-stat-value--blue">{totalDocuments}</span>
        </div>
      </div>

      <div className="kb-table-card">
        {safeKnowledgeBases.length > 0 ? (
          <Table columns={kbColumns} dataSource={safeKnowledgeBases} rowKey="id" loading={isLoading} pagination={{ pageSize: 8, size: 'small' }} />
        ) : (
          <Empty description="还没有知识库，创建一个来上传文档吧" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '48px 0' }} />
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        title={editingKb ? '编辑知识库' : '新建知识库'}
        open={modalVisible} onOk={handleSaveKb} onCancel={() => setModalVisible(false)}
        confirmLoading={isLoading} okText={editingKb ? '保存修改' : '创建知识库'} cancelText="取消" width={560}
        okButtonProps={{ style: { background: 'var(--c-accent)', borderColor: 'var(--c-accent)' } }}
      >
        <div className="kb-modal-fields">
          <div className="kb-field">
            <label className="kb-field-label">知识库名称</label>
            <Input placeholder="给知识库起个名字" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div className="kb-field">
            <label className="kb-field-label">描述（可选）</label>
            <TextArea placeholder="这个知识库的用途，例如：产品手册、FAQ、SOP" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
          </div>

          <Divider orientation="left" style={{ fontSize: 13, color: 'var(--c-text-secondary)' }}>
            <SettingOutlined /> 高级配置
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="kb-field">
              <label className="kb-field-label"><RobotOutlined /> Embedding 服务</label>
              <Select value={formData.embeddingProvider} onChange={(val: EmbeddingProviderType) => {
                const models = EMBEDDING_MODELS[val]
                const defaultModel = models[0]
                setFormData({
                  ...formData,
                  embeddingProvider: val,
                  embeddingModel: defaultModel.value,
                  embeddingDimension: defaultModel.dimension,
                })
              }} style={{ width: '100%' }}
                options={[
                  { label: '通义千问 (Qwen)', value: 'qwen' },
                  { label: 'OpenAI', value: 'openai' },
                  { label: 'Ollama (本地)', value: 'ollama' },
                ]}
              />
            </div>
            <div className="kb-field">
              <label className="kb-field-label"><CloudServerOutlined /> 向量存储</label>
              <Select value={formData.vectorStore} onChange={(val: VectorStoreType) => setFormData({ ...formData, vectorStore: val })} style={{ width: '100%' }}
                options={VECTOR_STORE_OPTIONS.map((opt) => ({
                  label: <Tooltip title={opt.description}><span>{opt.label}</span></Tooltip>,
                  value: opt.value,
                }))}
              />
            </div>
            <div className="kb-field">
              <label className="kb-field-label"><SearchOutlined /> 检索模式</label>
              <Select value={formData.retrievalMode} onChange={(val: 'vector' | 'keyword' | 'hybrid') => setFormData({ ...formData, retrievalMode: val })} style={{ width: '100%' }}
                options={RETRIEVAL_MODE_OPTIONS.map((opt) => ({
                  label: <Tooltip title={opt.description}><span style={{ color: opt.color }}>{opt.label}</span></Tooltip>,
                  value: opt.value,
                }))}
              />
            </div>
            <div className="kb-field">
              <label className="kb-field-label">Embedding 模型</label>
              <Select value={formData.embeddingModel} onChange={(val) => {
                const models = EMBEDDING_MODELS[formData.embeddingProvider]
                const selected = models.find((m) => m.value === val)
                setFormData({ ...formData, embeddingModel: val, embeddingDimension: selected?.dimension || 1024 })
              }} style={{ width: '100%' }}
                options={EMBEDDING_MODELS[formData.embeddingProvider].map((m) => ({
                  label: m.label,
                  value: m.value,
                }))}
              />
            </div>
            <div className="kb-field">
              <label className="kb-field-label">向量维度</label>
              <Select value={formData.embeddingDimension} onChange={(val) => setFormData({ ...formData, embeddingDimension: val })} style={{ width: '100%' }}
                options={[formData.embeddingDimension].map((d) => ({ label: `${d}`, value: d }))}
              />
            </div>
            <div className="kb-field">
              <label className="kb-field-label">TopK</label>
              <InputNumber value={formData.topK} onChange={(val) => setFormData({ ...formData, topK: val || 5 })} min={1} max={20} style={{ width: '100%' }} />
            </div>
            <div className="kb-field">
              <label className="kb-field-label">分块大小: {formData.chunkSize}</label>
              <Slider value={formData.chunkSize} onChange={(val) => setFormData({ ...formData, chunkSize: val })} min={100} max={2000} step={50} />
            </div>
            <div className="kb-field">
              <label className="kb-field-label">分块重叠: {formData.chunkOverlap}</label>
              <Slider value={formData.chunkOverlap} onChange={(val) => setFormData({ ...formData, chunkOverlap: val })} min={0} max={500} step={10} />
            </div>
            <div className="kb-field" style={{ gridColumn: '1 / -1' }}>
              <label className="kb-field-label">相似度阈值: {formData.similarityThreshold}</label>
              <Slider value={formData.similarityThreshold} onChange={(val) => setFormData({ ...formData, similarityThreshold: val })} min={0} max={1} step={0.05} marks={{ 0: '0', 0.5: '0.5', 0.7: '0.7', 1: '1.0' }} />
            </div>
            {formData.retrievalMode === 'hybrid' && (
              <>
                <div className="kb-field" style={{ gridColumn: '1 / -1' }}>
                  <Divider orientation="left" style={{ fontSize: 12, color: 'var(--c-text-secondary)', margin: '8px 0' }}>
                    <ExperimentOutlined /> 混合检索配置
                  </Divider>
                </div>
                <div className="kb-field">
                  <label className="kb-field-label">
                    向量检索权重: {formData.vectorWeight}
                    <Tooltip title="向量检索在融合中的权重，关键词权重 = 1 - 向量权重。默认 0.7 偏向语义匹配。">
                      <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 12, color: 'var(--c-text-tertiary)' }} />
                    </Tooltip>
                  </label>
                  <Slider value={formData.vectorWeight} onChange={(val) => setFormData({ ...formData, vectorWeight: val })} min={0} max={1} step={0.05} marks={{ 0: '关键词', 0.5: '均衡', 0.7: '0.7', 1: '向量' }} />
                </div>
                <div className="kb-field">
                  <label className="kb-field-label">
                    RRF 常数 K: {formData.rrfK}
                    <Tooltip title="Reciprocal Rank Fusion 常数，增大则低排名结果影响增大（更平等），减小则偏向头部。学术推荐值 60。">
                      <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 12, color: 'var(--c-text-tertiary)' }} />
                    </Tooltip>
                  </label>
                  <Slider value={formData.rrfK} onChange={(val) => setFormData({ ...formData, rrfK: val })} min={1} max={200} step={1} marks={{ 1: '1', 60: '60', 100: '100', 200: '200' }} />
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Document Management Modal */}
      <Modal
        title={<div className="doc-modal-title"><DatabaseOutlined /><span>{selectedKb?.name} · 文档管理</span></div>}
        open={documentModalVisible} onCancel={() => setDocumentModalVisible(false)} width={880} footer={null}
      >
        <div className="doc-modal-body">
          <Dragger name="file" multiple={false} customRequest={handleUploadDocument} showUploadList={false} className="doc-dragger">
            <p className="ant-upload-drag-icon" style={{ marginBottom: 10 }}><InboxOutlined style={{ fontSize: 28, color: 'var(--c-accent)' }} /></p>
            <p className="doc-dragger-text">拖拽文件到此处，或点击上传</p>
            <p className="doc-dragger-hint">支持 txt、pdf、md 等格式，上传后即可用于 RAG 检索</p>
          </Dragger>
          <div className="doc-list-section">
            <div className="doc-list-header">
              <Text strong>已上传文档</Text>
              <Text style={{ color: 'var(--c-text-secondary)', fontSize: 13 }}>{documents.length ? `共 ${documents.length} 份` : '暂无文档'}</Text>
            </div>
            {documents.length === 0 ? (
              <Empty description="上传第一份文档后将在这里显示" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                columns={[
                  { title: '文件名', dataIndex: 'name', key: 'name', render: (name: string) => (<Space><FileTextOutlined style={{ color: 'var(--c-accent)' }} /><Text>{name}</Text></Space>) },
                  { title: '大小', dataIndex: 'size', key: 'size', width: 100, render: (size: number) => { if (size == null || isNaN(size)) return '-'; if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; return `${(size / 1024 / 1024).toFixed(1)} MB` } },
                  { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: (status: string) => { const statusMap: Record<string, { label: string; color: string }> = { processing: { label: '处理中', color: '#faad14' }, completed: { label: '已完成', color: '#52c41a' }, failed: { label: '失败', color: '#ff4d4f' } }; const s = statusMap[status] || statusMap.completed; return <span style={{ color: s.color }}>{s.label}</span> } },
                  { title: '上传时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (time: string) => new Date(time).toLocaleString('zh-CN') },
                  { title: '操作', key: 'action', width: 140, render: (_: any, record: any) => (<Space size="small"><Button icon={<BlockOutlined />} size="small" type="text" onClick={() => handleViewChunks(record)} className="action-btn">分块</Button><Button icon={<DeleteOutlined />} size="small" danger type="text" onClick={() => handleDeleteDocument(record.id)} loading={isLoading} className="action-btn" /></Space>) },
                ]}
                dataSource={documents} rowKey="id" pagination={false} size="small"
              />
            )}
          </div>
        </div>
      </Modal>

      {/* Chunk Preview Modal */}
      <Modal
        title={<div className="chunk-modal-title"><button className="chunk-back-btn" onClick={() => setChunkModalVisible(false)}><ArrowLeftOutlined /></button><BlockOutlined /><span>文档分块预览</span><span className="chunk-doc-name">{chunkDocName}</span></div>}
        open={chunkModalVisible} onCancel={() => setChunkModalVisible(false)} width={720} footer={null}
      >
        <div className="chunk-modal-body">
          {chunksLoading ? (
            <div className="chunk-loading"><Spin size="large" /><Text style={{ color: 'var(--c-text-secondary)', marginTop: 12 }}>正在加载分块数据…</Text></div>
          ) : chunks.length > 0 ? (
            <><div className="chunk-summary">共 <strong>{chunks.length}</strong> 个分块</div><div className="chunk-list">{chunks.map((chunk, idx) => (<div key={chunk.id} className="chunk-card"><div className="chunk-card-header"><span className="chunk-index">#{idx + 1}</span><span className="chunk-meta">{chunk.content.length} 字符</span></div><pre className="chunk-content">{chunk.content}</pre></div>))}</div></>
          ) : (
            <Empty description="该文档暂无分块数据" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '48px 0' }} />
          )}
        </div>
      </Modal>
    </div>
  )
}

export default KnowledgeBase
