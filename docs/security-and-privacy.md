# Security And Privacy

## Product Stance

ContextVault handles sensitive personal and work conversations. The default should be conservative:

- local-first storage
- user-triggered capture
- narrow host permissions
- visible review before permanent memory
- clear deletion and export
- no silent background collection in MVP

## Data Classes

| Class | Examples | Handling |
| --- | --- | --- |
| Normal | public project notes, general preferences | Store locally, searchable. |
| Sensitive | private work context, unpublished writing | Store encrypted, warn before export. |
| Secret | API keys, credentials, tokens, private personal data | Redact by default, require explicit save if ever supported. |

## Capture Consent

The side panel should make capture explicit:

- The user clicks capture.
- The UI shows provider and conversation title when detected.
- The user can cancel before extraction.
- The user can delete raw archive after card extraction.

## MAIN World Risks

MAIN world injection is powerful because it runs near page JavaScript.

Risks:

- hostile page script may observe or interfere with globals
- accidental leakage through `window.postMessage`
- over-capturing unrelated network data
- breakage when provider code changes

Mitigations:

- inject only on supported AI domains
- expose only `main-world/interceptor.js` as a web-accessible resource, and only on supported AI domains
- keep the MAIN world interceptor disabled by default in the MVP
- keep the shipped MAIN world interceptor inert even if injected; page-context `postMessage` must not be able to enable network capture because page scripts can forge those messages, and the inert bundle must not patch `fetch` or `XMLHttpRequest`
- enable MAIN world network capture only after an explicit user setting and provider-specific review
- keep MAIN world code minimal
- filter URLs and payload shapes before sending
- validate all messages in isolated content script
- validate all service worker runtime requests before dispatch
- include per-provider allowlists
- avoid sending secrets unless necessary
- never expose extension secrets to page context

## Storage Security

Browser MVP:

- Store data in IndexedDB.
- Encrypt sensitive archives/cards before persistence when user enables a vault passphrase.
- Keep API keys in extension storage with clear warnings.
- Prefer user-provided API keys over bundled secrets.
- Show local browser storage usage from `navigator.storage.estimate()`, include action-oriented warning/critical guidance in the side panel, and block clearly oversized imports before reading them so users can export or prune archives before quota pressure causes failed imports.

Future desktop app:

- Use SQLCipher or OS keychain-backed encryption.
- Store embeddings locally when possible.
- Support encrypted backups.

## LLM Provider Privacy

If remote LLM extraction or embedding is enabled:

- show which provider will receive conversation text
- allow per-capture opt-in
- support local-only mode
- redact secrets before sending where possible
- store extraction provider and model metadata

## Deletion

Users must be able to delete:

- a memory card
- an extraction batch
- a raw archive
- all data for one provider
- all project data
- all local vault data

Deleting a memory card warns when it is an accepted long-term memory and redacts protected titles in the confirmation. Deleting a raw archive warns with referenced memory-card status counts and explicitly calls out accepted memories before cascade deletion. Cards grounded only by the deleted archive are removed with it; cards that still have other source anchors are kept and only lose the anchors that pointed to the deleted archive. The delete result reports both removed cards and preserved multi-source cards that were updated, so the side panel can explain exactly what changed.

## Export

Supported export formats:

- Markdown
- JSON
- Obsidian folder
- Notion-ready Markdown
- Yuque-ready Markdown

Exports should include source links only when the user chooses.
Full copy and export actions should warn before disclosing memory cards marked `sensitive` or `secret`. Prompt-ready copy builds the actual bounded context first, then checks disclosure only for cards that will be copied, so omitted sensitive cards do not trigger unnecessary exposure prompts. Scoped Markdown export checks the exact card set for that scope, including all memory statuses when exporting "all". Redacted copy and Markdown export can replace common secrets, credentials, emails, SSNs, and card-like numbers in titles, bodies, tags, and source-anchor quotes, so those redacted actions can skip disclosure prompts. If content is already labeled sensitive or secret but does not match a known redaction pattern, redacted previews, snippets, prompt copy, Markdown export, and source previews should use a generic protected-content placeholder instead of showing the original text. Prompt-ready copy should keep source grounding compact by limiting visible source anchors per card, warning before copying when the budget omits cards or extra source anchors, and showing an omitted-anchor count without echoing card bodies. Markdown and JSON exports should preserve full source anchors. Search snippets for sensitive or secret cards should also be redacted before display. Raw archive and full-vault JSON exports should always require confirmation because they can contain unreviewed source text. Raw archive export confirmation should report the archive's source-turn count, capture warning count, archive warning sensitivity, and live sensitive/secret source-turn counts before download, without echoing the protected source text. Full-vault JSON export confirmation should report the actual archive and memory-card counts, effective sensitive/secret memory-card counts, archive-level sensitive/secret warning counts, and live sensitive/secret source-turn counts before download, without echoing the protected source text. Full-vault JSON export should still canonicalize memory cards by recomputing sensitivity and clearing todo-only metadata from non-todo cards before writing the backup file.

## Compliance Notes

The MVP should avoid:

- automatic collection of every AI conversation
- hidden background scraping
- collecting from unsupported domains
- bypassing provider controls
- presenting network interception as an official provider integration

## Manifest Permission Boundary

The extension manifest is part of the security model and should remain intentionally small:

- permissions are limited to `activeTab`, `sidePanel`, and `storage`
- host permissions are limited to ChatGPT, legacy ChatGPT, Gemini, and Claude web origins
- content script injection is limited to the same supported AI origins and runs at `document_start` so the optional bridge can initialize before provider UI hydration
- `web_accessible_resources` exposes only `main-world/interceptor.js`, because that is the minimum asset the page context needs for the optional MAIN world bridge
- broad scopes such as `<all_urls>`, `https://*/*`, `http://*/*`, `tabs`, `webRequest`, `webRequestBlocking`, and `declarativeNetRequest` are intentionally absent from the MVP

Any future permission expansion should include a user-facing reason, a narrower alternative analysis, and manifest tests that keep unsupported origins out of capture, injection, and web-accessible resource scopes.

## Security Checklist For MVP

- Host permissions are limited to supported AI web apps.
- The extension manifest does not request broad `tabs`, `webRequest`, `webRequestBlocking`, or `declarativeNetRequest` permissions.
- The extension manifest does not contain `<all_urls>`, `https://*/*`, or `http://*/*` in host permissions, content-script matches, or web-accessible-resource matches.
- The content script has a single explicit bundle path and runs at `document_start` only on supported AI web apps.
- Web-accessible resources expose only the MAIN world interceptor bundle, scoped to supported AI web apps.
- Capture starts only after a user action.
- MAIN world network interception is disabled by default.
- MAIN world bridge validates origin, exact message schema with no unexpected fields, absolute `http`/`https` URLs, known HTTP methods, canonical timestamps, `100-599` status codes, bounded content-type metadata, payload size, and a likely conversation response signal such as JSON, SSE, or a conversation/completion/stream URL before any future opt-in capture handling.
- Service worker and content script reject malformed runtime messages before dispatch, including requests with unexpected extra fields beyond the explicit message contract.
- DOM fallback capture bounds turn count and per-turn text size before returning data from the content script, with warnings when visible turns are skipped or truncated, and falls back from empty provider-specific selector results with an explicit adapter-health warning.
- Core vault services also reject malformed manual-memory inputs, including unsupported memory types/scopes, malformed due dates, and non-string tags, before creating source archives.
- Import/message validators reject invalid enum values for providers, capture methods, roles, memory types, scopes, statuses, and sensitivity classes.
- ChatGPT official export import preserves user/assistant message text and skips system, tool, unknown-role, and non-text payloads with visible import warnings. Import errors that mention a conversation title should redact and truncate that label, and invalid exported timestamps should be ignored rather than exposing parser internals.
- JSON import validation rejects malformed archive/turn/card fields, duplicate archive content hashes, broken source references, missing anchors, duplicate IDs, oversized source turns, oversized metadata fields, too many tags, too many source anchors, too many turns per archive, too many archives/cards/total source turns per backup, out-of-range spans, and quote mismatches before writing archives or memory cards.
- Memory card titles, bodies, tags, owner metadata, source anchors, source-anchor quotes, enum fields, timestamps, confidence values, and source-anchor span shapes are bounded before JSON import or runtime edits reach storage; malformed runtime edits fail before loading source archives for grounding checks, and manual memory creation uses the same body/tag/owner limits.
- Conversation capture imports are bounded by conversation count, total turn count, per-capture turn count, and per-turn text size before writing archives or memory cards; ChatGPT official exports enforce conversation-count, per-conversation visible-turn, and total visible-turn limits before storage.
- ChatGPT ZIP imports preflight the `conversations.json` uncompressed size from ZIP metadata before extraction, then recheck decompressed size, browser storage headroom, and decoded JSON text length before parsing.
- JSON import validation reports field paths for malformed data so users can identify the exact broken archive, turn, card, or source anchor.
- JSON import refuses archive, source turn, or memory card IDs that already exist locally instead of overwriting local data, and conflict errors report bounded counts plus truncated samples instead of echoing long user-provided identifiers or full content hashes.
- JSON import/export and memory-card edits canonicalize cards before storage or backup: stale `normal` labels are upgraded when content now looks sensitive or secret, explicit `sensitive`/`secret` labels are not downgraded just because the current redaction regexes do not recognize the protected content, and non-todo owner/due metadata is removed.
- Capture warning validation rejects empty or oversized warning codes/messages and caps warning list length before they reach the side panel.
- Raw archives and cards are deletable, but the side panel distinguishes their blast radius: deleting a memory card removes it from recall while preserving raw source archives and source turns, while deleting an archive cascades through source turns and either deletes single-source cards or removes only stale anchors from multi-source cards.
- Vault integrity checks are readonly and report broken source grounding without automatic repair or deletion, including malformed card/anchor shapes, missing archives/turns, archive mismatches, invalid anchor spans, quote/span mismatches, and quotes that no longer exist in source turns. They cap returned issue details while preserving total counts, so damaged local data can be inspected without exposing large amounts of user-provided identifiers or source text.
- Sensitive cards are visibly marked.
- Bulk review actions confirm before permanently accepting sensitive or secret draft cards, and before discarding multiple candidates.
- Manual memory creation also confirms before storing sensitive or secret text as an accepted long-term memory.
- Copy/export actions confirm before disclosing sensitive or secret memory content.
- Source archive previews should combine per-turn detection with archive-level sensitive/secret warnings, so every turn in a protected archive stays redacted until explicit reveal.
- Unknown protected text that does not match a known pattern should be masked with a generic protected-content placeholder in default previews and redacted outputs.
- Remote extraction requires explicit configuration.
- DNR/webRequest are not used as response-body extraction mechanisms.
- No extension secret is injected into page MAIN world.
