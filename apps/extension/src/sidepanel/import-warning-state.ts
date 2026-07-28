import type { CaptureWarningCount } from "@contextvault/shared";

export type CaptureWarningLabeler = (code: string) => string;

export function formatImportWarningSummary(
  warningCounts: CaptureWarningCount[],
  labelWarning: CaptureWarningLabeler
): string {
  if (warningCounts.length === 0) {
    return "";
  }

  const visibleWarnings = warningCounts
    .slice(0, 4)
    .map((warning) => `${labelWarning(warning.code)} ${warning.count} 次`)
    .join("、");
  const suffix = warningCounts.length > 4 ? ` 等 ${warningCounts.length} 类` : "";

  return ` 导入提示：${visibleWarnings}${suffix}。`;
}
