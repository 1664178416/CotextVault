import { describe, expect, it, vi } from "vitest";
import { runExclusiveAction } from "../action-state";

describe("side panel action state", () => {
  it("runs one async action at a time and resets busy state", async () => {
    const lock = { current: false };
    const setBusy = vi.fn();
    let releaseFirstAction!: () => void;
    const firstAction = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseFirstAction = () => resolve("first");
        })
    );
    const secondAction = vi.fn(async () => "second");

    const firstResult = runExclusiveAction(lock, setBusy, firstAction);
    const secondResult = await runExclusiveAction(lock, setBusy, secondAction);

    expect(secondResult).toBeUndefined();
    expect(secondAction).not.toHaveBeenCalled();
    expect(lock.current).toBe(true);
    expect(setBusy).toHaveBeenCalledWith(true);

    releaseFirstAction();

    await expect(firstResult).resolves.toBe("first");
    expect(lock.current).toBe(false);
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it("releases the action lock when the action rejects", async () => {
    const lock = { current: false };
    const setBusy = vi.fn();

    await expect(
      runExclusiveAction(lock, setBusy, async () => {
        throw new Error("failed");
      })
    ).rejects.toThrow("failed");

    expect(lock.current).toBe(false);
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });
});
