/**
 * VectorStore 工厂
 *
 * 根据配置动态创建 VectorStore 实例
 * 支持运行时切换向量存储后端
 *
 * 设计模式: 工厂模式 + 注册表模式
 * - 新增 VectorStore 只需实现接口 + 注册到 factory
 * - 支持运行时动态注册
 * - 实例缓存，避免重复创建
 *
 * 竞品对标:
 * - Dify: 配置文件选择向量存储类型
 * - LangChain: 通过类继承体系
 * - 本设计: 通过工厂模式 + 接口，更灵活且类型安全
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/services/prisma.service';
import { VectorStore } from '../interfaces/vector-store.interface';
import { PgVectorStore } from '../providers/vectorstore/pgvector-store.provider';
import { QdrantVectorStore } from '../providers/vectorstore/qdrant-store.provider';
import { MilvusVectorStore } from '../providers/vectorstore/milvus-store.provider';

/**
 * VectorStore 构造函数类型
 * 不同 VectorStore 的构造参数不同，使用工厂函数统一创建
 */
type StoreFactory = () => VectorStore;

@Injectable()
export class VectorStoreFactory {
  private readonly logger = new Logger(VectorStoreFactory.name);

  /** Store 工厂函数注册表 */
  private readonly storeRegistry = new Map<string, StoreFactory>();

  /** 已创建的 Store 实例缓存 */
  private readonly storeCache = new Map<string, VectorStore>();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    // 注册内置 VectorStore
    this.registerStore('pgvector', () => new PgVectorStore(this.prisma));
    this.registerStore('qdrant', () => new QdrantVectorStore(this.configService));
    this.registerStore('milvus', () => new MilvusVectorStore(this.configService));
  }

  /**
   * 注册 VectorStore 工厂函数
   * 支持运行时动态注册第三方 VectorStore
   */
  registerStore(type: string, factory: StoreFactory): void {
    this.storeRegistry.set(type, factory);
    this.logger.log(`Registered vector store: ${type}`);
  }

  /**
   * 创建 VectorStore 实例
   *
   * @param storeType - 存储类型 ('pgvector' | 'qdrant' | 'milvus' | 自定义)
   * @returns VectorStore 实例
   */
  create(storeType: string): VectorStore {
    // 缓存命中
    const cached = this.storeCache.get(storeType);
    if (cached) {
      return cached;
    }

    const factory = this.storeRegistry.get(storeType);
    if (!factory) {
      throw new Error(
        `Unknown vector store type: "${storeType}". ` +
        `Available: ${[...this.storeRegistry.keys()].join(', ')}`,
      );
    }

    const store = factory();
    this.storeCache.set(storeType, store);

    this.logger.log(`Created vector store: ${storeType}`);

    return store;
  }

  /**
   * 获取默认的 VectorStore（基于环境变量配置）
   * 用于知识库未指定存储后端时的回退
   */
  getDefaultStore(): VectorStore {
    const defaultType = this.configService.get<string>('VECTOR_STORE') ?? 'pgvector';
    return this.create(defaultType);
  }

  /**
   * 获取所有已注册的 Store 类型
   */
  getRegisteredTypes(): string[] {
    return [...this.storeRegistry.keys()];
  }
}
