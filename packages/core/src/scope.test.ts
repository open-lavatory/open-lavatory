import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";

import { createScope } from "./scope.js";

describe("createScope", () => {
  it("removes listeners and runs cleanup in reverse order", async () => {
    const emitter = new EventEmitter<{ changed: () => void; }>();
    const listener = vi.fn();
    const cleanups: string[] = [];
    const scope = createScope();

    scope.add(() => {
      cleanups.push("first");
    });
    scope.listen(emitter, "changed", listener);
    scope.add(async () => {
      cleanups.push("last");
    });

    emitter.emit("changed");
    await scope.close();
    emitter.emit("changed");

    expect(listener).toHaveBeenCalledOnce();
    expect(cleanups).toEqual(["last", "first"]);
  });

  it("accepts multiple cleanups", async () => {
    const cleanups: string[] = [];
    const scope = createScope();

    scope.add(() => {
      cleanups.push("first");
    });
    scope.add(() => {
      cleanups.push("second");
    });

    await scope.close();

    expect(cleanups).toEqual(["second", "first"]);
  });

  it("runs separately registered cleanups in reverse order", async () => {
    const cleanups: string[] = [];
    const scope = createScope();

    scope.add(() => {
      cleanups.push("first");
    });
    scope.add(() => {
      cleanups.push("second");
    });

    await scope.close();

    expect(cleanups).toEqual(["second", "first"]);
  });

  it("is idempotent and rejects cleanup added after closing", async () => {
    const cleanup = vi.fn();
    const scope = createScope();

    scope.add(cleanup);
    await Promise.all([scope.close(), scope.close()]);

    expect(cleanup).toHaveBeenCalledOnce();
    expect(() => scope.add(() => {})).toThrow("Cannot add cleanup to a closed scope");
  });

  it("runs every cleanup before reporting failures", async () => {
    const firstError = new Error("first");
    const secondError = new Error("second");
    const cleanup = vi.fn();
    const scope = createScope();

    scope.add(() => {
      throw firstError;
    });
    scope.add(() => {
      throw secondError;
    });
    scope.add(cleanup);

    await expect(scope.close()).rejects.toThrow(AggregateError);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
