/**
 * 执行控制工具单元测试
 *
 * Phase 4.1 测试覆盖:
 * - withTimeout: 超时控制
 * - retryWithBackoff: 重试机制
 * - HeartbeatManager: 心跳保活
 * - TimeoutError / CancelledError
 */
import {
  withTimeout,
  retryWithBackoff,
  HeartbeatManager,
  TimeoutError,
  CancelledError,
  sleep,
} from '../utils/execution-control.util';
import { Subject } from 'rxjs';

describe('execution-control.util', () => {
  // ============================================================
  // withTimeout
  // ============================================================
  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const result = await withTimeout(
        Promise.resolve('success'),
        1000,
        'node',
        'test_node',
      );
      expect(result).toBe('success');
    });

    it('should reject with TimeoutError when timeout exceeded', async () => {
      const slowPromise = sleep(200).then(() => 'too late');
      await expect(
        withTimeout(slowPromise, 50, 'node', 'slow_node'),
      ).rejects.toThrow(TimeoutError);
    });

    it('should include scope and label in timeout error', async () => {
      const slowPromise = sleep(200).then(() => 'too late');
      try {
        await withTimeout(slowPromise, 50, 'workflow', 'my_workflow');
        fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as TimeoutError).scope).toBe('workflow');
        expect((error as TimeoutError).timeoutMs).toBe(50);
        expect((error as Error).message).toContain('my_workflow');
      }
    });

    it('should not apply timeout when timeoutMs is 0', async () => {
      const result = await withTimeout(
        sleep(100).then(() => 'done'),
        0,
        'node',
      );
      expect(result).toBe('done');
    });

    it('should not apply timeout when timeoutMs is negative', async () => {
      const result = await withTimeout(
        Promise.resolve('done'),
        -1,
        'node',
      );
      expect(result).toBe('done');
    });
  });

  // ============================================================
  // retryWithBackoff
  // ============================================================
  describe('retryWithBackoff', () => {
    it('should succeed on first try without retry', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const result = await retryWithBackoff(fn, { maxRetries: 3 });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new TimeoutError('timeout', 100, 'node'))
        .mockResolvedValue('ok');

      const result = await retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting retries', async () => {
      const fn = jest.fn().mockRejectedValue(new TimeoutError('timeout', 100, 'node'));

      await expect(
        retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 10 }),
      ).rejects.toThrow(TimeoutError);

      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('non-retryable'));

      await expect(
        retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 10 }),
      ).rejects.toThrow('non-retryable');

      expect(fn).toHaveBeenCalledTimes(1); // 默认 isRetryable 对普通错误返回 false
    });

    it('should not retry CancelledError', async () => {
      const fn = jest.fn().mockRejectedValue(new CancelledError());

      await expect(
        retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 10 }),
      ).rejects.toThrow(CancelledError);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new TimeoutError('timeout', 100, 'node'))
        .mockResolvedValue('ok');

      await retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(TimeoutError), expect.any(Number));
    });

    it('should retry HTTP 5xx and 429 errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValue('ok');

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
      });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff', async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new TimeoutError('t', 100, 'node'));

      await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
        onRetry: (_attempt, _error, delayMs) => delays.push(delayMs),
      }).catch(() => {});

      // 10, 20, 40 (exponential)
      expect(delays).toEqual([10, 20, 40]);
    });

    it('should cap delay at maxDelayMs', async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new TimeoutError('t', 100, 'node'));

      await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffMultiplier: 10,
        maxDelayMs: 500,
        onRetry: (_attempt, _error, delayMs) => delays.push(delayMs),
      }).catch(() => {});

      // 100, 500 (capped), 500 (capped)
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(500);
      expect(delays[2]).toBe(500);
    });
  });

  // ============================================================
  // HeartbeatManager
  // ============================================================
  describe('HeartbeatManager', () => {
    it('should emit heartbeat events at interval', async () => {
      const subject = new Subject<any>();
      const events: any[] = [];
      subject.subscribe((e) => events.push(e));

      const heartbeat = new HeartbeatManager(subject, 50);
      heartbeat.start(() => ({ executed: 2, total: 5, currentNode: 'node_2' }));

      await sleep(170); // 应该产生 3 次心跳
      heartbeat.stop();

      const heartbeats = events.filter((e) => e.type === 'heartbeat');
      expect(heartbeats.length).toBeGreaterThanOrEqual(2);
      expect(heartbeats[0].data.progress.executed).toBe(2);
      expect(heartbeats[0].data.progress.total).toBe(5);
      expect(heartbeats[0].data.progress.percentage).toBe(40);
      expect(heartbeats[0].data.progress.currentNode).toBe('node_2');
    });

    it('should not emit when interval is 0', async () => {
      const subject = new Subject<any>();
      const events: any[] = [];
      subject.subscribe((e) => events.push(e));

      const heartbeat = new HeartbeatManager(subject, 0);
      heartbeat.start();

      await sleep(100);
      heartbeat.stop();

      expect(events.filter((e) => e.type === 'heartbeat')).toHaveLength(0);
    });

    it('should stop emitting after stop()', async () => {
      const subject = new Subject<any>();
      const events: any[] = [];
      subject.subscribe((e) => events.push(e));

      const heartbeat = new HeartbeatManager(subject, 30);
      heartbeat.start();

      await sleep(80);
      heartbeat.stop();
      const countAfterStop = events.length;

      await sleep(80);
      expect(events.length).toBe(countAfterStop); // 停止后不再增加
    });

    it('should track elapsed time', async () => {
      const heartbeat = new HeartbeatManager(undefined, 0);
      await sleep(50);
      expect(heartbeat.getElapsedMs()).toBeGreaterThanOrEqual(45);
    });

    it('should handle undefined subject gracefully', () => {
      const heartbeat = new HeartbeatManager(undefined, 50);
      expect(() => heartbeat.start()).not.toThrow();
      heartbeat.stop();
    });
  });

  // ============================================================
  // Error types
  // ============================================================
  describe('Error types', () => {
    it('TimeoutError should have correct properties', () => {
      const error = new TimeoutError('timed out', 5000, 'workflow');
      expect(error.name).toBe('TimeoutError');
      expect(error.timeoutMs).toBe(5000);
      expect(error.scope).toBe('workflow');
      expect(error).toBeInstanceOf(Error);
    });

    it('CancelledError should have correct properties', () => {
      const error = new CancelledError();
      expect(error.name).toBe('CancelledError');
      expect(error.message).toBe('Execution cancelled');
      expect(error).toBeInstanceOf(Error);
    });

    it('CancelledError should accept custom message', () => {
      const error = new CancelledError('user aborted');
      expect(error.message).toBe('user aborted');
    });
  });
});
