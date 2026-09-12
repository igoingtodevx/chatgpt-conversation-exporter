# Export schema v1.0

`chat.json` is the canonical machine-readable representation. Markdown, HTML and PDF are presentation views of the same captured conversation.

Top-level fields:

- `schemaVersion`: currently `1.0`.
- `generator`: exporter name and version.
- `conversation`: title, original URL, ChatGPT conversation id when available, export timestamp, and `visible-current` branch marker.
- `messages[]`: ordered conversation messages.
- `sources[]`: deduplicated links/citations with their full URLs.
- `assets[]`: deduplicated images/attachments.
- `diagnostics`: extraction source, expected/exported turn counts and explicit warnings.

Each message preserves:

- stable IDs when ChatGPT exposes them;
- role, model and timestamp when available;
- plain text, Markdown and sanitized rendered HTML;
- full links/citations;
- image/attachment references;
- visible reasoning/tool/research details that the web UI exposes;
- per-message extraction diagnostics.

## Security boundary

The exporter does not attempt to expose hidden chain-of-thought, system prompts, cookies, access tokens, private bootstrap data, or invisible internal context. Structured ChatGPT metadata is used only for the currently selected branch and to enrich/recover user/assistant messages that belong to the visible conversation.
