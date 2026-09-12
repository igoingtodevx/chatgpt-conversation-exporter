# Export schema v1.1

`chat.json` is the canonical machine-readable representation. Markdown, HTML and PDF are human-readable views of the visible conversation; structured tool execution is preserved separately so it cannot be mistaken for normal assistant replies.

Top-level fields:

- `schemaVersion`: currently `1.1`.
- `generator`: exporter name and version.
- `conversation`: title, original URL, ChatGPT conversation id when available, export timestamp, and `visible-current` branch marker.
- `messages[]`: ordered **user-visible** user/assistant conversation messages.
- `toolTrace[]`: structured tool calls/results from the selected branch, including tool name/recipient, timestamp, content type, readable text and the original structured content payload.
- `sources[]`: deduplicated user/content links and citations with their full URLs; ChatGPT plugin-pill/UI links are filtered out.
- `assets[]`: deduplicated conversation images/attachments; favicons and app/plugin icons are filtered out.
- `diagnostics`: extraction source, expected/exported visible-message counts, tool-trace count and explicit warnings.

Each visible message preserves:

- stable IDs when ChatGPT exposes them;
- role, model and timestamp when available;
- plain text, Markdown and sanitized rendered HTML;
- full links/citations;
- image/attachment references;
- visible reasoning/tool/research details that the web UI exposes;
- per-message extraction diagnostics.

## Why toolTrace is separate

ChatGPT metadata can contain assistant-authored tool invocations between visible messages. Treating those records as ordinary assistant messages makes a transcript misleading and massively inflates long Work/Connector chats. Schema 1.1 therefore keeps the human transcript clean while retaining tool calls/results in `toolTrace[]` for agents that need the full execution history.

Human-readable Markdown/HTML/PDF exports mention the trace count but do not inline the raw trace. `chat.json` remains the exhaustive AI-oriented representation.

## Security boundary

The exporter does not attempt to expose hidden chain-of-thought, system/developer prompts, cookies, access tokens, private bootstrap data, or unrelated invisible context. Structured ChatGPT metadata is used only for the currently selected branch, to recover visible user/assistant messages and to preserve explicit tool-call/tool-result records. Hidden reasoning is not promoted into `messages[]` or `toolTrace[]` unless ChatGPT exposes it as a tool record rather than private reasoning.
