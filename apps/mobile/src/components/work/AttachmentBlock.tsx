/**
 * Inline attachment block — renders an uploaded file or image directly in
 * the page editor. Owns its own upload + decrypt state so BlockRow stays thin.
 *
 * Visual states
 * ─────────────
 *  A. Deleted child object  → faint tombstone row (icon + muted label)
 *  B. No blob uploaded yet  → dashed placeholder card + Upload button
 *  C. File too large error  → danger-toned card with specific MB message + retry
 *  D. Decrypting blob       → spinner in card shell
 *  E. Content:
 *     • image  → full-width rounded preview, caption below
 *     • code   → scrollable source excerpt with filename header
 *     • file   → horizontal chip: icon · name · size · Share
 */
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useState, useMemo } from 'react';

import { useTheme } from '@/lib/use-theme';
import { radii, spacing } from '@/theme';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Txt } from '@/components/ui/Txt';
import type { ObjectNode } from '@drakkar.software/octovault-sdk';
import { FileTooLargeError, MAX_OBJECT_BLOB_BYTES, propsOf } from '@drakkar.software/octovault-sdk';
import { useObjectBlob } from '@/lib/use-object-blob';
import { useObjectFiles } from '@/lib/use-object-files';
import { attachmentKind } from '@/lib/attachment-kind';

// Code preview caps — show a useful excerpt without loading the full file
const CODE_LINE_LIMIT = 100;
const CODE_BYTE_LIMIT = 8 * 1024; // 8 KB

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentBlockProps {
  node?: ObjectNode;
  blockType: 'image' | 'file';
  spaceId: string;
  onOpen: () => void;
  onLongPress?: () => void;
}

export function AttachmentBlock({ node, blockType, spaceId, onOpen, onLongPress }: AttachmentBlockProps) {
  const { colors } = useTheme();
  const { attachBlob } = useObjectFiles(spaceId);
  const { bytes, dataUri, loading, error, share } = useObjectBlob(spaceId, node);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const props = node ? propsOf(node) : {};
  const blobId = props['blobId'] as string | undefined;
  const mime = (props['mime'] as string | undefined)
    ?? (blockType === 'image' ? 'image/jpeg' : 'application/octet-stream');
  const name = (props['name'] as string | undefined)
    ?? (blockType === 'image' ? 'image' : 'file');
  const size = props['size'] as number | undefined;

  const kind = attachmentKind(mime, name);
  const isImage = blockType === 'image';

  const handleUpload = async () => {
    if (!node) return;
    setUploadError(null);
    setUploading(true);
    try {
      await attachBlob(node.id, isImage);
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        setUploadError(
          `This file is ${formatBytes(err.size)} — attachments must be under ${formatBytes(MAX_OBJECT_BLOB_BYTES)}.`
        );
      } else if (err instanceof Error && err.name !== 'AbortError') {
        setUploadError(err.message);
      }
      // AbortError = user cancelled — silently discard
    } finally {
      setUploading(false);
    }
  };

  // Decode the first CODE_BYTE_LIMIT bytes as UTF-8, cap to CODE_LINE_LIMIT lines
  const codePreview = useMemo(() => {
    if (!bytes || kind !== 'code') return null;
    try {
      const slice = bytes.slice(0, CODE_BYTE_LIMIT);
      const decoded = new TextDecoder('utf-8').decode(slice);
      const allLines = decoded.split('\n');
      const lines = allLines.slice(0, CODE_LINE_LIMIT);
      return {
        text: lines.join('\n'),
        truncated: allLines.length > CODE_LINE_LIMIT || bytes.length > CODE_BYTE_LIMIT,
      };
    } catch {
      return null;
    }
  }, [bytes, kind]);

  // ── State A: child object was deleted ────────────────────────────────────
  if (!node) {
    return (
      <View style={styles.deletedRow}>
        <Icon
          name={blockType === 'image' ? 'image' : 'file'}
          size={14}
          color={colors.inkFaint}
        />
        <Txt variant="body" tone="inkFaint">
          {blockType === 'image' ? 'Deleted image' : 'Deleted file'}
        </Txt>
      </View>
    );
  }

  // ── State D: decrypting blob ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.card, {
        backgroundColor: colors.surface,
        borderColor: colors.rule,
      }]}>
        <ActivityIndicator color={colors.inkMuted} />
      </View>
    );
  }

  // ── State C: file too large / upload error ───────────────────────────────
  if (uploadError) {
    return (
      <View style={[styles.card, {
        backgroundColor: colors.dangerBg,
        borderColor: colors.dangerBorder,
        borderStyle: 'solid',
      }]}>
        <View style={styles.errorRow}>
          <Icon name="alert" size={16} color={colors.danger} />
          <Txt variant="callout" tone="danger" style={styles.flexFill}>{uploadError}</Txt>
        </View>
        <Button
          label="Choose another file"
          variant="secondary"
          size="sm"
          onPress={() => void handleUpload()}
        />
      </View>
    );
  }

  // ── State E: decrypt error (e.g. wrong key) ──────────────────────────────
  if (error) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.rule }]}>
        <Icon name="alert" size={16} color={colors.danger} />
        <Txt variant="callout" tone="danger" style={styles.flexFill}>{error}</Txt>
      </View>
    );
  }

  // ── State B: no blob yet — placeholder ──────────────────────────────────
  if (!blobId) {
    return (
      <Pressable
        onPress={uploading ? undefined : () => void handleUpload()}
        onLongPress={onLongPress}
        style={({ pressed }) => [
          styles.placeholder,
          {
            backgroundColor: pressed && !uploading ? colors.accentBgStrong : colors.accentBg,
            borderColor: colors.accentBorder,
          },
        ]}
      >
        {uploading ? (
          <View style={styles.uploadingState}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Txt variant="callout" tone="inkMuted" style={styles.uploadingLabel}>
              Uploading…
            </Txt>
          </View>
        ) : (
          <>
            <View style={[styles.iconRing, { backgroundColor: colors.accentBgStrong, borderColor: colors.accentBorder }]}>
              <Icon
                name={isImage ? 'image' : 'arrow-up'}
                size={20}
                color={colors.accent}
              />
            </View>
            <Txt variant="callout" weight="semibold" tone="accentInk" style={styles.placeholderLabel}>
              {isImage ? 'Add image' : 'Upload file'}
            </Txt>
            <Txt variant="caption" tone="inkFaint">
              Tap to choose from your {isImage ? 'photos' : 'files'}
            </Txt>
            <View style={styles.uploadBtn}>
              <Button
                label="Choose file"
                variant="primary"
                size="sm"
                iconName="arrow-up"
                onPress={() => void handleUpload()}
              />
            </View>
          </>
        )}
      </Pressable>
    );
  }

  // ── State E — image preview ───────────────────────────────────────────────
  if (kind === 'image' && dataUri) {
    return (
      <Pressable
        onPress={onOpen}
        onLongPress={onLongPress}
        style={[styles.imageWrapper, { borderColor: colors.lineFaint }]}
      >
        <Image
          source={{ uri: dataUri }}
          style={[styles.image, { borderRadius: radii.card }]}
          contentFit="contain"
        />
        {(name || size != null) && (
          <View style={[styles.imageCaption, { borderTopColor: colors.lineFaint }]}>
            <Txt variant="caption" tone="inkMuted">
              {name}{size != null ? ` · ${formatBytes(size)}` : ''}
            </Txt>
          </View>
        )}
      </Pressable>
    );
  }

  // ── State E — code preview ────────────────────────────────────────────────
  if (kind === 'code' && codePreview) {
    return (
      <Pressable
        onPress={onOpen}
        onLongPress={onLongPress}
        style={[styles.codeCard, { backgroundColor: colors.codeBg, borderColor: colors.codeBorder }]}
      >
        {/* Filename header bar */}
        <View style={[styles.codeHeader, { borderBottomColor: colors.codeBorder }]}>
          <Icon name="paperclip" size={12} color={colors.inkMuted} />
          <Txt variant="caption" tone="inkMuted" mono numberOfLines={1} style={styles.flexFill}>
            {name}
          </Txt>
        </View>
        {/* Source excerpt — no inner scroll; outer page scrolls */}
        <ScrollView
          style={styles.codeScroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          <Txt variant="callout" mono style={{ color: colors.ink, lineHeight: 18 }}>
            {codePreview.text}
          </Txt>
        </ScrollView>
        {codePreview.truncated && (
          <Pressable
            onPress={onOpen}
            style={[styles.showMore, { borderTopColor: colors.codeBorder }]}
          >
            <Txt variant="caption" style={{ color: colors.accent }}>Show full file →</Txt>
          </Pressable>
        )}
      </Pressable>
    );
  }

  // ── State E — generic file chip (incl. video/audio) ──────────────────────
  const chipIcon = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'volume' : 'paperclip';
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.fileChip,
        {
          backgroundColor: pressed ? colors.pressed : colors.surface,
          borderColor: colors.rule,
        },
      ]}
    >
      <View style={[styles.fileIconWrap, { backgroundColor: colors.surfaceStrong }]}>
        <Icon name={chipIcon} size={16} color={colors.inkMuted} />
      </View>
      <Txt variant="body" tone="ink" numberOfLines={1} style={styles.flexFill}>{name}</Txt>
      {size != null ? (
        <Txt variant="caption" tone="inkMuted">{formatBytes(size)}</Txt>
      ) : null}
      <Pressable
        onPress={() => void share()}
        hitSlop={spacing.sm}
        style={styles.shareBtn}
      >
        <Icon name="arrow-r" size={16} color={colors.inkMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // ── Deleted tombstone ────────────────────────────────────────────────────
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    opacity: 0.5,
  },

  // ── Shared card shell (empty, error, loading) ────────────────────────────
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flexFill: { flex: 1 },

  // ── Empty / pending upload ────────────────────────────────────────────────
  placeholder: {
    borderRadius: radii.card,
    borderWidth: 1,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  iconRing: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  placeholderLabel: {
    marginTop: spacing.xs,
  },
  uploadBtn: {
    marginTop: spacing.md,
  },
  uploadingState: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  uploadingLabel: {
    marginTop: spacing.xs,
  },

  // ── Image preview ────────────────────────────────────────────────────────
  imageWrapper: {
    borderRadius: radii.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  image: {
    width: '100%',
    maxHeight: 320,
  },
  imageCaption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // ── Code preview ─────────────────────────────────────────────────────────
  codeCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  codeScroll: {
    maxHeight: 220,
    padding: spacing.sm,
  },
  showMore: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // ── File chip ────────────────────────────────────────────────────────────
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  fileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  shareBtn: {
    padding: spacing.xs,
    flexShrink: 0,
  },
});
