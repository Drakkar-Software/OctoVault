import { describe, it, expect } from 'vitest';

import { serializeBlocks, parseClipboardHtml, splitPlainText, toClipBlock } from './block-clipboard';
import type { Block } from './page-content';

const b = (over: Partial<Block> & { id: string }): Block => ({ type: 'paragraph', text: '', ...over });

describe('serializeBlocks / parseClipboardHtml round-trip', () => {
  it('preserves type + indent + checked across serialize → parse', () => {
    const blocks: Block[] = [
      b({ id: '1', type: 'heading', text: 'Title' }),
      b({ id: '2', type: 'bulleted', text: 'Point', indent: 1 }),
      b({ id: '3', type: 'todo', text: 'Do it', checked: true, indent: 2 }),
    ];
    const { html } = serializeBlocks(blocks);
    const parsed = parseClipboardHtml(html);
    expect(parsed).toEqual([
      { type: 'heading', text: 'Title', indent: 0 },
      { type: 'bulleted', text: 'Point', indent: 1 },
      { type: 'todo', text: 'Do it', indent: 2, checked: true },
    ]);
  });

  it('carries a ref for ref blocks', () => {
    const { html } = serializeBlocks([b({ id: '1', type: 'page', ref: 'child-9' })]);
    expect(parseClipboardHtml(html)).toEqual([{ type: 'page', text: '', indent: 0, ref: 'child-9' }]);
  });

  it('escapes and restores HTML-significant characters in text', () => {
    const { html } = serializeBlocks([b({ id: '1', text: 'a < b && c > "d"' })]);
    expect(parseClipboardHtml(html)?.[0]?.text).toBe('a < b && c > "d"');
  });

  it('renders a Markdown-ish plain payload', () => {
    const { plain } = serializeBlocks([
      b({ id: '1', type: 'heading', text: 'Title' }),
      b({ id: '2', type: 'bulleted', text: 'Point', indent: 1 }),
      b({ id: '3', type: 'todo', text: 'Done', checked: true }),
      b({ id: '4', type: 'divider' }),
    ]);
    expect(plain).toBe('# Title\n  - Point\n- [x] Done\n---');
  });

  it('returns null for foreign (non-sentinel) HTML', () => {
    expect(parseClipboardHtml('<div><p>hello</p></div>')).toBeNull();
    expect(parseClipboardHtml('')).toBeNull();
  });
});

describe('splitPlainText', () => {
  it('splits on newlines, skips blank lines, applies markdown shortcuts', () => {
    const clips = splitPlainText('# Heading\n\n- one\n- two\nplain line\n> quote');
    expect(clips).toEqual([
      { type: 'heading', text: 'Heading', indent: 0 },
      { type: 'bulleted', text: 'one', indent: 0 },
      { type: 'bulleted', text: 'two', indent: 0 },
      { type: 'paragraph', text: 'plain line', indent: 0 },
      { type: 'quote', text: 'quote', indent: 0 },
    ]);
  });

  it('reads a checked todo shortcut', () => {
    expect(splitPlainText('- [x] shipped')).toEqual([{ type: 'todo', text: 'shipped', indent: 0, checked: true }]);
  });

  it('handles CRLF line endings and a bare divider', () => {
    expect(splitPlainText('a\r\n---\r\nb')).toEqual([
      { type: 'paragraph', text: 'a', indent: 0 },
      { type: 'divider', text: '', indent: 0 },
      { type: 'paragraph', text: 'b', indent: 0 },
    ]);
  });
});

describe('toClipBlock', () => {
  it('drops register-only fields and defaults indent', () => {
    expect(toClipBlock(b({ id: '1', type: 'quote', text: 'hi', color: 'red', collapsed: true }))).toEqual({
      type: 'quote',
      text: 'hi',
      indent: 0,
    });
  });
});
