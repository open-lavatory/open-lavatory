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

    timeout.start(callback, 100);
    timeout.start(callback, 200);

    vi.advanceTimersByTime(199);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("cancels a pending callback", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const timeout = createTimeout();

    timeout.start(callback, 100);
    timeout.stop();
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
});
