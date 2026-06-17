# Capture Strategy

## Principle

Do not treat `chrome.webRequest` or `declarativeNetRequest` as the primary way to read response JSON bodies.

They are useful for observing, analyzing, blocking, redirecting, and modifying request metadata or headers, but they are not the right foundation for extracting streamed conversation content in a Chrome MV3 extension.

## Capture Priority

### 1. Official Export And Import

Use official export/import paths as the most stable historical data entry.

Examples:

- ChatGPT data export ZIP for supported consumer accounts.
- Gemini Apps Activity / Google My Activity where available.

Pros:

- Stable and user-authorized.
- Good for historical backfill.
- Lower risk than scraping.

Cons:

- Not always available for every account type.
- May not preserve all UI context.
- Not ideal for just-in-time capture.

MVP implementation boundary:

- Official or external exports are imported after being normalized into `ConversationCapture` JSON.
- The side panel accepts a single capture, an array of captures, or `{ "captures": [...] }`.
- ChatGPT export ZIP files are read in-browser, `conversations.json` is located inside the ZIP, and conversations are converted directly into normalized `ConversationCapture` objects.
- When ChatGPT export mappings contain regenerated branches, `current_node` parent links are followed first so the active conversation path is imported instead of every stale branch. The current path keeps parent-chain order; timestamp sorting is used only for fallback mapping imports. If the `current_node` path exists but contains no importable user or assistant text, the importer falls back to mapping import with an explicit warning instead of dropping the conversation.
- Text parts from ChatGPT export user/assistant messages are preserved, including conservative recovery of structured parts that clearly carry visible text. System, tool, unknown-role, and non-text parts such as images, files, or structured payloads with file/image pointers are skipped with explicit capture warnings.
- Invalid or out-of-range ChatGPT export timestamps are ignored instead of surfacing parser internals, and import errors that name oversized conversations use redacted, truncated labels so sensitive conversation titles are not echoed.
- ChatGPT export conversations with no importable user/assistant text are skipped with a warning when other conversations can still import; an export containing no importable visible text is rejected with a clear error.
- ZIP imports enforce size limits and local storage headroom checks on the uploaded file, preflight the `conversations.json` ZIP entry size from archive metadata before extraction, recheck the decompressed `conversations.json` before parsing, cap decoded JSON text before parsing, and only extract `conversations.json` from the archive.
- Imported captures use the same archive, source-turn, sensitivity-warning, deduplication, and proposed-card pipeline as live browser capture.
- Conversation capture imports are bounded before storage: at most 500 captures per import, 10,000 total turns per import, 1,000 turns per capture/archive, and 500,000 characters per source turn. ChatGPT official exports enforce the conversation-count limit before normalizing individual mapping entries and enforce per-conversation and total visible-turn limits immediately after normalization, before storage.
- After conversation import, the side panel reports aggregated capture warnings so users can review skipped non-text parts, fallback mapping, and sensitive/secret content notices before accepting memories.
- Capture warning display should prioritize high-risk warnings such as sensitive/secret content and missing turns, merge duplicates, and collapse long warning lists behind an omitted-count summary so critical capture-quality signals stay visible.
- Provider-specific media handling should be implemented as provider-specific converters on top of this normalized import contract.

### 2. User-Initiated Browser Capture

Build a Chrome MV3 extension with React Side Panel.

The user explicitly triggers capture through the **Capture current conversation** side-panel action. This avoids the product and compliance complexity of silently collecting every AI session in the background.

### 3. MAIN World Page Interception

Inject a script at `document_start` into the page MAIN world and patch:

- `window.fetch`
- `XMLHttpRequest`

This allows the adapter to see page-level request/response flows and reconstruct streamed AI responses when possible.

Important boundary:

- Chrome content scripts run in an isolated world by default.
- To patch page globals, the script must run in the page MAIN world.
- MAIN world scripts have greater exposure to the page environment and need a strict security model.

Recommended bridge when the user explicitly enables this advanced mode:

1. MAIN world interceptor observes and copies only minimal event payloads.
2. It sends sanitized payloads to the isolated content script via `window.postMessage`.
3. The content script validates origin, shape, message type, absolute `http`/`https` URL, known HTTP method, canonical timestamp, `100-599` status code, bounded content-type metadata, bounded response-text size, and a likely conversation response signal such as JSON, SSE, or a conversation/completion/stream URL before accepting a fragment.
4. The content script forwards normalized fragments to the service worker.

The MVP keeps this interceptor disabled by default. The shipped MAIN world bundle is an inert shell: even if injected, page-context `postMessage` cannot enable network capture because those messages are forgeable by the page, and the bundle does not patch `fetch` or `XMLHttpRequest` while the capture policy is disabled. If a later explicit user action enables this path, it must first add a non-forgeable enable mechanism and the content script should inject the MAIN world script at most once per content-script lifecycle so repeated enable attempts do not stack fetch/XHR patches.

### 4. DevTools Capture Mode

Chrome DevTools extensions can read network request content through `chrome.devtools.network.getContent()`.

This is official and can read response bodies, but it depends on DevTools being open and running in the DevTools extension environment. It should be treated as an advanced diagnostic/import mode, not the default user workflow.

### 5. DOM Extraction Fallback

Use DOM extraction when network interception is unavailable or broken.

DOM fallback should:

- Detect visible message turns.
- Preserve author roles when possible.
- Preserve code blocks and markdown structure.
- Bound captured output to the same source-turn limits used by imports, with warnings when DOM turns are truncated or skipped.
- Fall back to broader visible article/content selectors when provider-specific DOM selectors are present but contain no importable text, and emit an explicit warning so adapter breakage is visible.
- Include a warning that source fidelity may be lower.

### 6. Clipboard Fallback

As a final fallback, allow the user to paste copied conversation text into the side panel.

The browser MVP also supports manual memory creation from pasted or typed text. This path still creates a local `generic` source archive with `captureMethod: "clipboard"` and a source turn, so the accepted memory card remains traceable and can be deleted through the same archive cascade behavior.

Manual archive content hashes are based on the normalized pasted body, because the archive represents reusable source text rather than a specific memory-card title. Exact accepted manual card repeats return the existing card; intentional variants reuse the same local source archive instead of duplicating raw pasted text.

## What Not To Do

- Do not make always-on background capture the MVP default.
- Do not rely on DNR to read response body content.
- Do not assume `webRequestBlocking` is broadly available under MV3.
- Do not silently collect cross-site browsing data.
- Do not store raw sensitive data without clear user control.

## Adapter Contract

Each adapter should implement:

```ts
export interface CaptureAdapter {
  provider: "chatgpt" | "gemini" | "claude" | "generic";
  matches(url: URL): boolean;
  getConversationIdentity(tab: BrowserTabContext): Promise<ConversationIdentity>;
  capture(options: CaptureOptions): Promise<ConversationCapture>;
  healthCheck?(): Promise<AdapterHealth>;
}
```

## Normalized Capture Shape

```ts
export interface ConversationCapture {
  provider: string;
  providerConversationId?: string;
  title?: string;
  url: string;
  capturedAt: string;
  captureMethod: "official_export" | "main_world_network" | "devtools_network" | "dom" | "clipboard";
  turns: ConversationTurn[];
  rawFragments?: RawCaptureFragment[];
  warnings?: CaptureWarning[];
  contentHash: string;
}

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "unknown";
  text: string;
  createdAt?: string;
  source: SourceAnchor;
}
```

## ChatGPT Adapter MVP

Capture methods, in order:

1. DOM message extraction.
2. Clipboard paste/import.
3. Official export import for history.
4. Optional MAIN world network stream reconstruction after explicit opt-in.

Initial scope:

- Current conversation only.
- Text and code blocks.
- Source turn anchors.
- Basic title and URL.
- MAIN world interception remains disabled by default.

## Gemini Adapter MVP

Capture methods, in order:

1. DOM message extraction.
2. Clipboard paste/import.
3. Activity/import path where practical.
4. Optional MAIN world network stream reconstruction after explicit opt-in.

Initial scope:

- Current conversation only.
- Text and code blocks.
- Source turn anchors.
- Basic title and URL.
- MAIN world interception remains disabled by default.

## Capture Verification

For each provider adapter, maintain fixtures:

- single-turn conversation
- multi-turn conversation
- code-heavy conversation
- long streaming answer
- regenerated response if supported
- failed/interrupted response

Test expectations:

- all visible user/assistant turns captured
- turn order preserved
- code block formatting preserved
- source anchors assigned
- capture warnings emitted when using fallback
