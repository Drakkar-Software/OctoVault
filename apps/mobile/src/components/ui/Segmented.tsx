import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SegmentedControl as NativeSegmentedControl } from '@octovault/ui';

import { focusRingStyle, useFocusRing } from '@/lib/focus';
import { useHover } from '@/lib/use-hover';
import { useScalePress } from '@/lib/use-scale-press';
import { useTheme } from '@/lib/use-theme';
import { opacity, radii, spacing } from '@/theme';

import { Tooltip } from './Tooltip';
import { Txt } from './Txt';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Block interaction and dim. Set `hint` to explain via tooltip on hover. */
  disabled?: boolean;
  hint?: string;
}

interface SegmentProps<T extends string> {
  opt: SegmentedOption<T>;
  selected: boolean;
  onSelect: (v: T) => void;
  groupDisabled?: boolean;
}

function Segment<T extends string>({ opt, selected, onSelect, groupDisabled }: SegmentProps<T>) {
  const { colors } = useTheme();
  const isDisabled = groupDisabled || !!opt.disabled;
  const [pressed, setPressed] = useState(false);
  const { hovered, hoverProps } = useHover();
  const { focused, focusProps } = useFocusRing();
  const { animStyle, onPressIn, onPressOut } = useScalePress({ scaleTo: 0.94 });

  const bg = selected
    ? colors.accent
    : pressed && !isDisabled
    ? colors.pressed
    : colors.hover;
  const fg = selected ? colors.onAccent : colors.ink;

  const el = (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={() => onSelect(opt.value)}
      {...hoverProps}
      {...focusProps}
      onPressIn={() => { setPressed(true); onPressIn(); }}
      onPressOut={() => { setPressed(false); onPressOut(); }}
      style={[
        styles.segment,
        { backgroundColor: bg, opacity: isDisabled && !selected ? opacity.disabled : 1 },
        focused && !selected && focusRingStyle(colors),
        animStyle,
      ]}
    >
      <Txt variant="footnote" weight={selected ? 'semibold' : 'regular'} color={fg} numberOfLines={1}>
        {opt.label}
      </Txt>
    </AnimatedPressable>
  );

  return opt.hint && opt.disabled ? <Tooltip label={opt.hint}>{el}</Tooltip> : el;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function Segmented<T extends string>({ options, value, onChange, disabled }: SegmentedProps<T>) {
  // iOS: the real UISegmentedControl. Android + web keep the brand pill below —
  // the native Android control paints the selected label with a Material default
  // that reads poorly on our accent fill, and the pill carries the accent/onAccent
  // brand look. (No call site uses per-option disabled/hint, which the native
  // control can't express.)
  if (Platform.OS === 'ios') {
    const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
    return (
      <NativeSegmentedControl
        values={options.map((o) => o.label)}
        selectedIndex={selectedIndex}
        enabled={!disabled}
        onSelect={(i) => {
          const opt = options[i];
          if (opt && !opt.disabled) onChange(opt.value);
        }}
      />
    );
  }

  return (
    <View style={styles.row}>
      {options.map((opt) => (
        <Segment
          key={opt.value}
          opt={opt}
          selected={opt.value === value}
          onSelect={onChange}
          groupDisabled={disabled}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  segment: { minHeight: spacing.controlMinHeight, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.md },
});
