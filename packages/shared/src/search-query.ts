import { normalizeText } from "./text";

export type SearchFieldQueryName = "type" | "scope" | "tag" | "tags" | "owner" | "due" | "status";

export interface SearchFieldQuery {
  field: SearchFieldQueryName;
  value: string;
}

export interface ParsedSearchQuery {
  text: string;
  fieldQueries: SearchFieldQuery[];
}

const FIELD_QUERY_PATTERN =
  /(^|[\s,;\uFF0C\uFF1B|()[\]{}\u3001\u3002\uFF01\uFF1F!?]+)(type|scope|tag|tags|owner|due|status)[\uFF1A:](?:"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s,;\uFF0C\uFF1B|()[\]{}\u3001\u3002\uFF01\uFF1F!?]+))/giu;
const QUERY_FIELD_TERMS = new Set(["type", "scope", "tag", "tags", "owner", "due", "status"]);

export function parseRecallSearchQuery(query: string): ParsedSearchQuery {
  const fieldQueries: SearchFieldQuery[] = [];
  const normalizedQuery = normalizeText(query).toLowerCase();
  const text = normalizedQuery.replace(
    FIELD_QUERY_PATTERN,
    (
      _match,
      prefix: string,
      field: SearchFieldQueryName,
      doubleQuotedValue: string | undefined,
      singleQuotedValue: string | undefined,
      backtickQuotedValue: string | undefined,
      bareValue: string | undefined
    ) => {
      const value = [doubleQuotedValue, singleQuotedValue, backtickQuotedValue, bareValue]
        .find((capture) => capture !== undefined)
        ?.trim();

      if (value) {
        fieldQueries.push({ field, value: normalizeSearchFieldValue(value) });
      }

      return prefix ? `${prefix} ` : " ";
    }
  );

  return {
    text,
    fieldQueries
  };
}

export function parseRecallSearchTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .replace(/[#\uFF03]/g, " ")
        .replace(/[:\uFF1A]/g, " ")
        .replace(/[,\uFF0C;\uFF1B|()[\]{}"'`\u3001\u3002\uFF01\uFF1F!?]+/g, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => Boolean(term) && !QUERY_FIELD_TERMS.has(term))
    )
  ];
}

export function normalizeSearchFieldValue(value: string): string {
  return normalizeText(value).toLowerCase().replace(/^#+/, "").trim();
}
