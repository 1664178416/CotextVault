# ADR 0002: Do Not Use DNR Or webRequest As The Response Body Reader

## Status

Accepted.

## Context

Chrome extension APIs can observe and modify network requests in several ways. It is tempting to treat `webRequest` or `declarativeNetRequest` as a direct way to read AI response JSON bodies.

Under Chrome MV3, `webRequestBlocking` is restricted for most extensions. DNR is designed around declarative rules for blocking, redirecting, upgrading, and modifying headers. It is not a response-body extraction API.

## Decision

ContextVault will not use DNR or `webRequest` as the primary response-body extraction path.

Primary active capture will use:

- official export/import where available
- user-triggered page adapters
- MAIN world `fetch` / `XMLHttpRequest` interception
- DOM fallback

DevTools `network.getContent()` may be added as a diagnostic or advanced capture mode.

## Consequences

Benefits:

- aligns with Chrome platform constraints
- avoids building the product on unavailable or unsuitable APIs
- keeps capture logic explicit and provider-scoped

Tradeoffs:

- MAIN world capture requires careful security review
- provider-specific adapters are fragile and need maintenance
- DevTools capture cannot be the default workflow

