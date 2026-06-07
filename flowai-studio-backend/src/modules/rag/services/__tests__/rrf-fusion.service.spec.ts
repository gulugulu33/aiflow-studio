/**
 * RRFFusionService 单元测试
 *
 * 测试 RRF 融合算法的正确性：
 * 1. 基本融合：两路检索结果融合
 * 2. 加权融合：不同权重的融合效果
 * 3. 归一化：融合分数归一化到 0-1
 * 4. 单路降级：只有一路结果时的处理
 * 5. 空结果处理
 * 6. 融合质量分析
 */
import { RRFFusionService } from '../rrf-fusion.service';
import { RetrievalResult } from '../../interfaces/retrieval-strategy.interface';

describe('RRFFusionService', () => {
  let service: RRFFusionService;

  beforeEach(() => {
    service = new RRFFusionService();
  });

  // ============================================================
  // 基本融合
  // ============================================================

  it('should fuse vector and keyword results with RRF', () => {
    const vectorResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.95, source: 'vector' },
      { id: 'doc2', content: 'content2', score: 0.85, source: 'vector' },
      { id: 'doc3', content: 'content3', score: 0.75, source: 'vector' },
    ];

    const keywordResults: RetrievalResult[] = [
      { id: 'doc2', content: 'content2', score: 0.90, source: 'keyword' },
      { id: 'doc4', content: 'content4', score: 0.80, source: 'keyword' },
      { id: 'doc1', content: 'content1', score: 0.70, source: 'keyword' },
    ];

    const fused = service.fuse(
      [
        { name: 'vector', results: vectorResults, weight: 0.7 },
        { name: 'keyword', results: keywordResults, weight: 0.3 },
      ],
      { k: 60, topK: 5 },
    );

    // 应该有4个不重复的结果
    expect(fused.length).toBe(4);

    // doc1 和 doc2 在两路中都出现，RRF 分数应该更高
    const doc1Score = fused.find((r) => r.id === 'doc1')!.score;
    const doc4Score = fused.find((r) => r.id === 'doc4')!.score;
    expect(doc1Score).toBeGreaterThan(doc4Score);

    // 所有分数应该在 0-1 范围内
    for (const result of fused) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }

    // 来源应为 hybrid
    for (const result of fused) {
      expect(result.source).toBe('hybrid');
    }
  });

  it('should preserve vector and keyword scores in hybrid results', () => {
    const vectorResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.95, source: 'vector' },
    ];

    const keywordResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.90, source: 'keyword' },
    ];

    const fused = service.fuse(
      [
        { name: 'vector', results: vectorResults },
        { name: 'keyword', results: keywordResults },
      ],
      { k: 60, topK: 5 },
    );

    expect(fused.length).toBe(1);
    expect(fused[0].vectorScore).toBe(0.95);
    expect(fused[0].keywordScore).toBe(0.90);
    expect(fused[0].vectorRank).toBe(1);
    expect(fused[0].keywordRank).toBe(1);
  });

  // ============================================================
  // 加权融合
  // ============================================================

  it('should respect weights in weighted RRF', () => {
    const vectorResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.9, source: 'vector' },
    ];

    const keywordResults: RetrievalResult[] = [
      { id: 'doc2', content: 'content2', score: 0.9, source: 'keyword' },
    ];

    // 高向量权重 → doc1 排前面
    const fusedHighVector = service.fuse(
      [
        { name: 'vector', results: vectorResults, weight: 0.9 },
        { name: 'keyword', results: keywordResults, weight: 0.1 },
      ],
      { k: 60, topK: 5 },
    );
    expect(fusedHighVector[0].id).toBe('doc1');

    // 高关键词权重 → doc2 排前面
    const fusedHighKeyword = service.fuse(
      [
        { name: 'vector', results: vectorResults, weight: 0.1 },
        { name: 'keyword', results: keywordResults, weight: 0.9 },
      ],
      { k: 60, topK: 5 },
    );
    expect(fusedHighKeyword[0].id).toBe('doc2');
  });

  // ============================================================
  // 归一化
  // ============================================================

  it('should normalize scores to 0-1 range', () => {
    const vectorResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.9, source: 'vector' },
      { id: 'doc2', content: 'content2', score: 0.8, source: 'vector' },
      { id: 'doc3', content: 'content3', score: 0.7, source: 'vector' },
    ];

    const keywordResults: RetrievalResult[] = [
      { id: 'doc4', content: 'content4', score: 0.9, source: 'keyword' },
      { id: 'doc5', content: 'content5', score: 0.8, source: 'keyword' },
    ];

    const fused = service.fuse(
      [
        { name: 'vector', results: vectorResults },
        { name: 'keyword', results: keywordResults },
      ],
      { k: 60, topK: 5 },
    );

    // 最高分应为 1.0（归一化后）
    expect(fused[0].score).toBeCloseTo(1.0, 5);

    // 所有分数在 [0, 1] 范围
    for (const result of fused) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  // ============================================================
  // 单路降级
  // ============================================================

  it('should return results directly when only one retriever', () => {
    const vectorResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.9, source: 'vector' },
      { id: 'doc2', content: 'content2', score: 0.8, source: 'vector' },
    ];

    const fused = service.fuse(
      [{ name: 'vector', results: vectorResults }],
      { k: 60, topK: 5 },
    );

    expect(fused.length).toBe(2);
    expect(fused[0].source).toBe('hybrid');
  });

  // ============================================================
  // 空结果
  // ============================================================

  it('should return empty array when no results', () => {
    const fused = service.fuse([], { k: 60, topK: 5 });
    expect(fused).toEqual([]);
  });

  it('should return empty array when both retrievers have empty results', () => {
    const fused = service.fuse(
      [
        { name: 'vector', results: [] },
        { name: 'keyword', results: [] },
      ],
      { k: 60, topK: 5 },
    );
    expect(fused).toEqual([]);
  });

  // ============================================================
  // topK 限制
  // ============================================================

  it('should respect topK limit', () => {
    const vectorResults: RetrievalResult[] = Array.from({ length: 10 }, (_, i) => ({
      id: `doc${i}`, content: `content${i}`, score: 0.9 - i * 0.05, source: 'vector' as const,
    }));

    const keywordResults: RetrievalResult[] = Array.from({ length: 10 }, (_, i) => ({
      id: `doc${i + 10}`, content: `content${i + 10}`, score: 0.9 - i * 0.05, source: 'keyword' as const,
    }));

    const fused = service.fuse(
      [
        { name: 'vector', results: vectorResults },
        { name: 'keyword', results: keywordResults },
      ],
      { k: 60, topK: 3 },
    );

    expect(fused.length).toBe(3);
  });

  // ============================================================
  // 相似度阈值
  // ============================================================

  it('should filter results below similarity threshold', () => {
    const vectorResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.95, source: 'vector' },
      { id: 'doc2', content: 'content2', score: 0.85, source: 'vector' },
      { id: 'doc3', content: 'content3', score: 0.75, source: 'vector' },
    ];

    const keywordResults: RetrievalResult[] = [
      { id: 'doc4', content: 'content4', score: 0.90, source: 'keyword' },
      { id: 'doc5', content: 'content5', score: 0.80, source: 'keyword' },
    ];

    const fused = service.fuse(
      [
        { name: 'vector', results: vectorResults },
        { name: 'keyword', results: keywordResults },
      ],
      { k: 60, topK: 5, similarityThreshold: 0.5 },
    );

    // 大部分结果应该被保留（归一化后分数通常较高）
    expect(fused.length).toBeGreaterThan(0);
    for (const result of fused) {
      expect(result.score).toBeGreaterThanOrEqual(0.5);
    }
  });

  // ============================================================
  // 融合质量分析
  // ============================================================

  it('should analyze fusion quality correctly', () => {
    const vectorResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.9, source: 'vector' },
      { id: 'doc2', content: 'content2', score: 0.8, source: 'vector' },
    ];

    const keywordResults: RetrievalResult[] = [
      { id: 'doc1', content: 'content1', score: 0.9, source: 'keyword' },
      { id: 'doc3', content: 'content3', score: 0.7, source: 'keyword' },
    ];

    const fused = service.fuse(
      [
        { name: 'vector', results: vectorResults },
        { name: 'keyword', results: keywordResults },
      ],
      { k: 60, topK: 5 },
    );

    const analysis = service.analyzeFusion(fused);

    expect(analysis.dualHitCount).toBe(1); // doc1
    expect(analysis.vectorOnlyCount).toBe(1); // doc2
    expect(analysis.keywordOnlyCount).toBe(1); // doc3
    expect(analysis.avgScore).toBeGreaterThan(0);
    expect(analysis.scoreRange.max).toBeLessThanOrEqual(1);
    expect(analysis.scoreRange.min).toBeGreaterThanOrEqual(0);
  });

  // ============================================================
  // RRF 分数计算
  // ============================================================

  it('should calculate RRF score correctly', () => {
    const score1 = service.calculateRRFScore(1, 60, 1.0);
    expect(score1).toBeCloseTo(1 / 61, 10);

    const score2 = service.calculateRRFScore(5, 60, 1.0);
    expect(score2).toBeCloseTo(1 / 65, 10);

    const scoreWithWeight = service.calculateRRFScore(1, 60, 0.7);
    expect(scoreWithWeight).toBeCloseTo(0.7 / 61, 10);
  });
});
