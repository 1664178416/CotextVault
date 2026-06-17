import { classifySensitivity, redactProtectedText } from "@contextvault/shared";

const MAX_DISPLAY_ERROR_LENGTH = 360;

export function formatDisplayError(error: unknown, fallback: string): string {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
    return sanitizeDisplayErrorMessage(error.message);
  }

  return fallback;
}

export function sanitizeDisplayErrorMessage(message: string, maxLength = MAX_DISPLAY_ERROR_LENGTH): string {
  const normalized = message.replace(/\s+/g, " ").trim();

  if (normalized.length === 0) {
    return "";
  }

  const sensitivity = classifySensitivity(normalized);
  const sanitized = sensitivity === "normal" ? normalized : redactProtectedText(normalized, sensitivity);

  return sanitized.length > maxLength ? `${sanitized.slice(0, Math.max(0, maxLength - 3)).trim()}...` : sanitized;
}
