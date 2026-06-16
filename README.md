# ContextVault

ContextVault is a local-first personal work memory system for AI conversations.

It captures high-value context from ChatGPT, Gemini, Claude, and other AI web sessions, turns raw conversations into reviewed memory cards, and makes those memories searchable and reusable in future work.

Chinese name options:

- 语境金库
- 上下文金库

## Product Positioning

ContextVault is not a chat-history dump or a fragile background crawler. It is a deliberate memory tool:

1. Users actively choose which conversations to preserve.
2. Raw conversations are stored as immutable source archives.
3. LLMs extract reusable memory cards from the source.
4. Users confirm cards before they become permanent memory.
5. Every memory links back to the exact source conversation and turn.

## MVP

The first usable version should be simple:

1. Open a ChatGPT or Gemini conversation in Chrome.
2. Click "沉淀当前对话" in the extension side panel.
3. Review structured cards for facts, decisions, todos, preferences, reusable methods, and citations.
4. Confirm the useful cards.
5. Search saved memories.
6. Copy selected memories back into a new AI conversation.

## Core Principles

- Local first: user data stays on the user's machine by default.
- User initiated: avoid always-on collection for the first version.
- Source grounded: every memory must trace back to raw conversation turns.
- Review before permanence: automatic extraction is allowed, permanent memory requires confirmation.
- Adapter based: ChatGPT, Gemini, Claude, and future targets use explicit capture adapters.
- Privacy by design: collect the least data needed, encrypt sensitive local stores, and expose clear deletion/export paths.

## Recommended Stack

- Browser extension: Chrome MV3, TypeScript, React, Vite.
- UI surface: `chrome.sidePanel`.
- Capture: official exports, provider DOM adapters, clipboard fallback, and optional MAIN world `fetch` / `XMLHttpRequest` interception after explicit opt-in.
- Local storage: IndexedDB for browser MVP; SQLite FTS5 for desktop/local app path.
- Search: BM25 / SQLite FTS5 plus embeddings for hybrid retrieval.
- Sync/export targets: Markdown, Obsidian, Notion, Yuque.

## Documentation

- [Product Design](./docs/product-design.md)
- [Technical Architecture](./docs/technical-architecture.md)
- [Capture Strategy](./docs/capture-strategy.md)
- [Memory Model](./docs/memory-model.md)
- [Search And Recall](./docs/search-and-recall.md)
- [Data Model](./docs/data-model.md)
- [Security And Privacy](./docs/security-and-privacy.md)
- [Technology Selection](./docs/technology-selection.md)
- [MVP Roadmap](./docs/mvp-roadmap.md)
- [Development Plan](./docs/development-plan.md)
- [Official References](./docs/references.md)

## Development

Install dependencies:

```bash
npm install
```

Run type checks:

```bash
npm run check
```

Run tests:

```bash
npm run test
```

Build the Chrome extension:

```bash
npm run build
```

Run the full verification gate:

```bash
npm run verify
```

Load the unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `apps/extension/dist`.

Current MVP behavior:

- opens a Chrome Side Panel UI
- detects supported AI providers
- captures visible conversation turns through DOM fallback
- validates conversation capture payloads before archive processing
- records DOM capture health warnings when provider selectors fall back, capture is sparse, duplicate turns are removed, or roles look incomplete
- stores immutable raw archives in IndexedDB
- deduplicates exact repeat captures by archive content hash
- proposes heuristic memory cards
- classifies reusable workflow/checklist/prompt snippets as method cards before broader decision matches
- skips obvious secret snippets when proposing memory cards
- lets users edit, accept, reject, bulk accept, bulk reject, search, filter by memory type and scope, inspect match snippets, copy, and delete memory cards
- lets users set candidate memory scope, tags, and todo owner/due dates during review so accepted cards are easier to retrieve and reuse
- shows accepted memory scope, owner, and due metadata directly on recall cards, with redaction for protected previews
- asks for confirmation before bulk-accepting sensitive/secret draft memory cards or bulk-rejecting multiple candidates
- rejects memory card edits that lose valid source anchors or point to source text that no longer matches
- rejects memory card updates for IDs that do not already exist locally
- rejects memory card deletes for IDs that do not already exist locally
- confirms memory card deletion with type/status/sensitivity details and redacted protected titles
- copies selected memories as prompt-ready context with scope/tags/owner/due metadata and source anchors, with full and redacted copy paths
- asks for confirmation before full-copying or full-exporting sensitive/secret memory content
- lets redacted copy/export skip disclosure prompts because sensitive values are replaced before leaving the vault
- supports redacted copy, Markdown export, tags, structured metadata search, and sensitive search snippets that replace common secrets, credentials, emails, SSNs, and card-like numbers
- lets users jump from a proposed or accepted memory card to the exact source archive turn and quoted evidence span
- exports accepted, proposed, or all memory statuses as source-grounded Markdown
- imports external conversation capture JSON plus ChatGPT export `.zip` / `conversations.json` files through the same source archive and memory extraction pipeline
- summarizes import quality warnings after conversation import, including official-export normalization, fallback mapping, skipped non-text parts, and sensitive/secret content notices
- lets users view, delete, export, and re-import JSON vault archives, with archive deletion warnings that count referenced memory card statuses
- validates ContextVault JSON imports before writing to local storage
- rejects invalid provider, capture method, role, memory type, scope, status, and sensitivity enum values during import/message validation
- rejects JSON imports with malformed memory card fields, duplicate archive content hashes, broken archive/turn/source-anchor references, missing anchors, duplicate IDs, invalid spans, or quote mismatches
- reports JSON import validation failures with field paths such as `$.archives[0].archive.provider`
- rejects JSON imports that would overwrite existing local archives, source turns, or memory cards
- reports empty, oversized, malformed, and structurally invalid JSON imports with user-facing errors
- validates service worker, content script, and MAIN world bridge messages before handling them
- surfaces JSON import parse/validation failures in the side panel
- includes a disabled-by-default MAIN world network interceptor bridge for future stream capture
- verifies core privacy, formatting/export, extraction, search, text, import/message validation, DOM capture fixtures and health warnings, capture processing, IndexedDB storage behavior, review-state rules, cross-layer workflow fixtures, and vault workflow with Vitest

## Repository Status

This repository contains the product/engineering design baseline and the first buildable Chrome MV3 extension MVP.
