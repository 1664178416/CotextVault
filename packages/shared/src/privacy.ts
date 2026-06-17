import type { MemoryCard, Sensitivity } from "./types";
import { getSafeMemoryCardForRead } from "./memory-card";

const SENSITIVITY_RANK: Record<Sensitivity, number> = {
  normal: 0,
  sensitive: 1,
  secret: 2
};

const SECRET_PATTERNS = [
  /\b(api[_-]?key|secret|token|password|passwd|pwd|credential)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./=+]{8,}/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bghp_[0-9A-Za-z_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/
];

const SENSITIVE_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\d{16}\b/,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
  /\b(bearer|authorization)\b/i
];

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(api[_-]?key|secret|token|password|passwd|pwd|credential)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./=+]{8,}/gi, "$1=[REDACTED_SECRET]"],
  [/\bbearer\s+[A-Za-z0-9_\-./=+]{8,}/gi, "Bearer [REDACTED_SECRET]"],
  [/\bauthorization\s*[:=]\s*["']?[A-Za-z0-9_\-./=+ ]{8,}/gi, "authorization=[REDACTED_SECRET]"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_GOOGLE_KEY]"],
  [/\bghp_[0-9A-Za-z_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]"],
  [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]"],
  [/\b\d{16}\b/g, "[REDACTED_CARD]"]
];

export function classifySensitivity(text: string): Sensitivity {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    return "secret";
  }

  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "sensitive";
  }

  return "normal";
}

export function containsSecret(text: string): boolean {
  return classifySensitivity(text) === "secret";
}

export function redactSensitiveText(text: string): string {
  return REDACTION_PATTERNS.reduce((redacted, [pattern, replacement]) => redacted.replace(pattern, replacement), text);
}

export function redactProtectedText(text: string, sensitivity: Sensitivity = classifySensitivity(text)): string {
  if (sensitivity === "normal") {
    return text;
  }

  const redacted = redactSensitiveText(text);

  if (redacted !== text) {
    return redacted;
  }

  return sensitivity === "secret" ? "[REDACTED_SECRET_CONTENT]" : "[REDACTED_SENSITIVE_CONTENT]";
}

export type SensitivitySummary = Record<Sensitivity, number>;

export function summarizeMemorySensitivity(cards: MemoryCard[]): SensitivitySummary {
  return cards.reduce<SensitivitySummary>(
    (summary, card) => {
      summary[getEffectiveMemorySensitivity(card)] += 1;
      return summary;
    },
    {
      normal: 0,
      sensitive: 0,
      secret: 0
    }
  );
}

export function getEffectiveMemorySensitivity(card: MemoryCard): Sensitivity {
  const safeCard = getSafeMemoryCardForRead(card);
  const currentSensitivity = classifySensitivity([safeCard.title, safeCard.body, safeCard.owner ?? "", ...safeCard.tags].join("\n"));

  return SENSITIVITY_RANK[currentSensitivity] > SENSITIVITY_RANK[safeCard.sensitivity]
    ? currentSensitivity
    : safeCard.sensitivity;
}

export function formatSensitivitySummary(summary: SensitivitySummary): string {
  const parts: string[] = [];

  if (summary.secret > 0) {
    parts.push(`${summary.secret} secret`);
  }

  if (summary.sensitive > 0) {
    parts.push(`${summary.sensitive} sensitive`);
  }

  if (summary.normal > 0 || parts.length === 0) {
    parts.push(`${summary.normal} normal`);
  }

  return parts.join(", ");
}
