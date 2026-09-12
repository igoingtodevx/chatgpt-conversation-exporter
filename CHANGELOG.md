# Changelog

All notable changes to ChatGPT Conversation Exporter are documented here.

## 1.0.0 — 2026-09-12

First stable release.

### Highlights

- Canonical, schema-versioned JSON export for the current visible ChatGPT branch.
- Compact AI-ready Markdown export.
- Standalone dark HTML archive.
- Selectable-text A4 PDF export.
- Complete Archive and AI Export ZIP modes with exact manifests.
- Hybrid extraction using ChatGPT conversation metadata plus hydrated rendered DOM.
- Structured tool calls/results preserved separately in `toolTrace[]` instead of polluting the human-readable transcript.
- Visible reasoning/research/tool detail sections captured when ChatGPT exposes them in the UI.
- Images and attachments embedded locally when browser-accessible; inaccessible file cards are preserved explicitly as unavailable instead of silently dropped.
- Local archive asset paths in Markdown.
- Filtering for UI-only favicons, plugin icons, hidden widgets, search-result pseudo-assets, duplicate image-open controls and status text that resembles filenames.
- Long/virtualized conversation hydration with metadata fallback.
- Source links/citations preserved.
- Code blocks preserve visible language labels when available.
- PDF fallback transliteration for unsupported WinAnsi glyphs.
- Local-first implementation with no backend, telemetry or persistent all-sites permission.

### Validation

The stable release was accepted against a frozen real ChatGPT fixture and a final v1.0.0 smoke export. See [`docs/VALIDATION.md`](docs/VALIDATION.md) for the release gate, observed platform limitations and pass criteria.

### Permissions

The extension requests only:

- `activeTab`
- `scripting`
- `downloads`
