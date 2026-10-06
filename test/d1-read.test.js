import { it, expect, vi } from 'vitest';
import { readWithRetry } from '../worker/d1-read.js';

it('recovers transient procedure lookup failures while recording every exception', async () => {
  const error = new Error('D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.');
  const read = vi.fn().mockRejectedValueOnce(error).mockRejectedValueOnce(error).mockResolvedValue({ id: 'procedure' });
  const record = vi.fn(async () => true), wait = vi.fn(async () => {});
  expect(await readWithRetry({}, read, '/procedures/example', { record, wait })).toEqual({ id: 'procedure' });
  expect(read).toHaveBeenCalledTimes(3); expect(record).toHaveBeenCalledTimes(2);
  expect(record.mock.calls[0][0]).toMatchObject({ path: '/procedures/example', source: 'server', message: error.message });
  expect(record.mock.calls[0][0].detail).toContain(error.stack);
  expect(wait.mock.calls[0][0]).toBeGreaterThanOrEqual(50);
  expect(wait.mock.calls[1][0]).toBeGreaterThanOrEqual(100);
});

it('bounds retries and preserves the original failure when storage remains unavailable', async () => {
  const error = new Error('D1_ERROR: storage caused object to be reset');
  const read = vi.fn(async () => { throw error; }), record = vi.fn(async () => true);
  await expect(readWithRetry({}, read, '/procedures/example', { record, wait: async () => {} })).rejects.toBe(error);
  expect(read).toHaveBeenCalledTimes(3); expect(record).toHaveBeenCalledTimes(3);
  expect(record.mock.calls[2][0].detail).toContain('Retries exhausted.');
});

it('does not retry permanent SQL failures', async () => {
  const error = new Error('D1_ERROR: no such table'); const read = vi.fn(async () => { throw error; });
  const record = vi.fn(), wait = vi.fn();
  await expect(readWithRetry({}, read, '/', { record, wait })).rejects.toBe(error);
  expect(read).toHaveBeenCalledTimes(1); expect(record).not.toHaveBeenCalled(); expect(wait).not.toHaveBeenCalled();
});
