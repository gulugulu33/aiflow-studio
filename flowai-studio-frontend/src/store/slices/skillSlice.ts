import { StateCreator } from 'zustand'
import { Skill } from '../../types'
import request from '../../utils/axios'

export interface SkillSlice {
  skills: Skill[]
  isLoading: boolean
  error: string | null
  
  // Actions
  setSkills: (skills: Skill[]) => void
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  fetchSkills: () => Promise<void>
  createSkill: (data: { name: string; description?: string; type: string; builtinType?: string; isActive?: boolean }) => Promise<Skill>
  updateSkill: (id: string, data: { name?: string; description?: string; type?: string; builtinType?: string; isActive?: boolean }) => Promise<Skill>
  deleteSkill: (id: string) => Promise<void>
  executeSkill: (skillId: string, params: Record<string, any>) => Promise<any>
  getBuiltinSkills: () => Promise<any[]>
}

export const createSkillSlice: StateCreator<SkillSlice> = (set, get) => ({
  skills: [],
  isLoading: false,
  error: null,

  setSkills: (skills) => set({ skills }),
  
  setIsLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),

  fetchSkills: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.get('/skill') as any
      const skills = (Array.isArray(response.data) ? response.data : [])
      set({ skills, isLoading: false })
    } catch (error) {
      set({ error: 'Failed to fetch skills', isLoading: false, skills: [] })
      throw error
    }
  },

  createSkill: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.post('/skill', data) as any
      const skill = response.data
      const currentSkills = Array.isArray(get().skills) ? get().skills : []
      set({ 
        skills: [...currentSkills, skill],
        isLoading: false 
      })
      return skill
    } catch (error) {
      set({ error: 'Failed to create skill', isLoading: false })
      throw error
    }
  },

  updateSkill: async (id, data) => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.put(`/skill/${id}`, data) as any
      const updatedSkill = response.data
      const currentSkills = Array.isArray(get().skills) ? get().skills : []
      set({
        skills: currentSkills.map(skill => skill.id === id ? updatedSkill : skill),
        isLoading: false,
      })
      return updatedSkill
    } catch (error) {
      set({ error: 'Failed to update skill', isLoading: false })
      throw error
    }
  },

  deleteSkill: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await request.delete(`/skill/${id}`)
      const currentSkills = Array.isArray(get().skills) ? get().skills : []
      set({
        skills: currentSkills.filter(skill => skill.id !== id),
        isLoading: false,
      })
    } catch (error) {
      set({ error: 'Failed to delete skill', isLoading: false })
      throw error
    }
  },

  executeSkill: async (skillId, params) => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.post(`/skill/${skillId}/execute`, { params }) as any
      set({ isLoading: false })
      return response.data
    } catch (error) {
      set({ error: 'Failed to execute skill', isLoading: false })
      throw error
    }
  },

  getBuiltinSkills: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await request.get('/skill/builtin/list') as any
      set({ isLoading: false })
      return response.data || []
    } catch (error) {
      set({ error: 'Failed to fetch builtin skills', isLoading: false })
      throw error
    }
  },
})
