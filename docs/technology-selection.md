# Technology Selection

## MVP Recommendation

| Area | Choice | Reason |
| --- | --- | --- |
| Extension platform | Chrome MV3 | Target platform for side panel and capture. |
| Language | TypeScript | Safer adapter contracts and schema-heavy code. |
| UI | React | Fast side panel development and rich review workflow. |
| Build tool | Vite | Simple extension-friendly frontend build. |
| UI components | Radix UI or Ariakit plus local styling | Accessible primitives without heavy design lock-in. |
| Extension UI | `chrome.sidePanel` | Persistent workspace beside AI pages. |
| Capture | Adapter system | Keeps provider-specific logic isolated. |
| Browser storage | IndexedDB | Available in extension context and good for MVP local data. |
| Search MVP | Local keyword index, later SQLite FTS5 | Browser-first practicality, desktop-grade path later. |
| Embeddings | Provider-configurable | Avoid hard dependency and allow local/remote choice. |
| Schema validation | Zod or TypeBox | Runtime validation for capture and extraction payloads. |
| Tests | Vitest + Playwright | Unit tests for adapters, browser tests for extension behavior. |

## Storage Options

### IndexedDB

Best for browser-only MVP.

Pros:

- Native browser storage.
- Works in extension contexts.
- Good enough for local archives and cards.

Cons:

- Search is weaker than SQLite FTS.
- Backup and inspection are less ergonomic.
- Large datasets can become awkward.

Recommendation:

- Use IndexedDB for MVP.
- Keep repository interfaces abstract enough to move to SQLite later.

### SQLite FTS5

Best for desktop/local app or native helper.

Pros:

- Excellent full-text search.
- Durable and inspectable.
- Mature migration and backup story.

Cons:

- Harder inside a pure Chrome extension.
- Browser SQLite/WASM options add complexity.

Recommendation:

- Document as the target storage/search engine for the local app path.

### Vector Storage

Options:

- sqlite-vec for SQLite-native vector search.
- LanceDB for local vector database.
- pgvector for future server/team edition.

MVP recommendation:

- Store embeddings in IndexedDB if remote embeddings are enabled.
- Add a replaceable vector repository interface.

## Capture Technology

| Technology | Use | Do Not Use For |
| --- | --- | --- |
| Official export/import | Stable historical backfill | Real-time capture only. |
| MAIN world fetch/XHR patch | Active conversation capture | Broad cross-site monitoring. |
| DevTools network `getContent()` | Diagnostic/advanced mode | Default side panel workflow. |
| DOM extraction | Fallback | High-fidelity source capture. |
| Clipboard paste | Last resort | Automated capture. |
| `webRequest` | Observing request metadata | Reading response JSON body. |
| DNR | Rule-based block/redirect/header changes | Extracting response body. |

## LLM Extraction

Provider interface:

```ts
export interface MemoryExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}
```

Implementations:

- manual-only extractor for tests
- OpenAI-compatible remote extractor
- local model extractor later

Prompt output:

- JSON only
- validated against schema
- source anchors required

## Suggested Initial Monorepo Layout

```txt
apps/
  extension/
    src/
      background/
      content/
      main-world/
      sidepanel/
      adapters/
      storage/
      search/
      extraction/
packages/
  shared/
    src/
      schemas/
      types/
      crypto/
      source-anchors/
docs/
schemas/
```

## Future Stack Paths

### Browser Extension Only

Good for a focused MVP.

Limitations:

- storage/search constraints
- harder local file sync
- remote embedding dependence unless using small browser models

### Extension Plus Desktop Helper

Best long-term local-first product shape.

Capabilities:

- SQLite FTS5
- local embeddings
- encrypted local files
- Obsidian/Yuque sync workers
- larger archive handling

### SaaS/Team Edition

Only after personal local-first product is proven.

Capabilities:

- account sync
- team memory spaces
- admin controls
- pgvector-backed search
- audit logs

