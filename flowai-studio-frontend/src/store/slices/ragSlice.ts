import { StateCreator } from 'zustand'
import { KnowledgeBase, Document, DocumentChunksResponse } from '../../types'
import request from '../../utils/axios'

export interface RAGSlice {
  knowledgeBases: KnowledgeBase[]
  currentKnowledgeBase: KnowledgeBase | null
  documents: Document[]
  isLoading: boolean
  error: string | null
  
  // Actions
  setKnowledgeBases: (knowledgeBases: KnowledgeBase[]) => void
  setCurrentKnowledgeBase: (knowledgeBase: KnowledgeBase | null) => void
  setDocuments: (documents: Document[]) => void
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  fetchKnowledgeBases: () => Promise<void>
  fetchKnowledgeBaseById: (id: string) => Promise<KnowledgeBase>
  createKnowledgeBase: (data: { name: string; description?: string }) => Promise<KnowledgeBase>
  updateKnowledgeBase: (id: string, data: { name?: string; description?: string }) => Promise<KnowledgeBase>
  deleteKnowledgeBase: (id: string) => Promise<void>
  uploadDocument: (knowledgeBaseId: string, file: File) => Promise<Document>
  deleteDocument: (documentId: string) => Promise<void>
  fetchDocumentChunks: (documentId: string) => Promise<DocumentChunksResponse>
  retrieve: (query: string, knowledgeBaseId: string, topK?: number) => Promise<any>
}

export const createRAGSlice: StateCreator<RAGSlice> = (set, get) => ({
  knowledgeBases: [],
  currentKnowledgeBase: null,
  documents: [],
  isLoading: false,
  error: null,

  setKnowledgeBases: (knowledgeBases) => set({ knowledgeBases }),
  
  setCurrentKnowledgeBase: (knowledgeBase) => set({ currentKnowledgeBase: knowledgeBase }),
  
  setDocuments: (documents) => set({ documents }),
  
  setIsLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),

  fetchKnowledgeBases: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.get('/rag/knowledge-bases') as any
      const knowledgeBases = (Array.isArray(response.data) ? response.data : [])
      set({ knowledgeBases, isLoading: false })
    } catch (error) {
      set({ error: 'Failed to fetch knowledge bases', isLoading: false, knowledgeBases: [] })
      throw error
    }
  },

  fetchKnowledgeBaseById: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.get(`/rag/knowledge-bases/${id}`) as any
      const knowledgeBase = response.data
      set({ currentKnowledgeBase: knowledgeBase, documents: knowledgeBase.documents || [], isLoading: false })
      return knowledgeBase
    } catch (error) {
      set({ error: 'Failed to fetch knowledge base', isLoading: false })
      throw error
    }
  },

  createKnowledgeBase: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.post('/rag/knowledge-bases', data) as any
      const knowledgeBase = response.data
      const currentKBs = Array.isArray(get().knowledgeBases) ? get().knowledgeBases : []
      set({ 
        knowledgeBases: [...currentKBs, knowledgeBase],
        isLoading: false 
      })
      return knowledgeBase
    } catch (error) {
      set({ error: 'Failed to create knowledge base', isLoading: false })
      throw error
    }
  },

  updateKnowledgeBase: async (id, data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.patch(`/rag/knowledge-bases/${id}`, data) as any
      const updatedKnowledgeBase = response.data
      const currentKBs = Array.isArray(get().knowledgeBases) ? get().knowledgeBases : []
      set({
        knowledgeBases: currentKBs.map(kb => kb.id === id ? updatedKnowledgeBase : kb),
        currentKnowledgeBase: get().currentKnowledgeBase?.id === id ? updatedKnowledgeBase : get().currentKnowledgeBase,
        isLoading: false,
      })
      return updatedKnowledgeBase
    } catch (error) {
      set({ error: 'Failed to update knowledge base', isLoading: false })
      throw error
    }
  },

  deleteKnowledgeBase: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await request.delete(`/rag/knowledge-bases/${id}`)
      set({
        knowledgeBases: get().knowledgeBases.filter(kb => kb.id !== id),
        currentKnowledgeBase: get().currentKnowledgeBase?.id === id ? null : get().currentKnowledgeBase,
        isLoading: false,
      })
    } catch (error) {
      set({ error: 'Failed to delete knowledge base', isLoading: false })
      throw error
    }
  },

  uploadDocument: async (knowledgeBaseId, file) => {
    set({ isLoading: true, error: null })
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('knowledgeBaseId', knowledgeBaseId)

      const response = await request.post('/rag/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }) as any

      const document = response.data
      
      // 刷新知识库列表
      await get().fetchKnowledgeBases()
      
      // 刷新当前知识库的文档列表
      if (get().currentKnowledgeBase?.id === knowledgeBaseId) {
        await get().fetchKnowledgeBaseById(knowledgeBaseId)
      }

      set({ isLoading: false, error: null })
      return document
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        '文档上传失败'
      set({ error: message, isLoading: false })
      throw error
    }
  },

  deleteDocument: async (documentId) => {
    set({ isLoading: true, error: null })
    try {
      await request.delete(`/rag/documents/${documentId}`)
      
      // 刷新知识库列表
      await get().fetchKnowledgeBases()
      
      // 刷新当前知识库的文档列表
      if (get().currentKnowledgeBase) {
        await get().fetchKnowledgeBaseById(get().currentKnowledgeBase.id)
      }

      set({ isLoading: false })
    } catch (error) {
      set({ error: 'Failed to delete document', isLoading: false })
      throw error
    }
  },

  fetchDocumentChunks: async (documentId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.get(`/rag/documents/${documentId}/chunks`) as any
      set({ isLoading: false })
      return response.data
    } catch (error) {
      set({ error: 'Failed to fetch document chunks', isLoading: false })
      throw error
    }
  },

  retrieve: async (query, knowledgeBaseId, topK = 5) => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.post('/rag/retrieve', {
        query,
        knowledgeBaseId,
        topK,
      }) as any
      set({ isLoading: false })
      return response.data
    } catch (error) {
      set({ error: 'Failed to retrieve documents', isLoading: false })
      throw error
    }
  },
})
