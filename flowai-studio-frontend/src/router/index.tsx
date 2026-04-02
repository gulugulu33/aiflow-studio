import { createBrowserRouter, createRoutesFromElements, Route, Navigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Login from '../pages/Login'
import Register from '../pages/Register'
import AppList from '../pages/AppList'
import AppEditor from '../pages/AppEditor'
import KnowledgeBase from '../pages/KnowledgeBase'
import Skill from '../pages/Skill'
import Debug from '../pages/Debug'
import { useStore } from '../store'

// 鉴权守卫
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return children
}

// 路由配置
export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* 公共路由 */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      {/* 受保护路由 */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/apps" replace />} />
        <Route path="/apps" element={<AppList />} />
        <Route path="/apps/:appId/editor" element={<AppEditor />} />
        <Route path="/knowledge-bases" element={<KnowledgeBase />} />
        <Route path="/tools" element={<Skill />} />
        <Route path="/debug" element={<Debug />} />
      </Route>
      
      {/* 404路由 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  )
)
