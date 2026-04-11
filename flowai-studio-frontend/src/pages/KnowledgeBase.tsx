import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Table, message, Modal, Upload, Space, Typography, Empty, Spin } from 'antd'
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
} from '@ant-design/icons'
import { useStore } from '../store'
import { DocumentChunk } from '../types'
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
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [documents, setDocuments] = useState<any[]>([])

  // Chunk preview state
  const [chunkModalVisible, setChunkModalVisible] = useState(false)
  const [chunkDocName, setChunkDocName] = useState('')
  const [chunks, setChunks] = useState<DocumentChunk[]>([])
  const [chunksLoading, setChunksLoading] = useState(false)

  useEffect(() => {
    fetchKnowledgeBases()
  }, [])

  const safeKnowledgeBases = Array.isArray(knowledgeBases) ? knowledgeBases : []

  const totalDocuments = useMemo(
    () => safeKnowledgeBases.reduce((count, kb) => count + (kb.documents?.length || 0), 0),
    [safeKnowledgeBases],
  )

  const handleAddKb = () => {
    setEditingKb(null)
    setFormData({ name: '', description: '' })
    setModalVisible(true)
  }

  const handleEditKb = (kb: any) => {
    setEditingKb(kb)
    setFormData({ name: kb.name, description: kb.description })
    setModalVisible(true)
  }

  const handleSaveKb = async () => {
    if (!formData.name) {
      message.error('请输入知识库名称')
      return
    }
    try {
      if (editingKb) {
        await updateKnowledgeBase(editingKb.id, formData)
        message.success('知识库更新成功')
      } else {
        await createKnowledgeBase(formData)
        message.success('知识库创建成功')
      }
      setModalVisible(false)
    } catch {
      message.error('操作失败，请重试')
    }
  }

  const handleDeleteKb = async (id: string) => {
    try {
      await deleteKnowledgeBase(id)
      message.success('知识库删除成功')
    } catch {
      message.error('删除失败，请重试')
    }
  }

  const handleViewDocuments = async (kb: any) => {
    setSelectedKb(kb)
    setDocuments(kb.documents || [])
    setDocumentModalVisible(true)
  }

  const handleUploadDocument = async (options: any) => {
    const { file, onSuccess, onError } = options
    try {
      await uploadDocument(selectedKb.id, file)
      message.success('文档上传成功')
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
      await deleteDocument(documentId)
      message.success('文档删除成功')
      const updatedKb = await fetchKnowledgeBaseById(selectedKb.id)
      setDocuments(updatedKb.documents || [])
    } catch {
      message.error('删除失败，请重试')
    }
  }

  const handleViewChunks = async (doc: any) => {
    setChunkDocName(doc.name)
    setChunks([])
    setChunkModalVisible(true)
    setChunksLoading(true)
    try {
      const result = await fetchDocumentChunks(doc.id)
      setChunks(result.chunks || [])
    } catch {
      message.error('获取分块失败')
    } finally {
      setChunksLoading(false)
    }
  }

  const kbColumns = [
    {
      title: '知识库名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <div className="kb-table-name">
          <div className="kb-table-icon">
            <BookOutlined />
          </div>
          <div>
            <Text strong style={{ color: 'var(--c-text-primary)' }}>{text}</Text>
            <div className="kb-table-desc">
              {record.description || '暂无描述'}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '文档数量',
      key: 'documentCount',
      render: (_: any, record: any) => (
        <span className="kb-doc-count">
          {(record.documents || []).length} 份
        </span>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time: string) => (
        <Text style={{ color: 'var(--c-text-secondary)', fontSize: 13 }}>
          {new Date(time).toLocaleDateString('zh-CN')}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space size="small" wrap>
          <Button
            icon={<FolderOpenOutlined />}
            size="small"
            className="action-btn action-btn--docs"
            onClick={() => handleViewDocuments(record)}
          >
            管理文档
          </Button>
          <Button
            icon={<EditOutlined />}
            size="small"
            type="text"
            className="action-btn"
            onClick={() => handleEditKb(record)}
          />
          <Button
            danger
            icon={<DeleteOutlined />}
            size="small"
            type="text"
            className="action-btn action-btn--danger"
            onClick={() => handleDeleteKb(record.id)}
          />
        </Space>
      ),
    },
  ]

  return (
    <div className="kb-page">
      {/* Page header */}
      <div className="kb-page-header">
        <div>
          <h2 className="kb-page-title">知识库</h2>
          <p className="kb-page-desc">管理文档资产，为 RAG 节点提供稳定可靠的检索素材。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddKb}>
          新建知识库
        </Button>
      </div>

      {/* Stats */}
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

      {/* Table card */}
      <div className="kb-table-card">
        {safeKnowledgeBases.length > 0 ? (
          <Table
            columns={kbColumns}
            dataSource={safeKnowledgeBases}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 8, size: 'small' }}
          />
        ) : (
          <Empty
            description="还没有知识库，创建一个来上传文档吧"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '48px 0' }}
          />
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        title={editingKb ? '编辑知识库' : '新建知识库'}
        open={modalVisible}
        onOk={handleSaveKb}
        onCancel={() => setModalVisible(false)}
        confirmLoading={isLoading}
        okText={editingKb ? '保存修改' : '创建知识库'}
        cancelText="取消"
        width={480}
        okButtonProps={{ style: { background: 'var(--c-accent)', borderColor: 'var(--c-accent)' } }}
      >
        <div className="kb-modal-fields">
          <div className="kb-field">
            <label className="kb-field-label">知识库名称</label>
            <Input
              placeholder="给知识库起个名字"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="kb-field">
            <label className="kb-field-label">描述（可选）</label>
            <TextArea
              placeholder="这个知识库的用途，例如：产品手册、FAQ、SOP"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* Document Management Modal */}
      <Modal
        title={
          <div className="doc-modal-title">
            <DatabaseOutlined />
            <span>{selectedKb?.name} · 文档管理</span>
          </div>
        }
        open={documentModalVisible}
        onCancel={() => setDocumentModalVisible(false)}
        width={880}
        footer={null}
      >
        <div className="doc-modal-body">
          {/* Upload */}
          <Dragger
            name="file"
            multiple={false}
            customRequest={handleUploadDocument}
            showUploadList={false}
            className="doc-dragger"
          >
            <p className="ant-upload-drag-icon" style={{ marginBottom: 10 }}>
              <InboxOutlined style={{ fontSize: 28, color: 'var(--c-accent)' }} />
            </p>
            <p className="doc-dragger-text">拖拽文件到此处，或点击上传</p>
            <p className="doc-dragger-hint">支持 txt、pdf、md 等格式，上传后即可用于 RAG 检索</p>
          </Dragger>

          {/* Document list */}
          <div className="doc-list-section">
            <div className="doc-list-header">
              <Text strong>已上传文档</Text>
              <Text style={{ color: 'var(--c-text-secondary)', fontSize: 13 }}>
                {documents.length ? `共 ${documents.length} 份` : '暂无文档'}
              </Text>
            </div>

            {documents.length === 0 ? (
              <Empty description="上传第一份文档后将在这里显示" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                columns={[
                  {
                    title: '文件名',
                    dataIndex: 'name',
                    key: 'name',
                    render: (name: string) => (
                      <Space>
                        <FileTextOutlined style={{ color: 'var(--c-accent)' }} />
                        <Text>{name}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: '大小',
                    dataIndex: 'size',
                    key: 'size',
                    width: 100,
                    render: (size: number) => {
                      if (size == null || isNaN(size)) return '-'
                      if (size < 1024) return `${size} B`
                      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
                      return `${(size / 1024 / 1024).toFixed(1)} MB`
                    },
                  },
                  {
                    title: '上传时间',
                    dataIndex: 'createdAt',
                    key: 'createdAt',
                    width: 170,
                    render: (time: string) => new Date(time).toLocaleString('zh-CN'),
                  },
                  {
                    title: '操作',
                    key: 'action',
                    width: 140,
                    render: (_: any, record: any) => (
                      <Space size="small">
                        <Button
                          icon={<BlockOutlined />}
                          size="small"
                          type="text"
                          onClick={() => handleViewChunks(record)}
                          className="action-btn"
                        >
                          分块
                        </Button>
                        <Button
                          icon={<DeleteOutlined />}
                          size="small"
                          danger
                          type="text"
                          onClick={() => handleDeleteDocument(record.id)}
                          loading={isLoading}
                          className="action-btn"
                        />
                      </Space>
                    ),
                  },
                ]}
                dataSource={documents}
                rowKey="id"
                pagination={false}
                size="small"
              />
            )}
          </div>
        </div>
      </Modal>

      {/* Chunk Preview Modal */}
      <Modal
        title={
          <div className="chunk-modal-title">
            <button className="chunk-back-btn" onClick={() => setChunkModalVisible(false)}>
              <ArrowLeftOutlined />
            </button>
            <BlockOutlined />
            <span>文档分块预览</span>
            <span className="chunk-doc-name">{chunkDocName}</span>
          </div>
        }
        open={chunkModalVisible}
        onCancel={() => setChunkModalVisible(false)}
        width={720}
        footer={null}
      >
        <div className="chunk-modal-body">
          {chunksLoading ? (
            <div className="chunk-loading">
              <Spin size="large" />
              <Text style={{ color: 'var(--c-text-secondary)', marginTop: 12 }}>正在加载分块数据…</Text>
            </div>
          ) : chunks.length > 0 ? (
            <>
              <div className="chunk-summary">
                共 <strong>{chunks.length}</strong> 个分块
              </div>
              <div className="chunk-list">
                {chunks.map((chunk, idx) => (
                  <div key={chunk.id} className="chunk-card">
                    <div className="chunk-card-header">
                      <span className="chunk-index">#{idx + 1}</span>
                      <span className="chunk-meta">
                        {chunk.content.length} 字符
                      </span>
                    </div>
                    <pre className="chunk-content">{chunk.content}</pre>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty
              description="该文档暂无分块数据"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: '48px 0' }}
            />
          )}
        </div>
      </Modal>
    </div>
  )
}

export default KnowledgeBase
