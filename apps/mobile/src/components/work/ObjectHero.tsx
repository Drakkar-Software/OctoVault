import { useState } from 'react';
import type { RefObject } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { layout, radii, spacing } from '@/theme';
import { useHover, useRowHover } from '@/lib/use-hover';
import { useTheme } from '@/lib/use-theme';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Icon } from '@/components/ui/Icon';
import { Txt } from '@/components/ui/Txt';

interface ObjectHeroProps {
  /** Emoji glyph shown as the large object icon above the title. Absent → no icon
   *  (no forced default); an "Add icon" ghost appears instead when `onPressIcon`. */
  emoji?: string;
  /** Object title; falls back to "Untitled" when empty. */
  title?: string;
  /** Optional subtle meta line under the title (e.g. "Edited 2h ago"). Block
   *  counts and other noise should NOT live here — keep it editorial. */
  subtitle?: string;
  /** When set, the title is tap-to-edit in place on EVERY form factor (an inline
   *  {@link AutosaveField} at `pageTitle` metrics) — phones no longer detour
   *  through a form sheet to rename. */
  onChangeTitle?: (text: string) => void;
  /** When set, the icon (or the "Add icon" ghost) is pressable — the owner opens
   *  an EmojiPicker anchored at {@link iconAnchorRef}. */
  onPressIcon?: () => void;
  /** Measure anchor for the owner's EmojiPicker popover (attached to the icon /
   *  ghost row), so the picker hangs off the glyph instead of centering. */
  iconAnchorRef?: RefObject<View | null>;
  /** Left inset so the hero aligns with a gutter-indented content column (the page
   *  editor reserves a left gutter for block handles; the board does not). */
  leftInset?: number;
  /** Create flows: mount with the title ALREADY editing (seeded empty when the
   *  title is still the placeholder "Untitled") so typing names the page at once. */
  focusTitle?: boolean;
  /** Enter/return in the title editor — the page editor jumps focus into the
   *  first block (never fired on blur/Escape, see {@link AutosaveField} `onSubmit`). */
  onSubmitTitle?: () => void;
}

/**
 * The header for a `page`/`board` view, in the Notion/Anytype idiom: a large object
 * icon sitting ABOVE a big editorial display title, with generous breathing room.
 * Shared by {@link PageView} and {@link BoardView} so the hero markup + metrics live
 * in one place.
 *
 * With no emoji set, nothing renders where the icon would be — instead a quiet
 * "Add icon" affordance appears (on web only while the hero is hovered, Notion-
 * style; on touch it stays visible since there is no hover to reveal it).
 */
export function ObjectHero({
  emoji,
  title,
  subtitle,
  onChangeTitle,
  onPressIcon,
  iconAnchorRef,
  leftInset = 0,
  focusTitle = false,
  onSubmitTitle,
}: ObjectHeroProps) {
  const { colors } = useTheme();
  const heroHover = useRowHover();
  const titleHover = useHover();
  const iconHover = useHover();
  const ghostHover = useHover();
  const [editing, setEditing] = useState(focusTitle && !!onChangeTitle);
  const canEditTitle = !!onChangeTitle;

  // A brand-new page still carries the placeholder name — seed the editor empty
  // so the first keystroke replaces "Untitled" instead of appending to it.
  const seedTitle = focusTitle && (!title || title === 'Untitled') ? '' : (title ?? '');

  return (
    <View style={[styles.hero, leftInset ? { paddingLeft: leftInset } : null]} {...heroHover.hoverProps}>
      {emoji ? (
        onPressIcon ? (
          <View ref={iconAnchorRef} collapsable={false} style={styles.iconAnchor}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change icon"
              onPress={onPressIcon}
              {...iconHover.hoverProps}
              style={[styles.iconHit, { backgroundColor: iconHover.hovered ? colors.hover : 'transparent' }]}
            >
              <Txt style={styles.icon} accessibilityLabel="Icon">
                {emoji}
              </Txt>
            </Pressable>
          </View>
        ) : (
          <View style={styles.iconHit}>
            <Txt style={styles.icon} accessibilityLabel="Icon">
              {emoji}
            </Txt>
          </View>
        )
      ) : onPressIcon ? (
        // Ghost affordance instead of a forced default glyph. It stays in the
        // flow at full size (no layout jump) and fades in on hero hover on web;
        // touch has no hover, so it is always (quietly) visible there.
        <View ref={iconAnchorRef} collapsable={false} style={styles.iconAnchor}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add icon"
            onPress={onPressIcon}
            hitSlop={8}
            {...ghostHover.hoverProps}
            style={[
              styles.addIcon,
              { backgroundColor: ghostHover.hovered ? colors.hover : 'transparent' },
              Platform.OS === 'web' && !heroHover.hovered && !ghostHover.hovered ? styles.addIconHidden : null,
            ]}
          >
            <Icon name="emoji" size={14} color={colors.inkFaint} />
            <Txt variant="footnote" tone="inkFaint">
              Add icon
            </Txt>
          </Pressable>
        </View>
      ) : null}

      {canEditTitle && editing ? (
        <AutosaveField
          initialText={seedTitle}
          textVariant="pageTitle"
          plain
          autoFocus
          placeholder="Untitled"
          accessibilityLabel="Title"
          onCommit={(t) => onChangeTitle!(t)}
          onClose={() => setEditing(false)}
          onSubmit={onSubmitTitle}
          containerStyle={styles.titleEdit}
        />
      ) : canEditTitle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Rename ${title || 'Untitled'}`}
          onPress={() => setEditing(true)}
          {...titleHover.hoverProps}
          style={[styles.titleHit, { backgroundColor: titleHover.hovered ? colors.hover : 'transparent' }]}
        >
          <Txt variant="pageTitle" weight="bold" tone={title ? 'ink' : 'inkFaint'}>
            {title || 'Untitled'}
          </Txt>
        </Pressable>
      ) : (
        <Txt variant="pageTitle" weight="bold" tone={title ? 'ink' : 'inkFaint'}>
          {title || 'Untitled'}
        </Txt>
      )}

      {subtitle ? (
        <Txt variant="footnote" tone="inkMuted" style={styles.meta}>
          {subtitle}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'flex-start', paddingTop: spacing.lg, gap: spacing.xs, marginBottom: spacing.sm },
  // The anchor wrapper exists purely so `measureInWindow` has a stable node
  // (`collapsable={false}` keeps Android from optimizing it away).
  iconAnchor: { alignSelf: 'flex-start' },
  // Hit target hugs the glyph so the hover wash doesn't balloon; negative margin keeps
  // the icon's optical left edge flush with the title below.
  iconHit: { marginHorizontal: -spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radii.md, marginBottom: spacing.xs },
  icon: { fontSize: layout.objectIconLg, lineHeight: layout.objectIconLg + 8 },
  // Quiet ghost row where the icon would sit; web fades it in on hero hover.
  addIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  addIconHidden: { opacity: 0 },
  // Negative margin so the press surface hugs the text without shifting the title's
  // optical left edge (the inline editor is flush, so they line up).
  titleHit: { alignSelf: 'flex-start', marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm },
  // The hero container uses alignItems:'flex-start' so the emoji icon hugs its width.
  // The title editor must stretch to the full hero width so the TextInput has room —
  // without this the TextInput collapses to near-zero width and typed characters are
  // clipped (invisible while typing, visible after blur when the Txt component takes over).
  titleEdit: { alignSelf: 'stretch' },
  meta: { marginTop: spacing.xs },
});
