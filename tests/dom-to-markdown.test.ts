import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { blocksToMarkdown } from "../src/content/dom-to-markdown";

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  Object.assign(globalThis, {
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    HTMLAnchorElement: dom.window.HTMLAnchorElement
  });
});

describe("DOM to Markdown", () => {
  it("preserves headings, code, tables and links", () => {
    const dom = new JSDOM(`<div id="root"><h2>Title</h2><p>Hello <strong>world</strong> <a href="https://example.com">source</a></p><pre><code class="language-js">const x = 1;</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></div>`, { url: "https://chatgpt.com/" });
    Object.assign(globalThis, {
      Node: dom.window.Node,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      HTMLImageElement: dom.window.HTMLImageElement,
      HTMLAnchorElement: dom.window.HTMLAnchorElement
    });
    const root = dom.window.document.querySelector("#root")!;
    const md = blocksToMarkdown(root);
    expect(md).toContain("## Title");
    expect(md).toContain("**world**");
    expect(md).toContain("[source](https://example.com/)");
    expect(md).toContain("```js");
    expect(md).toContain("| A | B |");
  });

  it("infers the language from ChatGPT's visible code-viewer label", () => {
    const dom = new JSDOM(`<div id="root"><pre><div><div><div>JavaScript</div></div><div><pre><code>function fibonacci(n) { return n; }</code></pre></div></div></pre></div>`);
    Object.assign(globalThis, {
      Node: dom.window.Node,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      HTMLImageElement: dom.window.HTMLImageElement,
      HTMLAnchorElement: dom.window.HTMLAnchorElement
    });
    const root = dom.window.document.querySelector("#root")!;
    expect(blocksToMarkdown(root)).toContain("```javascript\nfunction fibonacci(n) { return n; }");
  });
});
