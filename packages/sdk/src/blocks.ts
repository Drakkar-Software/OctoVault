/**
 * Block-type presentation table — the single source of truth for how each
 * {@link BlockType} renders, reads and is reached in the page editor (see
 * {@link PageView}).
 *
 * Keeps the editor component declarative: instead of inline `switch`/`if` on the
 * type for the label, slash-menu section, icon, text variant, mono-ness,
 * multiline-ness and placeholder, components look these up here. Also carries
 * the Markdown shortcut prefixes and the slash-menu search keywords, plus the
 * pure typing-behaviour helpers (Enter continuation, slash filtering, numbered
 * run counting) so the editor's "feel" logic is unit-testable without React.
 */
import type { IconName } from './domain/icon-name';
import type { TextVariant } from './domain/text-variant';

import type { Block, BlockType } from './page-content';

/** Slash/insert menu grouping (Notion-style sections, micro mono headers). */
export type BlockSection = 'basic' | 'list' | 'other';

export const BLOCK_SECTIONS: { id: BlockSection; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'list', label: 'Lists' },
  { id: 'other', label: 'More' },
];

/** A {@link BlockType}'s presentation: how it reads and which editor it uses. */
export interface BlockTypeDef {
  type: BlockType;
  /** Menu label. */
  label: string;
  /** Glyph in the block-type / slash menu and (where shown) the gutter. */
  icon: IconName;
  /** Slash/insert menu section. */
  section: BlockSection;
  /** Extra slash-filter aliases beyond the label ("/h1", "/ul", "/check"…). */
  keywords: string[];
  /** Type-scale step the block's text renders at (also the editor's `textVariant`). */
  variant: TextVariant;
  /** Render the text in JetBrains Mono (code blocks). */
  mono: boolean;
  /** Editor allows in-block newlines (web Shift+Enter; plain Enter still splits). */
  multiline: boolean;
  /** Placeholder shown ONLY in the focused empty editor (unfocused empties are blank). */
  placeholder: string;
  /** Start-of-line Markdown shortcuts that convert a block to this type. */
  mdPrefixes?: string[];
}

/**
 * Every block type, in the order they appear in the block-type / slash menu.
 * `divider` renders as a rule (no text editor); `page` renders as a child-page
 * link row (its content lives in the linked Object, not in this doc).
 */
export const BLOCK_TYPES: BlockTypeDef[] = [
  { type: 'paragraph', label: 'Text', icon: 'text', section: 'basic', keywords: ['plain', 'p'], variant: 'body', mono: false, multiline: true, placeholder: "Type '/' for commands" },
  { type: 'page', label: 'Page', icon: 'page', section: 'basic', keywords: ['sub', 'child', 'doc'], variant: 'body', mono: false, multiline: false, placeholder: 'Untitled' },
  { type: 'heading', label: 'Heading 1', icon: 'h1', section: 'basic', keywords: ['h1', 'title', '#'], variant: 'title', mono: false, multiline: false, placeholder: 'Heading 1', mdPrefixes: ['# '] },
  { type: 'subheading', label: 'Heading 2', icon: 'h2', section: 'basic', keywords: ['h2', 'h3', 'sub', '##'], variant: 'heading', mono: false, multiline: false, placeholder: 'Heading 2', mdPrefixes: ['## ', '### '] },
  { type: 'todo', label: 'To-do list', icon: 'square', section: 'list', keywords: ['check', 'checkbox', 'task', '[]'], variant: 'body', mono: false, multiline: false, placeholder: 'To-do', mdPrefixes: ['[] ', '[ ] '] },
  { type: 'bulleted', label: 'Bulleted list', icon: 'list-bullet', section: 'list', keywords: ['ul', 'bullet', 'unordered', '-'], variant: 'body', mono: false, multiline: false, placeholder: 'List item', mdPrefixes: ['- ', '* '] },
  { type: 'numbered', label: 'Numbered list', icon: 'list-number', section: 'list', keywords: ['ol', 'ordered', '1.'], variant: 'body', mono: false, multiline: false, placeholder: 'List item' },
  { type: 'toggle', label: 'Toggle', icon: 'toggle-chev', section: 'list', keywords: ['collapse', 'expand', 'details'], variant: 'body', mono: false, multiline: false, placeholder: 'Toggle' },
  { type: 'quote', label: 'Quote', icon: 'quote-mark', section: 'other', keywords: ['blockquote', 'cite', '>'], variant: 'body', mono: false, multiline: true, placeholder: 'Quote', mdPrefixes: ['> '] },
  { type: 'code', label: 'Code', icon: 'code-block', section: 'other', keywords: ['snippet', 'mono', '```'], variant: 'callout', mono: true, multiline: true, placeholder: 'Code', mdPrefixes: ['``` ', '```'] },
  { type: 'divider', label: 'Divider', icon: 'minus', section: 'other', keywords: ['rule', 'hr', 'separator', '---'], variant: 'body', mono: false, multiline: false, placeholder: '', mdPrefixes: ['--- ', '---'] },
  { type: 'image', label: 'Image', icon: 'image', section: 'other', keywords: ['picture', 'photo', 'img', 'upload'], variant: 'body', mono: false, multiline: false, placeholder: '' },
  { type: 'file', label: 'File', icon: 'paperclip', section: 'other', keywords: ['attachment', 'upload', 'pdf', 'doc', 'attach'], variant: 'body', mono: false, multiline: false, placeholder: '' },
  { type: 'bookmark', label: 'Web bookmark', icon: 'link', section: 'other', keywords: ['url', 'link', 'bookmark', 'embed', 'web'], variant: 'body', mono: false, multiline: false, placeholder: 'Paste a link…' },
];

const BY_TYPE: Record<BlockType, BlockTypeDef> = BLOCK_TYPES.reduce(
  (acc, def) => {
    acc[def.type] = def;
    return acc;
  },
  {} as Record<BlockType, BlockTypeDef>,
);

/** The full presentation def for a block type. */
export function blockDef(type: BlockType): BlockTypeDef {
  return BY_TYPE[type] ?? BY_TYPE.paragraph;
}

export const labelFor = (type: BlockType): string => blockDef(type).label;
export const iconFor = (type: BlockType): IconName => blockDef(type).icon;
export const variantFor = (type: BlockType): TextVariant => blockDef(type).variant;
export const monoFor = (type: BlockType): boolean => blockDef(type).mono;
export const isMultiline = (type: BlockType): boolean => blockDef(type).multiline;
export const placeholderFor = (type: BlockType): string => blockDef(type).placeholder;

/** Block types whose Enter-split continues the SAME type (the list-entry motion). */
const CONTINUES: ReadonlySet<BlockType> = new Set<BlockType>(['todo', 'bulleted', 'numbered', 'toggle']);

/**
 * What Enter at the end of a `type` block creates next: lists/todos/toggles
 * continue themselves; everything else (headings, quotes, paragraphs…) yields a
 * fresh paragraph — the Notion continuation rule.
 */
export function continuationType(type: BlockType): BlockType {
  return CONTINUES.has(type) ? type : 'paragraph';
}

/** Whether Enter on an EMPTY block of this type should demote it to a paragraph
 *  (ending the list) instead of stacking another empty item. */
export function endsListOnEmptyEnter(type: BlockType): boolean {
  return CONTINUES.has(type);
}

export interface MdShortcutMatch {
  type: BlockType;
  /** Whatever the user typed after the prefix — kept as the block's text. */
  rest: string;
  /** `[x] ` starts a CHECKED to-do. */
  checked?: boolean;
}

// All (prefix → def) pairs, longest prefix first so '``` ' wins over '```'.
const MD_PREFIXES: { prefix: string; type: BlockType; checked?: boolean }[] = [
  ...BLOCK_TYPES.flatMap((def) => (def.mdPrefixes ?? []).map((prefix) => ({ prefix, type: def.type }))),
  { prefix: '[x] ', type: 'todo' as BlockType, checked: true },
  { prefix: '[X] ', type: 'todo' as BlockType, checked: true },
].sort((a, b) => b.prefix.length - a.prefix.length);

/** `1. ` / `1) ` (any number) → numbered list; declared as a regex, not a prefix table. */
const NUMBERED_MD = /^\d+[.)] /;

/**
 * Resolve a start-of-line Markdown shortcut: if `text` STARTS WITH a known
 * prefix (e.g. `"# "`, `"- "`, `"[x] "`, `"--- "`), return the {@link BlockType}
 * it converts to plus the remainder to keep as the block's text — so pasting
 * `"# Title"` converts AND keeps "Title". Prefix-based (not exact-match) so the
 * shortcut also fires when typed before existing text.
 */
export function mdShortcut(text: string): MdShortcutMatch | undefined {
  for (const m of MD_PREFIXES) {
    if (text.startsWith(m.prefix)) return { type: m.type, rest: text.slice(m.prefix.length), checked: m.checked };
  }
  const num = NUMBERED_MD.exec(text);
  if (num) return { type: 'numbered', rest: text.slice(num[0].length) };
  return undefined;
}

/**
 * Filter the slash menu by the text typed after "/" — case-insensitive substring
 * over the label plus prefix match over the keyword aliases, preserving the
 * canonical menu order (Notion keeps its sections stable rather than re-ranking).
 */
export function filterBlockTypes(query: string): BlockTypeDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return BLOCK_TYPES;
  return BLOCK_TYPES.filter(
    (def) => def.label.toLowerCase().includes(q) || def.keywords.some((k) => k.toLowerCase().startsWith(q)),
  );
}

/**
 * Per-run numbering for `numbered` blocks: a run restarts after any
 * non-numbered block at the SAME indent, while deeper-indented content nested
 * under an item does NOT break its parent's run (each indent level keeps its
 * own counter, reset when the level is interrupted). Render-side only — the
 * model stores no ordinals, so concurrent inserts renumber for free.
 */
export function listOrdinals(blocks: Pick<Block, 'id' | 'type' | 'indent'>[]): Map<string, number> {
  const ordinals = new Map<string, number>();
  const counters: number[] = [];
  for (const b of blocks) {
    const ind = b.indent ?? 0;
    if (b.type === 'numbered') {
      counters[ind] = (counters[ind] ?? 0) + 1;
      ordinals.set(b.id, counters[ind]!);
      counters.length = ind + 1; // deeper runs restart after this item
    } else {
      counters.length = ind; // breaks runs at this level and deeper, not shallower
    }
  }
  return ordinals;
}
