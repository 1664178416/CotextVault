import { describe, expect, it } from "vitest";
import { pruneSelectedMemoryIds, selectVisibleMemoryIds } from "../selection-state";

describe("selection state", () => {
  it("selects every visible memory id", () => {
    expect([...selectVisibleMemoryIds([{ id: "a" }, { id: "b" }])]).toEqual(["a", "b"]);
  });

  it("prunes selected ids that are no longer visible", () => {
    const pruned = pruneSelectedMemoryIds(new Set(["a", "hidden", "b"]), new Set(["a", "b"]));

    expect([...pruned]).toEqual(["a", "b"]);
  });

  it("preserves the selected id set when nothing changes", () => {
    const selectedIds = new Set(["a", "b"]);

    expect(pruneSelectedMemoryIds(selectedIds, new Set(["a", "b"]))).toBe(selectedIds);
  });
});
