const REMOVE_SELECTOR = [
  "script", "style", "noscript", "iframe", "object", "embed", "form", "input", "textarea", "select", "option",
  "button", "svg", "canvas", "video", "audio",
  '[aria-label*="Copy"]', '[aria-label*="Regenerate"]', '[data-testid*="copy"]', '[data-testid*="feedback"]'
].join(",");

export function sanitizedClone(root: Element): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(REMOVE_SELECTOR).forEach((node) => node.remove());

  for (const element of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    for (const attr of Array.from(element.attributes)) {
      if (/^on/i.test(attr.name)) element.removeAttribute(attr.name);
      if (["contenteditable", "tabindex", "draggable"].includes(attr.name)) element.removeAttribute(attr.name);
    }
    if (element instanceof HTMLAnchorElement) {
      element.setAttribute("rel", "noopener noreferrer");
      element.setAttribute("target", "_blank");
    }
  }
  return clone;
}
