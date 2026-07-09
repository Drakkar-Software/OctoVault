import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { StringFormat } from 'expo-clipboard';
import {
  serializeBlocks,
  parseClipboardHtml,
  splitPlainText,
  toClipBlock,
  type Block,
  type ClipBlock,
} from '@drakkar.software/octovault-sdk';

// How long the "Copied" confirmation stays before reverting to the idle label.
const COPIED_RESET_MS = 1600;

type Clip = { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } };

/**
 * Copy text to the clipboard. Native uses `expo-clipboard`; web uses the
 * `navigator.clipboard` API (kept as a path so it works under RN-Web without
 * the native module). Resolves to whether the copy actually happened so callers
 * can show feedback only on success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS !== 'web') return await Clipboard.setStringAsync(text);
    const clip = (globalThis as Clip).navigator?.clipboard;
    if (!clip?.writeText) return false;
    await clip.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copy-to-clipboard with a transient `copied` flag for button feedback. */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (text: string) => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }, []);

  return { copied, copy };
}

/* ───────────────────────── multi-block clipboard ──────────────────────────── */

/**
 * Same-session fallback for a multi-block copy: some native pasteboards (and some
 * OEM keyboards) drop the rich `text/html` representation, leaving only the plain
 * text. When the plain text we read back matches what we last wrote, we restore the
 * exact structured blocks instead of re-parsing the lossy plain rendering.
 */
let remembered: { plain: string; blocks: ClipBlock[] } | null = null;

type ClipItem = { types?: string[]; getType: (t: string) => Promise<{ text: () => Promise<string> }> };
type RichClip = {
  ClipboardItem?: new (items: Record<string, Blob>) => unknown;
  navigator?: {
    clipboard?: {
      write?: (items: unknown[]) => Promise<void>;
      read?: () => Promise<ClipItem[]>;
      readText?: () => Promise<string>;
    };
  };
};

/** Serialize `blocks`, remember them for the same-session fallback, and return the
 *  paired plain + rich-HTML payloads. Used by both the web copy-event path (which
 *  writes the payloads onto `e.clipboardData`) and {@link copyBlocks}. */
export function rememberBlocks(blocks: Block[]): { plain: string; html: string } {
  const s = serializeBlocks(blocks);
  remembered = { plain: s.plain, blocks: blocks.map(toClipBlock) };
  return s;
}

/** Resolve clipboard payloads (rich HTML + plain) into blocks: prefer our own rich
 *  format, else same-session remembered blocks, else split external plain text.
 *  Used by the web paste-event path (which reads both off `e.clipboardData`). */
export function clipBlocksFromPayloads(html: string, plain: string): ClipBlock[] | null {
  const rich = parseClipboardHtml(html);
  if (rich) return rich;
  if (remembered && plain && plain === remembered.plain) return remembered.blocks;
  return plain ? splitPlainText(plain) : null;
}

/** Write a run of blocks to the clipboard (rich HTML + plain text). Native uses
 *  `expo-clipboard`; web writes both formats via the async Clipboard API. On web,
 *  prefer intercepting the DOM `copy` event where possible — this is the
 *  button/programmatic fallback. */
export async function copyBlocks(blocks: Block[]): Promise<boolean> {
  const { plain, html } = rememberBlocks(blocks);
  try {
    if (Platform.OS !== 'web') {
      return await Clipboard.setStringAsync(html, { inputFormat: StringFormat.HTML });
    }
    const g = globalThis as unknown as RichClip;
    const clip = g.navigator?.clipboard;
    if (g.ClipboardItem && clip?.write) {
      await clip.write([
        new g.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
    return await copyText(plain);
  } catch {
    return false;
  }
}

/** Read blocks from the clipboard: prefer our rich payload, else same-session
 *  remembered blocks, else split external plain text. Native uses `expo-clipboard`;
 *  web uses the async Clipboard API (the paste-event path is preferred on web). */
export async function pasteBlocks(): Promise<ClipBlock[] | null> {
  try {
    if (Platform.OS !== 'web') {
      const html = await Clipboard.getStringAsync({ preferredFormat: StringFormat.HTML }).catch(() => '');
      const rich = parseClipboardHtml(html);
      if (rich) return rich;
      const plain = await Clipboard.getStringAsync().catch(() => '');
      return clipBlocksFromPayloads('', plain);
    }
    const g = globalThis as unknown as RichClip;
    const clip = g.navigator?.clipboard;
    if (clip?.read) {
      const items = await clip.read();
      for (const it of items) {
        if (it.types?.includes('text/html')) {
          const blob = await it.getType('text/html');
          const rich = parseClipboardHtml(await blob.text());
          if (rich) return rich;
        }
      }
    }
    const plain = (await clip?.readText?.()) ?? '';
    return clipBlocksFromPayloads('', plain);
  } catch {
    return null;
  }
}
