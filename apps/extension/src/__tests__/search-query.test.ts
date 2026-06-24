import { describe, expect, it } from "vitest";
import { parseRecallSearchQuery, parseRecallSearchTerms } from "@contextvault/shared";

describe("recall search query parsing", () => {
  it("extracts field queries and leaves plain terms for ranking", () => {
    const parsed = parseRecallSearchQuery('capture,(tag:recall) owner:"Context Vault" due:20260609');

    expect(parsed.fieldQueries).toEqual([
      { field: "tag", value: "recall" },
      { field: "owner", value: "context vault" },
      { field: "due", value: "20260609" }
    ]);
    expect(parseRecallSearchTerms(parsed.text)).toEqual(["capture"]);
  });

  it("treats pure field queries as having no plain search terms", () => {
    const parsed = parseRecallSearchQuery("tag:recall owner:wyh");

    expect(parsed.fieldQueries).toEqual([
      { field: "tag", value: "recall" },
      { field: "owner", value: "wyh" }
    ]);
    expect(parseRecallSearchTerms(parsed.text)).toEqual([]);
  });
});
