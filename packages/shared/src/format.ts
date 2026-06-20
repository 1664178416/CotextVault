import type { MemoryCard, MemoryCardType, MemoryScope, ProviderId, Sensitivity, SourceAnchor } from "./types";
import { getProviderLabel } from "./provider";
import { getSafeMemoryCardForRead, getSafeSourceAnchors, normalizeMemoryCardForType } from "./memory-card";
import { getEffectiveMemorySensitivity, redactProtectedText, redactSensitiveText } from "./privacy";
import { truncateToCodePointBoundary } from "./text";

export interface PromptContextFormatOptions {
  redactSensitive?: boolean;
  maxLength?: number;
  maxSourceAnchorsPerCard?: number;
}

export interface PromptContextBuildResult {
  text: string;
  includedCards: MemoryCard[];
  omittedCards: MemoryCard[];
  truncated: boolean;
  length: number;
  maxLength?: number;
}

const TYPE_LABELS: Record<MemoryCardType, string> = {
  project_fact: "项目事实",
  decision: "决策记录",
  todo: "待办事项",
  preference: "长期偏好",
  method: "复用方法",
  citation_anchor: "引用锚点"
};

const SCOPE_LABELS: Record<MemoryScope, string> = {
  global: "全局",
  project: "项目",
  conversation: "对话"
};

export function getMemoryTypeLabel(type: MemoryCardType): string {
  return TYPE_LABELS[type];
}

export function getMemoryScopeLabel(scope: MemoryScope): string {
  return SCOPE_LABELS[scope];
}

export function formatMemoryCardsForPrompt(cards: MemoryCard[], options: PromptContextFormatOptions = {}): string {
  return buildMemoryCardsPromptContext(cards, options).text;
}

export function buildMemoryCardsPromptContext(
  cards: MemoryCard[],
  options: PromptContextFormatOptions = {}
): PromptContextBuildResult {
  if (cards.length === 0) {
    return {
      text: "",
      includedCards: [],
      omittedCards: [],
      truncated: false,
      length: 0,
      maxLength: normalizePromptMaxLength(options.maxLength)
    };
  }

  const maxLength = normalizePromptMaxLength(options.maxLength);
  const normalizedCards = cards.map(getSafeMemoryCardForRead).map(normalizeMemoryCardForType);
  const lines = ["Relevant Context:"];
  const includedCards: MemoryCard[] = [];
  const omittedCards: MemoryCard[] = [];

  for (const card of normalizedCards) {
    const cardLines = formatPromptCardLines(card, options);
    const nextLines = [...lines, ...cardLines];
    const candidateWithoutOmissionText = nextLines.join("\n");

    if (maxLength !== undefined && candidateWithoutOmissionText.length > maxLength) {
      omittedCards.push(card);
      continue;
    }

    lines.push(...cardLines);
    includedCards.push(card);
  }

  const fullText = formatPromptLines(lines, omittedCards.length);
  const text = fitPromptTextWithinBudget(lines, omittedCards.length, fullText, maxLength);

  return {
    text,
    includedCards,
    omittedCards,
    truncated: omittedCards.length > 0 || text.length < fullText.length,
    length: text.length,
    maxLength
  };
}

export function formatMemoryCardsAsMarkdown(
  cards: MemoryCard[],
  options: { title?: string; exportedAt?: string; redactSensitive?: boolean } = {}
): string {
  const title = options.title ?? "ContextVault Memory Export";
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const lines = [`# ${title}`, "", `Exported at: ${exportedAt}`, `Cards: ${cards.length}`, ""];

  if (cards.length === 0) {
    lines.push("_No memory cards matched this export._");
    return lines.join("\n");
  }

  for (const [type, typeCards] of groupCardsByType(cards.map(getSafeMemoryCardForRead))) {
    lines.push(`## ${getMemoryTypeLabel(type)}`, "");

    for (const rawCard of typeCards) {
      const card = normalizeMemoryCardForType(rawCard);
      const effectiveSensitivity = getEffectiveMemorySensitivity(card);

      lines.push(`### ${formatPossiblyRedacted(card.title, options, effectiveSensitivity)}`, "");
      lines.push(formatPossiblyRedacted(card.body, options, effectiveSensitivity).trim(), "");
      lines.push(`- Type: ${getMemoryTypeLabel(card.type)}`);
      lines.push(`- Card id: ${formatMemoryCardIdentifier(card.id)}`);
      lines.push(`- Status: ${card.status}`);
      lines.push(`- Scope: ${card.scope}`);
      lines.push(`- Sensitivity: ${effectiveSensitivity}`);
      if (card.createdAt) {
        lines.push(`- Created: ${card.createdAt}`);
      }
      if (card.updatedAt) {
        lines.push(`- Updated: ${card.updatedAt}`);
      }
      if (card.acceptedAt) {
        lines.push(`- Accepted: ${card.acceptedAt}`);
      }

      if (card.owner) {
        lines.push(`- Owner: ${formatPossiblyRedacted(card.owner, options, effectiveSensitivity)}`);
      }

      if (card.dueAt) {
        lines.push(`- Due: ${card.dueAt}`);
      }

      if (card.tags.length > 0) {
        lines.push(
          `- Tags: ${card.tags
            .map((tag) => `#${sanitizeTag(formatPossiblyRedacted(tag, options, effectiveSensitivity))}`)
            .join(" ")}`
        );
      }

      for (const source of getSafeSourceAnchors(card)) {
        lines.push(`- Source: ${formatSourceAnchor(source, { ...options, redactionSensitivity: effectiveSensitivity })}`);
      }

      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function providerPrefix(provider: ProviderId): string {
  return getProviderLabel(provider);
}

export function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return ".".repeat(Math.max(0, maxLength));
  }

  return `${truncateToCodePointBoundary(normalized, maxLength - 3).trimEnd()}...`;
}

function formatPossiblyRedacted(
  text: string,
  options: { redactSensitive?: boolean },
  sensitivity?: Sensitivity
): string {
  if (!options.redactSensitive) {
    return text;
  }

  return sensitivity && sensitivity !== "normal" ? redactProtectedText(text, sensitivity) : redactSensitiveText(text);
}

function formatPromptCardLines(card: MemoryCard, options: PromptContextFormatOptions): string[] {
  const effectiveSensitivity = getEffectiveMemorySensitivity(card);
  const lines = [
    `- [${getMemoryTypeLabel(card.type)}] ${formatPossiblyRedacted(
      card.title,
      options,
      effectiveSensitivity
    )}: ${formatPossiblyRedacted(card.body, options, effectiveSensitivity)}`
  ];

  const metadata = formatPromptMetadata(card, options, effectiveSensitivity);

  if (metadata) {
    lines.push(`  Meta: ${metadata}`);
  }

  const sourceAnchors = limitPromptSourceAnchors(getSafeSourceAnchors(card), options.maxSourceAnchorsPerCard);

  if (sourceAnchors.visible.length > 0) {
    const formattedAnchors = sourceAnchors.visible.map((anchor) =>
      formatSourceAnchor(anchor, { ...options, redactionSensitivity: effectiveSensitivity })
    );
    const omittedSuffix =
      sourceAnchors.omittedCount > 0 ? `; +${sourceAnchors.omittedCount} more source anchor(s)` : "";

    lines.push(`  Source: ${formattedAnchors.join("; ")}${omittedSuffix}`);
  }

  return lines;
}

function limitPromptSourceAnchors(
  anchors: SourceAnchor[],
  maxSourceAnchorsPerCard: number | undefined
): { visible: SourceAnchor[]; omittedCount: number } {
  if (typeof maxSourceAnchorsPerCard !== "number" || !Number.isFinite(maxSourceAnchorsPerCard)) {
    return {
      visible: anchors,
      omittedCount: 0
    };
  }

  const limit = Math.max(0, Math.floor(maxSourceAnchorsPerCard));

  return {
    visible: anchors.slice(0, limit),
    omittedCount: Math.max(0, anchors.length - limit)
  };
}

function fitPromptTextWithinBudget(
  lines: string[],
  omittedCount: number,
  fullText: string,
  maxLength: number | undefined
): string {
  if (maxLength === undefined || fullText.length <= maxLength) {
    return fullText;
  }

  const compactText = omittedCount > 0 ? formatPromptLines(lines, omittedCount, { compactOmission: true }) : fullText;

  if (compactText.length <= maxLength) {
    return compactText;
  }

  const baseText = lines.join("\n");

  if (baseText.length <= maxLength) {
    return baseText;
  }

  return constrainPromptText(baseText, maxLength);
}

function formatPromptLines(
  lines: string[],
  omittedCount: number,
  options: { compactOmission?: boolean } = {}
): string {
  const outputLines = [...lines];

  if (omittedCount > 0) {
    outputLines.push(
      options.compactOmission
        ? `- Omitted ${omittedCount} memory card(s).`
        : `- Omitted ${omittedCount} memory card(s) because the prompt context budget was reached.`
    );
  }

  return outputLines.join("\n");
}

function normalizePromptMaxLength(maxLength: number | undefined): number | undefined {
  if (typeof maxLength !== "number" || !Number.isFinite(maxLength)) {
    return undefined;
  }

  return Math.max(0, Math.floor(maxLength));
}

function constrainPromptText(text: string, maxLength: number | undefined): string {
  if (maxLength === undefined || text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return ".".repeat(maxLength);
  }

  return `${truncateToCodePointBoundary(text, maxLength - 3).trimEnd()}...`;
}

function groupCardsByType(cards: MemoryCard[]): Array<[MemoryCardType, MemoryCard[]]> {
  const groups = new Map<MemoryCardType, MemoryCard[]>();

  for (const rawCard of cards) {
    const card = normalizeMemoryCardForType(rawCard);
    groups.set(card.type, [...(groups.get(card.type) ?? []), card]);
  }

  return [...groups.entries()];
}

function sanitizeTag(tag: string): string {
  return tag.replace(/[^\p{L}\p{N}_/-]+/gu, "-").replace(/^-+|-+$/g, "");
}

function formatPromptMetadata(
  card: MemoryCard,
  options: { redactSensitive?: boolean },
  effectiveSensitivity: Sensitivity
): string {
  const parts = [`scope=${card.scope}`];

  if (card.tags.length > 0) {
    parts.push(
      `tags=${card.tags
        .map((tag) => `#${sanitizeTag(formatPossiblyRedacted(tag, options, effectiveSensitivity))}`)
        .join(" ")}`
    );
  }

  if (card.owner) {
    parts.push(`owner=${formatPossiblyRedacted(card.owner, options, effectiveSensitivity)}`);
  }

  if (card.dueAt) {
    parts.push(`due=${card.dueAt}`);
  }

  return parts.join(" ");
}

export function formatSourceAnchor(
  anchor: SourceAnchor,
  options: { redactSensitive?: boolean; redactionSensitivity?: Sensitivity } = {}
): string {
  const parts = [
    `archive=${formatSourceAnchorIdentifier(anchor.archiveId, options)}`,
    `turn=${formatSourceAnchorIdentifier(anchor.turnId, options)}`
  ];

  if (typeof anchor.charStart === "number" && typeof anchor.charEnd === "number") {
    parts.push(`chars=${anchor.charStart}-${anchor.charEnd}`);
  }

  if (anchor.quote) {
    const quote = formatPossiblyRedacted(anchor.quote, options, options.redactionSensitivity);
    parts.push(`quote="${truncateText(quote, 120).replaceAll('"', '\\"')}"`);
  }

  return parts.join(" ");
}

function formatSourceAnchorIdentifier(
  identifier: string,
  _options: { redactSensitive?: boolean; redactionSensitivity?: Sensitivity }
): string {
  return redactSensitiveText(identifier);
}

function formatMemoryCardIdentifier(identifier: string): string {
  return redactSensitiveText(identifier);
}
