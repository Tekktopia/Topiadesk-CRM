/**
 * Minimal, dependency-free Markdown -> HTML for rendering the copilot's
 * own assistant replies — same "no marked/react-markdown, no new heavy
 * dependency" constraint as the near-identical utility this is adapted
 * from (app/(knowledge)/_lib/markdown-preview.ts, also duplicated at
 * app/(portal)/portal/_lib/markdown-preview.ts — this is a third,
 * deliberately separate copy following that same established pattern, not
 * a new one). Escapes HTML first so message content can't inject into the
 * render, matching the source utility's own safety reasoning.
 *
 * Two things this copy adds that the KB-article version doesn't need:
 *  - `![alt](url)` image syntax, rendered as an actual inline <img> — this
 *    is what makes chat's generate_report tool's chart PNG link (see
 *    chat-intent-router.ts's answerGenerateReport()) show up as a real
 *    visual in the conversation instead of a wall of link text. KB
 *    articles are admin-authored prose that has never needed this.
 *  - Bare URL auto-linking (a plain `https://...` with no `[text](url)`
 *    wrapper) — chat's own composed messages emit bare URLs (report/case
 *    numbers, download links), unlike hand-authored KB markdown which
 *    always uses the bracket syntax deliberately.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Matches a bare URL that isn't already inside a `[...]( )` or `![...]( )`
// construct — those are handled first, before this pass ever runs, so by
// the time this regex sees the text any URL still bare really is bare.
const BARE_URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

function renderInline(text: string): string {
  let html = escapeHtml(text);
  // Images first — `![alt](url)` — a hyperlink-like pattern would also
  // match an image's `](url)` portion if run afterward, so order matters.
  html = html.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    '<img src="$2" alt="$1" class="max-w-full rounded-md border border-border" loading="lazy" />',
  );
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.85em]">$1</code>');
  // Bare-URL auto-link, last — skips anything already inside an href/src
  // attribute from the replacements above by only matching URLs that
  // aren't immediately preceded by a quote character.
  html = html.replace(BARE_URL_PATTERN, (match, url: string, offset: number, full: string) => {
    const precedingChar = full[offset - 1];
    if (precedingChar === '"' || precedingChar === "'") return match;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline">${url}</a>`;
  });
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
