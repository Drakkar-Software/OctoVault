import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { opacity, radii, spacing } from '@/theme';
import type { CreatableTypeEntry } from '@drakkar.software/octovault-sdk';
import { useCreatableTypes } from '@/lib/use-creatable-types';
import { useHover } from '@/lib/use-hover';
import { useScalePress } from '@/lib/use-scale-press';
import { useTheme } from '@/lib/use-theme';
import type { ObjectType } from '@drakkar.software/octovault-sdk';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';

export type VisibilityAccess = 'space' | 'invite' | 'public';

interface VisibilityOption {
  value: VisibilityAccess;
  label: string;
  description: string;
  icon: IconName;
  disabled?: boolean;
  soon?: boolean;
}

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: 'space',
    label: 'Space',
    description: 'Visible to all space members',
    icon: 'people',
  },
  {
    value: 'invite',
    label: 'Invite only',
    description: 'Title hidden from shared index · encrypted for members',
    icon: 'lock',
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Visible to anyone · not encrypted',
    icon: 'unlock',
    disabled: true,
    soon: true,
  },
];

const TYPE_DESCRIPTIONS: Record<string, string> = {
  page: 'Nested blocks, rich text, inline media',
  board: 'Kanban columns and task cards',
};

interface CreateTypeMenuProps {
  visible: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<any>;
  onCreate: (type: ObjectType, access: VisibilityAccess) => void;
  disabled?: boolean;
  types?: CreatableTypeEntry[];
  title?: string;
  hideVisibility?: boolean;
}

export function CreateTypeMenu({
  visible,
  onClose,
  onCreate,
  disabled,
  types,
  title = 'Create',
  hideVisibility = false,
}: CreateTypeMenuProps) {
  const { colors } = useTheme();
  const creatableTypes = useCreatableTypes();

  const items = types ?? creatableTypes;
  const [access, setAccess] = useState<VisibilityAccess>('space');

  // Reset to space-default when dismissed so a chosen 'Invite' doesn't persist
  // to the next open (security: the control should start neutral each time).
  useEffect(() => { if (!visible) setAccess('space'); }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.root}>
        {!hideVisibility && (
          <View style={styles.section}>
            <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint" style={styles.label}>
              Visibility
            </Txt>
            <View style={[styles.card, { borderColor: colors.lineSoft, backgroundColor: colors.paper }]}>
              {VISIBILITY_OPTIONS.map((opt, i) => (
                <View key={opt.value}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.lineFaint }]} />}
                  <VisibilityRow opt={opt} selected={access === opt.value} onSelect={setAccess} />
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint" style={styles.label}>
            Type
          </Txt>
          <View style={styles.typeList}>
            {items.map((d) => (
              <TypeTile
                key={d.label}
                entry={d}
                disabled={disabled}
                onPress={() => { onClose(); onCreate(d.type, access); }}
              />
            ))}
          </View>
        </View>
      </View>
    </Sheet>
  );
}

// ── VisibilityRow ────────────────────────────────────────────────────────────

function VisibilityRow({
  opt,
  selected,
  onSelect,
}: {
  opt: VisibilityOption;
  selected: boolean;
  onSelect: (v: VisibilityAccess) => void;
}) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: opt.disabled }}
      disabled={opt.disabled}
      onPress={() => onSelect(opt.value)}
      {...hoverProps}
      style={({ pressed }) => [
        styles.visRow,
        {
          backgroundColor: selected
            ? colors.accentBg
            : pressed && !opt.disabled
            ? colors.pressed
            : hovered && !opt.disabled
            ? colors.hover
            : 'transparent',
          opacity: opt.disabled ? opacity.disabled : 1,
        },
      ]}
    >
      {/* Radio ring */}
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.accent : colors.lineSoft,
            backgroundColor: selected ? colors.accent : 'transparent',
          },
        ]}
      >
        {selected && <View style={[styles.radioDot, { backgroundColor: colors.onAccent }]} />}
      </View>

      {/* Label + description */}
      <View style={styles.visText}>
        <View style={styles.visLabelRow}>
          <Txt
            variant="subhead"
            weight={selected ? 'semibold' : 'regular'}
            color={selected ? colors.accentInk : colors.ink}
          >
            {opt.label}
          </Txt>
          {opt.soon && (
            <View style={[styles.soonPill, { backgroundColor: colors.fill, borderColor: colors.lineSoft }]}>
              <Txt variant="micro" mono uppercase tone="inkMuted">Soon</Txt>
            </View>
          )}
        </View>
        <Txt variant="caption" tone="inkFaint">{opt.description}</Txt>
      </View>

      {/* Icon hint */}
      <Icon name={opt.icon} size={15} color={selected ? colors.accent : colors.inkFaint} />
    </Pressable>
  );
}

// ── TypeTile ─────────────────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TypeTile({
  entry,
  onPress,
  disabled,
}: {
  entry: CreatableTypeEntry;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const { animStyle, onPressIn, onPressOut } = useScalePress({ scaleTo: 0.97 });
  // Reanimated drops a function-form `style` on web, taking the tile's layout
  // with it — track pressed via state so `style` stays a plain array.
  const [pressed, setPressed] = useState(false);

  const description = TYPE_DESCRIPTIONS[entry.type as string] ?? '';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Create ${entry.label}`}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        onPressIn();
      }}
      onPressOut={() => {
        setPressed(false);
        onPressOut();
      }}
      {...hoverProps}
      style={[
        styles.typeTile,
        {
          backgroundColor: pressed
            ? colors.accentBgStrong
            : hovered
            ? colors.accentBg
            : colors.paperAlt,
          borderColor: pressed || hovered ? colors.accentBorder : colors.lineSoft,
          opacity: disabled ? opacity.disabled : 1,
        },
        animStyle,
      ]}
    >
      {/* Icon square */}
      <View
        style={[
          styles.typeIconWrap,
          { backgroundColor: hovered ? colors.accentBgStrong : colors.accentBg },
        ]}
      >
        <Icon name={entry.icon} size={22} color={colors.accent} />
      </View>

      {/* Name + description */}
      <View style={styles.typeText}>
        <Txt variant="heading">{entry.label}</Txt>
        {description ? (
          <Txt variant="caption" tone="inkFaint">{description}</Txt>
        ) : null}
      </View>

      <Icon name="chev" size={16} color={colors.inkFaint} />
    </AnimatedPressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { gap: spacing.lg },

  section: { gap: spacing.sm },
  label: { paddingHorizontal: spacing.xs },

  // Visibility card: a single rounded container holding the three radio rows
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth },
  visRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  visText: { flex: 1, gap: 2 },
  visLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  soonPill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },

  // Type tiles: stacked full-width pressable cards
  typeList: { gap: spacing.sm },
  typeTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  typeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  typeText: { flex: 1, gap: 2 },
});
