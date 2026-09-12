# ChatGPT Conversation Exporter

A local-first Chromium extension for exporting the **current visible ChatGPT conversation branch** into formats that work well for both humans and AI agents.

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
- user and assistant messages;
- Markdown structure, headings, lists, blockquotes and tables;
- code blocks and inline code;
- links, citations and full URLs;
- images and attachments, with local embedding when the browser can access them;
- visible tool, connector and research UI content;
- visible reasoning summaries/details exposed by ChatGPT's UI;
- message IDs, turn IDs, model names and timestamps when available;
- explicit diagnostics when something cannot be recovered.

It **does not** try to expose hidden chain-of-thought, system prompts, cookies, tokens, or invisible internal context.

## Long chats

ChatGPT virtualizes long conversations. The exporter combines two approaches:

1. it reads the selected branch from ChatGPT conversation metadata when available;
2. it walks/scrolls rendered turn shells to hydrate rich DOM content.

If a visible user/assistant turn cannot be hydrated, metadata text is used as a marked fallback rather than silently omitting the turn.

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

Or unzip `release/chatgpt-conversation-exporter-v0.1.0.zip` and load that directory.

## Usage

1. Open the ChatGPT conversation you want to export.
2. Click the extension icon.
3. Choose Complete Archive, AI Export, or an individual format.
4. Keep the capture options enabled for maximum fidelity.
5. Click **Export** and choose where to save the file.

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
- [Privacy](PRIVACY.md)

## Current limitations

ChatGPT's web UI and metadata endpoints are not public APIs and can change. Rich interactive widgets can only be archived to the extent their visible DOM/text/assets are accessible. Cross-origin protected images or attachments may remain URL references; the export records a warning instead of pretending they were embedded.

The parser is intentionally modular so future adapters can target Claude, Gemini, Grok, or other chat UIs without changing the export schema.

## License

MIT
