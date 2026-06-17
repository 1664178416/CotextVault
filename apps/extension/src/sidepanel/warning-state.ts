import {
  classifySensitivity,
  redactProtectedText,
  type CaptureWarning,
  type Sensitivity
} from "@contextvault/shared";

export interface DisplayWarning {
  key: string;
  code: string;
  message: string;
  count: number;
  severity: WarningSeverity;
  omittedCount?: number;
}

export type WarningSeverity = "high" | "medium" | "low";

const DEFAULT_MAX_DISPLAY_WARNINGS = 5;
const MAX_DISPLAY_WARNING_MESSAGE_LENGTH = 240;

export function summarizeWarningsForDisplay(
  warnings: CaptureWarning[],
  options: { maxItems?: number } = {}
): DisplayWarning[] {
  const displayWarnings: DisplayWarning[] = [];
  const indexByKey = new Map<string, number>();

  for (const warning of warnings) {
    const message = sanitizeWarningMessage(warning);
    const key = `${warning.code}\n${message}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex !== undefined) {
      displayWarnings[existingIndex] = {
        ...displayWarnings[existingIndex]!,
        count: displayWarnings[existingIndex]!.count + 1
      };
      continue;
    }

    indexByKey.set(key, displayWarnings.length);
    displayWarnings.push({
      key: `${warning.code}:${displayWarnings.length}`,
      code: warning.code,
      message,
      count: 1,
      severity: warningSeverity(warning.code)
    });
  }

  const sortedWarnings = displayWarnings.sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || b.count - a.count || a.code.localeCompare(b.code)
  );
  const maxItems = normalizeMaxItems(options.maxItems ?? DEFAULT_MAX_DISPLAY_WARNINGS);

  if (sortedWarnings.length <= maxItems) {
    return sortedWarnings;
  }

  const visibleWarnings = sortedWarnings.slice(0, maxItems);
  const omittedWarnings = sortedWarnings.slice(maxItems);

  return [
    ...visibleWarnings,
    {
      key: "warnings-omitted",
      code: "warnings_omitted",
      message: `${omittedWarnings.length} additional warning type(s) hidden.`,
      count: omittedWarnings.reduce((count, warning) => count + warning.count, 0),
      severity: "low",
      omittedCount: omittedWarnings.length
    }
  ];
}

function sanitizeWarningMessage(warning: CaptureWarning): string {
  const sensitivity = maxSensitivity(classifySensitivity(warning.message), warningCodeSensitivity(warning.code));
  const message =
    sensitivity === "normal" ? warning.message : redactProtectedText(warning.message, sensitivity);

  return truncateDisplayText(message, MAX_DISPLAY_WARNING_MESSAGE_LENGTH);
}

function warningCodeSensitivity(code: string): Sensitivity {
  switch (code) {
    case "secret_content_detected":
      return "secret";
    case "sensitive_content_detected":
      return "sensitive";
    default:
      return "normal";
  }
}

function maxSensitivity(left: Sensitivity, right: Sensitivity): Sensitivity {
  if (left === "secret" || right === "secret") {
    return "secret";
  }

  if (left === "sensitive" || right === "sensitive") {
    return "sensitive";
  }

  return "normal";
}

function warningSeverity(code: string): WarningSeverity {
  switch (code) {
    case "secret_content_detected":
    case "sensitive_content_detected":
    case "no_dom_turns":
      return "high";
    case "missing_user_turn":
    case "missing_assistant_turn":
    case "sparse_dom_capture":
    case "provider_selector_fallback":
    case "chatgpt_mapping_fallback":
      return "medium";
    default:
      return "low";
  }
}

function severityRank(severity: WarningSeverity): number {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function normalizeMaxItems(maxItems: number): number {
  if (!Number.isFinite(maxItems)) {
    return DEFAULT_MAX_DISPLAY_WARNINGS;
  }

  return Math.max(1, Math.floor(maxItems));
}

function truncateDisplayText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}
