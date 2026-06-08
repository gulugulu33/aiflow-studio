import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createUserSlice } from './slices/userSlice'
import { AppSlice, createAppSlice } from './slices/appSlice'
import { WorkflowSlice, createWorkflowSlice } from './slices/workflowSlice'
import { GlobalSlice, createGlobalSlice } from './slices/globalSlice'
import { RAGSlice, createRAGSlice } from './slices/ragSlice'
import { SkillSlice, createSkillSlice } from './slices/skillSlice'
import { TemplateSlice, createTemplateSlice } from './slices/templateSlice'

type StoreState = ReturnType<typeof createUserSlice> &
  ReturnType<typeof createAppSlice> &
  ReturnType<typeof createWorkflowSlice> &
  ReturnType<typeof createGlobalSlice> &
  ReturnType<typeof createRAGSlice> &
  ReturnType<typeof createSkillSlice> &
  ReturnType<typeof createTemplateSlice>

export const useStore = create<StoreState>()(
  persist(
    (...args) => ({
      ...createUserSlice(...args),
      ...createAppSlice(...args),
      ...createWorkflowSlice(...args),
      ...createGlobalSlice(...args),
      ...createRAGSlice(...args),
      ...createSkillSlice(...args),
      ...createTemplateSlice(...args),
    }),
    {
      name: 'flowai-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        globalConfig: state.globalConfig,
      }),
    }
  )
)

export * from './slices/userSlice'
export * from './slices/appSlice'
export * from './slices/workflowSlice'
export * from './slices/globalSlice'
export * from './slices/ragSlice'
export * from './slices/skillSlice'
export * from './slices/templateSlice'
