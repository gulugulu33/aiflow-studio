import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // 1. 创建或更新 admin 用户
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password: hashedPassword },
    create: {
      username: 'admin',
      password: hashedPassword,
    },
  });
  console.log(`✅ Created or found user: ${adminUser.username}`);

  // 2. 创建或更新默认知识库
  const defaultKb = await prisma.knowledgeBase.upsert({
    where: { name_userId: { name: '默认知识库', userId: adminUser.id } },
    update: {},
    create: {
      name: '默认知识库',
      description: '系统自动创建的默认知识库，包含 FlowAI Studio 的功能介绍。',
      userId: adminUser.id,
    },
  });
  console.log(`✅ Created or found knowledge base: ${defaultKb.name}`);

  // 3. 为默认知识库创建一篇文档
  const docContent = `
FlowAI Studio 是一个先进的全栈可视化 AI 应用低代码编排平台。它旨在降低 AI 应用开发的门槛，使开发者和业务人员能够通过直观的拖拽式交互，快速构建、测试和部署复杂的 AI 工作流。

核心特性包括：
- 深度可视化的工作流编排：基于 React Flow 构建，支持节点的自由拖拽、缩放及自动布局。
- 强大的 RAG 知识库管理：支持文档上传、切片、向量化存储及检索。
- 灵活的插件与工具系统：遵循 Model Context Protocol (MCP)，支持快速扩展 AI 的外部感知与操作能力。
- 企业级后端架构：后端基于 NestJS，采用严格的模块化开发模式，业务逻辑清晰，易于扩展。
- 生产就绪的应用管理：支持草稿、已发布、已归档等多种应用状态。
  `;
  const docName = 'FlowAI Studio 功能介绍.md';

  const document = await prisma.document.upsert({
    where: { name_knowledgeBaseId: { name: docName, knowledgeBaseId: defaultKb.id } },
    update: {
      content: docContent,
      size: Buffer.from(docContent).length,
    },
    create: {
      name: docName,
      content: docContent,
      knowledgeBaseId: defaultKb.id,
      size: Buffer.from(docContent).length,
    },
  });
  await prisma.documentChunk.deleteMany({
    where: { documentId: document.id },
  });
  await prisma.documentChunk.create({
    data: {
      documentId: document.id,
      content: docContent,
      embedding: JSON.stringify([]),
      chunkIndex: 0,
      startIndex: 0,
      endIndex: docContent.length,
    },
  });
  console.log(`✅ Created or updated default document in knowledge base: ${defaultKb.name}`);

  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
