# v1.0 Validation

This document records the acceptance test used to stop the pre-release patch cycle and promote ChatGPT Conversation Exporter to v1.0.0.

## Release gate

The release candidate was tested against a frozen ChatGPT conversation so the target could not change between exporter builds.

The fixture deliberately contained:

- an uploaded image;
- an uploaded PDF;
- headings, numbered and unordered lists;
- bold, italic and inline-code formatting;
- a Markdown table;
- a JavaScript fenced code block;
- web research and official links/citations;
- structured tool activity;
- visible reasoning/research UI where exposed by ChatGPT;
- a generated downloadable text file;
- a fixed completion marker.

The conversation was not modified after generation before export.

## Acceptance criteria

A release passes when:

1. every visible user/assistant turn is present exactly once;
2. no expected visible turn is silently lost;
3. internal tool calls/results do not appear as ordinary transcript messages;
4. visible reasoning/research/tool detail UI is preserved separately when exposed;
5. real images/files are embedded when browser-accessible or explicitly marked unavailable when ChatGPT does not expose a retrievable browser URL;
6. UI chrome, search results, favicons, plugin icons and duplicate file/image controls are not mistaken for conversation assets;
7. headings, lists, tables, links, code blocks and visible code-language labels survive the export;
8. JSON, Markdown, HTML and PDF remain semantically consistent;
9. `manifest.json` exactly describes the ZIP contents;
10. the generated PDF is valid, readable and text-selectable.

Cosmetic differences that do not lose or materially alter user content are not release blockers.

## Frozen-fixture result

The v0.3.2 release candidate passed the functional gate:

- 2 expected visible turns;
- 2 exported visible turns;
- 0 missing turns;
- 8 structured tool-trace events kept outside the readable transcript;
- uploaded image successfully embedded locally;
- uploaded PDF and generated text-file cards preserved explicitly when their bytes were not exposed through a retrievable browser URL;
- table, links, citations, formatting and code content preserved;
- ZIP manifest matched the actual members;
- PDF rendered as a valid selectable-text A4 document.

Two non-blocking fidelity issues discovered by that fixture were fixed before v1.0.0:

- the visible `JavaScript` code-viewer label is now retained in fenced Markdown even when ChatGPT does not attach a `language-*` class to the `<code>` element;
- redundant image UI/metadata records are collapsed when the same image is already embedded.

Both patterns have regression coverage.

## Final v1.0.0 smoke check

A final Complete Archive export made with v1.0.0 confirmed:

- archive creation succeeds;
- generator version reports `1.0.0`;
- 2/2 visible messages are present with 0 missing turns;
- 8 tool events remain separate;
- the uploaded image is represented once as the useful embedded asset;
- Markdown points to the local archived image path;
- the JavaScript code fence retains its language label;
- unresolved file cards remain explicit rather than disappearing;
- ZIP integrity and manifest membership are consistent.

No further pre-emptive patch cycle is required after this gate. Future changes should be driven by reproducible bugs or deliberate feature work.

## Known platform boundary

ChatGPT does not always expose a browser-retrievable URL for uploaded or generated file cards. In those cases the exporter preserves the filename/available metadata and marks the asset as unavailable. This is considered correct behavior: the exporter must not claim to have embedded bytes it could not access.

ChatGPT's web UI and private metadata endpoints can change over time, so real-browser regression fixtures remain the authoritative compatibility check for future releases.
