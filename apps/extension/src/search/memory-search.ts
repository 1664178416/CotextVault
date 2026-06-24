import {
  classifySensitivity,
  compareMemoryCardsForRecall,
  getEffectiveMemorySensitivity,
  getSafeMemoryCardForRead,
  normalizeMemoryCardForType,
  normalizeText,
  normalizeSearchFieldValue,
  parseRecallSearchQuery,
  parseRecallSearchTerms,
  redactProtectedText,
  sortMemoryCardsForRecall,
  type MemoryCard,
  type MemoryCardStatus,
  type MemoryCardType,
  type MemoryScope,
  type SearchFieldQuery,
  type SearchSnippet,
  type SearchResult,
  type Sensitivity
} from "@contextvault/shared";

const MAX_MATCHED_TERMS_PER_SNIPPET = 4;
const MAX_MATCHED_TERM_LENGTH = 64;

export function rankMemoryCards(
  cards: MemoryCard[],
  query: string,
  options: { status?: MemoryCardStatus; memoryType?: MemoryCardType; memoryScope?: MemoryScope; limit?: number } = {}
): SearchResult[] {
  const limit = options.limit ?? 30;
  const status = options.status;
  const filteredCards = cards.map(getSafeMemoryCardForRead).map(normalizeMemoryCardForType).filter((card) => {
    if (status && card.status !== status) {
      return false;
    }

    if (options.memoryType && card.type !== options.memoryType) {
      return false;
    }

    if (options.memoryScope && card.scope !== options.memoryScope) {
      return false;
    }

    return true;
  });
  const normalizedQuery = normalizeText(query).toLowerCase();

  if (!normalizedQuery) {
    return recallResults(filteredCards, limit);
  }

  const parsedQuery = parseRecallSearchQuery(normalizedQuery);
  const terms = parseRecallSearchTerms(parsedQuery.text);
  const queryFilteredCards = filterCardsByFieldQueries(filteredCards, parsedQuery.fieldQueries);

  if (terms.length === 0) {
    return recallResults(queryFilteredCards, limit);
  }

  return queryFilteredCards
    .map((card) => scoreCard(card, terms))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || compareMemoryCardsForRecall(a.card, b.card))
    .slice(0, limit);
}

function recallResults(cards: MemoryCard[], limit: number): SearchResult[] {
  return sortMemoryCardsForRecall(cards)
    .slice(0, limit)
    .map((card) => ({
      card,
      score: 1,
      matchedFields: [],
      snippets: []
    }));
}

function scoreCard(card: MemoryCard, terms: string[]): SearchResult {
  const normalizedCard = normalizeMemoryCardForType(getSafeMemoryCardForRead(card));
  const fields = {
    title: normalizedCard.title.toLowerCase(),
    body: normalizedCard.body.toLowerCase(),
    tags: normalizedCard.tags.join(" ").toLowerCase(),
    type: normalizedCard.type,
    metadata: formatSearchMetadata(normalizedCard).toLowerCase()
  };
  const effectiveSensitivity = getEffectiveMemorySensitivity(normalizedCard);
  const redactionSensitivity = effectiveSensitivity === "normal" ? undefined : effectiveSensitivity;
  const visibleMetadata = formatSearchMetadata(normalizedCard, redactionSensitivity);
  const visibleTags = formatSearchTags(normalizedCard, redactionSensitivity);
  const matchedFields: string[] = [];
  const snippets: SearchSnippet[] = [];
  let score = 0;

  for (const term of terms) {
    const titleMatch = findMatchingTermVariant(fields.title, term);
    const bodyMatch = findMatchingTermVariant(fields.body, term);
    const tagsMatch = findMatchingTermVariant(fields.tags, term);
    const typeMatch = findMatchingTermVariant(fields.type, term);
    const metadataMatch = findMatchingTermVariant(fields.metadata, term);

    if (titleMatch) {
      score += 4;
      matchedFields.push("title");
      addSnippet(snippets, "title", normalizedCard.title, titleMatch, redactionSensitivity, undefined, term);
    }

    if (bodyMatch) {
      score += 2;
      matchedFields.push("body");
      addSnippet(snippets, "body", normalizedCard.body, bodyMatch, redactionSensitivity, undefined, term);
    }

    if (tagsMatch || typeMatch || metadataMatch) {
      score += 1;
      matchedFields.push("metadata");

      if (tagsMatch) {
        addSnippet(snippets, "tags", visibleTags, tagsMatch, undefined, redactionSensitivity, term);
      }

      if (typeMatch) {
        addSnippet(snippets, "type", normalizedCard.type, typeMatch, undefined, undefined, term);
      }

      if (metadataMatch) {
        addSnippet(snippets, "metadata", visibleMetadata, metadataMatch, undefined, redactionSensitivity, term);
      }
    }
  }

  if (effectiveSensitivity === "secret") {
    score -= 3;
  }

  if (effectiveSensitivity === "sensitive") {
    score -= 1;
  }

  if (score <= 0 && matchedFields.length > 0) {
    score = 0.1;
  }

  return {
    card: normalizedCard,
    score,
    matchedFields: [...new Set(matchedFields)],
    snippets: snippets.slice(0, 5)
  };
}

function normalizeFieldMatchKey(value: string): string {
  return normalizeSearchFieldValue(value)
    .replace(/[#\uFF03]+/g, "")
    .replace(/[_\-\s/\\.,;:|()[\]{}"'`\u3001\u3002\uFF0C\uFF1B\uFF1A\uFF01\uFF1F!?]+/g, "");
}

function filterCardsByFieldQueries(cards: MemoryCard[], filters: SearchFieldQuery[]): MemoryCard[] {
  if (filters.length === 0) {
    return cards;
  }

  return cards.filter((card) => filters.every((filter) => matchesFieldQuery(card, filter)));
}

function matchesFieldQuery(card: MemoryCard, filter: SearchFieldQuery): boolean {
  switch (filter.field) {
    case "type":
      return card.type === filter.value;
    case "scope":
      return card.scope === filter.value;
    case "status":
      return card.status === filter.value;
    case "tag":
    case "tags":
      return card.tags.some((tag) => fieldValueMatches(tag, filter.value));
    case "owner":
      return Boolean(card.owner && fieldValueMatches(card.owner, filter.value));
    case "due":
      return Boolean(card.dueAt && fieldValueMatches(card.dueAt, filter.value));
  }
}

function fieldValueMatches(value: string, filterValue: string): boolean {
  const normalizedValue = normalizeSearchFieldValue(value);
  const compactValue = normalizeFieldMatchKey(value);
  const compactFilterValue = normalizeFieldMatchKey(filterValue);

  return (
    normalizedValue.includes(filterValue) ||
    (compactFilterValue.length > 0 && compactValue.includes(compactFilterValue))
  );
}

function findMatchingTermVariant(text: string, term: string): string | undefined {
  return searchTermVariants(term).find((variant) => text.includes(variant));
}

function searchTermVariants(term: string): string[] {
  const variants = new Set([term]);

  if (!/^[a-z]+$/.test(term) || term.length < 5) {
    return [...variants];
  }

  if (term.endsWith("ies") && term.length > 5) {
    variants.add(`${term.slice(0, -3)}y`);
  }

  if (term.endsWith("es") && term.length > 5) {
    variants.add(term.slice(0, -2));
  }

  if (term.endsWith("s") && !term.endsWith("ss")) {
    variants.add(term.slice(0, -1));
  }

  if (term.endsWith("ed") && term.length > 5) {
    const base = term.slice(0, -2);
    variants.add(base);
    variants.add(`${base}e`);
  }

  if (term.endsWith("ing") && term.length > 6) {
    const base = term.slice(0, -3);
    variants.add(base);
    variants.add(`${base}e`);
  }

  variants.add(`${term}s`);
  variants.add(`${term}es`);

  if (term.endsWith("e")) {
    const base = term.slice(0, -1);
    variants.add(`${base}ed`);
    variants.add(`${base}ing`);
  } else {
    variants.add(`${term}ed`);
    variants.add(`${term}ing`);
  }

  return [...variants].filter((variant) => variant.length >= 4);
}

function formatSearchMetadata(card: MemoryCard, redactionSensitivity?: Sensitivity): string {
  return [
    `scope=${card.scope}`,
    card.owner
      ? `owner=${redactionSensitivity ? redactProtectedText(card.owner, redactionSensitivity) : card.owner}`
      : "",
    card.dueAt ? `due=${card.dueAt}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function formatSearchTags(card: MemoryCard, redactionSensitivity?: Sensitivity): string {
  return card.tags
    .map((tag) => (redactionSensitivity ? redactProtectedText(tag, redactionSensitivity) : tag))
    .join(", ");
}

function addSnippet(
  snippets: SearchSnippet[],
  field: SearchSnippet["field"],
  sourceText: string,
  term: string,
  redactionSensitivity?: Sensitivity,
  matchedTermRedactionSensitivity: Sensitivity | undefined = redactionSensitivity,
  visibleTerm = term
): void {
  const text =
    field === "metadata"
      ? makeFullSnippet(sourceText, redactionSensitivity)
      : makeSnippet(sourceText, term, redactionSensitivity);
  const matchedTerm = makeVisibleMatchedTerm(visibleTerm, text, matchedTermRedactionSensitivity);
  const existing = snippets.find((snippet) => snippet.field === field && snippet.text === text);

  if (existing) {
    if (!existing.matchedTerms.includes(matchedTerm) && existing.matchedTerms.length < MAX_MATCHED_TERMS_PER_SNIPPET) {
      existing.matchedTerms.push(matchedTerm);
    }

    return;
  }

  snippets.push({
    field,
    text,
    matchedTerms: [matchedTerm]
  });
}

function makeVisibleMatchedTerm(
  term: string,
  visibleSnippet: string,
  redactionSensitivity: Sensitivity | undefined
): string {
  const normalizedTerm = normalizeText(term);
  const termSensitivity = classifySensitivity(normalizedTerm);
  const termAppearsInVisibleSnippet = visibleSnippet.toLowerCase().includes(normalizedTerm.toLowerCase());

  if (termSensitivity !== "normal") {
    return truncateMatchedTerm(redactProtectedText(normalizedTerm, termSensitivity));
  }

  if (redactionSensitivity && !termAppearsInVisibleSnippet) {
    return truncateMatchedTerm(redactProtectedText(normalizedTerm, redactionSensitivity));
  }

  return truncateMatchedTerm(normalizedTerm);
}

function truncateMatchedTerm(term: string): string {
  if (term.length <= MAX_MATCHED_TERM_LENGTH) {
    return term;
  }

  return `${term.slice(0, MAX_MATCHED_TERM_LENGTH - 3)}...`;
}

function makeFullSnippet(sourceText: string, redactionSensitivity: Sensitivity | undefined): string {
  const normalized = normalizeText(sourceText);
  return redactionSensitivity ? redactProtectedText(normalized, redactionSensitivity) : normalized;
}

function makeSnippet(
  sourceText: string,
  term: string,
  redactionSensitivity: Sensitivity | undefined,
  radius = 44
): string {
  const normalized = normalizeText(sourceText);
  const lower = normalized.toLowerCase();
  const index = lower.indexOf(term.toLowerCase());
  const fullSnippet = redactionSensitivity ? redactProtectedText(normalized, redactionSensitivity) : normalized;

  if (index < 0 || normalized.length <= radius * 2) {
    return fullSnippet;
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(normalized.length, index + term.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";

  const snippet = `${prefix}${normalized.slice(start, end)}${suffix}`;

  return redactionSensitivity ? redactProtectedText(snippet, redactionSensitivity) : snippet;
}
