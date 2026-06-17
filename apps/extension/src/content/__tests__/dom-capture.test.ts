/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import { MAX_SOURCE_TURN_TEXT_LENGTH, MAX_SOURCE_TURNS_PER_ARCHIVE } from "@contextvault/shared";
import { captureConversationFromDom } from "../dom-capture";

describe("DOM conversation capture", () => {
  beforeEach(() => {
    document.title = "Fixture conversation";
    document.body.innerHTML = "";
  });

  it("captures ChatGPT turns from data-message-author-role nodes", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">请设计 ContextVault。</div>
        <div data-message-author-role="assistant">
          建议使用 Side Panel。
          <button>Copy</button>
          <span hidden>Hidden affordance</span>
          <pre>npm run verify</pre>
        </div>
      </main>
    `;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.captureMethod).toBe("dom");
    expect(capture.turns).toHaveLength(2);
    expect(capture.turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    expect(capture.turns[1]?.text).toContain("```");
    expect(capture.turns[1]?.text).toContain("npm run verify");
    expect(capture.turns[1]?.text).not.toMatch(/\bCopy\b/);
    expect(capture.turns[1]?.text).not.toMatch(/Hidden affordance/);
    expect(capture.turns[1]?.sourceSelector).toBe("[data-message-author-role]");
  });

  it("captures Gemini turns from provider-specific nodes", () => {
    document.body.innerHTML = `
      <main>
        <user-query>下一步做什么？</user-query>
        <model-response id="model-response-message-1">实现 Gemini adapter 并补测试。</model-response>
      </main>
    `;

    const capture = captureConversationFromDom("gemini");

    expect(capture.turns).toHaveLength(2);
    expect(capture.turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    expect(capture.turns[1]?.text).toContain("Gemini adapter");
  });

  it("captures Claude turns from data-testid nodes", () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="user-message">Summarize the plan.</div>
        <div data-testid="assistant-message">Use local-first storage and source anchors.</div>
      </main>
    `;

    const capture = captureConversationFromDom("claude");

    expect(capture.turns).toHaveLength(2);
    expect(capture.turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
  });

  it("emits no_dom_turns warning when no useful content is visible", () => {
    document.body.innerHTML = `<main><button>Copy</button></main>`;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns).toEqual([]);
    expect(capture.warnings.map((warning) => warning.code)).toContain("no_dom_turns");
  });

  it("warns when provider selectors fall back to generic content", () => {
    document.body.innerHTML = `
      <main>
        <p>User asks for a searchable memory vault design.</p>
        <p>Assistant recommends local-first storage and reviewed cards.</p>
      </main>
    `;

    const capture = captureConversationFromDom("gemini");

    expect(capture.turns).toHaveLength(2);
    expect(capture.warnings.map((warning) => warning.code)).toContain("provider_selector_fallback");
  });

  it("falls back when provider selectors exist but contain no useful text", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="assistant"><button>Copy</button></div>
        <article>User asks for a resilient capture fallback.</article>
        <article>Assistant recommends falling back when provider nodes are empty.</article>
      </main>
    `;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns).toHaveLength(2);
    expect(capture.turns.map((turn) => turn.sourceSelector)).toEqual(["main article", "main article"]);
    expect(capture.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["provider_selector_empty", "provider_selector_fallback"])
    );
  });

  it("warns when DOM capture looks sparse", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="assistant">Only one assistant answer is visible.</div>
      </main>
    `;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns).toHaveLength(1);
    expect(capture.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["sparse_dom_capture", "missing_user_turn"])
    );
  });

  it("warns when captured DOM text volume is very low", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">OK?</div>
        <div data-message-author-role="assistant">Yes.</div>
      </main>
    `;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns).toHaveLength(2);
    expect(capture.warnings.map((warning) => warning.code)).toContain("low_text_volume_dom_capture");
  });

  it("warns when duplicate DOM turns are removed", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">Design ContextVault.</div>
        <div data-message-author-role="user">Design ContextVault.</div>
        <div data-message-author-role="assistant">Use reviewed memory cards.</div>
      </main>
    `;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns).toHaveLength(2);
    expect(capture.warnings.map((warning) => warning.code)).toContain("duplicate_dom_turns_removed");
  });

  it("keeps long same-prefix DOM turns when their full text differs", () => {
    const sharedPrefix = "A".repeat(320);
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">${sharedPrefix} First distinct requirement.</div>
        <div data-message-author-role="user">${sharedPrefix} Second distinct requirement.</div>
        <div data-message-author-role="assistant">Use reviewed memory cards.</div>
      </main>
    `;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns).toHaveLength(3);
    expect(capture.turns[0]?.text).toContain("First distinct requirement.");
    expect(capture.turns[1]?.text).toContain("Second distinct requirement.");
    expect(capture.warnings.map((warning) => warning.code)).not.toContain("duplicate_dom_turns_removed");
  });

  it("limits DOM capture to the maximum source turns with a warning", () => {
    document.body.innerHTML = `<main>${Array.from(
      { length: MAX_SOURCE_TURNS_PER_ARCHIVE + 1 },
      (_, index) => `<div data-message-author-role="${index % 2 === 0 ? "user" : "assistant"}">Visible bounded turn ${index} with enough text.</div>`
    ).join("")}</main>`;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns).toHaveLength(MAX_SOURCE_TURNS_PER_ARCHIVE);
    expect(capture.turns.at(-1)?.text).toContain(`Visible bounded turn ${MAX_SOURCE_TURNS_PER_ARCHIVE - 1}`);
    expect(JSON.stringify(capture.turns)).not.toContain(`Visible bounded turn ${MAX_SOURCE_TURNS_PER_ARCHIVE}`);
    expect(capture.warnings.map((warning) => warning.code)).toContain("dom_turn_limit_reached");
    expect(capture.warnings.map((warning) => warning.code)).not.toContain("duplicate_dom_turns_removed");
  });

  it("truncates oversized DOM turn text with a warning", () => {
    const character = String.fromCodePoint(0x1f642);

    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">${"A".repeat(MAX_SOURCE_TURN_TEXT_LENGTH - 1)}${character}</div>
        <div data-message-author-role="assistant">Use bounded DOM capture.</div>
      </main>
    `;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns[0]?.text).toHaveLength(MAX_SOURCE_TURN_TEXT_LENGTH - 1);
    expect(capture.turns[0]?.text).toBe("A".repeat(MAX_SOURCE_TURN_TEXT_LENGTH - 1));
    expect(capture.warnings.map((warning) => warning.code)).toContain("dom_turn_text_truncated");
  });
  it("warns when provider role metadata is unknown", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="developer">System design note.</div>
        <div data-message-author-role="assistant">Keep source anchors.</div>
      </main>
    `;

    const capture = captureConversationFromDom("chatgpt");

    expect(capture.turns.map((turn) => turn.role)).toEqual(["unknown", "assistant"]);
    expect(capture.warnings.map((warning) => warning.code)).toContain("unknown_role_detected");
  });
});
