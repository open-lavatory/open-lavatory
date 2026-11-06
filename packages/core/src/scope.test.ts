import { EventEmitter } from "eventemitter3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { observable } from "./observable.js";
import { createScope } from "./scope.js";

describe("scope", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs cleanups newest first, once", async () => {
    const scope = createScope();
    const order: string[] = [];

    scope.add(() => {
      order.push("first");
    });
    scope.add(async () => {
      order.push("second");
    });

    await Promise.all([scope.close(), scope.close()]);
    await scope.close();

    expect(order).toEqual(["second", "first"]);
  });

  it("runs every cleanup when one throws, then rejects", async () => {
    const scope = createScope();
    const order: string[] = [];

    scope.add(() => {
      order.push("first");
    });
    scope.add(() => {
      throw new Error("boom");
    });
    scope.add(() => {
      order.push("third");
    });

    await expect(scope.close()).rejects.toBeInstanceOf(AggregateError);
    expect(order).toEqual(["third", "first"]);
  });

  it("runs a cleanup at once when it is added after close", async () => {
    const scope = createScope();
    const cleanup = vi.fn();

    await scope.close();
    scope.add(cleanup);

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cancels a timeout on close", async () => {
    const scope = createScope();
    const fired = vi.fn();

    scope.timeout(1000, fired);
    await vi.advanceTimersByTimeAsync(999);
    await scope.close();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fired).not.toHaveBeenCalled();
  });

  it("fires a timeout once after its delay", async () => {
    const scope = createScope();
    const fired = vi.fn();

    scope.timeout(1000, fired);
    await vi.advanceTimersByTimeAsync(999);
    expect(fired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fired).toHaveBeenCalledOnce();
  });

  it("repeats from now, keeps going after a failed run, and stops on close", async () => {
    const scope = createScope();
    let runs = 0;

    scope.repeat(2000, () => {
      runs += 1;

      if (runs === 2) throw new Error("lost");
    });
    expect(runs).toBe(1);

    await vi.advanceTimersByTimeAsync(6000);
    expect(runs).toBe(4);

    await scope.close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toBe(4);
  });

  it("starts no timer on a closed scope", async () => {
    const scope = createScope();
    const run = vi.fn();

    await scope.close();
    scope.timeout(10, run);
    scope.repeat(10, run);
    await vi.advanceTimersByTimeAsync(1000);

    expect(run).not.toHaveBeenCalled();
  });

  it("removes a listener on close", async () => {
    const scope = createScope();
    const emitter = new EventEmitter<{ ping: () => void; }>();
    const listener = vi.fn();

    scope.listen(emitter, "ping", listener);
    emitter.emit("ping");
    await scope.close();
    emitter.emit("ping");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("closes a child with its parent, and a closed child leaves its parent open", async () => {
    const parent = createScope();
    const first = parent.child();
    const second = parent.child();
    const parentTimer = vi.fn();
    const secondTimer = vi.fn();

    parent.timeout(1000, parentTimer);
    second.timeout(1000, secondTimer);
    await first.close();
    await parent.close();
    await vi.advanceTimersByTimeAsync(1000);

    expect(parentTimer).not.toHaveBeenCalled();
    expect(secondTimer).not.toHaveBeenCalled();
  });

  it("gives a closed child from a closed parent", async () => {
    const parent = createScope();
    const run = vi.fn();

    await parent.close();
    parent.child().timeout(10, run);
    await vi.advanceTimersByTimeAsync(100);

    expect(run).not.toHaveBeenCalled();
  });

  it("closes when an observable reaches a value, the current one included", async () => {
    const [state, setState] = observable("idle");
    const later = createScope();
    const now = createScope();
    const run = vi.fn();

    later.closeWhen(state, value => value === "done");
    later.repeat(1000, run);
    setState("busy");
    await vi.advanceTimersByTimeAsync(1000);
    setState("done");
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);

    now.closeWhen(state, value => value === "done");
    now.timeout(10, run);
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
