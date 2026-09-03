import { afterEach, describe, expect, it, vi } from "vitest";

import { createRepeater, createTimeout } from "./timers.js";

describe("createTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("replaces a pending callback when restarted", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const timeout = createTimeout();

    timeout.schedule(callback, 100);
    timeout.schedule(callback, 200);

    vi.advanceTimersByTime(199);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("cancels a pending callback", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const timeout = createTimeout();

    timeout.schedule(callback, 100);
    timeout.cancel();
    vi.advanceTimersByTime(100);

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("createRepeater", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs immediately and repeats until stopped", async () => {
    vi.useFakeTimers();
    const callback = vi.fn(async () => {});
    const repeater = createRepeater(callback, 100);

    await repeater.start();
    expect(callback).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(200);
    expect(callback).toHaveBeenCalledTimes(3);

    repeater.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("reports callback failures and keeps repeating", async () => {
    vi.useFakeTimers();
    const error = new Error("failed to publish");
    const callback = vi.fn(async () => {
      throw error;
    });
    const onError = vi.fn();
    const repeater = createRepeater(callback, 100, onError);

    await repeater.start();
    await vi.advanceTimersByTimeAsync(100);
    repeater.stop();

    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(error);
  });

  it("does not reschedule after being stopped during a callback", async () => {
    vi.useFakeTimers();
    let isBlocked = true;
    const callback = vi.fn(async () => {
      while (isBlocked) await Promise.resolve();
    });
    const repeater = createRepeater(callback, 100);

    const firstRun = repeater.start();

    repeater.stop();
    isBlocked = false;
    await firstRun;
    await vi.advanceTimersByTimeAsync(100);

    expect(callback).toHaveBeenCalledOnce();
  });

  it("does not let a previous run reschedule after restarting", async () => {
    vi.useFakeTimers();
    let isFirstRunBlocked = true;
    let runs = 0;
    const callback = vi.fn(async () => {
      runs += 1;

      while (runs === 1 && isFirstRunBlocked) await Promise.resolve();
    });
    const repeater = createRepeater(callback, 100);

    const firstRun = repeater.start();

    await repeater.start();
    isFirstRunBlocked = false;
    await firstRun;
    await vi.advanceTimersByTimeAsync(100);

    expect(callback).toHaveBeenCalledTimes(3);
  });
});
