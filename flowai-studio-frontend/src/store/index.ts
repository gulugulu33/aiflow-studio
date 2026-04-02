import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { UserSlice, createUserSlice } from './slices/userSlice'
import { AppSlice, createAppSlice } from './slices/appSlice'
import { WorkflowSlice, createWorkflowSlice } from './slices/workflowSlice'
import { GlobalSlice, createGlobalSlice } from './slices/globalSlice'
import { RAGSlice, createRAGSlice } from './slices/ragSlice'
import { SkillSlice, createSkillSlice } from './slices/skillSlice'

// 组合所有store切片
type StoreState = UserSlice & AppSlice & WorkflowSlice & GlobalSlice & RAGSlice & SkillSlice

export const useStore = create<StoreState>()(
  persist(
    (...args) => ({
      ...createUserSlice(...args),
      ...createAppSlice(...args),
      ...createWorkflowSlice(...args),
      ...createGlobalSlice(...args),
      ...createRAGSlice(...args),
      ...createSkillSlice(...args),
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
