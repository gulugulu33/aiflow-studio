import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, Table, message, Modal, Upload, Space, Typography, Empty, Tag } from 'antd'
import { PlusOutlined, UploadOutlined, DeleteOutlined, EditOutlined, BookOutlined, FolderOutlined, FileTextOutlined, DatabaseOutlined, InboxOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import './KnowledgeBase.css'

const { Title, Text, Paragraph } = Typography
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
  } = useStore()
  const [modalVisible, setModalVisible] = useState(false)
  const [documentModalVisible, setDocumentModalVisible] = useState(false)
  const [editingKb, setEditingKb] = useState<any>(null)
  const [selectedKb, setSelectedKb] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  })
  const [documents, setDocuments] = useState<any[]>([])

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
            <Text strong>{text}</Text>
            <Paragraph ellipsis={{ rows: 1 }}>
              {record.description || '为这个知识库补充一句说明，方便团队快速识别用途。'}
            </Paragraph>
          </div>
        </div>
      ),
    },
    {
      title: '文档规模',
      key: 'documentCount',
      render: (_: any, record: any) => (
        <Tag className="kb-table-tag" bordered={false}>
          {(record.documents || []).length} 份文档
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time: string) => <Text type="secondary">{new Date(time).toLocaleString()}</Text>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space size="small" wrap>
          <Button icon={<FolderOutlined />} size="small" onClick={() => handleViewDocuments(record)}>
            管理文档
          </Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEditKb(record)}>
            编辑
          </Button>
          <Button danger icon={<DeleteOutlined />} size="small" onClick={() => handleDeleteKb(record.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="knowledge-page">
      <div className="page-hero kb-hero">
        <div>
          <div className="page-eyebrow">Knowledge</div>
          <Title level={3}>知识库中心</Title>
          <Paragraph>
            在一个统一工作区里整理知识库、上传文档并维护检索素材，让 RAG 节点调用更稳定。
          </Paragraph>
        </div>
        <div className="page-hero-stats kb-hero-stats">
          <div>
            <span>知识库总数</span>
            <strong>{safeKnowledgeBases.length}</strong>
          </div>
          <div>
            <span>文档总量</span>
            <strong>{totalDocuments}</strong>
          </div>
        </div>
      </div>

      <div className="kb-toolbar">
        <div className="kb-toolbar-copy">
          <Text>管理知识库元信息、文档资产和后续检索输入。</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddKb}>
          新建知识库
        </Button>
      </div>

      <Card className="page-card kb-card">
        {safeKnowledgeBases.length > 0 ? (
          <Table columns={kbColumns} dataSource={safeKnowledgeBases} rowKey="id" loading={isLoading} pagination={{ pageSize: 8 }} />
        ) : (
          <Empty
            description="还没有知识库，先创建一个用于挂载文档和检索上下文。"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </Card>

      <Modal
        title={editingKb ? '编辑知识库' : '新建知识库'}
        open={modalVisible}
        onOk={handleSaveKb}
        onCancel={() => setModalVisible(false)}
        confirmLoading={isLoading}
        okText={editingKb ? '保存修改' : '创建知识库'}
        cancelText="取消"
      >
        <div className="kb-modal-fields">
          <Input
            placeholder="知识库名称"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <TextArea
            placeholder="知识库描述，例如：产品手册、FAQ、内部 SOP"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
          />
        </div>
      </Modal>

      <Modal
        title={
          <div className="document-modal-title">
            <DatabaseOutlined />
            <span>{selectedKb?.name || '知识库'} · 文档管理</span>
          </div>
        }
        open={documentModalVisible}
        onCancel={() => setDocumentModalVisible(false)}
        width={920}
        footer={null}
      >
        <div className="document-modal-shell">
          <div className="document-upload-section">
            <Dragger name="file" multiple={false} customRequest={handleUploadDocument} showUploadList={false}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">拖拽文件到此处，或点击上传</p>
              <p className="ant-upload-hint">支持 txt、pdf、md 等文本格式，上传后可用于检索与问答。</p>
            </Dragger>
          </div>

          <div className="document-list-section">
            <div className="document-section-header">
              <div>
                <Text strong>已上传文档</Text>
                <Paragraph>{documents.length ? `当前共 ${documents.length} 份文档` : '上传第一份文档后，这里会显示文档列表。'}</Paragraph>
              </div>
            </div>

            {documents.length === 0 ? (
              <Empty description="暂无文档" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                columns={[
                  {
                    title: '文件名',
                    dataIndex: 'name',
                    key: 'name',
                    render: (name: string) => (
                      <Space>
                        <FileTextOutlined className="document-file-icon" />
                        <Text>{name}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: '大小',
                    dataIndex: 'size',
                    key: 'size',
                    render: (size: number) => `${(size / 1024).toFixed(2)} KB`,
                  },
                  {
                    title: '上传时间',
                    dataIndex: 'createdAt',
                    key: 'createdAt',
                    render: (time: string) => new Date(time).toLocaleString(),
                  },
                  {
                    title: '操作',
                    key: 'action',
                    render: (_: any, record: any) => (
                      <Button
                        icon={<DeleteOutlined />}
                        size="small"
                        danger
                        onClick={() => handleDeleteDocument(record.id)}
                        loading={isLoading}
                      >
                        删除
                      </Button>
                    ),
                  },
                ]}
                dataSource={documents}
                rowKey="id"
                pagination={false}
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default KnowledgeBase
