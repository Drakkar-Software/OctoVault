import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { layout, radii, spacing } from '@/theme';
import { focusRingStyle, useFocusRing } from '@/lib/focus';
import { useTypeRegistry } from '@/lib/type-registry-context';
import { useCreatableTypes } from '@/lib/use-creatable-types';
import { useHover } from '@/lib/use-hover';
import { useQuickCreate } from '@/lib/use-quick-create';
import { useRecents } from '@/lib/use-recents';
import { useSpaceObjects } from '@/lib/space-objects-context';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import type { ObjectNode } from '@drakkar.software/octovault-sdk';
import { useTheme } from '@/lib/use-theme';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Txt } from '@/components/ui/Txt';

import { WorkEmpty } from './WorkEmpty';

/** How many recent documents the home surfaces — enough to resume work, few
 *  enough to stay an editorial list rather than a feed. */
const MAX_RECENTS = 6;

/**
 * The desktop Vault home — a real landing pane instead of the old mirror of
 * the sidebar tree (two synchronized trees side-by-side read as scaffolding).
 * Notion-style and greeting-free: a "Jump back in" list of this device's
 * recently opened documents (MRU from {@link useRecents}, resolved against the
 * live index so renames/archives reflect instantly) and a quiet create row.
 * The full tree stays in the sidebar; phones keep their tree via WorkObjects.
 */
export function WorkHome({ spaceId }: { spaceId: string | null }) {
  const router = useRouter();
  const registry = useTypeRegistry();
  const creatableTypes = useCreatableTypes();
  const { objects } = useSpaceObjects();
  const { recents } = useRecents();
  const { createObject, ready } = useQuickCreate();

  // Resolve the device MRU to live nodes in THIS space; drop archived/foreign
  // entries instead of showing dead rows.
  const items = useMemo(() => {
    const out: { node: ObjectNode; ts: number }[] = [];
    const seen = new Set<string>();
    for (const r of recents) {
      if (r.spaceId !== spaceId || seen.has(r.objectId)) continue;
      const node = objects.get(r.objectId);
      if (!node || node.archived) continue;
      seen.add(r.objectId);
      out.push({ node, ts: r.ts });
      if (out.length >= MAX_RECENTS) break;
    }
    return out;
  }, [recents, spaceId, objects]);

  const hasContent = useMemo(
    () => objects.nodes.some((n) => registry.showsInWorkTree(n)),
    [objects.nodes, registry],
  );

  const open = (node: ObjectNode) =>
    router.push({
      pathname: '/work/object/[id]',
      params: { id: node.id, spaceId: spaceId ?? '', emoji: node.emoji ?? '', label: node.title },
    });

  // Index still opening: sketch the rows it will fill (no spinner pop-in).
  if (!objects.loaded) {
    return (
      <View style={styles.home}>
        <Skeleton width={120} height={10} />
        <View style={styles.skeletonRows}>
          <Skeleton height={layout.objectTreeRowHeight} radius={radii.md} />
          <Skeleton height={layout.objectTreeRowHeight} radius={radii.md} />
          <Skeleton height={layout.objectTreeRowHeight} radius={radii.md} />
        </View>
      </View>
    );
  }

  // Nothing in the space yet — the first-page moment, with live CTAs.
  if (!hasContent) {
    return <WorkEmpty onCreate={createObject} disabled={!ready} />;
  }

  return (
    <View style={styles.home}>
      {items.length > 0 ? (
        <View style={styles.section}>
          <Txt variant="micro" mono uppercase weight="bold" tone="inkFaint" style={styles.label}>
            Jump back in
          </Txt>
          {items.map(({ node, ts }) => (
            <HomeRow
              key={node.id}
              icon={registry.iconForNode(node)}
              emoji={node.emoji}
              label={node.title || 'Untitled'}
              meta={relativeTime(ts)}
              onPress={() => open(node)}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        <Txt variant="micro" mono uppercase weight="bold" tone="inkFaint" style={styles.label}>
          Start
        </Txt>
        {creatableTypes.map((d) => (
          <HomeRow key={d.type} icon={d.icon} label={`New ${d.label.toLowerCase()}`} disabled={!ready} onPress={() => createObject(d.type)} />
        ))}
      </View>
    </View>
  );
}

interface HomeRowProps {
  icon: IconName;
  /** Object emoji wins over the type glyph when present. */
  emoji?: string;
  label: string;
  /** Trailing mono caption (relative edit time). */
  meta?: string;
  disabled?: boolean;
  onPress: () => void;
}

/** One quiet home row — hover wash, pressed fill, focus ring; the same calm
 *  row vocabulary as the sidebar tree so the home reads as part of the shell. */
function HomeRow({ icon, emoji, label, meta, disabled, onPress }: HomeRowProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const { focused, focusProps } = useFocusRing();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      {...hoverProps}
      {...focusProps}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.pressed } : hovered ? { backgroundColor: colors.hover } : null,
        focused && focusRingStyle(colors),
      ]}
    >
      {emoji ? (
        <Txt variant="subhead" style={styles.rowEmoji}>
          {emoji}
        </Txt>
      ) : (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={15} color={colors.inkMuted} />
        </View>
      )}
      <Txt variant="subhead" numberOfLines={1} style={styles.rowLabel}>
        {label}
      </Txt>
      {meta ? (
        <Txt variant="caption" mono tone="inkFaint">
          {meta}
        </Txt>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  home: { gap: spacing.xl, paddingTop: spacing.lg },
  section: { gap: spacing.xs },
  label: { paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.objectTreeRowHeight + spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  rowEmoji: { width: 22, textAlign: 'center' },
  rowIcon: { width: 22, alignItems: 'center' },
  rowLabel: { flex: 1, minWidth: 0 },
  skeletonRows: { gap: spacing.sm, marginTop: spacing.sm },
});
