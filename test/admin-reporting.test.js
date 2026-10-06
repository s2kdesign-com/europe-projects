import { describe, it, expect, vi } from 'vitest';
import { createErrorDelivery, errorEventPayload, errorOrigin } from '../app/services/error-reporting.js';
import { createActivityTracker } from '../app/services/user-activity.js';

describe('exception preservation', () => {
  it('delivers every event beyond the former lifetime cap, including native bridge failures', async () => {
    const send = vi.fn(async () => {});
    const delivery = createErrorDelivery({ send, onFailure: vi.fn() });
    for (let i = 0; i < 30; i++) delivery.enqueue({ message: 'Java object is gone', detail: 'iabjs://navigation_performance_logger_android:' + i });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(30));
    expect(delivery.pending()).toBe(0);
    delivery.stop();
  });
  it('keeps a failed event and subsequent events for retry without claiming success', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValue(undefined);
    const failure = vi.fn(), schedule = vi.fn(() => 1);
    const delivery = createErrorDelivery({ send, onFailure: failure, schedule, cancel: vi.fn() });
    const event = { message: 'Full original error', detail: 'stack'.repeat(1000) };
    delivery.enqueue(event); delivery.enqueue({ message: 'next' });
    await vi.waitFor(() => expect(failure).toHaveBeenCalledTimes(1));
    expect(delivery.pending()).toBe(2);
    delivery.retry();
    await vi.waitFor(() => expect(delivery.pending()).toBe(0));
    expect(send.mock.calls[1][0]).toEqual(event);
    expect(send).toHaveBeenCalledTimes(3);
    delivery.stop();
  });
  it('captures resource failures and preserves original stack detail', () => {
    const error = new Error('long error'); error.stack = 'stack'.repeat(1000);
    expect(errorEventPayload({ message: error.message, error, filename: '/app.js', lineno: 2 }).detail).toContain(error.stack);
    expect(errorEventPayload({ target: { src: 'https://example.invalid/missing.js' } }).message).toContain('missing.js');
    expect(errorOrigin({ source: 'client', detail: 'iabjs://navigation_performance_logger_android:1' })).toBe('native-browser');
    expect(errorOrigin({ source: 'client', message: 'Java object is gone', detail: '/app.js' })).toBe('client');
  });
});

describe('foreground activity', () => {
  it('throttles visible interactions without marking a hidden tab as active', async () => {
    let time = 0, visible = true;
    const send = vi.fn(async () => {});
    const note = createActivityTracker({ send, visible: () => visible, now: () => time, onError: vi.fn() });
    await note(); time = 30000; await note(); expect(send).toHaveBeenCalledTimes(1);
    time = 60000; visible = false; await note(); expect(send).toHaveBeenCalledTimes(1);
    visible = true; await note(); expect(send).toHaveBeenCalledTimes(2);
    time = 120000; expect(send).toHaveBeenCalledTimes(2); // No timer/idle heartbeat.
  });
  it('reports failures and permits retry', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    const onError = vi.fn();
    const note = createActivityTracker({ send, visible: () => true, now: () => 0, onError });
    await note(); await note(); expect(onError).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledTimes(2);
  });
});
