/**
 * BM25KeywordService 单元测试
 *
 * 测试 BM25 关键词检索服务:
 * 1. 文本搜索配置检测
 * 2. LIKE 降级搜索
 * 3. 过滤条件构建
 */
import { BM25KeywordService } from '../bm25-keyword.service';

describe('BM25KeywordService', () => {
  let service: BM25KeywordService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    service = new BM25KeywordService(mockPrisma);
  });

  describe('detectTextSearchConfig', () => {
    it('should detect zhparser if available', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ cfgname: 'zhparser' }]);

      const config = await service.detectTextSearchConfig();
      expect(config).toBe('zhparser');
    });

    it('should fall back to english if zhparser not available', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ cfgname: 'english' }]);

      const config = await service.detectTextSearchConfig();
      expect(config).toBe('english');
    });

    it('should fall back to simple if no known config', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const config = await service.detectTextSearchConfig();
      expect(config).toBe('simple');
    });

    it('should fall back to simple on error', async () => {
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('Connection error'));

      const config = await service.detectTextSearchConfig();
      expect(config).toBe('simple');
    });
  });

  describe('search', () => {
    it('should return empty for empty query', async () => {
      const results = await service.search({
        query: '',
        knowledgeBaseId: 'kb1',
      });
      expect(results).toEqual([]);
    });

    it('should return empty for whitespace-only query', async () => {
      const results = await service.search({
        query: '   ',
        knowledgeBaseId: 'kb1',
      });
      expect(results).toEqual([]);
    });
  });

  describe('ensureFullTextIndex', () => {
    it('should create GIN index for full-text search', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ cfgname: 'english' }]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(undefined);

      await service.ensureFullTextIndex();
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled();
    });

    it('should handle index creation failure gracefully', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ cfgname: 'simple' }]);
      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error('Index creation failed'));

      // Should not throw
      await expect(service.ensureFullTextIndex()).resolves.toBeUndefined();
    });
  });
});
