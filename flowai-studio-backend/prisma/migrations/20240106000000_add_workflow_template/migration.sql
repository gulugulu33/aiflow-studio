-- CreateTable: 工作流模板市场
-- Phase 4.3: 模板 CRUD、分类搜索、一键导入、评分

CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "screenshot" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "nodes" TEXT NOT NULL DEFAULT '[]',
    "edges" TEXT NOT NULL DEFAULT '[]',
    "variables" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 分类查询
CREATE INDEX "workflow_templates_category_idx" ON "workflow_templates"("category");

-- CreateIndex: 状态筛选
CREATE INDEX "workflow_templates_status_idx" ON "workflow_templates"("status");

-- CreateIndex: 官方标识筛选
CREATE INDEX "workflow_templates_isOfficial_idx" ON "workflow_templates"("isOfficial");

-- CreateIndex: 下载量排序
CREATE INDEX "workflow_templates_downloadCount_idx" ON "workflow_templates"("downloadCount");

-- AddForeignKey: 模板创建者
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
