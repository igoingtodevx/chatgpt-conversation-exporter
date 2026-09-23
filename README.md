# ChatGPT Conversation Exporter

A local-first Chromium extension for exporting the **current visible ChatGPT conversation branch** into formats that work well for both humans and AI agents.

**Current version: v1.0.1.** The v1.0 release gate was accepted against a frozen real-world ChatGPT fixture; v1.0.1 adds a metadata-only recovery path after a real ChatGPT DOM compatibility break. See [Validation](docs/VALIDATION.md) and the [Changelog](CHANGELOG.md).

## Why this exists

Normal PDF/print exports are convenient for people but poor as a canonical AI handoff. Raw DOM scrapers are better for machines but often lose tables, code, citations, images, timestamps, tool output, long virtualized messages, or branch information.

This project treats **JSON as the source of truth**, Markdown as the compact AI handoff format, and HTML/PDF as high-quality reading/archive views.

## Export modes

- **Complete Archive** — ZIP with `chat.json`, `chat.md`, `chat.html`, `chat.pdf`, `manifest.json`, and available assets.
- **AI Export** — ZIP with `chat.json`, `chat.md`, `manifest.json`, and available assets.
- Individual **JSON**, **Markdown**, **HTML**, or **PDF** exports.

Generated filenames follow:

`YYYY-MM-DD - ChatGPT - <Chat Title>.*`

The browser always opens **Save As**.

## What it captures

- current/selected conversation branch;
- user-visible user and assistant messages;
- structured tool calls/results in a separate `toolTrace[]` inside `chat.json`;
- Markdown structure, headings, lists, blockquotes and tables;
- code blocks, visible language labels and inline code;
- links, citations and full URLs;
- images and attachments, with local embedding when the browser can access them;
- file/download widgets plus attachment metadata from the selected visible branch;
- visible tool, connector and research UI content;
- visible reasoning summaries/details exposed by ChatGPT's UI;
- message IDs, turn IDs, model names and timestamps when available;
- explicit diagnostics when something cannot be recovered.

UI-only chrome such as favicons, app/plugin icons, hidden tool widgets, duplicate image-open controls and plugin-pill links is filtered from conversation assets/sources. When an asset is embedded in an AI/Complete archive, `chat.md` points to the local `assets/...` copy and `manifest.json` lists the exact files actually present in the ZIP.

It **does not** try to expose hidden chain-of-thought, system/developer prompts, cookies, tokens, or unrelated invisible context.

## Why tool calls are not normal messages

A real ChatGPT Work/Connector conversation contains metadata records for internal tool invocations between visible replies. Earlier builds could mistake those records for ordinary assistant messages. Since v0.2, the readable transcript contains only the visible conversation while `chat.json` retains tool calls/results under `toolTrace[]` for agents that need the execution history. Since v0.3.2, assistant progress records explicitly marked by ChatGPT as non-final are also kept out of the top-level transcript so they are not duplicated when the same visible progress is captured inside reasoning/details.

That gives both sides what they need:

- humans and direct LLM handoffs get a clean `chat.md`, HTML and PDF;
- programmatic consumers get the exhaustive structured JSON including the tool trace.

## Long chats

ChatGPT virtualizes long conversations. The exporter combines two approaches:

1. it reads the selected branch from ChatGPT conversation metadata when available;
2. it walks the scroll surface in multiple passes and harvests rendered turns as they hydrate.

If a visible user/assistant turn cannot be hydrated, metadata text is used as a marked fallback rather than silently omitting the turn.

## Compatibility strategy

ChatGPT's web UI is not a public API, so the exporter assumes selectors and private metadata shapes can change.

The extraction path is deliberately redundant: rendered DOM provides rich structure, selected-branch metadata provides ordering and recovery, and diagnostics record which path actually produced the export. Since v1.0.1, a page with zero recognized rendered turn nodes no longer fails immediately when usable conversation metadata is still available; it falls back to metadata-only recovery.

Compatibility fixes should be driven by reproducible failures and regression tests. If ChatGPT changes again, please use the compatibility issue template and **do not attach private conversations, cookies, access tokens, full conversation URLs, or unredacted exports**.

## Privacy

The extension has no backend, analytics or telemetry. Export generation is local. It uses only:

- `activeTab`
- `scripting`
- `downloads`

There is no persistent all-sites permission. See [PRIVACY.md](PRIVACY.md).

## Install from source

```bash
npm install
npm run check
npm run package
```

Then either:

1. open `brave://extensions` or `chrome://extensions`;
2. enable **Developer mode**;
3. choose **Load unpacked**;
4. select the generated `dist/` directory.

Or unzip `release/chatgpt-conversation-exporter-v1.0.1.zip` and load that directory.

## Usage

1. Open the ChatGPT conversation you want to export.
2. Click the extension icon.
3. Choose Complete Archive, AI Export, or an individual format.
4. Keep the capture options enabled for maximum fidelity.
5. Click **Export** and choose where to save the file.

## v1.0 validation

v1.0.0 was accepted against a frozen real ChatGPT fixture containing an uploaded image, uploaded PDF, Markdown table, JavaScript code block, web research, official links, structured tool calls and a generated downloadable text file. The final smoke export preserved all expected visible turns with zero missing turns, kept tool activity separate, embedded the accessible image locally, preserved unresolved file cards explicitly, retained the JavaScript language label, produced a consistent ZIP manifest and rendered a valid text-selectable A4 PDF.

The complete release gate and the platform boundary around protected file cards are documented in [docs/VALIDATION.md](docs/VALIDATION.md).

## Development

```bash
npm test
npm run build
npm run package
npm run check
```

Key implementation docs:

- [Architecture](docs/ARCHITECTURE.md)
- [JSON schema](docs/SCHEMA.md)
- [v1.0 validation](docs/VALIDATION.md)
- [Changelog](CHANGELOG.md)
- [Privacy](PRIVACY.md)

## Current limitations

ChatGPT's web UI and metadata endpoints are not public APIs and can change. Rich interactive widgets can only be archived to the extent their visible DOM/text/assets or selected-branch metadata are accessible. Cross-origin protected images or attachments may remain URL/metadata references; the export records a warning instead of pretending they were embedded.

Generated file cards are best-effort: when ChatGPT exposes a filename but no retrievable URL, the filename is preserved and the asset is explicitly marked unavailable rather than silently disappearing. PDF uses jsPDF's built-in WinAnsi fonts, so a small set of unsupported symbols (for example arrows/checkmarks) is transliterated to readable ASCII equivalents; JSON/Markdown/HTML preserve the original Unicode.

The parser is intentionally modular so future adapters can target Claude, Gemini, Grok, or other chat UIs without changing the overall export model.

## License

MIT
