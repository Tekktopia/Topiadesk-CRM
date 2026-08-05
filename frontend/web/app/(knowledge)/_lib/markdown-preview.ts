/**
 * Minimal, dependency-free Markdown -> HTML for the article editor's
 * preview toggle — no `marked`/`react-markdown`/etc, per this codebase's
 * "no new heavy dependency for a plain-textarea editor" constraint. Covers
 * the handful of constructs KB articles realistically use (headings, bold,
 * italic, links, unordered/ordered lists, paragraphs) — not a spec-complete
 * CommonMark implementation. Escapes HTML first so pasted/typed markup in
 * the source can't inject into the preview (KnowledgeArticleVisibility has
 * a documented CUSTOMER hook for later external exposure — safe by default
 * now rather than retrofitted later).
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.85em]">$1</code>');
  return html;
}

export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  function flushParagraph(): void {
    if (paragraph.length > 0) {
      blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  }
  function flushList(): void {
    if (list) {
      const items = list.items.map((item) => `<li>${renderInline(item)}</li>`).join('');
      blocks.push(`<${list.type} class="ms-5 list-${list.type === 'ul' ? 'disc' : 'decimal'} space-y-1">${items}</${list.type}>`);
      list = null;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const unordered = /^[-*]\s+(.*)$/.exec(line);
    const ordered = /^\d+\.\s+(.*)$/.exec(line);

    if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]!.length;
      const sizeClass = level === 1 ? 'text-xl font-semibold' : level === 2 ? 'text-lg font-semibold' : 'text-base font-semibold';
      blocks.push(`<h${level} class="${sizeClass}">${renderInline(heading[2]!)}</h${level}>`);
    } else if (unordered) {
      flushParagraph();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(unordered[1]!);
    } else if (ordered) {
      flushParagraph();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(ordered[1]!);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return blocks.join('');
}
