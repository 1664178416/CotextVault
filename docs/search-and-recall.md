# Search And Recall

## Goal

The value of ContextVault is not storage. The value is recalling the right memory at the moment the user resumes work.

## Retrieval Modes

### Full Text Search

Use keyword search for exact terms:

- project names
- filenames
- API names
- decisions
- people
- dates
- error messages

Recommended engine:

- MVP browser-only: IndexedDB-backed search library or lightweight local index.
- Desktop/local app path: SQLite FTS5.

### Semantic Search

Use embeddings for conceptual recall:

- "Why did we choose this capture approach?"
- "What are my preferences for AI memory tools?"
- "Find reusable prompts about paper reading."

Recommended engines:

- MVP: remote embedding provider if user configures API key.
- Local-first later: local embedding model via native helper or desktop app.
- Vector storage options: sqlite-vec, LanceDB, pgvector for server/team edition.

### Hybrid Search

Use both keyword and vector retrieval.

Recommended flow:

1. Run FTS/BM25 query.
2. Run vector query.
3. Merge results.
4. Deduplicate by memory id.
5. Apply filters.
6. Rerank top candidates.
7. Show source-grounded snippets.

## Recall Context

When user opens an AI conversation, compute a recall query from:

- current page provider
- conversation title
- visible recent turns if user allows
- selected project
- user-entered search query

The side panel should display related memories without automatically injecting them.

## Ranking Signals

| Signal | Why It Matters |
| --- | --- |
| Text relevance | Exact project and API names matter. |
| Semantic similarity | Captures conceptual continuity. |
| Recency | Recent project context is often more useful. |
| Memory type | Decisions and preferences may outrank generic facts. |
| User pin | Explicitly important memory should rise. |
| Source confidence | Higher extraction confidence can help ranking. |
| Project match | Project-scoped memories should beat unrelated global memories. |

## Filters

User-facing filters:

- project
- provider
- type
- tag
- created date
- source conversation
- sensitivity
- confirmed only
- pinned

## Browser MVP Query Syntax

The browser MVP supports lightweight field queries inside the recall search box. The side panel recall view searches accepted memories; these filters are applied before keyword scoring, so they narrow the candidate set while the remaining plain terms still rank title, body, tag, type, and metadata matches.

Supported fields:

- `type:decision`, `type:todo`, `type:method`
- `scope:project`, `scope:conversation`, `scope:global`
- aliases for common recall wording: `type:fact`, `type:task`, `type:workflow`, `type:citation`, `scope:chat`, `scope:workspace`, `status:saved`, `status:draft`
- Chinese field names and values for the side panel: `类型:事实`, `类型:决策记录`, `类型:待办事项`, `范围:对话`, `范围:项目`, `状态:已保存`, `标签:召回`, `所有者:wyh`, `截止时间:2026-06`
- `tag:recall` or `tags:recall`
- `owner:wyh` for todo cards
- `due:2026-06` for todo cards

Quoted values are supported when a field value contains spaces:

```text
owner:"Context Vault" tag:"follow up" importer
类型:事实 标签:“长期 偏好” 侧边栏
```

The field matcher is intentionally forgiving for common recall input. Type, scope, and status filters accept common English and Chinese aliases before matching the stored enum values, so users can write `type:fact` or `类型:事实` for `project_fact`, `type:task` or `类型:任务` for `todo`, `scope:chat` or `范围:对话` for `conversation`, and `status:saved` or `状态:已保存` for `accepted`. Quoted values can use straight quotes, backticks, Chinese curly quotes, or book-title quotes. For tag, owner, and due filters, punctuation and spacing differences are compacted, so `tag:follow-up` can match `follow up`, `owner:context_vault` can match `Context Vault team`, and `due:20260609` can match an ISO due date such as `2026-06-09T00:00:00.000Z`.

The side panel type and scope dropdowns still work as explicit UI filters. Field queries are useful when the user wants to paste a compact query, combine metadata constraints with keywords, or copy search terms between tools.

## Return Formats

### Compact Context

```md
Relevant Context:
- ContextVault MVP is local-first and user-initiated.
  Meta: scope=project tags=#mvp #privacy
  Source: archive=archive-1 turn=turn-12
- Use Chrome Side Panel for capture/review/search UI.
  Meta: scope=project tags=#side-panel
  Source: archive=archive-1 turn=turn-12
- Avoid DNR/webRequest as response-body extraction strategy.
  Meta: scope=global tags=#capture #privacy
  Source: archive=archive-1 turn=turn-8
```

### Source-Grounded Context

```md
Relevant Context:
1. ContextVault MVP is local-first and user-initiated.
   Source: ChatGPT conversation "ContextVault design", 2026-06-07, turn 12.
2. Use Chrome Side Panel for capture/review/search UI.
   Source: ChatGPT conversation "ContextVault design", 2026-06-07, turn 12.
```

### Task Resume Context

```md
We are continuing ContextVault development.

Known decisions:
- The MVP uses a Chrome MV3 extension with React Side Panel.
- Capturing response bodies should use official export/import, MAIN world page interception, DevTools mode, or DOM fallback rather than relying on DNR/webRequest.
- Permanent memories require user confirmation.

Next tasks:
- Scaffold extension.
- Implement ChatGPT and Gemini adapters.
- Build review queue and local search.
```

## UI Behavior

Side panel recall view should support:

- search box
- search input limits; the browser MVP caps recall queries at 2,000 characters at both the side panel input and runtime/service boundary so accidental large paste payloads cannot become search workload
- search state feedback; the side panel distinguishes an empty accepted-memory library from a search/filter set with no matches, and warns when the query is close to or at the browser-side character limit
- manual memory composer; pasted or typed notes become accepted, source-grounded memories backed by a local clipboard/manual archive, exact accepted duplicates return the existing memory, distinct cards from the same source reuse the same archive, todo entries can include owner and due date, sensitive/secret drafts require confirmation, oversized bodies are rejected before storage, duplicate submits are disabled while creating, and failed or cancelled creates should keep the draft text intact
- type and scope filters; the browser MVP currently supports filtering accepted memories by memory card type and scope
- lightweight query normalization for common recall input such as `#tag`, `type:decision`, `scope:project`, and common English/Chinese punctuation; this is not a full query language, and queries that collapse to only field labels or punctuation fall back to the normal recent-memory recall list
- match snippets; the browser MVP currently returns short title/body/tag/type/metadata snippets for matched query terms
- matched-term chips; search snippets can show the terms that caused a match, but these chips are generated from the same redacted view as the snippet, capped per snippet, and truncated so search explainability does not become a new sensitive-data leak
- metadata search; scope is indexed for all cards, while owner and due date are indexed only for todo cards
- snippet redaction; sensitive and secret result snippets are redacted before display while remaining discoverable, and protected snippets without a known redaction-pattern match use a generic placeholder instead of the original text
- metadata chips; accepted memory cards show scope, and todo cards also show owner and due date when available
- project filter, later expanded into richer project matching
- result cards
- visible-result selection controls, so prompt copy works only from the currently shown recall set
- source preview
- copy button; prompt-ready copy keeps memory cards source-grounded but may include only the first few source anchors per card with an explicit omitted-anchor count, confirms before copying when selected cards or source anchors will be omitted by the prompt budget, and checks sensitive disclosure against only the cards that will actually be copied; Markdown/JSON exports retain full source anchors
- clipboard fallback; if the browser Clipboard API rejects a copy request, the side panel should try a focused textarea fallback and show a safe error that does not include the copied memory text
- inject button when available
- pin/unpin
- archive

The product should never silently inject memory into a live AI prompt without a visible user action.
