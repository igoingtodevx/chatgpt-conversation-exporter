# Privacy

ChatGPT Conversation Exporter is local-first.

- No exporter server exists.
- No analytics or telemetry are collected.
- No conversation content is transmitted to the developer.
- No account data is stored by the extension.
- Export files are generated locally in the browser.
- The extension uses `activeTab`, so page access is temporary and granted only after the user clicks the extension on the active tab.

The exporter may make requests that the ChatGPT page itself is allowed to make in order to read the current conversation metadata or resolve already-referenced assets. Authentication material used by ChatGPT is never included in an export, logged, or persisted by the extension.

Some images or attachments may be hosted on a different origin with access controls that prevent local embedding. The exporter preserves the original URL and emits a warning instead of silently dropping the asset.
