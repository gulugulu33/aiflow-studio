# FlowAI Studio

FlowAI Studio 是一个先进的全栈可视化 AI 应用低代码编排平台。它旨在降低 AI 应用开发的门槛，使开发者和业务人员能够通过直观的拖拽式交互，快速构建、测试和部署复杂的 AI 工作流。

## 项目亮点

### 1. 深度可视化的工作流编排
- 交互式编辑器：基于 React Flow 构建，支持节点的自由拖拽与缩放。
- 丰富的节点类型：
    - 开始节点：定义流程入口。
    - 用户输入节点：收集用户输入。
    - LLM 节点：支持自定义 Prompt、模型选择及参数配置（温度、Max Tokens 等）。
    - RAG 检索节点：无缝集成知识库，实现检索增强生成。
    - 条件分支节点：支持逻辑判断，实现复杂的决策流。
    - 技能/工具节点：调用外部 API 或内置功能。
    - 输出节点：定义流程的最终输出。
- 实时状态同步：画布操作与全局状态管理（Zustand）高度同步，确保编排过程的数据一致性。

### 2. 强大的 RAG 知识库管理
- 全生命周期管理：支持文档上传、切片、向量化存储及检索。
- 多格式支持：能够处理多种常见的文档格式，为 AI 提供精准的上下文支撑。
- 调试工具：内置检索测试功能，可在编排前验证知识库的召回效果。

### 3. 灵活的插件与工具系统
- MCP 协议集成：遵循 Model Context Protocol，通过 stdio + JSON-RPC 2.0 协议，支持动态连接、断开外部 MCP Server，自动发现并调用其提供的工具。
- 内置工具库：提供时间查询、HTTP 请求、JSON 处理、正则匹配、计算器、代码执行（JS 沙箱）等常用工具。
- 自定义技能：支持开发者定义自己的工具接口（配置 API 地址、HTTP 方法、请求头），并将其作为节点在工作流中使用。

### 4. 企业级后端架构
- 模块化设计：后端基于 NestJS，采用严格的模块化开发模式，业务逻辑清晰，易于扩展。
- 稳健的数据层：使用 Prisma ORM 配合 SQLite，支持复杂的关联查询与事务处理。
- 统一的 API 规范：内置全局异常过滤器、响应拦截器及入参校验管道（class-validator），确保接口调用的安全性与一致性。

### 5. 生产就绪的应用管理
- 应用状态控制：支持草稿、已发布、已归档等多种应用状态，并提供归档/取消归档操作。
- 用户认证体系：基于 JWT 的认证与授权，保护用户的私有数据与工作流资产。
- 响应式 UI：适配不同尺寸的屏幕，提供流畅的桌面端操作体验。

## 技术栈

### 前端 (Frontend)
- 核心框架: React 18 (Vite)
- 状态管理: Zustand
- UI 组件库: Ant Design (AntD)
- 流程图引擎: React Flow (@xyflow/react)
- 样式处理: CSS + Ant Design Token
- 路由管理: React Router v6

### 后端 (Backend)
- 核心框架: NestJS
- 数据库层: Prisma ORM + SQLite
- 认证安全: JWT (JSON Web Token)
- 校验工具: class-validator + class-transformer
- 异步通信: Axios / Server-Sent Events (SSE)
- 代码沙箱: vm2

## 快速开始

### 1. 环境准备
确保您的开发环境已安装以下软件：
- Node.js (v18.0.0 或更高版本)
- npm (v9.0.0 或更高版本)

### 2. 后端配置与启动
```bash
cd flowai-studio-backend
# 安装项目依赖
npm install
# 配置环境变量 (参考 .env.example)
cp .env.example .env
# 同步数据库结构
npx prisma db push
# 写入默认演示数据（默认账号、默认知识库、默认文档）
npx prisma db seed
# 启动后端开发服务器
npm run start:dev
```
*注意：请务必在 .env 文件中填入有效的 QWEN_API_KEY 以启用 AI 节点功能。*

### 3. 前端配置与启动
```bash
cd flowai-studio-frontend
# 安装项目依赖
npm install
# 启动前端开发服务器
npm run dev
```
启动完成后，在浏览器中访问 http://localhost:5173 即可开始您的 AI 编排之旅。

## 默认账号（演示用）
- 用户名：admin
- 密码：admin123

## 如何验证 RAG（最短路径）
1. 使用默认账号登录。
2. 打开「知识库管理」，确认存在「默认知识库」，并且里面有文档「FlowAI Studio 功能介绍.md」。
3. 打开「调试中心」→「AI 聊天」，在"关联知识库"下拉框中选择「默认知识库」。
4. 发送问题：`FlowAI Studio 有什么核心特性？`
5. 观察返回结果下方的「参考文档」区域，应该能看到命中的文档片段与相似度。

## 验证 RAG（接口方式，可选）
```bash
# 1) 登录获取 token
curl -s -X POST http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

# 2) 带 token 获取知识库列表（将 YOUR_TOKEN 替换成上一步返回的 token）
curl -s http://localhost:3000/api/rag/knowledge-bases \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3) 检索（将 KB_ID 替换成知识库 id）
curl -s -X POST http://localhost:3000/api/rag/retrieve \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query":"FlowAI Studio 有什么核心特性","knowledgeBaseId":"KB_ID","topK":3}'
```

## 项目结构说明

```text
├── flowai-studio-frontend   # 前端工程
│   ├── src/components       # 通用组件及工作流节点组件
│   ├── src/pages            # 业务页面视图
│   ├── src/store            # 全局状态管理切片
│   ├── src/router           # 路由导航配置
│   └── src/types            # TypeScript 类型定义
└── flowai-studio-backend    # 后端工程
    ├── src/modules          # 业务逻辑模块 (AI, App, Workflow, RAG, Skill, MCP, User)
    ├── src/common           # 公共中间件、装饰器、拦截器
    ├── src/config           # 环境变量与全局配置
    └── prisma               # 数据库 Schema 定义与 Seed 脚本
```

## 开源协议
小圆项目，禁止商业用途。
<img width="1612" height="961" alt="image" src="https://github.com/user-attachments/assets/c58798f9-96f5-4415-968a-70e99a96e595" />
<img width="1612" height="961" alt="image" src="https://github.com/user-attachments/assets/bb0d912c-44a1-48ef-a25c-fb4a7560b1d8" />
<img width="1612" height="961" alt="image" src="https://github.com/user-attachments/assets/85ba1bc0-f2a7-4981-9a98-af057cf949f6" />
<img width="1612" height="961" alt="image" src="https://github.com/user-attachments/assets/a40c8ba6-ac10-4fb9-890f-b0a5758e4a37" />
<img width="1612" height="961" alt="image" src="https://github.com/user-attachments/assets/d457aff7-cfa4-4f81-aac8-f5496c36994f" />
<img width="1612" height="961" alt="image" src="https://github.com/user-attachments/assets/c10a3711-c73a-4ca9-af23-28f9bf225a3b" />
<img width="1612" height="961" alt="image" src="https://github.com/user-attachments/assets/dcc9bf67-52e3-4420-84d3-9f1693c38cf0" />
