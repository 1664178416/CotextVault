import type { ProviderId } from "./types";

const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const GEMINI_HOSTS = new Set(["gemini.google.com"]);
const CLAUDE_HOSTS = new Set(["claude.ai"]);

export function detectProviderFromUrl(url?: string): ProviderId {
  if (!url) {
    return "unknown";
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (CHATGPT_HOSTS.has(host)) {
      return "chatgpt";
    }

    if (GEMINI_HOSTS.has(host)) {
      return "gemini";
    }

    if (CLAUDE_HOSTS.has(host)) {
      return "claude";
    }

    return "generic";
  } catch {
    return "unknown";
  }
}

export function isSupportedProvider(provider: ProviderId): boolean {
  return provider === "chatgpt" || provider === "gemini" || provider === "claude";
}

export function getProviderLabel(provider: ProviderId): string {
  switch (provider) {
    case "chatgpt":
      return "ChatGPT";
    case "gemini":
      return "Gemini";
    case "claude":
      return "Claude";
    case "generic":
      return "Generic";
    default:
      return "Unknown";
  }
}

