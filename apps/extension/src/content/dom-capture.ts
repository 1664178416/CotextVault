import {
  MAX_SOURCE_TURN_TEXT_LENGTH,
  MAX_SOURCE_TURNS_PER_ARCHIVE,
  normalizeText,
  truncateToCodePointBoundary,
  type CaptureWarning,
  type ConversationCapture,
  type ConversationTurnCapture,
  type ProviderId,
  type SourceRole
} from "@contextvault/shared";

type CandidateTurn = ConversationTurnCapture & {
  score: number;
  documentIndex: number;
};

type DomSelectionResult = {
  turns: ConversationTurnCapture[];
  warnings: CaptureWarning[];
};

export function captureConversationFromDom(provider: ProviderId): ConversationCapture {
  const selection = selectProviderTurns(provider);
  const dedupedTurns = dedupeTurns(selection.turns);
  const bounded = boundDomTurns(dedupedTurns);
  const turns = bounded.turns;
  const warnings: CaptureWarning[] = [
    {
      code: "dom_fallback",
      message: "Captured from visible DOM. Source fidelity may be lower than network or official export capture."
    },
    ...selection.warnings,
    ...bounded.warnings,
    ...buildDomHealthWarnings(turns, selection.turns.length, dedupedTurns.length)
  ];

  return {
    provider,
    title: document.title || undefined,
    url: window.location.href,
    capturedAt: new Date().toISOString(),
    captureMethod: "dom",
    turns,
    warnings
  };
}

function selectProviderTurns(provider: ProviderId): DomSelectionResult {
  switch (provider) {
    case "chatgpt":
      return selectChatGptTurns();
    case "gemini":
      return selectGeminiTurns();
    case "claude":
      return selectClaudeTurns();
    default:
      return {
        turns: selectGenericTurns(),
        warnings: [
          {
            code: "generic_dom_adapter",
            message: "Captured with the generic DOM adapter because no provider-specific adapter was selected."
          }
        ]
      };
  }
}

function selectChatGptTurns(): DomSelectionResult {
  const authorRoleNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-message-author-role]"));

  if (authorRoleNodes.length > 0) {
    const turns = authorRoleNodes
      .map((node, index) => ({
        id: `chatgpt-role-${index}`,
        role: mapRole(node.getAttribute("data-message-author-role")),
        text: extractNodeText(node),
        sourceSelector: "[data-message-author-role]"
      }))
      .filter(hasUsefulText);

    if (turns.length > 0) {
      return {
        turns,
        warnings: []
      };
    }
  }

  const articles = Array.from(document.querySelectorAll<HTMLElement>("main article"));

  return {
    turns: articles
      .map((article, index) => ({
        id: `chatgpt-article-${index}`,
        role: inferRoleFromText(readNodeText(article), index),
        text: extractNodeText(article),
        sourceSelector: "main article"
      }))
      .filter(hasUsefulText),
    warnings: [
      ...(authorRoleNodes.length > 0 ? [providerSelectorEmptyWarning("ChatGPT")] : []),
      {
        code: "provider_selector_fallback",
        message: "ChatGPT-specific DOM selectors did not produce importable text; captured from fallback article nodes."
      }
    ]
  };
}

function selectGeminiTurns(): DomSelectionResult {
  const selectors = [
    "user-query",
    "[data-test-id='user-query']",
    ".user-query",
    "model-response",
    "[id^='model-response-message']",
    ".model-response-text",
    ".response-container"
  ];
  const nodes = uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))));

  if (nodes.length > 0) {
    const turns = nodes
      .map((node, index) => ({
        id: `gemini-node-${index}`,
        role: inferGeminiRole(node, index),
        text: extractNodeText(node),
        sourceSelector: tagSelector(node)
      }))
      .filter(hasUsefulText);

    if (turns.length > 0) {
      return {
        turns,
        warnings: []
      };
    }
  }

  return {
    turns: selectGenericTurns(),
    warnings: [
      ...(nodes.length > 0 ? [providerSelectorEmptyWarning("Gemini")] : []),
      {
        code: "provider_selector_fallback",
        message: "Gemini-specific DOM selectors were not found; captured from generic content nodes."
      }
    ]
  };
}

function selectClaudeTurns(): DomSelectionResult {
  const selectors = [
    "[data-testid='user-message']",
    "[data-testid='assistant-message']",
    "[data-testid='message']",
    "[class*='font-user-message']",
    "[class*='conversation'] [class*='message']"
  ];
  const nodes = uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))));

  if (nodes.length > 0) {
    const turns = nodes
      .map((node, index) => ({
        id: `claude-node-${index}`,
        role: inferClaudeRole(node, index),
        text: extractNodeText(node),
        sourceSelector: tagSelector(node)
      }))
      .filter(hasUsefulText);

    if (turns.length > 0) {
      return {
        turns,
        warnings: []
      };
    }
  }

  return {
    turns: selectGenericTurns(),
    warnings: [
      ...(nodes.length > 0 ? [providerSelectorEmptyWarning("Claude")] : []),
      {
        code: "provider_selector_fallback",
        message: "Claude-specific DOM selectors were not found; captured from generic content nodes."
      }
    ]
  };
}

function selectGenericTurns(): ConversationTurnCapture[] {
  const main = document.querySelector<HTMLElement>("main") ?? document.body;
  const candidates = Array.from(
    main.querySelectorAll<HTMLElement>("article, [role='article'], [data-message-author-role], pre, p")
  )
    .map((node, index): CandidateTurn => {
      const text = extractNodeText(node);
      const score = scoreText(text);

      return {
        id: `generic-${index}`,
        role: inferRoleFromText(text, index),
        text,
        score,
        documentIndex: index,
        sourceSelector: tagSelector(node)
      };
    })
    .filter((candidate) => candidate.score > 0);

  const best = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 80)
    .sort((a, b) => a.documentIndex - b.documentIndex);

  return best.filter(hasUsefulText);
}

function providerSelectorEmptyWarning(providerLabel: string): CaptureWarning {
  return {
    code: "provider_selector_empty",
    message: `${providerLabel}-specific DOM selectors were present but did not contain importable conversation text.`
  };
}

function extractNodeText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;

  for (const hidden of clone.querySelectorAll("[aria-hidden='true'], [hidden], script, style, noscript, button, svg")) {
    hidden.remove();
  }

  for (const pre of clone.querySelectorAll("pre")) {
    pre.textContent = `\n\`\`\`\n${pre.textContent?.trim() ?? ""}\n\`\`\`\n`;
  }

  return normalizeText(clone.innerText || clone.textContent || "");
}

function hasUsefulText(turn: ConversationTurnCapture): boolean {
  const text = normalizeText(turn.text);
  return text.length >= 2 && !/^(copy|share|edit|regenerate|like|dislike)$/i.test(text);
}

function dedupeTurns(turns: ConversationTurnCapture[]): ConversationTurnCapture[] {
  const seen = new Set<string>();
  const result: ConversationTurnCapture[] = [];

  for (const turn of turns) {
    const text = normalizeText(turn.text);
    const key = `${turn.role}:${text.toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      ...turn,
      id: turn.id ?? crypto.randomUUID(),
      text
    });
  }

  return result;
}

function boundDomTurns(turns: ConversationTurnCapture[]): DomSelectionResult {
  const warnings: CaptureWarning[] = [];
  const textLimitedTurns = turns.map((turn) => {
    if (turn.text.length <= MAX_SOURCE_TURN_TEXT_LENGTH) {
      return turn;
    }

    return {
      ...turn,
      text: truncateToCodePointBoundary(turn.text, MAX_SOURCE_TURN_TEXT_LENGTH)
    };
  });
  const truncatedTextCount = textLimitedTurns.filter((turn, index) => turn.text.length < turns[index]!.text.length).length;

  if (truncatedTextCount > 0) {
    warnings.push({
      code: "dom_turn_text_truncated",
      message: `Truncated ${truncatedTextCount} DOM turn(s) to ${MAX_SOURCE_TURN_TEXT_LENGTH} characters before capture.`
    });
  }

  if (textLimitedTurns.length > MAX_SOURCE_TURNS_PER_ARCHIVE) {
    warnings.push({
      code: "dom_turn_limit_reached",
      message: `Captured the first ${MAX_SOURCE_TURNS_PER_ARCHIVE} DOM turn(s) and skipped ${textLimitedTurns.length - MAX_SOURCE_TURNS_PER_ARCHIVE} additional turn(s).`
    });
  }

  return {
    turns: textLimitedTurns.slice(0, MAX_SOURCE_TURNS_PER_ARCHIVE),
    warnings
  };
}

function buildDomHealthWarnings(
  turns: ConversationTurnCapture[],
  selectedTurnCount: number,
  dedupedTurnCount: number
): CaptureWarning[] {
  const warnings: CaptureWarning[] = [];

  if (turns.length === 0) {
    warnings.push({
      code: "no_dom_turns",
      message: "No visible conversation turns were detected."
    });
    return warnings;
  }

  if (selectedTurnCount > dedupedTurnCount) {
    warnings.push({
      code: "duplicate_dom_turns_removed",
      message: `Removed ${selectedTurnCount - dedupedTurnCount} duplicate DOM turn(s) during capture normalization.`
    });
  }

  if (turns.length === 1) {
    warnings.push({
      code: "sparse_dom_capture",
      message: "Only one visible conversation turn was detected; the page may still be loading or selectors may have changed."
    });
  }

  if (turns.reduce((total, turn) => total + normalizeText(turn.text).length, 0) < 80) {
    warnings.push({
      code: "low_text_volume_dom_capture",
      message: "Captured DOM text volume is low; review the archive before accepting extracted memories."
    });
  }

  if (!turns.some((turn) => turn.role === "user")) {
    warnings.push({
      code: "missing_user_turn",
      message: "Captured turns did not include a user role."
    });
  }

  if (!turns.some((turn) => turn.role === "assistant")) {
    warnings.push({
      code: "missing_assistant_turn",
      message: "Captured turns did not include an assistant role."
    });
  }

  if (turns.some((turn) => turn.role === "unknown")) {
    warnings.push({
      code: "unknown_role_detected",
      message: "One or more captured turns had an unknown role."
    });
  }

  return warnings;
}

function mapRole(role: string | null): SourceRole {
  if (role === "user" || role === "assistant" || role === "system" || role === "tool") {
    return role;
  }

  return "unknown";
}

function inferGeminiRole(node: HTMLElement, index: number): SourceRole {
  const label = `${node.tagName} ${node.className} ${node.id}`.toLowerCase();

  if (label.includes("user")) {
    return "user";
  }

  if (label.includes("model") || label.includes("response")) {
    return "assistant";
  }

  return inferRoleFromText(readNodeText(node), index);
}

function inferClaudeRole(node: HTMLElement, index: number): SourceRole {
  const label = `${node.getAttribute("data-testid") ?? ""} ${node.className}`.toLowerCase();

  if (label.includes("user")) {
    return "user";
  }

  if (label.includes("assistant")) {
    return "assistant";
  }

  return inferRoleFromText(readNodeText(node), index);
}

function readNodeText(node: HTMLElement): string {
  return node.innerText || node.textContent || "";
}

function inferRoleFromText(text: string, index: number): SourceRole {
  const trimmed = text.trim().toLowerCase();

  if (trimmed.startsWith("you") || trimmed.startsWith("你") || trimmed.startsWith("user")) {
    return "user";
  }

  if (trimmed.startsWith("chatgpt") || trimmed.startsWith("gemini") || trimmed.startsWith("claude")) {
    return "assistant";
  }

  return index % 2 === 0 ? "user" : "assistant";
}

function scoreText(text: string): number {
  const normalized = normalizeText(text);

  if (normalized.length < 12) {
    return 0;
  }

  let score = normalized.length;

  if (normalized.includes("```")) {
    score += 80;
  }

  if (/^(copy|share|new chat|settings)$/i.test(normalized)) {
    return 0;
  }

  return score;
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)].sort((a, b) => {
    const position = a.compareDocumentPosition(b);

    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }

    return 0;
  });
}

function tagSelector(node: HTMLElement): string {
  const tag = node.tagName.toLowerCase();

  if (node.id) {
    return `${tag}#${node.id}`;
  }

  const testId = node.getAttribute("data-testid") ?? node.getAttribute("data-test-id");

  if (testId) {
    return `${tag}[data-testid="${testId}"]`;
  }

  return tag;
}
