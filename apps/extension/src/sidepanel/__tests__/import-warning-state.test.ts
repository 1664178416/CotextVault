import { describe, expect, it } from "vitest";
import { formatImportWarningSummary } from "../import-warning-state";
import { captureWarningLabel } from "../warning-state";

describe("side panel import warning state", () => {
  it("omits warning summaries when there are no warnings", () => {
    expect(formatImportWarningSummary([], captureWarningLabel)).toBe("");
  });

  it("formats visible import warning counts with caller-provided labels", () => {
    expect(
      formatImportWarningSummary(
        [
          { code: "dom_fallback", count: 2 },
          { code: "missing_user_turn", count: 1 }
        ],
        captureWarningLabel
      )
    ).toBe(" 导入提示：DOM 捕获 2 次、缺少用户 turn 1 次。");
  });

  it("limits long warning summaries while preserving the total type count", () => {
    expect(
      formatImportWarningSummary(
        [
          { code: "dom_fallback", count: 2 },
          { code: "missing_user_turn", count: 1 },
          { code: "missing_assistant_turn", count: 1 },
          { code: "duplicate_dom_turns_removed", count: 3 },
          { code: "unknown_warning", count: 4 }
        ],
        captureWarningLabel
      )
    ).toBe(" 导入提示：DOM 捕获 2 次、缺少用户 turn 1 次、缺少助手 turn 1 次、已移除重复 turn 3 次 等 5 类。");
  });
});
