/**
 * RRF (Reciprocal Rank Fusion) 融合服务
 *
 * 将多路检索结果（向量检索 + 关键词检索）融合为统一排序结果。
 *
 * 算法原理:
 * RRF 对每个文档计算融合分数:
 *   score(d) = Σ_{r∈R} 1 / (k + rank_r(d))
 *
 * 其中:
 * - R 是所有检索器集合（如 vector、keyword）
 * - rank_r(d) 是文档 d 在检索器 r 中的排名（从 1 开始）
 * - k 是常数（默认 60），用于控制低排名结果的影响
 *
 * RRF 的优势:
 * - 无需调参（不像加权融合需要调整各路权重）
 * - 对分数尺度不敏感（只使用排名，不使用原始分数）
 * - 对异常值鲁棒（单路检索的极端分数不会主导融合结果）
 * - 在 TREC 实验中被证明优于简单的分数归一化+加权
 *
 * 竞品对标:
 * - Dify: RRF 融合，k=60，支持调整向量/关键词权重
 * - FastGPT: 自定义权重融合（score_vector * w1 + score_keyword * w2）
 * - Coze: 仅向量检索
 * - LangChain: EnsembleRetriever 使用 RRF 融合
 *
 * 本设计优势:
 * - 标准 RRF 算法（学术界验证）
 * - 支持加权 RRF（weighted RRF）：为不同检索器分配不同权重
 * - 保留各路原始分数和排名信息（用于调试和解释）
 * - 分数归一化到 0-1 范围（便于后续过滤和展示）
 *
 * 参考文献:
 * - Cormack, G.V., Clarke, C.L.A., & Butt, S. (2009).
 *   Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods.
 *   SIGIR '09.
 */
import { Injectable, Logger } from '@nestjs/common';
import { RetrievalResult } from '../interfaces/retrieval-strategy.interface';

/**
 * RRF 融合参数
 */
export interface RRFFusionParams {
  /** RRF 常数 K（默认 60） */
  k?: number;
  /** 各路检索的权重（key 为检索器名称，value 为权重） */
  weights?: Record<string, number>;
  /** 融合后返回的最大结果数 */
  topK?: number;
  /** 相似度阈值（0-1，低于此阈值的结果将被过滤） */
  similarityThreshold?: number;
}

/**
 * 单路检索结果输入
 */
export interface RetrievalInput {
  /** 检索器名称（如 'vector', 'keyword'） */
  name: string;
  /** 检索结果列表（按分数降序排列） */
  results: RetrievalResult[];
  /** 该路检索的权重（默认 1.0） */
  weight?: number;
}

@Injectable()
export class RRFFusionService {
  private readonly logger = new Logger(RRFFusionService.name);

  /**
   * 执行 RRF 融合
   *
   * @param inputs 多路检索结果
   * @param params 融合参数
   * @returns 融合后的结果列表
   */
  fuse(inputs: RetrievalInput[], params: RRFFusionParams = {}): RetrievalResult[] {
    const { k = 60, topK = 5, similarityThreshold = 0 } = params;

    if (inputs.length === 0) {
      return [];
    }

    // 只有一路检索结果时，直接返回（无需融合）
    if (inputs.length === 1) {
      const singleResults = inputs[0].results.slice(0, topK);
      return singleResults.map((r) => ({
        ...r,
        source: 'hybrid' as const,
      }));
    }

    // 计算每个文档的 RRF 分数
    const rrfScores = new Map<string, {
      result: RetrievalResult;
      rrfScore: number;
      vectorScore?: number;
      keywordScore?: number;
      vectorRank?: number;
      keywordRank?: number;
    }>();

    for (const input of inputs) {
      const weight = input.weight || params.weights?.[input.name] || 1.0;

      for (let rank = 0; rank < input.results.length; rank++) {
        const result = input.results[rank];
        const rrfContribution = weight / (k + rank + 1); // rank+1 因为排名从 1 开始

        const existing = rrfScores.get(result.id);
        if (existing) {
          existing.rrfScore += rrfContribution;
          // 保留各路分数信息
          if (input.name === 'vector') {
            existing.vectorScore = result.score;
            existing.vectorRank = rank + 1;
          } else if (input.name === 'keyword') {
            existing.keywordScore = result.score;
            existing.keywordRank = rank + 1;
          }
        } else {
          rrfScores.set(result.id, {
            result,
            rrfScore: rrfContribution,
            vectorScore: input.name === 'vector' ? result.score : undefined,
            keywordScore: input.name === 'keyword' ? result.score : undefined,
            vectorRank: input.name === 'vector' ? rank + 1 : undefined,
            keywordRank: input.name === 'keyword' ? rank + 1 : undefined,
          });
        }
      }
    }

    // 按 RRF 分数降序排列
    const sortedEntries = [...rrfScores.entries()]
      .sort((a, b) => b[1].rrfScore - a[1].rrfScore);

    // 归一化 RRF 分数到 0-1 范围
    if (sortedEntries.length === 0) {
      return [];
    }

    const maxRRFScore = sortedEntries[0][1].rrfScore;
    const minRRFScore = sortedEntries[sortedEntries.length - 1][1].rrfScore;
    const scoreRange = maxRRFScore - minRRFScore;

    const fusedResults: RetrievalResult[] = sortedEntries
      .map(([id, entry]) => {
        // 归一化 RRF 分数
        const normalizedScore = scoreRange > 0
          ? (entry.rrfScore - minRRFScore) / scoreRange
          : 1.0;

        return {
          id,
          content: entry.result.content,
          score: Math.min(Math.max(normalizedScore, 0), 1),
          source: 'hybrid' as const,
          metadata: entry.result.metadata,
          vectorScore: entry.vectorScore,
          keywordScore: entry.keywordScore,
          vectorRank: entry.vectorRank,
          keywordRank: entry.keywordRank,
        };
      })
      .filter((r) => r.score >= similarityThreshold)
      .slice(0, topK);

    this.logger.debug(
      `RRF fusion: ${inputs.length} retrievers, ` +
      `${rrfScores.size} unique documents, ` +
      `${fusedResults.length} results after fusion (k=${k}, topK=${topK})`
    );

    return fusedResults;
  }

  /**
   * 计算单路检索的 RRF 分数贡献
   * 用于调试和分析融合效果
   */
  calculateRRFScore(rank: number, k: number = 60, weight: number = 1.0): number {
    return weight / (k + rank);
  }

  /**
   * 分析融合结果的质量指标
   * 用于监控和调优
   */
  analyzeFusion(results: RetrievalResult[]): {
    /** 双路命中数（同时出现在向量和关键词结果中的文档数） */
    dualHitCount: number;
    /** 仅向量命中数 */
    vectorOnlyCount: number;
    /** 仅关键词命中数 */
    keywordOnlyCount: number;
    /** 平均融合分数 */
    avgScore: number;
    /** 最高/最低分数 */
    scoreRange: { min: number; max: number };
  } {
    let dualHitCount = 0;
    let vectorOnlyCount = 0;
    let keywordOnlyCount = 0;

    for (const result of results) {
      const hasVector = result.vectorScore !== undefined;
      const hasKeyword = result.keywordScore !== undefined;

      if (hasVector && hasKeyword) {
        dualHitCount++;
      } else if (hasVector) {
        vectorOnlyCount++;
      } else if (hasKeyword) {
        keywordOnlyCount++;
      }
    }

    const scores = results.map((r) => r.score);
    return {
      dualHitCount,
      vectorOnlyCount,
      keywordOnlyCount,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      scoreRange: {
        min: scores.length > 0 ? Math.min(...scores) : 0,
        max: scores.length > 0 ? Math.max(...scores) : 0,
      },
    };
  }
}
