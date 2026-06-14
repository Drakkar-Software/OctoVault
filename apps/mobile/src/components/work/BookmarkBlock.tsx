/**
 * Inline bookmark block — unfurls a URL into a rich OG card (title,
 * description, thumbnail) via the server's `/unfurl` endpoint and persists
 * the result in the block's CRDT `bookmark` register so it renders offline.
 *
 * Visual states
 * ─────────────
 *  A. Empty URL    → text field with link icon ("Paste a link…")
 *  B. Fetching     → loading card ("Fetching preview…")
 *  C. OG card      → editorial card with thumbnail, title, hostname chip
 *  C'. Bare link   → minimal link row on unfurl failure
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useState, useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';

import { useTheme } from '@/lib/use-theme';
import { radii, shadows, spacing } from '@/theme';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { Txt } from '@/components/ui/Txt';
import { useUnfurl } from '@/lib/use-unfurl';
import type { BookmarkMeta } from '@drakkar.software/octovault-sdk';

interface BookmarkBlockProps {
  /** The URL stored in the block's text register. Empty while the user is typing. */
  text: string;
  /** Cached OG metadata previously fetched and persisted to the CRDT register. */
  bookmark?: BookmarkMeta;
  /** Persist the URL to the CRDT (called on submit/blur). */
  onChangeUrl: (url: string) => void;
  /** Persist OG metadata to the CRDT `bookmark:` register once fetched. */
  onBookmarkFetched: (meta: BookmarkMeta) => void;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function BookmarkBlock({ text, bookmark, onChangeUrl, onBookmarkFetched }: BookmarkBlockProps) {
  const { colors } = useTheme();
  const { unfurl } = useUnfurl();
  const [localUrl, setLocalUrl] = useState(text);
  const [fetching, setFetching] = useState(false);
  const [unfurlFailed, setUnfurlFailed] = useState(false);

  // Sync localUrl when the block's text changes externally (CRDT merge from
  // another device). We only override the local value when it is empty (the
  // user hasn't started typing) to avoid colliding with an active edit session.
  useEffect(() => {
    if (!localUrl) setLocalUrl(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Auto-unfurl when `text` has a URL but the cached metadata is missing or
  // stale (`fetchedFor !== text`). A cancel flag prevents stale state updates
  // if the block unmounts or `text` changes before the fetch resolves.
  useEffect(() => {
    if (!text || !isValidUrl(text)) return;
    if (bookmark && bookmark.fetchedFor === text) return; // cache hit — nothing to do

    let cancelled = false;
    setFetching(true);
    setUnfurlFailed(false);

    unfurl(text)
      .then((meta) => {
        if (cancelled) return;
        if (meta) {
          onBookmarkFetched(meta);
        } else {
          setUnfurlFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setUnfurlFailed(true);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => { cancelled = true; };
  }, [text, bookmark, unfurl, onBookmarkFetched]);

  const handleSubmit = () => {
    const trimmed = localUrl.trim();
    if (!trimmed || !isValidUrl(trimmed)) return;
    onChangeUrl(trimmed);
  };

  const openUrl = () => {
    const url = text || localUrl;
    if (!url) return;
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  // ── State A: no URL yet — show input ────────────────────────────────────
  if (!text) {
    return (
      <View style={[styles.inputWrapper, { borderColor: colors.lineSoft }]}>
        <TextField
          leadingIcon="link"
          value={localUrl}
          onChangeText={setLocalUrl}
          onBlur={handleSubmit}
          onSubmitEditing={handleSubmit}
          placeholder="Paste a link…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          plain
        />
      </View>
    );
  }

  // ── State B: fetching OG data ─────────────────────────────────────────────
  if (fetching) {
    return (
      <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.rule }]}>
        <ActivityIndicator size="small" color={colors.inkMuted} />
        <Txt variant="caption" tone="inkFaint">Fetching preview…</Txt>
      </View>
    );
  }

  // ── State C: OG card — rich metadata available ───────────────────────────
  if (bookmark && bookmark.fetchedFor === text) {
    return (
      <Pressable
        onPress={openUrl}
        style={({ pressed }) => [
          styles.ogCard,
          shadows.sm,
          {
            backgroundColor: pressed ? colors.pressed : colors.paper,
            borderColor: colors.line,
          },
        ]}
      >
        <View style={styles.ogBody}>
          {/* Text column */}
          <View style={styles.ogText}>
            <Txt variant="body" weight="medium" tone="ink" numberOfLines={2}>
              {bookmark.title}
            </Txt>
            {bookmark.description ? (
              <Txt variant="caption" tone="inkMuted" numberOfLines={3} style={styles.ogDescription}>
                {bookmark.description}
              </Txt>
            ) : null}
            <View style={styles.hostnameRow}>
              <Icon name="globe" size={11} color={colors.inkFaint} />
              <Txt variant="caption" tone="inkFaint" mono numberOfLines={1} style={styles.flexFill}>
                {hostnameOf(text)}
              </Txt>
            </View>
          </View>
          {/* Thumbnail */}
          {bookmark.image ? (
            <Image
              source={{ uri: bookmark.image }}
              style={[styles.thumbnail, { borderRadius: radii.sm }]}
              contentFit="cover"
            />
          ) : null}
        </View>
      </Pressable>
    );
  }

  // ── State C': bare link row — unfurl failed or not yet cached ────────────
  return (
    <Pressable
      onPress={openUrl}
      style={({ pressed }) => [
        styles.bareLink,
        {
          backgroundColor: pressed ? colors.pressed : colors.surface,
          borderColor: colors.rule,
        },
      ]}
    >
      <Icon name="link" size={14} color={colors.inkMuted} />
      <Txt variant="body" tone="inkMuted" numberOfLines={1} style={styles.flexFill}>
        {text}
      </Txt>
      {unfurlFailed ? (
        <Txt variant="caption" tone="inkFaint">No preview</Txt>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // ── State A — URL input ──────────────────────────────────────────────────
  inputWrapper: {
    borderRadius: radii.card,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },

  // ── State B — loading ────────────────────────────────────────────────────
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 72,
  },

  // ── State C — OG card ────────────────────────────────────────────────────
  ogCard: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: spacing.md,
  },
  ogBody: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ogText: {
    flex: 1,
    gap: spacing.xs,
  },
  ogDescription: {
    marginTop: spacing.xs,
  },
  hostnameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  thumbnail: {
    width: 80,
    height: 80,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  flexFill: { flex: 1 },

  // ── State C' — bare link fallback ────────────────────────────────────────
  bareLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
});
