import { StateCreator } from 'zustand'
import { WorkflowTemplate, TemplateCategoryCount, TemplateSort, TemplateCategory } from '../../types'
import request from '../../utils/axios'

export interface TemplateSlice {
  templates: WorkflowTemplate[]
  templateTotal: number
  templatePage: number
  templatePageSize: number
  templateTotalPages: number
  templateCategories: TemplateCategoryCount[]
  templateLoading: boolean
  templateError: string | null

  // Actions
  fetchTemplates: (params?: {
    keyword?: string
    category?: TemplateCategory
    tag?: string
    isOfficial?: boolean
    sort?: TemplateSort
    page?: number
    pageSize?: number
  }) => Promise<void>
  fetchTemplateCategories: () => Promise<void>
  fetchTemplateById: (id: string) => Promise<WorkflowTemplate>
  createTemplate: (data: {
    name: string
    description?: string
    icon?: string
    screenshot?: string
    category: TemplateCategory
    tags?: string[]
    isOfficial?: boolean
    sourceWorkflowId?: string
  }) => Promise<WorkflowTemplate>
  updateTemplate: (id: string, data: {
    name?: string
    description?: string
    icon?: string
    screenshot?: string
    category?: TemplateCategory
    tags?: string[]
  }) => Promise<WorkflowTemplate>
  publishTemplate: (id: string) => Promise<WorkflowTemplate>
  archiveTemplate: (id: string) => Promise<WorkflowTemplate>
  createFromTemplate: (id: string, data: { applicationId: string; name?: string }) => Promise<{
    workflowId: string
    name: string
    templateName: string
    templateId: string
  }>
  rateTemplate: (id: string, rating: number) => Promise<{
    rating: number
    ratingCount: number
    yourRating: number
  }>
  deleteTemplate: (id: string) => Promise<void>
}

export const createTemplateSlice: StateCreator<TemplateSlice> = (set, get) => ({
  templates: [],
  templateTotal: 0,
  templatePage: 1,
  templatePageSize: 20,
  templateTotalPages: 0,
  templateCategories: [],
  templateLoading: false,
  templateError: null,

  fetchTemplates: async (params = {}) => {
    set({ templateLoading: true, templateError: null })
    try {
      const response = await request.get('/workflow/templates', { params }) as any
      const data = response.data
      set({
        templates: data.items || [],
        templateTotal: data.total || 0,
        templatePage: data.page || 1,
        templatePageSize: data.pageSize || 20,
        templateTotalPages: data.totalPages || 0,
        templateLoading: false,
      })
    } catch (error) {
      set({ templateError: '获取模板列表失败', templateLoading: false })
      throw error
    }
  },

  fetchTemplateCategories: async () => {
    try {
      const response = await request.get('/workflow/templates/categories') as any
      set({ templateCategories: response.data || [] })
    } catch (error) {
      console.error('Failed to fetch template categories', error)
    }
  },

  fetchTemplateById: async (id) => {
    try {
      const response = await request.get(`/workflow/templates/${id}`) as any
      return response.data
    } catch (error) {
      throw error
    }
  },

  createTemplate: async (data) => {
    set({ templateLoading: true, templateError: null })
    try {
      const response = await request.post('/workflow/templates', data) as any
      const template = response.data
      set({ templateLoading: false })
      return template
    } catch (error) {
      set({ templateError: '创建模板失败', templateLoading: false })
      throw error
    }
  },

  updateTemplate: async (id, data) => {
    try {
      const response = await request.patch(`/workflow/templates/${id}`, data) as any
      return response.data
    } catch (error) {
      throw error
    }
  },

  publishTemplate: async (id) => {
    try {
      const response = await request.post(`/workflow/templates/${id}/publish`) as any
      return response.data
    } catch (error) {
      throw error
    }
  },

  archiveTemplate: async (id) => {
    try {
      const response = await request.post(`/workflow/templates/${id}/archive`) as any
      return response.data
    } catch (error) {
      throw error
    }
  },

  createFromTemplate: async (id, data) => {
    try {
      const response = await request.post(`/workflow/templates/${id}/import`, data) as any
      return response.data
    } catch (error) {
      throw error
    }
  },

  rateTemplate: async (id, rating) => {
    try {
      const response = await request.post(`/workflow/templates/${id}/rate`, { rating }) as any
      return response.data
    } catch (error) {
      throw error
    }
  },

  deleteTemplate: async (id) => {
    try {
      await request.delete(`/workflow/templates/${id}`)
    } catch (error) {
      throw error
    }
  },
})
