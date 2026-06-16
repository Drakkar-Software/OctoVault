import type { TextProps } from 'react-native';
import { StyleSheet, Text } from 'react-native';

import { fonts, labelTracking, type as typeScale } from '@/theme';

/** Resolve the letter-spacing for a given variant. Variants that carry their
 *  own `letterSpacing` token (hero, mega) use it; `pageTitle`/`display` get a
 *  subtle tightening; uppercase labels use `labelTracking`; everything else = 0. */
function resolveTracking(variant: Variant, uppercase: boolean): number {
  if (uppercase) return labelTracking;
  const step = typeScale[variant] as { fontSize: number; lineHeight: number; letterSpacing?: number };
  if (step.letterSpacing !== undefined) return step.letterSpacing;
  if (variant === 'pageTitle' || variant === 'display') return -0.4;
  return 0;
}
import { useTheme, type Palette } from '@/lib/use-theme';

type Variant = keyof typeof typeScale;
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface TxtProps extends TextProps {
  variant?: Variant;
  weight?: Weight;
  /** Use JetBrains Mono (keys, fingerprints, timestamps, labels). */
  mono?: boolean;
  /** Explicit color (wins over `tone`). */
  color?: string;
  /** Palette token to color the text (e.g. "inkMuted", "accent"). */
  tone?: keyof Palette;
  uppercase?: boolean;
  center?: boolean;
}

function family(variant: Variant, weight: Weight, mono: boolean): string {
  if (mono) {
    if (weight === 'bold' || weight === 'semibold') return fonts.monoBold;
    if (weight === 'medium') return fonts.monoMedium;
    return fonts.mono;
  }
  if (variant === 'hero' || variant === 'mega' || variant === 'pageTitle' || variant === 'display') return fonts.display;
  if (variant === 'title' || variant === 'heading') return fonts.heading;
  switch (weight) {
    case 'bold':
      return fonts.bodyBold;
    case 'semibold':
      return fonts.bodySemibold;
    case 'medium':
      return fonts.bodyMedium;
    default:
      return fonts.body;
  }
}

/**
 * The app's single text primitive. Every label, title and paragraph renders
 * through here so type scale, font family and theme color stay consistent.
 */
export function Txt({
  variant = 'body',
  weight = 'regular',
  mono = false,
  color,
  tone,
  uppercase = false,
  center = false,
  style,
  ...rest
}: TxtProps) {
  const { colors } = useTheme();
  const { fontSize, lineHeight } = typeScale[variant];
  const resolved = color ?? (tone ? colors[tone] : colors.ink);
  return (
    <Text
      {...rest}
      style={[
        styles.base,
        {
          fontFamily: family(variant, weight, mono),
          fontSize,
          lineHeight,
          color: resolved,
          letterSpacing: resolveTracking(variant, uppercase),
          textTransform: uppercase ? 'uppercase' : 'none',
          textAlign: center ? 'center' : 'left',
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
