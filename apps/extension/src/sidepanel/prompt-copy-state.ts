import { getSafeSourceAnchors, type PromptContextBuildResult } from "@contextvault/shared";

export interface PromptCopyOmissionSummary {
  omittedCardCount: number;
  omittedSourceAnchorCount: number;
}

export interface PromptCopySummaryOptions {
  maxSourceAnchorsPerCard?: number;
}

export interface PromptCopyBudgetConfirmationOptions extends PromptCopySummaryOptions {
  selectedCount: number;
}

export function summarizePromptCopyOmissions(
  promptContext: PromptContextBuildResult,
  options: PromptCopySummaryOptions = {}
): PromptCopyOmissionSummary {
  return {
    omittedCardCount: promptContext.omittedCards.length,
    omittedSourceAnchorCount: countOmittedSourceAnchors(
      promptContext.includedCards,
      options.maxSourceAnchorsPerCard
    )
  };
}

export function formatPromptCopyBudgetConfirmation(
  promptContext: PromptContextBuildResult,
  options: PromptCopyBudgetConfirmationOptions
): string | undefined {
  const summary = summarizePromptCopyOmissions(promptContext, options);
  const textWasTrimmed = promptContext.truncated && summary.omittedCardCount === 0;

  if (summary.omittedCardCount === 0 && summary.omittedSourceAnchorCount === 0 && !textWasTrimmed) {
    return undefined;
  }

  const selectedCount = Math.max(
    options.selectedCount,
    promptContext.includedCards.length + promptContext.omittedCards.length
  );
  const parts = [`Prompt copy will include ${promptContext.includedCards.length} of ${selectedCount} selected memory card(s).`];

  if (promptContext.maxLength !== undefined) {
    parts.push(`Prompt budget: ${promptContext.length.toLocaleString()}/${promptContext.maxLength.toLocaleString()} characters.`);
  }

  if (summary.omittedCardCount > 0) {
    parts.push(`It will omit ${summary.omittedCardCount} memory card(s) that do not fit.`);
  }

  if (summary.omittedSourceAnchorCount > 0) {
    parts.push(
      `It will omit ${summary.omittedSourceAnchorCount} extra source anchor(s) beyond ${normalizeSourceAnchorLimit(
        options.maxSourceAnchorsPerCard
      )} per included card.`
    );
  }

  if (textWasTrimmed) {
    parts.push("The copied text will be trimmed to fit the character budget.");
  }

  parts.push("Continue copying?");

  return parts.join(" ");
}

export function formatPromptCopyResultMessage(
  promptContext: PromptContextBuildResult,
  options: PromptCopySummaryOptions = {}
): string {
  const summary = summarizePromptCopyOmissions(promptContext, options);
  const textWasTrimmed = promptContext.truncated && summary.omittedCardCount === 0;
  const parts = [`Copied ${promptContext.includedCards.length} memory card(s)`];

  if (summary.omittedCardCount > 0) {
    parts.push(`omitted ${summary.omittedCardCount} card(s) to stay within the prompt budget`);
  }

  if (summary.omittedSourceAnchorCount > 0) {
    parts.push(`omitted ${summary.omittedSourceAnchorCount} extra source anchor(s)`);
  }

  if (textWasTrimmed) {
    parts.push("trimmed text to fit the prompt budget");
  }

  return `${parts.join("; ")}.`;
}

function countOmittedSourceAnchors(
  cards: PromptContextBuildResult["includedCards"],
  maxSourceAnchorsPerCard: number | undefined
): number {
  if (typeof maxSourceAnchorsPerCard !== "number" || !Number.isFinite(maxSourceAnchorsPerCard)) {
    return 0;
  }

  const limit = normalizeSourceAnchorLimit(maxSourceAnchorsPerCard);

  return cards.reduce(
    (count, card) => count + Math.max(0, getSafeSourceAnchors(card).length - limit),
    0
  );
}

function normalizeSourceAnchorLimit(maxSourceAnchorsPerCard: number | undefined): number {
  if (typeof maxSourceAnchorsPerCard !== "number" || !Number.isFinite(maxSourceAnchorsPerCard)) {
    return 0;
  }

  return Math.max(0, Math.floor(maxSourceAnchorsPerCard));
}
