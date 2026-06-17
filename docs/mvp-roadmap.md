# MVP Roadmap

## Phase 0: Design Baseline

Status: complete in this repository.

Deliverables:

- product design
- technical architecture
- capture strategy
- memory model
- data model
- security model
- technology selection

## Phase 1: Extension Scaffold

Goal:

Create a working Chrome MV3 extension with side panel UI.

Tasks:

- Initialize TypeScript + Vite + React project.
- Add MV3 manifest.
- Add service worker.
- Add side panel entry.
- Add content script.
- Add MAIN world injection shell.
- Add provider routing.
- Add local settings page.

Acceptance:

- Extension loads in Chrome.
- Side panel opens on supported domains.
- Active tab provider is detected.
- Capture button can start a stub capture job.

## Phase 2: Local Archive Store

Goal:

Store normalized raw conversations locally.

Tasks:

- Define shared TypeScript types.
- Add schema validation.
- Implement IndexedDB repositories.
- Add archive list view.
- Add source viewer.
- Add deletion flow.

Acceptance:

- Stub capture can save a source archive.
- Archive can be viewed and deleted.
- Content hash is recorded.

## Phase 3: ChatGPT Adapter

Goal:

Capture current ChatGPT conversation.

Tasks:

- Detect ChatGPT pages.
- Implement MAIN world fetch/XHR event capture.
- Reconstruct streamed assistant messages where possible.
- Implement DOM fallback.
- Normalize turns.
- Add adapter fixtures and tests.

Acceptance:

- Captures a multi-turn ChatGPT conversation.
- Preserves user and assistant roles.
- Preserves code blocks.
- Emits fallback warnings when using DOM.

## Phase 4: Gemini Adapter

Goal:

Capture current Gemini conversation.

Tasks:

- Detect Gemini pages.
- Implement network interception where possible.
- Implement DOM fallback.
- Normalize turns.
- Add fixtures and tests.

Acceptance:

- Captures a multi-turn Gemini conversation.
- Preserves turn order and role labels.
- Emits capture warnings accurately.

## Phase 5: Memory Extraction And Review

Goal:

Generate proposed memory cards and let the user confirm them.

Tasks:

- Build extractor provider interface.
- Add configurable LLM provider.
- Add JSON schema validation.
- Implement extraction prompt.
- Build review queue UI.
- Support accept, reject, edit, tag, and project assignment.

Acceptance:

- Captured archive can produce proposed cards.
- Cards show source anchors.
- Accepted cards become permanent memory.
- Rejected cards do not appear in search.

## Phase 6: Search And Recall

Goal:

Find saved memories and return them to active AI work.

Tasks:

- Implement keyword search.
- Add filters by project/type/tag/provider.
- Add recall view in side panel.
- Add copy-as-Markdown.
- Add source preview.

Acceptance:

- User can search accepted memory cards.
- User can copy selected memories into prompt-ready Markdown.
- User can jump from memory to source archive/turn.

## Phase 7: Export

Goal:

Let users take their memory out of ContextVault.

Tasks:

- Export accepted memory cards as Markdown.
- Export raw archives as JSON.
- Import ContextVault JSON exports for restore/migration.
- Add Obsidian folder format.
- Add Yuque-ready Markdown format.

Acceptance:

- Exported Markdown is readable and source-linked.
- JSON export can be validated and re-imported into ContextVault.
- Invalid JSON shapes are rejected before writing to local storage.

## Post-MVP

- DevTools capture mode.
- SQLite FTS5 desktop helper.
- Embedding search and hybrid retrieval.
- Local embedding model support.
- Claude adapter.
- Notion/Yuque sync.
- Encrypted vault mode.
- Team edition exploration.

## Current Implementation Notes

- Phase 1 and Phase 2 are implemented as a buildable Chrome MV3 extension.
- Phase 5 and Phase 6 have MVP coverage through heuristic memory extraction, review, local keyword search, memory type filtering, and copy-as-Markdown.
- Phase 7 has JSON vault export/import and scoped Markdown memory export coverage; Obsidian, Notion, and Yuque exports remain future work.
- ChatGPT official export import has coverage for current-branch reconstruction, skipped non-text parts, skipped non-conversation roles, empty visible conversations, ZIP entry filtering, and size checks.
- DOM fallback capture has fixture coverage for ChatGPT, Gemini, and Claude-like markup.
- DOM fallback capture records health warnings for provider selector fallback, sparse or low-volume captures, duplicate turn removal, missing roles, and unknown roles.
- Runtime, content-script, and MAIN world bridge messages are validated before handlers run.
- Import and runtime validators reject malformed enum values before data reaches storage or handlers.
- JSON import validators reject malformed archive/turn/card fields, duplicate archive content hashes, broken archive/turn/source-anchor references, missing anchors, duplicate IDs, invalid spans, and quote mismatches before data reaches storage.
- JSON import validation errors include field paths for the first broken values, which makes bad backups and future sync payloads diagnosable.
- JSON import refuses to overwrite existing local archive, source turn, or memory card IDs.
- Capture processing has test coverage for payload validation, archive creation, turn normalization, sensitivity warnings, and proposed memory cards.
- Cross-layer workflow fixture coverage verifies provider DOM capture, card review, accepted-memory search, prompt-ready copy, Markdown export, source-anchor resolution, and JSON re-import together.
- Heuristic extraction prioritizes reusable workflow/checklist/prompt snippets as method cards before broader decision matches.
- Privacy utilities have test coverage for sensitivity classification and disclosure summaries.
- Markdown export disclosure checks use the requested export scope rather than only currently loaded review/search lists.
- Markdown export enablement follows the requested scope, including rejected/archived/superseded cards when exporting all memory statuses.
- Vault workflow has test coverage for capture, storage, card acceptance, search, JSON export/import, and cascade deletion.
- JSON export canonicalization has test coverage for stale sensitivity labels, acceptedAt lifecycle metadata, and todo-only metadata cleanup.
- Vault workflow has test coverage for exact repeat capture deduplication by archive content hash.
- Memory card updates are service-validated so edited cards keep valid source anchors, matching source text, and an existing local card ID before storage.
- Memory card deletes are service-validated so missing IDs return errors instead of silent success.
- Search has test coverage for status filtering, memory type/scope filtering, metadata matches, sensitive-result discoverability, and match snippets.
- Heuristic extraction has test coverage for conservative fallback behavior so ordinary long chat text does not become a project fact without reusable-memory signals.
- Markdown export has test coverage for source-grounded memory card formatting, accepted/all export scopes, and redacted sensitive output.
- Prompt copy formatting includes scope/tags/owner/due metadata and source anchors, supports redacted output, and has test coverage.
- Review-state tests cover todo due-date conversion and owner-sensitive draft classification.
- Memory preview tests cover scope/owner/due metadata display and redaction for protected cards.
- Archive deletion confirmation has test coverage for referenced-card status counts and accepted-memory warnings.
- Memory-card deletion confirmation has test coverage for accepted-memory warnings and protected-title redaction.
- Side panel recall actions include full and redacted prompt-copy paths plus full and redacted Markdown export paths.
- Disclosure confirmation state is tested so unredacted sensitive output prompts the user while redacted output can proceed without extra friction.
- Proposed and accepted memory cards can open their source archive, highlight the anchored turn, and mark the quoted evidence span when available.
- Source preview tests cover quoted evidence span resolution for normal visible turns and suppress quote highlighting while protected source text is still redacted.
- The full verification gate is `npm run verify`, covering TypeScript, Vitest, production extension build, and npm audit.
