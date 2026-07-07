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

const FIELD_VALUE_ALIASES: Record<SearchFieldQueryName, Record<string, string>> = {
  type: {
    action: "todo",
    actionitem: "todo",
    actionitems: "todo",
    "办法": "method",
    "偏好": "preference",
    "长期偏好": "preference",
    "长期偏好设置": "preference",
    citation: "citation_anchor",
    citationanchor: "citation_anchor",
    citations: "citation_anchor",
    decisionrecord: "decision",
    evidence: "citation_anchor",
    fact: "project_fact",
    facts: "project_fact",
    "复用方法": "method",
    "方法": "method",
    method: "method",
    methods: "method",
    note: "project_fact",
    notes: "project_fact",
    preference: "preference",
    preferences: "preference",
    process: "method",
    projectfact: "project_fact",
    "任务": "todo",
    "事实": "project_fact",
    "事项": "todo",
    "待办": "todo",
    "待办事项": "todo",
    "决策": "decision",
    "决策记录": "decision",
    "记录": "decision",
    "项目事实": "project_fact",
    reference: "citation_anchor",
    source: "citation_anchor",
    task: "todo",
    tasks: "todo",
    template: "method",
    todo: "todo",
    todos: "todo",
    workflow: "method",
    "引用": "citation_anchor",
    "证据": "citation_anchor"
  },
  scope: {
    all: "global",
    chat: "conversation",
    convo: "conversation",
    conversation: "conversation",
    global: "global",
    personal: "global",
    project: "project",
    proj: "project",
    thread: "conversation",
    workspace: "project",
    "工作区": "project",
    "个人": "global",
    "全局": "global",
    "项目": "project",
    "线程": "conversation",
    "对话": "conversation"
  },
  status: {
    accepted: "accepted",
    archive: "archived",
    archived: "archived",
    confirmed: "accepted",
    deleted: "archived",
    draft: "proposed",
    pending: "proposed",
    proposed: "proposed",
    rejected: "rejected",
    saved: "accepted",
    superseded: "superseded",
    "草稿": "proposed",
    "待确认": "proposed",
    "已保存": "accepted",
    "已归档": "archived",
    "已接受": "accepted",
    "已拒绝": "rejected",
    "已确认": "accepted"
  },
  tag: {},
  tags: {},
  owner: {},
  due: {}
};

const FIELD_NAME_ALIASES: Record<string, SearchFieldQueryName> = {
  due: "due",
  owner: "owner",
  scope: "scope",
  status: "status",
  tag: "tag",
  tags: "tags",
  type: "type",
  "标签": "tag",
  "标签名": "tag",
  "范围": "scope",
  "负责人": "owner",
  "截止": "due",
  "截止日": "due",
  "截止日期": "due",
  "截止时间": "due",
  "类型": "type",
  "所有者": "owner",
  "状态": "status"
};
const FIELD_NAME_PATTERN = Object.keys(FIELD_NAME_ALIASES).map(escapeRegExp).join("|");
const FIELD_QUERY_PATTERN =
  new RegExp(
    `(^|[\\s,;\\uFF0C\\uFF1B|()[\\]{}\\u3001\\u3002\\uFF01\\uFF1F!?]+)(${FIELD_NAME_PATTERN})[\\uFF1A:](?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`|“([^”]*)”|‘([^’]*)’|《([^》]*)》|([^\\s,;\\uFF0C\\uFF1B|()[\\]{}\\u3001\\u3002\\uFF01\\uFF1F!?]+))`,
    "giu"
  );
const QUERY_FIELD_TERMS = new Set(Object.keys(FIELD_NAME_ALIASES));

export function parseRecallSearchQuery(query: string): ParsedSearchQuery {
  const fieldQueries: SearchFieldQuery[] = [];
  const normalizedQuery = normalizeText(query).toLowerCase();
  const text = normalizedQuery.replace(
    FIELD_QUERY_PATTERN,
    (
      _match,
      prefix: string,
      rawField: string,
      doubleQuotedValue: string | undefined,
      singleQuotedValue: string | undefined,
      backtickQuotedValue: string | undefined,
      curlyDoubleQuotedValue: string | undefined,
      curlySingleQuotedValue: string | undefined,
      bookTitleQuotedValue: string | undefined,
      bareValue: string | undefined
    ) => {
      const field = normalizeRecallSearchFieldName(rawField);
      const value = [
        doubleQuotedValue,
        singleQuotedValue,
        backtickQuotedValue,
        curlyDoubleQuotedValue,
        curlySingleQuotedValue,
        bookTitleQuotedValue,
        bareValue
      ]
        .find((capture) => capture !== undefined)
        ?.trim();

      if (value) {
        fieldQueries.push({ field, value: normalizeRecallSearchFieldQueryValue(field, value) });
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

export function normalizeRecallSearchFieldName(field: string): SearchFieldQueryName {
  const aliasKey = normalizeSearchAliasKey(field);

  return FIELD_NAME_ALIASES[aliasKey] ?? "tag";
}

export function normalizeRecallSearchFieldQueryValue(field: SearchFieldQueryName, value: string): string {
  const normalizedValue = normalizeSearchFieldValue(value);
  const aliasKey = normalizeSearchAliasKey(normalizedValue);

  return FIELD_VALUE_ALIASES[field][aliasKey] ?? normalizedValue;
}

function normalizeSearchAliasKey(value: string): string {
  return normalizeSearchFieldValue(value)
    .replace(/[#\uFF03]+/g, "")
    .replace(/[_\-\s/\\.,;:|()[\]{}"'`\u3001\u3002\uFF0C\uFF1B\uFF1A\uFF01\uFF1F!?]+/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
