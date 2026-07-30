import {
  classifySensitivity,
  formatCount,
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

export function captureWarningLabel(code: string): string {
  switch (code) {
    case "dom_fallback":
      return "DOM 捕获";
    case "provider_selector_fallback":
      return "选择器回退";
    case "generic_dom_adapter":
      return "通用适配器";
    case "no_dom_turns":
      return "未捕获到 turn";
    case "duplicate_dom_turns_removed":
      return "已移除重复 turn";
    case "sparse_dom_capture":
      return "捕获偏少";
    case "missing_user_turn":
      return "缺少用户 turn";
    case "missing_assistant_turn":
      return "缺少助手 turn";
    case "unknown_role_detected":
      return "存在未知角色";
    case "sensitive_content_detected":
      return "含敏感内容";
    case "secret_content_detected":
      return "含密钥内容";
    case "official_export_import":
      return "官方导出";
    case "chatgpt_current_path":
      return "ChatGPT 当前分支";
    case "chatgpt_mapping_fallback":
      return "ChatGPT 时间排序回退";
    case "chatgpt_non_text_parts_skipped":
      return "跳过非文本内容";
    case "chatgpt_non_conversation_roles_skipped":
      return "跳过系统/工具消息";
    case "chatgpt_empty_conversations_skipped":
      return "跳过空对话";
    default:
      return code;
  }
}

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
      message: `${formatCount(omittedWarnings.length, "additional warning type")} hidden.`,
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
