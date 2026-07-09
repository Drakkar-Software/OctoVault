/**
 * Clipboard serialization for a run of page blocks (multi-block copy/cut/paste).
 *
 * Two payloads travel together on the clipboard:
 *  - **plain text** (`text/plain`) — a Markdown-ish rendering external apps read;
 *  - **rich HTML** (`text/html`) — a `<div data-octovault-blocks="1">` wrapper whose
 *    children carry `data-bt` (block type) and `data-in` (indent) so an in-app paste
 *    rebuilds the exact block structure (type + indent + checked + ref).
 *
 * The `data-octovault-blocks` sentinel is how {@link parseClipboardHtml} tells our own
 * payload from arbitrary pasted HTML (returns null for the latter, so the caller falls
 * back to {@link splitPlainText}). Pure — no DOM, no React — so it runs identically on
 * web and native (native reads/writes the same HTML string via `expo-clipboard`).
 */
import type { Block, BlockType } from './page-content';
import { mdShortcut } from './blocks';

/** A block reduced to what the clipboard carries and a paste rebuilds. */
export interface ClipBlock {
  type: BlockType;
  text: string;
  indent: number;
  /** Only for `todo`. */
  checked?: boolean;
  /** Only for ref blocks (`page`/`image`/`file`) — the linked child Object id. */
  ref?: string;
}

/** The marker attribute that identifies our own rich-clipboard payload. */
const SENTINEL = 'data-octovault-blocks';

/* ───────────────────────────── HTML escaping ───────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/* ───────────────────────────── plain rendering ─────────────────────────────── */

/** A Markdown-ish prefix for a block type — what external apps see (and what
 *  {@link splitPlainText} re-reads via {@link mdShortcut} on the way back in). */
function plainPrefix(b: ClipBlock): string {
  switch (b.type) {
    case 'heading':
      return '# ';
    case 'subheading':
      return '## ';
    case 'todo':
      return b.checked ? '- [x] ' : '- [ ] ';
    case 'bulleted':
      return '- ';
    case 'numbered':
      return '1. ';
    case 'quote':
      return '> ';
    default:
      return '';
  }
}

function plainLine(b: ClipBlock): string {
  const pad = '  '.repeat(Math.max(0, b.indent));
  if (b.type === 'divider') return `${pad}---`;
  return `${pad}${plainPrefix(b)}${b.text}`;
}

/* ───────────────────────────── serialize ───────────────────────────────────── */

/** Reduce a block to its clipboard shape (drops WAL-register-only fields). */
export function toClipBlock(b: Block): ClipBlock {
  return {
    type: b.type,
    text: b.text,
    indent: b.indent ?? 0,
    ...(b.type === 'todo' ? { checked: !!b.checked } : {}),
    ...(b.ref ? { ref: b.ref } : {}),
  };
}

/** Serialize a run of blocks into paired plain-text + rich-HTML clipboard payloads. */
export function serializeBlocks(blocks: Block[]): { plain: string; html: string } {
  const clips = blocks.map(toClipBlock);
  const plain = clips.map(plainLine).join('\n');
  const rows = clips
    .map((b) => {
      const attrs = [
        `data-bt="${b.type}"`,
        `data-in="${b.indent}"`,
        b.checked ? 'data-ck="1"' : '',
        b.ref ? `data-ref="${escapeHtml(b.ref)}"` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<p ${attrs}>${escapeHtml(b.text)}</p>`;
    })
    .join('');
  const html = `<div ${SENTINEL}="1">${rows}</div>`;
  return { plain, html };
}

/* ───────────────────────────── parse ───────────────────────────────────────── */

// Match each `<p …data-bt="…"…>text</p>` row our serializer emits. Scoped to `<p>`
// so the enclosing `<div>` wrapper is never mistaken for a row. `[^>]*` is safe
// because the serializer never puts `>` inside an attribute (refs/ids are opaque).
const ROW_RE = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1];

/**
 * Parse our own rich-clipboard HTML back into blocks. Returns null when `html` is
 * NOT our payload (no sentinel) so the caller falls back to {@link splitPlainText}.
 */
export function parseClipboardHtml(html: string): ClipBlock[] | null {
  if (!html || !html.includes(SENTINEL)) return null;
  const out: ClipBlock[] = [];
  for (const m of html.matchAll(ROW_RE)) {
    const attrs = m[1] ?? '';
    const bt = attr(attrs, 'data-bt') as BlockType | undefined;
    if (!bt) continue;
    const indent = Number(attr(attrs, 'data-in') ?? '0');
    const ref = attr(attrs, 'data-ref');
    out.push({
      type: bt,
      text: unescapeHtml(m[2] ?? ''),
      indent: Number.isFinite(indent) && indent > 0 ? Math.floor(indent) : 0,
      ...(attr(attrs, 'data-ck') === '1' ? { checked: true } : {}),
      ...(ref ? { ref: unescapeHtml(ref) } : {}),
    });
  }
  return out.length ? out : null;
}

/**
 * External plain text → blocks: one block per non-empty line, with leading
 * Markdown shortcuts (`# `, `- `, `- [ ] `, `> `, `1. `…) applied via
 * {@link mdShortcut} so pasted Markdown lands as the right block types.
 */
export function splitPlainText(text: string): ClipBlock[] {
  const out: ClipBlock[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    // GitHub task-list syntax (`- [ ] ` / `- [x] `) — mdShortcut only knows the
    // bare `[x] ` form, so strip the list bullet first.
    const task = /^[-*] \[([ xX])\] (.*)$/.exec(line.trimStart());
    if (task) {
      out.push({ type: 'todo', text: task[2] ?? '', indent: 0, ...(task[1] !== ' ' ? { checked: true } : {}) });
      continue;
    }
    const md = mdShortcut(line.trimStart());
    if (md && md.type !== 'divider') {
      out.push({ type: md.type, text: md.rest, indent: 0, ...(md.checked ? { checked: true } : {}) });
    } else if (line.trim() === '---') {
      out.push({ type: 'divider', text: '', indent: 0 });
    } else {
      out.push({ type: 'paragraph', text: line, indent: 0 });
    }
  }
  return out;
}
