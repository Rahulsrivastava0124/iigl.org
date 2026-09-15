const KEEP = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H1', 'H2', 'H3', 'SPAN']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE']);
const ALIGN = new Set(['left', 'center', 'right', 'justify']);

/**
 * The panel's formatted text, kept to what its editor writes: paragraphs,
 * headings, bold, italic, underline and alignment. Every other tag is unwrapped
 * to its text, scripts and the like are dropped whole, and no attribute
 * survives but a text-align.
 */
export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (DROP.has(child.tagName)) {
          child.remove();
          continue;
        }
        walk(child);
        if (!KEEP.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          continue;
        }
        const align = child.style.textAlign;
        for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
        if (ALIGN.has(align)) child.style.textAlign = align;
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML.trim();
}
