import { describe, expect, it } from "vitest";
import { truncateToCodePointBoundary } from "@contextvault/shared";

describe("shared text helpers", () => {
  it("truncates without leaving dangling surrogate pairs", () => {
    const character = String.fromCodePoint(0x1f642);

    expect(truncateToCodePointBoundary(`${character}AB`, 1)).toBe("");
    expect(truncateToCodePointBoundary(`${character}AB`, 2)).toBe(character);
    expect(truncateToCodePointBoundary(`A${character}B`, 2)).toBe("A");
    expect(truncateToCodePointBoundary(`A${character}B`, 3)).toBe(`A${character}`);
  });
});
