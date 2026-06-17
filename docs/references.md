# Official References

This project should keep implementation decisions aligned with official platform constraints.

## Chrome Extensions

- [Chrome webRequest API](https://developer.chrome.com/docs/extensions/reference/api/webRequest)
- [Chrome declarativeNetRequest API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Chrome DevTools Network API](https://developer.chrome.com/docs/extensions/reference/api/devtools/network)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome scripting API and ExecutionWorld](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Chrome extension Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

## AI Account Data Export And Activity

- [OpenAI: export ChatGPT history and data](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data)
- [Google Gemini Apps Activity](https://support.google.com/gemini/answer/13278892)
- [Google My Activity](https://myactivity.google.com/)

## Storage And Search

- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [SQLite Wasm and OPFS](https://sqlite.org/wasm/doc/trunk/persistence.md)
- [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [sqlite-vec](https://github.com/asg017/sqlite-vec)
- [LanceDB](https://lancedb.github.io/lancedb/)
- [pgvector](https://github.com/pgvector/pgvector)

## Notes

- `webRequest` is appropriate for request observation and certain request lifecycle interventions, but it is not the primary response-body extraction path for this product.
- `declarativeNetRequest` is rule-oriented and should be reserved for blocking, redirecting, upgrade, or header-modification use cases.
- `chrome.devtools.network.getContent()` can read request content from the DevTools extension environment, but it depends on DevTools and should not be the default side panel workflow.
- `chrome.sidePanel` is the recommended MVP UI surface.
- MAIN world content script injection can patch page-level APIs, but it increases security risk and must remain provider-scoped and minimal.

