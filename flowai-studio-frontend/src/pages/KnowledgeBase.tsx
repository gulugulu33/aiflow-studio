import { useState, useEffect } from 'react'
import { Card, Button, Input, Table, Tag, message, Modal, Upload, Space, Typography, Spin, Empty } from 'antd'
import { PlusOutlined, UploadOutlined, DeleteOutlined, EditOutlined, FileTextOutlined, BookOutlined, FolderOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import './KnowledgeBase.css'

const { Title, Text } = Typography
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
    deleteDocument 
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
    } catch (error) {
      message.error('操作失败，请重试')
    }
  }

  const handleDeleteKb = async (id: string) => {
    try {
      await deleteKnowledgeBase(id)
      message.success('知识库删除成功')
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const handleViewDocuments = async (kb: any) => {
    setSelectedKb(kb)
    setDocuments(kb.documents || [])
    setDocumentModalVisible(true)
  }

  const safeKnowledgeBases = Array.isArray(knowledgeBases) ? knowledgeBases : []

  const handleUploadDocument = async (options: any) => {
    const { file, onSuccess, onError } = options
    try {
      await uploadDocument(selectedKb.id, file)
      message.success('文档上传成功')
      // 刷新当前知识库的文档列表
      const updatedKb = await fetchKnowledgeBaseById(selectedKb.id)
      setDocuments(updatedKb.documents || [])
      onSuccess()
    } catch (error) {
      message.error('上传失败，请重试')
      onError(error)
    }
  }

  const handleDeleteDocument = async (documentId: string) => {
    try {
      await deleteDocument(documentId)
      message.success('文档删除成功')
      // 刷新当前知识库的文档列表
      const updatedKb = await fetchKnowledgeBaseById(selectedKb.id)
      setDocuments(updatedKb.documents || [])
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const kbColumns = [
    {
      title: '知识库名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <BookOutlined className="kb-icon" />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => text || <Text type="secondary">无描述</Text>,
    },
    {
      title: '文档数',
      key: 'documentCount',
      render: (_: any, record: any) => (record.documents || []).length,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space size="middle">
          <Button type="link" icon={<FolderOutlined />} onClick={() => handleViewDocuments(record)}>
            管理文档
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEditKb(record)}>
            编辑
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeleteKb(record.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="kb-list">
      <div className="kb-header">
        <Title level={4}>知识库管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddKb}>
          新建知识库
        </Button>
      </div>

      <Card className="kb-card">
        {safeKnowledgeBases.length > 0 ? (
          <Table 
            columns={kbColumns} 
            dataSource={safeKnowledgeBases} 
            rowKey="id" 
            loading={isLoading} 
          />
        ) : (
          <Empty description="暂无知识库" />
        )}
      </Card>

      {/* 知识库编辑模态框 */}
      <Modal
        title={editingKb ? '编辑知识库' : '新建知识库'}
        open={modalVisible}
        onOk={handleSaveKb}
        onCancel={() => setModalVisible(false)}
        confirmLoading={isLoading}
      >
        <Input
          placeholder="知识库名称"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="mb-4"
        />
        <TextArea
          placeholder="知识库描述"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
        />
      </Modal>

      {/* 文档管理模态框 */}
      <Modal
        title={`${selectedKb?.name} - 文档管理`}
        open={documentModalVisible}
        onCancel={() => setDocumentModalVisible(false)}
        width={800}
        footer={null}
      >
        <div className="document-upload-section">
          <Dragger
            name="file"
            multiple={false}
            customRequest={handleUploadDocument}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              支持 txt、pdf、md 等文本格式文件
            </p>
          </Dragger>
        </div>

        <div className="document-list-section mt-4">
          <h5 className="mb-2">已上传文档</h5>
          {documents.length === 0 ? (
            <Text type="secondary">暂无文档</Text>
          ) : (
            <Table
              columns={[
                {
                  title: '文件名',
                  dataIndex: 'name',
                  key: 'name',
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
      </Modal>
    </div>
  )
}

export default KnowledgeBase
