import { describe, expect, it } from "vitest";
import { formatBytes, summarizeStorageEstimate } from "../storage-state";

describe("side panel storage state", () => {
  it("formats storage estimates for display", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
  });

  it("marks unknown storage health when estimate values are missing", () => {
    expect(summarizeStorageEstimate(undefined)).toMatchObject({
      level: "unknown",
      label: "Storage usage unavailable.",
      detail: "Browser storage estimate is unavailable."
    });
    expect(summarizeStorageEstimate({ usage: 10 })).toMatchObject({
      level: "unknown"
    });
  });

  it("classifies storage usage levels", () => {
    expect(summarizeStorageEstimate({ usage: 20, quota: 100 })).toMatchObject({
      level: "ok",
      label: "20 B / 100 B (20%)",
      detail: "Local browser storage has enough available space for normal MVP usage.",
      usageRatio: 0.2
    });
    expect(summarizeStorageEstimate({ usage: 75, quota: 100 })).toMatchObject({
      level: "warning",
      detail: "Local browser storage is getting high. Consider exporting the vault or pruning old raw archives soon."
    });
    expect(summarizeStorageEstimate({ usage: 95, quota: 100 })).toMatchObject({
      level: "critical",
      detail: "Local browser storage is almost full. Export the vault or delete old raw archives before importing more data."
    });
  });
});
