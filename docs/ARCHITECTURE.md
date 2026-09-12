# Architecture

## Goals

1. Preserve the current visible ChatGPT branch with minimal data loss.
2. Produce AI-friendly JSON/Markdown and human-friendly HTML/PDF.
3. Stay local-first: no exporter backend, analytics, telemetry, or cloud storage.
4. Fail loudly rather than silently omitting unsupported content.
5. Avoid brittle dependency on undocumented ChatGPT internals.

## Extraction strategy

The extension uses a hybrid pipeline:

1. **Structured metadata enrichment**: when the current `/c/<id>` route and ChatGPT's own conversation metadata endpoint are available, the exporter follows `current_node` back through its parents. This yields the selected branch, IDs, timestamps and model metadata.
2. **Rendered DOM hydration**: ChatGPT virtualizes long conversations. The exporter walks the rendered turn shells and scrolls each into view so mounted content can be harvested.
3. **DOM-first rich capture**: semantic Markdown, sanitized HTML, links, images and visible detail panels are captured from what the user can access in the UI.
4. **Metadata fallback**: if a visible user/assistant turn never hydrates, its visible-branch text can be recovered from conversation metadata and is marked as such.

Internal system/context records are deliberately excluded. The extension does not claim access to hidden reasoning.

## Exporters

- JSON: canonical schema.
- Markdown: compact AI/agent handoff format with explicit source URLs.
- HTML: single-file dark-mode archive with inline CSS and embedded images when accessible.
- PDF: A4, text-based vector PDF generated locally; headings, code, tables, links, assets and page numbers are preserved without screenshot rasterization.
- AI Export ZIP: JSON + Markdown + available assets.
- Complete Archive ZIP: JSON + Markdown + HTML + PDF + available assets.

## Permissions

- `activeTab`: temporary access only to the tab where the user clicks the extension.
- `scripting`: inject the extractor into that active tab.
- `downloads`: open the browser's Save As dialog for the generated local file.

There is intentionally no persistent `chatgpt.com` host permission and no `<all_urls>` permission in v0.1.
