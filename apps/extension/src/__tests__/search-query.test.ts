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

  it("normalizes user-friendly field value aliases", () => {
    const parsed = parseRecallSearchQuery("type:fact scope:chat status:saved tag:recall");

    expect(parsed.fieldQueries).toEqual([
      { field: "type", value: "project_fact" },
      { field: "scope", value: "conversation" },
      { field: "status", value: "accepted" },
      { field: "tag", value: "recall" }
    ]);
  });

  it("supports Chinese field names and value aliases", () => {
    const parsed = parseRecallSearchQuery("类型:事实 范围:对话 状态:已保存 标签:召回 截止:2026-06");

    expect(parsed.fieldQueries).toEqual([
      { field: "type", value: "project_fact" },
      { field: "scope", value: "conversation" },
      { field: "status", value: "accepted" },
      { field: "tag", value: "召回" },
      { field: "due", value: "2026-06" }
    ]);
    expect(parseRecallSearchTerms(parsed.text)).toEqual([]);
  });

  it("supports Chinese memory label aliases from the side panel vocabulary", () => {
    const parsed = parseRecallSearchQuery("类型:决策记录 范围:项目 所有者:wyh 截止时间:2026-06-09 标签名:方案");

    expect(parsed.fieldQueries).toEqual([
      { field: "type", value: "decision" },
      { field: "scope", value: "project" },
      { field: "owner", value: "wyh" },
      { field: "due", value: "2026-06-09" },
      { field: "tag", value: "方案" }
    ]);
  });

  it("supports Chinese and curly quoted field values", () => {
    const parsed = parseRecallSearchQuery("标签：“长期 偏好” 负责人:‘Context Vault’ 类型:《任务》 followup");

    expect(parsed.fieldQueries).toEqual([
      { field: "tag", value: "长期 偏好" },
      { field: "owner", value: "context vault" },
      { field: "type", value: "todo" }
    ]);
    expect(parseRecallSearchTerms(parsed.text)).toEqual(["followup"]);
  });
});
