import { classifySensitivity, redactProtectedText } from "@contextvault/shared";

const MAX_RUNTIME_ERROR_LENGTH = 360;

export function formatTabMessageError(message?: string): string {
  if (message?.includes("Receiving end does not exist")) {
    return "ContextVault content script is not available on this tab yet. Reload the AI conversation page and try again.";
  }

  return sanitizeRuntimeErrorMessage(message, "Unable to reach ContextVault content script.");
}

export function sanitizeRuntimeErrorMessage(message: string | undefined, fallback = "Unknown error"): string {
  if (!message || message.trim().length === 0) {
    return fallback;
  }

  const normalized = message.replace(/\s+/g, " ").trim();
  const sensitivity = classifySensitivity(normalized);
  const sanitized = sensitivity === "normal" ? normalized : redactProtectedText(normalized, sensitivity);

  return sanitized.length > MAX_RUNTIME_ERROR_LENGTH
    ? `${sanitized.slice(0, MAX_RUNTIME_ERROR_LENGTH - 3).trim()}...`
    : sanitized;
}
