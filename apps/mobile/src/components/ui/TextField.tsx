import { useState } from 'react';
import type { NativeSyntheticEvent, StyleProp, TextInputContentSizeChangeEventData, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { fonts, glowShadow, radii, spacing, type as typeScale } from '@/theme';
import { useTheme } from '@/lib/use-theme';

import { Icon, type IconName } from './Icon';

// On web, drop the browser's default focus outline — the field container shows
// a themed accent ring + glow on focus, which is the (more on-brand) indicator.
// `outlineStyle` is a web-only style prop not present in RN's types.
const WEB_OUTLINE_RESET = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as unknown as StyleProp<TextStyle>;

type TypeVariant = keyof typeof typeScale;

/** Map a type-scale step to its font family (serif display/heading, else grotesk body). */
function familyForVariant(variant: TypeVariant): string {
  if (variant === 'pageTitle' || variant === 'display') return fonts.display;
  if (variant === 'title' || variant === 'heading') return fonts.heading;
  return fonts.body;
}

interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  /** Optional leading icon (tints to accent on focus). */
  leadingIcon?: IconName;
  /** Render the value in JetBrains Mono (caps, codes, fingerprints). */
  mono?: boolean;
  /** Render the input text at a larger type-scale step (e.g. "display"/"pageTitle"
   *  for an inline title editor) instead of the default body size. With `mono`,
   *  the variant's size/line-height still apply (the family stays mono) so an
   *  inline code editor's metrics match the rendered `Txt` it replaces. */
  textVariant?: TypeVariant;
  /** Height for multiline textareas. */
  minHeight?: number;
  /** Borderless, transparent, chrome-free field that reads as plain body text — no
   *  border, focus ring or recessed fill. For a seamless document surface (the doc
   *  editor) where the input must be visually indistinguishable from the rendered text. */
  plain?: boolean;
  /** Multiline only: grow the field to fit its content instead of scrolling inside a
   *  fixed box (the page scrolls). Pairs with `plain` for a Notion-style page editor. */
  autoGrow?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * The app's single text input. A theme-aware field that lifts to an accent
 * border + soft glow on focus, with optional leading icon and a multiline /
 * mono mode. Every form input renders through here so focus states and metrics
 * stay consistent (see the Composer for the chat-bar variant).
 */
export function TextField({
  leadingIcon,
  mono = false,
  textVariant,
  minHeight,
  multiline = false,
  plain = false,
  autoGrow = false,
  containerStyle,
  onFocus,
  onBlur,
  onContentSizeChange,
  ...rest
}: TextFieldProps) {
  const { colors, scheme } = useTheme();
  const [focused, setFocused] = useState(false);
  // Auto-grow tracks the rendered content height so the field expands with the text
  // (no inner scroll) — the doc page scrolls as one surface instead.
  const [contentHeight, setContentHeight] = useState(0);
  const grownHeight = autoGrow ? Math.max(minHeight ?? 0, contentHeight) : undefined;
  const onSize = (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    if (autoGrow) setContentHeight(e.nativeEvent.contentSize.height);
    onContentSizeChange?.(e);
  };

  // The focus glow lives on an absolutely-positioned sibling, not on the
  // TextInput's parent View. On Android, adding `elevation` to a TextInput's
  // ancestor during the focus commit creates a new native render layer in the
  // same frame as focus and eats the focus event — keyboard flashes open then
  // dismisses immediately. Keeping the parent's layout stable (only swapping
  // borderColor, which is paint-only) avoids that.
  // For multiline, grow the FIELD (not just the outer wrapper) so the bordered
  // box covers the full glow area — otherwise the wrapper's paperAlt glow
  // leaks below the bordered field as a darker strip.
  // Plain fields (doc-editor blocks) are content-sized — no floor; the 72px
  // default only applies to bordered form textareas.
  const multilineMin = multiline && !plain ? { minHeight: minHeight ?? 72 } : null;
  // Larger inline-title metrics: override family + size + line-height so the editor
  // reads exactly like the rendered title (placed last so it wins over `multiline`).
  // A mono field keeps the mono family but adopts the variant's metrics — the doc
  // editor's code blocks render at `callout` size in read AND edit mode, so the
  // Txt ⇄ TextInput swap doesn't reflow.
  // On iOS, omit lineHeight from the TextInput style: when lineHeight is present iOS
  // builds a paragraph-style attributed string and drops the foreground color from the
  // live typingAttributes, making newly-typed glyphs invisible until blur rebuilds the
  // text. On web/Android lineHeight is needed (web: prevents textarea line-collapse;
  // Android: metric parity). Rendered (non-editing) text is unaffected.
  const variantStyle = textVariant
    ? {
        ...(mono ? null : { fontFamily: familyForVariant(textVariant) }),
        fontSize: typeScale[textVariant].fontSize,
        ...(Platform.OS !== 'ios' ? { lineHeight: typeScale[textVariant].lineHeight } : null),
      }
    : null;
  return (
    <View style={[plain ? styles.wrapperPlain : styles.wrapper, containerStyle]}>
      {/* The recessed fill + focus glow IS the box — a plain field has neither. */}
      {plain ? null : (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.glowLayer,
            { backgroundColor: colors.paperAlt },
            focused ? glowShadow(colors.glow, 0.2, 12) : null,
          ]}
        />
      )}
      <View
        style={[
          plain ? styles.fieldPlain : styles.field,
          multilineMin,
          multiline ? { alignItems: 'flex-start' } : null,
          plain ? null : { borderColor: focused ? colors.accentBorder : colors.lineSoft },
        ]}
      >
        {leadingIcon ? (
          <Icon name={leadingIcon} size={16} color={focused ? colors.accent : colors.inkMuted} />
        ) : null}
        <TextInput
          {...rest}
          multiline={multiline}
          {...(autoGrow ? { scrollEnabled: false } : {})}
          onContentSizeChange={onSize}
          placeholderTextColor={colors.inkMuted}
          // Android's TextInput otherwise inherits the OS `textColorPrimary`
          // for the cursor/selection — invisible against the dark paperAlt in
          // dark mode and off-brand in light mode.
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
          underlineColorAndroid="transparent"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            mono ? styles.mono : styles.sans,
            multiline && styles.multiline,
            // lineHeight omitted on iOS: see variantStyle comment above.
            multiline && Platform.OS !== 'ios' && styles.multilineLineHeight,
            variantStyle,
            plain && styles.inputPlain,
            grownHeight !== undefined ? { height: grownHeight } : null,
            WEB_OUTLINE_RESET,
            { color: colors.ink },
            // iOS UIKit defaults to a white background on TextInput when editing;
            // in plain mode (doc surface / title editor) that white fill renders
            // over the dark canvas in dark mode, making light ink invisible.
            plain ? { backgroundColor: 'transparent' } : null,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    minHeight: spacing.controlMinHeight,
  },
  // No control-height floor: a plain field is sized purely by its text/minHeight.
  wrapperPlain: {},
  glowLayer: {
    borderRadius: radii.md,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: spacing.controlMinHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: 'transparent',
    // On Android, elevation — not document order — decides which sibling draws
    // on top. When focused, `glowLayer` gains elevation 8 (its glow shadow) and
    // would otherwise paint its opaque paperAlt fill OVER this field, hiding the
    // typed text (iOS ignores elevation, so it was fine there). A STATIC
    // elevation above the glow's keeps the input on top; static (never toggled
    // on focus) so it doesn't eat the focus event. No own shadow: bg is transparent.
    // `shadowColor: transparent` suppresses the grey elevation drop-shadow Android
    // casts from any elevated view (API 28+ tints elevation shadows) — otherwise it
    // shows as a dark box behind the field in light mode (invisible in dark mode).
    elevation: 9,
    shadowColor: 'transparent',
  },
  // Borderless, transparent, flush-left — the text reads exactly like the rendered
  // document body, with no box around it.
  fieldPlain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    includeFontPadding: false,
  },
  // Match the body type scale's line height: a multiline TextInput renders as a web
  // <textarea> whose line box collapses without an explicit lineHeight, stacking lines
  // on top of each other. Also keeps the editor's metrics identical to the Markdown
  // reader so entering edit doesn't reflow the text.
  // lineHeight is split into a separate style applied only on non-iOS (see above).
  sans: { fontFamily: fonts.body, fontSize: typeScale.body.fontSize },
  mono: { fontFamily: fonts.mono, fontSize: typeScale.caption.fontSize },
  multiline: { textAlignVertical: 'top', paddingTop: spacing.sm },
  multilineLineHeight: { lineHeight: typeScale.body.lineHeight },
  // Drop the input's own vertical padding so the first line sits where the reader's
  // first paragraph does (the surrounding view supplies any padding). The explicit
  // `paddingTop: 0` is load-bearing: RN resolves `paddingTop` (set by `multiline`
  // above) over `paddingVertical` regardless of array order, and that stray 8px was
  // the visible text jump when a doc block entered edit mode.
  inputPlain: { paddingVertical: 0, paddingTop: 0 },
});
