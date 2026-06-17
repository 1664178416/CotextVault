# Development Plan

## First Implementation Slice

Build the thinnest useful extension path:

```txt
Side panel button
  -> active tab provider detection
  -> DOM fallback capture
  -> raw archive save
  -> manual memory card creation
  -> local keyword search
  -> copy card as Markdown
```

This gives a usable tool before network interception and LLM extraction are complete.

## Recommended Issue Breakdown

### Foundation

- Scaffold `apps/extension` with Vite, React, TypeScript.
- Add MV3 manifest and side panel.
- Add message bus between side panel, service worker, and content script.
- Add runtime guards for service worker requests, content script requests, and MAIN world bridge messages.
- Add provider detector.
- Add shared type package.

### Storage

- Add IndexedDB wrapper.
- Implement archive repository.
- Implement memory card repository.
- Add schema migrations.
- Add export/import for JSON backup.
- Validate JSON imports before writing local storage.
- Reject invalid enum values in imported archives, turns, memory cards, and runtime messages.

### Capture

- Implement generic DOM capture.
- Implement ChatGPT DOM capture.
- Implement Gemini DOM capture.
- Add MAIN world injection bridge.
- Add ChatGPT network stream capture.
- Add Gemini network stream capture.

### Memory

- Add extraction provider interface.
- Add manual card creation.
- Add LLM extraction prompt.
- Validate extraction JSON.
- Build review queue.
- Support bulk accept/reject in the review queue while keeping sensitive/secret acceptance confirmation.
- Allow reviewers to edit card scope and tags before accepting memory.
- Allow reviewers to set todo owner and due date before accepting memory.
- Add source anchor viewer.
- Add card-level source jump with highlighted archive turn and quoted evidence span.

### Search

- Add keyword index.
- Add search UI.
- Add filters, starting with memory type and scope.
- Add copy-as-Markdown.
- Include source anchors in prompt-ready copy output.
- Add scoped Markdown memory export.
- Add source preview.
- Surface JSON import parse/validation errors in the side panel.

### Privacy

- Add data deletion flows.
- Add sensitive/secret card labels.
- Add provider/API-key settings.
- Add optional vault passphrase design spike.
- Skip obvious secret snippets during automatic memory proposal.

## Suggested First Folder Structure

```txt
apps/
  extension/
    manifest.config.ts
    package.json
    vite.config.ts
    src/
      background/
        service-worker.ts
      content/
        content-script.ts
        bridge.ts
      main-world/
        interceptor.ts
      sidepanel/
        main.tsx
        App.tsx
        views/
        components/
      adapters/
        index.ts
        chatgpt/
        gemini/
        generic-dom/
      storage/
        db.ts
        repositories/
      extraction/
        extractor.ts
        prompts/
      search/
        keyword-index.ts
packages/
  shared/
    src/
      types/
      schemas/
      anchors/
      hashing/
```

## MVP Definition Of Done

- Extension can be loaded manually in Chrome.
- Side panel opens on ChatGPT and Gemini.
- User can capture current conversation.
- Raw archive is saved with source turns.
- Exact repeat captures reuse the existing archive instead of creating duplicate cards.
- User can create or accept memory cards.
- User can search accepted cards.
- User can filter accepted cards by memory type.
- User can copy selected cards as Markdown.
- User can delete archives and cards.
- User can export and re-import ContextVault JSON backups.

## Testing Strategy

### Unit Tests

- provider detector
- adapter normalization
- ChatGPT/Gemini/Claude DOM fixture capture
- cross-layer fixture from provider DOM capture through review, search, prompt copy, Markdown export, source-anchor resolution, and JSON re-import
- capture-to-archive processing pipeline
- vault workflow from capture through storage, search, export, import, and delete
- Markdown memory export formatting
- schema validation
- source anchor mapping
- memory extraction parsing
- extraction type precedence for reusable workflows, todos, preferences, and decisions
- search ranking merge
- vault export validation
- runtime/content/MAIN world message validation
- privacy/secret detection
- text sentence splitting

### Integration Tests

- side panel to service worker message flow
- content script capture request flow
- IndexedDB repository behavior
- archive to card extraction flow
- capture processing produces source archive, source turns, warnings, and proposed memory cards
- vault service persists captures, promotes cards, searches accepted memories, exports/imports JSON, and cascades delete behavior

### Browser Tests

- extension loads
- side panel opens
- capture button dispatches job
- DOM fixture page is captured
- search results render

## Engineering Rules

- Keep adapters isolated by provider.
- Treat provider DOM/network formats as unstable.
- Emit capture health warnings when provider selectors fall back, roles are incomplete, duplicate turns are removed, or the visible capture looks sparse.
- Validate conversation capture payloads before archive processing, regardless of whether they came from DOM, official import, clipboard, DevTools, or MAIN world capture.
- Validate all messages crossing runtime boundaries.
- Store raw archives before extraction.
- Do not promote proposed cards without review.
- Maintain source anchors as first-class data.
- Treat update and delete operations as explicit operations on existing records; do not silently create or ignore missing memory cards.
- Keep capture methods observable through warnings and metadata.
- Keep import/export paths covered by tests before changing storage schemas.
