import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { layout, opacity, radii, spacing } from '@/theme';
import { copyText } from '@/lib/clipboard';
import { objectLink, routeForNode } from '@drakkar.software/octovault-sdk';
import { useTypeRegistry } from '@/lib/type-registry-context';
import { useCreatableTypes } from '@/lib/use-creatable-types';
import { useBrand } from '@/lib/brand-context';
import type { ObjectType } from '@drakkar.software/octovault-sdk';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import { useSpaceObjects } from '@/lib/space-objects-context';
import { buildTree, type ObjectTreeNode } from '@drakkar.software/octovault-sdk';
import type { ID, ObjectNode } from '@drakkar.software/octovault-sdk';
import { useHover } from '@/lib/use-hover';
import { useRecents } from '@/lib/use-recents';
import { useTheme } from '@/lib/use-theme';
import { useTreeCollapse } from '@/lib/use-tree-collapse';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';
import { ObjectTree, type ObjectTreeActions } from '@/components/objects/ObjectTree';

import { CreateTypeMenu, type VisibilityAccess } from './CreateTypeMenu';
import { WorkEmpty } from './WorkEmpty';

interface WorkObjectsProps {
  spaceId: string | null;
  /** Phone Vault home: recents + the labelled tree + quiet create rows. The
   *  desktop sidebar omits it (tree + footer only). */
  hero?: boolean;
  /** The object open in the main pane (derived from the route by the shell) —
   *  highlights its tree row and auto-expands its ancestors. */
  selectedId?: ID;
}

/**
 * The OctoVault workspace surface: the space's pages and boards from the unified
 * object index (the ONE shared store — see {@link useSpaceObjects}), rendered as
 * the collapsible {@link ObjectTree}. This component is where tree INTENT becomes
 * index MUTATION: it wires the row menu's verbs (rename / add child / move /
 * duplicate / archive-with-undo / copy link) onto the store, owns the persisted
 * per-space collapse state, and navigates creates straight into the editor with
 * `focusTitle=1` so naming happens in the hero, not a settings sheet.
 */
export function WorkObjects({ spaceId, hero, selectedId }: WorkObjectsProps) {
  const router = useRouter();
  const toast = useToast();
  const registry = useTypeRegistry();
  const { has } = useBrand();
  const { objects } = useSpaceObjects();
  const { nodes, allNodes, create, createWithAccess, reorder, move, rename, archive, restore, ready, loaded } = objects;

  // Workspace scope: pages + boards only. Nesting is via sub-pages (Notion/Anytype
  // style), not folders — any legacy folder node is filtered out and buildTree
  // reparents its children to the forest root.
  const tree = useMemo(
    () => buildTree(nodes.filter((n) => registry.showsInWorkTree(n))),
    [nodes, registry],
  );
  const { collapsed, toggle, expand } = useTreeCollapse(spaceId, tree);

  // The "Archived" entry only earns its row once something is actually archived —
  // a permanent empty Trash link is chrome without a job.
  const archivedCount = useMemo(
    () => allNodes.filter((n) => n.archived && registry.showsInWorkTree(n)).length,
    [allNodes, registry],
  );

  const openNode = (node: Pick<ObjectNode, 'id' | 'type' | 'emoji' | 'title'>) =>
    router.push({
      pathname: routeForNode(node),
      params: { id: node.id, spaceId: spaceId ?? '', emoji: node.emoji ?? '', label: node.title },
    });

  const [creating, setCreating] = useState(false);

  // Title-first creation: nodes are born UNTITLED (empty title, no forced emoji)
  // and the route opens with `focusTitle=1` so the hero mounts editing — naming
  // the thing you just made is the cheapest action, not three taps deep.
  const createAndOpen = useCallback((type: ObjectType, parentId?: ID, access: VisibilityAccess = 'space') => {
    if (access !== 'space') {
      // invite → encrypted; public → plaintext (public+enc:true is invalid in the model)
      setCreating(true);
      createWithAccess({ type, title: '', parentId }, { access, enc: access === 'invite' })
        .then((id) => {
          if (!id) return;
          if (parentId) expand([parentId]);
          router.push({
            pathname: '/work/object/[id]',
            params: { id, spaceId: spaceId ?? '', label: 'Untitled', focusTitle: '1' },
          });
        })
        .catch(() => toast.show({ message: 'Could not create — try again' }))
        .finally(() => setCreating(false));
      return;
    }
    const id = create({ type, title: '', parentId });
    if (!id) return;
    if (parentId) expand([parentId]); // a child born under a collapsed parent must be visible
    router.push({
      pathname: '/work/object/[id]',
      params: { id, spaceId: spaceId ?? '', label: 'Untitled', focusTitle: '1' },
    });
  }, [create, createWithAccess, expand, router, spaceId, toast]);
  const newPage = (parentId?: ID) => createAndOpen('page', parentId);
  const newBoard = (parentId?: ID) => createAndOpen('board', parentId);

  /** The sorted sibling run containing `id` within the rendered forest. */
  const siblingRunOf = (roots: ObjectTreeNode[], id: ID): ObjectTreeNode[] | null => {
    if (roots.some((n) => n.id === id)) return roots;
    for (const n of roots) {
      const found = siblingRunOf(n.children, id);
      if (found) return found;
    }
    return null;
  };

  // Move up/down renumbers the WHOLE sibling run (1..n with the pair swapped)
  // instead of swapping two order values — ties broken by id would otherwise make
  // a swap between equal orders a visual no-op.
  const nudge = (node: ObjectTreeNode, dir: -1 | 1) => {
    const run = siblingRunOf(tree, node.id);
    if (!run) return;
    const idx = run.findIndex((n) => n.id === node.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= run.length) return;
    const ids = run.map((n) => n.id);
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    const orderById: Record<ID, number> = {};
    ids.forEach((nid, i) => {
      orderById[nid] = i + 1;
    });
    reorder(orderById);
  };

  const actions: ObjectTreeActions = {
    addChild: (node, type: ObjectType) => createAndOpen(type, node.id),
    rename: (node, title) => rename(node.id, { title: title.trim() }),
    moveTo: (node, parentId) => {
      move(node.id, parentId);
      if (parentId) expand([parentId]); // reveal the new home
    },
    moveUp: (node) => nudge(node, -1),
    moveDown: (node) => nudge(node, 1),
    duplicate: (node) => {
      // `create()` defaults to {enc:true, access:'space'} — the duplicate is always
      // space-visible regardless of the source node's access. By design: non-space
      // nodes (invite) require a server round-trip via createWithAccess, and public
      // creation is not yet enabled.
      const id = create({ type: node.type, title: node.title, emoji: node.emoji, parentId: node.parentId });
      // Fractional order slots the copy right under its source (sort ties on id).
      if (id) reorder({ [id]: node.order + 0.5 });
    },
    // Web-only: a copied app URL is only useful where a routable origin exists.
    copyLink:
      Platform.OS === 'web' && spaceId
        ? (node) => {
            const url = objectLink(spaceId, node);
            if (!url) return;
            void copyText(url).then((ok) => {
              if (ok) toast.show({ message: 'Link copied' });
            });
          }
        : undefined,
    // Archive is reversible → toast Undo, never a blocking confirm (delete-forever
    // in Trash is the one that confirms).
    archive: (node) => {
      archive(node.id);
      toast.show({
        message: `${registry.descriptor(node.type).label} archived`,
        action: { label: 'Undo', onPress: () => restore(node.id) },
      });
    },
  };

  if (hero && loaded && tree.length === 0) {
    return <WorkEmpty onCreate={(type) => createAndOpen(type)} disabled={!ready} />;
  }

  const list =
    tree.length > 0 ? (
      <ObjectTree
        nodes={tree}
        onOpen={openNode}
        collapsed={collapsed}
        onToggle={toggle}
        selectedId={selectedId}
        actions={ready ? actions : undefined}
      />
    ) : loaded ? (
      <Txt variant="caption" tone="inkFaint" style={styles.empty}>
        No pages or boards yet.
      </Txt>
    ) : (
      // Skeleton rows mirroring the tree, so a cold start reads as the sidebar
      // filling in rather than a dead "Opening workspace…" caption.
      <View style={styles.skeletons}>
        <Skeleton height={12} width="74%" />
        <Skeleton height={12} width="58%" />
        <Skeleton height={12} width="66%" />
      </View>
    );

  const agentsRow = (
    <CreateControl label="Agents" iconName="agents" onPress={() => router.navigate('/(tabs)/agents')} />
  );

  const archivedRow =
    archivedCount > 0 ? (
      <CreateControl label="Archived" iconName="trash" onPress={() => router.push('/space/trash')} />
    ) : null;

  // Phone Vault home: recents first (jump back in), then the labelled tree with
  // quiet creates — no oversized scaffold buttons.
  if (hero) {
    return (
      <View style={styles.home}>
        <RecentSection spaceId={spaceId} onOpen={openNode} />
        <SectionLabel>Pages &amp; boards</SectionLabel>
        {list}
        <View style={styles.creates}>
          {has('pages') && <CreateControl label="New page" iconName="file" onPress={() => newPage()} disabled={!ready} />}
          {has('boards') && <CreateControl label="New board" iconName="layers" onPress={() => newBoard()} disabled={!ready} />}
        </View>
        {agentsRow}
        {archivedRow}
      </View>
    );
  }

  // Sidebar: the tree, then ONE quiet create row (page is the primary object;
  // boards and anything rarer live behind the trailing "⋯").
  return (
    <View style={styles.panel}>
      {list}
      <View style={styles.footer}>
        <View style={styles.footRow}>
          <CreateControl label="New page" iconName="plus" onPress={() => newPage()} disabled={!ready} grow />
          <FootMenu onCreateType={(type, access) => createAndOpen(type, undefined, access)} disabled={!ready || creating} />
        </View>
        {agentsRow}
        {archivedRow}
      </View>
    </View>
  );
}

/** Micro mono section header — the same vocabulary as MenuLabel, kept local so the
 *  tree surface doesn't depend on menu internals. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint" style={styles.sectionLabel}>
      {children}
    </Txt>
  );
}

interface RecentSectionProps {
  spaceId: string | null;
  onOpen: (node: ObjectNode) => void;
}

/** "Recent" rows on the phone home — the device MRU (see `lib/use-recents`)
 *  resolved against the live index so renames/archives never show stale entries. */
function RecentSection({ spaceId, onOpen }: RecentSectionProps) {
  const registry = useTypeRegistry();
  const { objects } = useSpaceObjects();
  const { recents } = useRecents();

  const items = useMemo(() => {
    if (!spaceId) return [];
    const out: { node: ObjectNode; ts: number }[] = [];
    for (const r of recents) {
      if (r.spaceId !== spaceId) continue;
      // Ids only in the MRU — resolve against the live index so renames show
      // fresh and archived/foreign entries simply don't render.
      const node = objects.get(r.objectId);
      if (!node || node.archived || !registry.showsInWorkTree(node)) continue;
      out.push({ node, ts: r.ts });
      if (out.length >= 5) break;
    }
    return out;
  }, [recents, spaceId, objects, registry]);

  if (items.length === 0) return null;
  return (
    <View style={styles.recentSection}>
      <SectionLabel>Recent</SectionLabel>
      {items.map(({ node, ts }) => (
        <RecentRow key={node.id} node={node} ts={ts} onPress={() => onOpen(node)} />
      ))}
    </View>
  );
}

function RecentRow({ node, ts, onPress }: { node: ObjectNode; ts: number; onPress: () => void }) {
  const { colors } = useTheme();
  const registry = useTypeRegistry();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={node.title || 'Untitled'}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => [
        styles.recentRow,
        { backgroundColor: pressed ? colors.pressed : hovered ? colors.hover : 'transparent' },
      ]}
    >
      {node.emoji ? (
        <Txt variant="subhead" style={styles.recentIcon}>
          {node.emoji}
        </Txt>
      ) : (
        <View style={styles.recentIconWrap}>
          <Icon name={registry.iconForNode(node)} size={14} color={colors.inkMuted} />
        </View>
      )}
      <Txt variant="subhead" tone={node.title ? undefined : 'inkMuted'} numberOfLines={1} style={styles.recentTitle}>
        {node.title || 'Untitled'}
      </Txt>
      <Txt variant="caption" mono tone="inkFaint">
        {relativeTime(ts)}
      </Txt>
    </Pressable>
  );
}

interface FootMenuProps {
  onCreateType: (type: ObjectType, access: VisibilityAccess) => void;
  disabled?: boolean;
}

/** The sidebar footer's "⋯": secondary create verbs behind one quiet trigger —
 *  driven by the registry so any future creatable type drops in automatically. */
function FootMenu({ onCreateType, disabled }: FootMenuProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const secondaryTypes = useCreatableTypes();

  return (
    <>
      <IconButton
        name="dots"
        size={16}
        color={colors.inkMuted}
        onPress={() => setOpen(true)}
        tooltip="More ways to create"
        accessibilityLabel="More ways to create"
      />
      <CreateTypeMenu
        visible={open}
        onClose={() => setOpen(false)}
        onCreate={(type, access) => { setOpen(false); onCreateType(type, access); }}
        disabled={disabled}
        types={secondaryTypes}
        title="Create"
      />
    </>
  );
}

interface CreateControlProps {
  label: string;
  iconName: IconName;
  onPress: () => void;
  disabled?: boolean;
  /** Fill the remaining footer-row width (the "+ New page" primary). */
  grow?: boolean;
}

function CreateControl({ label, iconName, onPress, disabled, grow }: CreateControlProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      {...hoverProps}
      style={({ pressed }) => [
        styles.create,
        grow && styles.grow,
        {
          backgroundColor: pressed && !disabled ? colors.pressed : hovered && !disabled ? colors.hover : 'transparent',
          opacity: disabled ? opacity.disabled : 1,
        },
      ]}
    >
      <Icon name={iconName} size={15} color={hovered ? colors.accent : colors.inkMuted} />
      <Txt variant="footnote" weight="medium" tone="inkSoft">
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 2 },
  home: { gap: spacing.xs },
  sectionLabel: { paddingHorizontal: spacing.sm, marginBottom: spacing.xs, marginTop: spacing.sm },
  empty: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  skeletons: { gap: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  footer: { marginTop: spacing.sm, gap: 1 },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  creates: { marginTop: spacing.sm, gap: 1 },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  grow: { flex: 1 },
  recentSection: { marginBottom: spacing.md },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.objectTreeRowHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  recentIcon: { width: 18, textAlign: 'center' },
  recentIconWrap: { width: 18, alignItems: 'center' },
  recentTitle: { flex: 1, minWidth: 0 },
});
