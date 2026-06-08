/**
 * 工作流执行控制工具
 *
 * Phase 4.1: 超时控制与心跳检测
 *
 * 提供:
 * - withTimeout: 为 Promise 添加超时控制
 * - retryWithBackoff: 指数退避重试
 * - HeartbeatManager: 心跳保活管理器
 * - TimeoutError: 超时错误类型
 *
 * 竞品对标:
 * - Dify: 有工作流超时，但无节点级超时和心跳
 * - n8n: 有节点超时 + 重试，无心跳保活
 * - Coze: 仅有整体超时
 * - 本设计: 节点级+工作流级双重超时 + 心跳保活 + 指数退避重试 + 进度上报
 */
import { Subject } from 'rxjs';

/** 超时错误 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly scope: 'node' | 'workflow',
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** 取消错误（工作流被主动取消） */
export class CancelledError extends Error {
  constructor(message = 'Execution cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

/**
 * 为 Promise 添加超时控制
 *
 * @param promise 要执行的 Promise
 * @param timeoutMs 超时时间（毫秒），0 或负数表示不限制
 * @param scope 超时范围（node/workflow），用于错误信息
 * @param label 标签（如节点 ID），用于错误信息
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  scope: 'node' | 'workflow',
  label?: string,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const target = label ? `${scope} "${label}"` : scope;
      reject(
        new TimeoutError(
          `${target} execution timed out after ${timeoutMs}ms`,
          timeoutMs,
          scope,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 重试选项 */
export interface RetryOptions {
  /** 最大重试次数（不含首次执行） */
  maxRetries: number;
  /** 初始延迟（毫秒） */
  initialDelayMs: number;
  /** 最大延迟（毫秒） */
  maxDelayMs: number;
  /** 退避倍数 */
  backoffMultiplier: number;
  /** 判断错误是否可重试 */
  isRetryable?: (error: any) => boolean;
  /** 每次重试前的回调 */
  onRetry?: (attempt: number, error: any, delayMs: number) => void;
}

/** 默认重试选项 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 0, // 默认不重试，需显式开启
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  isRetryable: (error: any) => {
    // 超时和网络错误默认可重试，但用户取消不可重试
    if (error instanceof CancelledError) return false;
    if (error instanceof TimeoutError) return true;
    // 网络相关错误码
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'];
    if (error?.code && retryableCodes.includes(error.code)) return true;
    // HTTP 5xx 或 429 限流
    const status = error?.response?.status;
    if (status && (status >= 500 || status === 429)) return true;
    return false;
  },
};

/**
 * 指数退避重试
 *
 * @param fn 要执行的异步函数
 * @param options 重试选项
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 已达最大重试次数，或错误不可重试
      const isLastAttempt = attempt === opts.maxRetries;
      const retryable = opts.isRetryable ? opts.isRetryable(error) : true;

      if (isLastAttempt || !retryable) {
        throw error;
      }

      // 计算退避延迟
      const delayMs = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs,
      );

      if (opts.onRetry) {
        opts.onRetry(attempt + 1, error, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * 心跳保活管理器
 *
 * 周期性通过 SSE 推送心跳，防止长时间运行的工作流连接超时断开。
 * 同时上报进度信息。
 */
export class HeartbeatManager {
  private timer?: NodeJS.Timeout;
  private startTime: number;
  private lastBeatTime: number;
  private beatCount = 0;

  constructor(
    private readonly sseSubject: Subject<any> | undefined,
    private readonly intervalMs: number = 15000, // 默认 15 秒
  ) {
    this.startTime = Date.now();
    this.lastBeatTime = this.startTime;
  }

  /**
   * 启动心跳
   *
   * @param getProgress 获取当前进度的回调
   */
  start(getProgress?: () => { executed: number; total: number; currentNode?: string }): void {
    if (!this.sseSubject || this.intervalMs <= 0) return;

    this.timer = setInterval(() => {
      this.beatCount++;
      this.lastBeatTime = Date.now();
      const elapsed = this.lastBeatTime - this.startTime;

      const progress = getProgress?.();

      this.sseSubject?.next({
        type: 'heartbeat',
        data: {
          beat: this.beatCount,
          elapsedMs: elapsed,
          timestamp: this.lastBeatTime,
          ...(progress && {
            progress: {
              executed: progress.executed,
              total: progress.total,
              percentage: progress.total > 0
                ? Math.round((progress.executed / progress.total) * 100)
                : 0,
              currentNode: progress.currentNode,
            },
          }),
        },
      });
    }, this.intervalMs);

    // 防止心跳定时器阻止进程退出
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * 停止心跳
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * 获取已运行时间
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * 延迟工具
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
