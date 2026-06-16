/**
 * OctoVault design tokens — the SINGLE source of truth for the whole app.
 *
 * Every color, font, size, radius, shadow and motion value lives here.
 * Components must NEVER hardcode a hex / size or compute `rgba()` inline —
 * import from this file (usually via `useTheme()` in `src/lib/use-theme.ts`)
 * so light/dark stay in sync and the "Ink & Pearl" identity holds.
 *
 * Identity — "Ink & Pearl": a light-first, editorial knowledge-app look. Warm
 * pearl paper, near-black ink, a single octopus-ink indigo accent (#5847c9), an
 * editorial serif display (Newsreader) over a quiet grotesk body (Spline Sans).
 * The document surface is FLAT (no card/subaqua depth — see `editorCanvas`); a
 * categorical 8-color `swatches` set drives tags / kanban / colored callouts.
 * Following the house style, alpha variants are pre-derived into named tokens
 * (accentBg, accentBorder, surface, rule…) rather than mixed at call sites.
 */

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  // ── Surfaces ────────────────────────────────────────────────────────────
  /** App backdrop, behind everything. */
  canvas: string;
  /** Subtle gradient stops giving the canvas a faint warm depth (kept gentle —
   *  Ink & Pearl reads as flat paper, not subaqua). */
  depthTop: string;
  depthBottom: string;
  /** Raised surfaces (cards, sheets, headers). */
  paper: string;
  /** Slightly recessed surface (inputs, inset wells). */
  paperAlt: string;
  /** Neutral solid fills (avatars, chips, skeletons). */
  fill: string;
  fillDeep: string;
  /** Translucent ink overlays for layering on top of varied surfaces. */
  surface: string;
  surfaceStrong: string;
  /** Recessed fill + hairline for inline/fenced code. */
  codeBg: string;
  codeBorder: string;
  /** Flat document-editor canvas — the page IS the surface (no card elevation). */
  editorCanvas: string;

  // ── Ink (text + icons), strongest → faintest ─────────────────────────────
  ink: string;
  inkSoft: string;
  inkMuted: string;
  inkFaint: string;

  // ── Lines & dividers ─────────────────────────────────────────────────────
  /** Solid hairlines on paper, strongest → faintest. */
  line: string;
  lineSoft: string;
  lineFaint: string;
  /** Translucent dividers for use over arbitrary backgrounds. */
  rule: string;
  ruleSoft: string;
  /** "Lit from above" top-edge highlight on raised surfaces (the inner light
   *  that gives cards/sheets depth — dark mode's stand-in for a drop shadow). */
  hairlineHi: string;

  // ── Interaction (web pointer states) ─────────────────────────────────────
  /** Translucent fill painted under a hovered control/row. */
  hover: string;
  /** Active/pressed fill — one step past `hover`; pairs with the scale dip so a
   *  press reads on flat (border-less) controls too. */
  pressed: string;
  /** Persistent fill under a selected/active nav or tree row (distinct from hover). */
  selected: string;
  /** Hover wash for already-selected (accentSoft) rows. */
  accentSoftHover: string;
  /** White brightening wash layered over a solid/gradient fill on hover. */
  brightWash: string;
  /** Keyboard focus ring (web `:focus-visible`) — applied via
   *  `focusRingStyle()` in `src/lib/focus.ts`, never as a static border. */
  focusRing: string;
  /** Wash over a valid drag-over target (block drop zone, kanban column). */
  dropTarget: string;

  // ── Indigo accent system ─────────────────────────────────────────────────
  accent: string;
  accentStrong: string;
  /** Gradient stops for primary fills (buttons, brand disc): top → bottom. */
  accentGradTop: string;
  accentGradBottom: string;
  /** Glow color — drives accent glows that read in both schemes. */
  glow: string;
  /** Solid soft accent (selected rows, highlight blocks). */
  accentSoft: string;
  /** Readable accent-tinted ink (text on accentSoft). */
  accentInk: string;
  /** Readable text/icon when sitting directly on `accent`. */
  onAccent: string;
  /** Translucent accent fills/borders. */
  accentBg: string;
  accentBgStrong: string;
  accentBorder: string;
  accentBorderStrong: string;

  // ── Status ───────────────────────────────────────────────────────────────
  unread: string;
  mention: string;
  /** Text/glyph on an `unread`/`mention` badge — stays light in both schemes. */
  onUnread: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  success: string;
  successBg: string;
  successBorder: string;
  warning: string;
  warningBg: string;
  warningBorder: string;

  // ── Sticky-note (sparingly, e.g. security callouts) ──────────────────────
  note: string;
  noteInk: string;

  // ── Overlays ─────────────────────────────────────────────────────────────
  /** Drop-shadow base color — drives `shadows.sm/md/lg` (cross-platform elevation).
   *  Light: warm near-black; dark: pure black (shadows read on elevated surfaces). */
  shadow: string;
  /** Full-bleed scrim behind modals / camera overlays. */
  scrim: string;
  overlay: string;
  /** Foreground (icons/text) drawn on top of `scrim` — light in both themes. */
  onScrim: string;
  /** Inverted tooltip chip — warm near-ink in BOTH schemes so the hint floats
   *  above any surface without competing with the document. */
  tooltipBg: string;
  /** Text/glyph on `tooltipBg`. */
  onTooltip: string;
}

const light: Palette = {
  canvas: '#f4f1ea',
  depthTop: '#f8f5ef',
  depthBottom: '#ece7db',
  paper: '#fffdf8',
  paperAlt: '#f6f2e9',
  fill: '#ece7db',
  fillDeep: '#ddd6c6',
  surface: 'rgba(27,26,23,0.04)',
  surfaceStrong: 'rgba(27,26,23,0.07)',
  codeBg: 'rgba(27,26,23,0.05)',
  codeBorder: 'rgba(27,26,23,0.12)',
  editorCanvas: '#fffdf8',

  ink: '#1b1a17',
  inkSoft: '#46443d',
  inkMuted: '#8a8578',
  inkFaint: '#b3ada1',

  line: '#4a4740',
  lineSoft: '#d9d3c6',
  lineFaint: '#e9e4d8',
  rule: 'rgba(27,26,23,0.10)',
  ruleSoft: 'rgba(27,26,23,0.06)',
  hairlineHi: 'rgba(255,255,255,0.9)',

  hover: 'rgba(27,26,23,0.045)',
  pressed: 'rgba(27,26,23,0.08)',
  selected: 'rgba(88,71,201,0.10)',
  accentSoftHover: 'rgba(88,71,201,0.18)',
  brightWash: 'rgba(255,255,255,0.14)',
  focusRing: 'rgba(88,71,201,0.55)',
  dropTarget: 'rgba(88,71,201,0.10)',

  accent: '#5847c9',
  accentStrong: '#473aa6',
  accentGradTop: '#6a59d8',
  accentGradBottom: '#473aa6',
  glow: '#5847c9',
  accentSoft: '#ddd8f5',
  accentInk: '#312269',
  onAccent: '#ffffff',
  accentBg: 'rgba(88,71,201,0.10)',
  accentBgStrong: 'rgba(88,71,201,0.16)',
  accentBorder: 'rgba(88,71,201,0.32)',
  accentBorderStrong: 'rgba(88,71,201,0.50)',

  unread: '#5847c9',
  mention: '#c2410c',
  onUnread: '#ffffff',
  danger: '#c0392b',
  dangerBg: 'rgba(192,57,43,0.10)',
  dangerBorder: 'rgba(192,57,43,0.32)',
  success: '#2f8f5b',
  successBg: 'rgba(47,143,91,0.12)',
  successBorder: 'rgba(47,143,91,0.35)',
  warning: '#b07a1e',
  warningBg: 'rgba(176,122,30,0.12)',
  warningBorder: 'rgba(176,122,30,0.32)',

  note: '#fff2b0',
  noteInk: '#4a3a10',

  shadow: '#241f14',
  scrim: 'rgba(27,26,23,0.50)',
  overlay: 'rgba(27,26,23,0.32)',
  onScrim: '#fffdf8',
  tooltipBg: '#2c2a24',
  onTooltip: '#f4f1ea',
};

const dark: Palette = {
  canvas: '#131210',
  depthTop: '#1a1814',
  depthBottom: '#0c0b09',
  paper: '#1d1b16',
  paperAlt: '#252219',
  fill: '#2a2720',
  fillDeep: '#363229',
  surface: 'rgba(244,241,234,0.05)',
  surfaceStrong: 'rgba(244,241,234,0.09)',
  codeBg: 'rgba(244,241,234,0.07)',
  codeBorder: 'rgba(244,241,234,0.14)',
  editorCanvas: '#1d1b16',

  ink: '#ece8df',
  inkSoft: '#b9b3a5',
  inkMuted: '#857f70',
  inkFaint: '#4e4a3f',

  line: '#5c5749',
  lineSoft: '#332f27',
  lineFaint: '#272420',
  rule: 'rgba(244,241,234,0.10)',
  ruleSoft: 'rgba(244,241,234,0.06)',
  hairlineHi: 'rgba(236,232,223,0.08)',

  hover: 'rgba(244,241,234,0.06)',
  pressed: 'rgba(244,241,234,0.10)',
  selected: 'rgba(139,124,240,0.16)',
  accentSoftHover: 'rgba(139,124,240,0.18)',
  brightWash: 'rgba(255,255,255,0.12)',
  focusRing: 'rgba(139,124,240,0.60)',
  dropTarget: 'rgba(139,124,240,0.14)',

  accent: '#8b7cf0',
  accentStrong: '#a499f5',
  accentGradTop: '#7e6fe0',
  accentGradBottom: '#5a4cc0',
  glow: '#7d6ee0',
  accentSoft: '#2c2748',
  accentInk: '#cabffb',
  onAccent: '#0e0b1f',
  accentBg: 'rgba(139,124,240,0.14)',
  accentBgStrong: 'rgba(139,124,240,0.22)',
  accentBorder: 'rgba(139,124,240,0.34)',
  accentBorderStrong: 'rgba(139,124,240,0.55)',

  unread: '#8b7cf0',
  mention: '#e08a5a',
  onUnread: '#ffffff',
  danger: '#e07a6a',
  dangerBg: 'rgba(224,122,106,0.14)',
  dangerBorder: 'rgba(224,122,106,0.38)',
  success: '#5fc88a',
  successBg: 'rgba(95,200,138,0.14)',
  successBorder: 'rgba(95,200,138,0.36)',
  warning: '#d6a23f',
  warningBg: 'rgba(214,162,63,0.14)',
  warningBorder: 'rgba(214,162,63,0.34)',

  note: '#3a3416',
  noteInk: '#e9d98a',

  shadow: '#000000',
  scrim: 'rgba(8,7,5,0.66)',
  overlay: 'rgba(8,7,5,0.45)',
  onScrim: '#fffdf8',
  tooltipBg: '#3c382f',
  onTooltip: '#ece8df',
};

export const colors: Record<ColorScheme, Palette> = { light, dark };

// ── Categorical swatch system ───────────────────────────────────────────────
// The knowledge-app color family: 8 named swatches (gray → pink) each with a
// soft `bg`, readable `text`, a `border`, and a `solid` chip color. Drives tag
// chips, kanban column/card accents, page accents and colored callouts — the
// thing that makes a Notion/Anytype-style app, not a single-accent chat app.

export type SwatchName = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';

export interface Swatch {
  /** Soft tinted fill (chip / callout background). */
  bg: string;
  /** Readable text/icon on `bg` (and as a standalone label color). */
  text: string;
  /** Hairline border around a `bg` chip. */
  border: string;
  /** Saturated solid (dot, column rail, progress). */
  solid: string;
}

export const SWATCH_NAMES: readonly SwatchName[] = ['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

export const swatches: Record<ColorScheme, Record<SwatchName, Swatch>> = {
  light: {
    gray: { bg: '#ece9e1', text: '#5c584e', border: 'rgba(27,26,23,0.14)', solid: '#8a8578' },
    red: { bg: '#f7e0db', text: '#a8392b', border: 'rgba(192,57,43,0.30)', solid: '#c0392b' },
    orange: { bg: '#f9e6d2', text: '#9a5712', border: 'rgba(194,113,28,0.30)', solid: '#c2711c' },
    yellow: { bg: '#f7eecb', text: '#7a5d12', border: 'rgba(176,122,30,0.32)', solid: '#d4a72c' },
    green: { bg: '#dcefe1', text: '#246b44', border: 'rgba(47,143,91,0.30)', solid: '#2f8f5b' },
    blue: { bg: '#d9e6f7', text: '#1f5a99', border: 'rgba(47,111,176,0.30)', solid: '#2f6fb0' },
    purple: { bg: '#e6e1f7', text: '#4a3aa0', border: 'rgba(88,71,201,0.30)', solid: '#5847c9' },
    pink: { bg: '#f7deec', text: '#a3357a', border: 'rgba(200,77,150,0.30)', solid: '#c84d96' },
  },
  dark: {
    gray: { bg: '#2d2a22', text: '#b9b3a5', border: 'rgba(244,241,234,0.14)', solid: '#857f70' },
    red: { bg: '#3a2420', text: '#e8a298', border: 'rgba(224,122,106,0.34)', solid: '#e07a6a' },
    orange: { bg: '#3a2c1c', text: '#e6b483', border: 'rgba(214,138,79,0.34)', solid: '#d68a4f' },
    yellow: { bg: '#34301a', text: '#e0c97a', border: 'rgba(214,162,63,0.34)', solid: '#d6a23f' },
    green: { bg: '#1f3328', text: '#94d6ad', border: 'rgba(95,200,138,0.34)', solid: '#5fc88a' },
    blue: { bg: '#1f2d3d', text: '#8fb8e6', border: 'rgba(90,144,208,0.34)', solid: '#5a90d0' },
    purple: { bg: '#2a2548', text: '#c3b8f7', border: 'rgba(139,124,240,0.34)', solid: '#8b7cf0' },
    pink: { bg: '#3a2030', text: '#e6a3c8', border: 'rgba(214,118,168,0.34)', solid: '#d676a8' },
  },
};

/** Resolve a categorical swatch for the active scheme. */
export function swatch(scheme: ColorScheme, name: SwatchName): Swatch {
  return swatches[scheme][name];
}

/**
 * Font family keys — MUST match the keys registered in
 * `src/lib/use-app-fonts.ts`. Named by role, not weight, so call sites read
 * clearly. (RN custom fonts ship one family per weight, hence explicit names.)
 */
export const fonts = {
  /** Newsreader — editorial serif for the wordmark, page & section titles. */
  display: 'Newsreader_700Bold',
  heading: 'Newsreader_600SemiBold',
  /** Spline Sans — quiet, readable grotesk for UI body text. */
  body: 'SplineSans_400Regular',
  bodyMedium: 'SplineSans_500Medium',
  bodySemibold: 'SplineSans_600SemiBold',
  bodyBold: 'SplineSans_700Bold',
  /** JetBrains Mono — keys, fingerprints, seed words, timestamps, labels. */
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

/** Type scale: [fontSize, lineHeight]. */
export const type = {
  /** Big editorial page/object title (Notion-style hero H1). */
  pageTitle: { fontSize: 38, lineHeight: 44 },
  display: { fontSize: 30, lineHeight: 36 },
  title: { fontSize: 22, lineHeight: 28 },
  heading: { fontSize: 17, lineHeight: 23 },
  subhead: { fontSize: 15, lineHeight: 21 },
  body: { fontSize: 14, lineHeight: 20 },
  callout: { fontSize: 13, lineHeight: 18 },
  footnote: { fontSize: 12, lineHeight: 16 },
  caption: { fontSize: 11, lineHeight: 14 },
  micro: { fontSize: 10, lineHeight: 13 },
} as const;

/** Uppercase mono labels share this tracking ("ENTER PIN", "SECURITY"…). */
export const labelTracking = 0.8;

/** 4px spacing scale + semantic aliases. */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  /** Default horizontal screen padding. */
  screenX: 18,
  /** Standard gap between stacked controls/cards. */
  gutter: 12,
  /** Minimum tappable control height. */
  controlMinHeight: 48,
} as const;

export const radii = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  card: 14,
  sheet: 22,
  pill: 999,
} as const;

/**
 * Cross-platform elevation presets (react-native-web maps these to boxShadow).
 *
 * These are LIGHT-SCHEME static constants — safe for use in `StyleSheet.create()`
 * which requires compile-time values. For scheme-aware inline styles, use
 * `dropShadow(colors.shadow, …)` instead. The `resolveOctoSpacesTheme` adapter
 * overrides `shadowColor` per-scheme so shared UI components always pick up the
 * correct tint.
 */
export const shadows = {
  none: {},
  sm: {
    shadowColor: '#241f14',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: '#241f14',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  lg: {
    shadowColor: '#241f14',
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  /** Accent glow for hero/primary moments — kept restrained (editorial, not neon). */
  accentGlow: {
    shadowColor: '#5847c9',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

/**
 * Scheme-aware drop shadow — use in dynamic (inline) styles where you have access
 * to the active palette. Pass `colors.shadow` from `useTheme()`.
 */
export function dropShadow(
  color: string,
  opacity: number,
  radius: number,
  yOffset: number,
  elevation: number,
) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: yOffset },
    elevation,
  } as const;
}

/**
 * Accent-tinted glow keyed to the active scheme's `glow` color. Dark surfaces
 * swallow near-black drop shadows, so primary moments (buttons, the brand disc,
 * focused inputs) lean on a colored bloom instead. Pass `colors.glow`.
 */
export function glowShadow(color: string, opacity = 0.28, radius = 14) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  } as const;
}

/**
 * The "lit-from-above paper edge" — a `paper` surface ringed by a hairline whose
 * top edge catches light (`hairlineHi`). Returns the three theme-dependent color
 * props meant for an inline style; pair with a `borderWidth`/`borderRadius` from a
 * StyleSheet. Pass a `border` override for emphasised edges (e.g. `accentBorder`).
 */
export function paperBorder(p: Palette, border: string = p.lineSoft) {
  return {
    backgroundColor: p.paper,
    borderColor: border,
    borderTopColor: p.hairlineHi,
  } as const;
}

/**
 * z-index scale for everything that floats. Overlay primitives (Popover, Sheet,
 * Tooltip, Toast) and shell chrome consume these instead of ad-hoc zIndex /
 * Modal mount-order, so stacking stays predictable as surfaces compose
 * (e.g. a tooltip inside a popover, a toast over a panel).
 */
export const layers = {
  header: 10,
  sidebar: 20,
  panel: 50,
  popover: 100,
  tooltip: 150,
  toast: 200,
  modal: 300,
} as const;

/**
 * Shared easing curves as web CSS timing functions — for `FadeView` and other
 * CSS-transition-driven web motion. (Native/reanimated interactions use
 * `motion.spring`; these keep web enter/exit curves consistent instead of the
 * browser default `ease`.) `out` decelerates entrances, `in` accelerates
 * exits, `inOut` moves things already on screen.
 */
export const easing = {
  out: 'cubic-bezier(0.2,0,0,1)',
  in: 'cubic-bezier(0.4,0,1,1)',
  inOut: 'cubic-bezier(0.4,0,0.2,1)',
} as const;

export const motion = {
  fast: 140,
  base: 220,
  slow: 360,
  /** Keypad fade-out / tip fade-in while a slow unlock (Argon2id) stretches the PIN. */
  unlockFade: 2000,
  /** Slow ambient loop — breathing glow on hero moments. */
  pulse: 2800,
  /** Skeleton shimmer loop. */
  shimmer: 1100,
  /** Idle delay before an inline edit autosaves into a merge-doc (cheap in-place
   *  overwrite — short, near-keystroke). */
  autosaveDoc: 600,
  /** Idle delay before an inline edit autosaves into an append-log (each commit is
   *  a permanent entry — longer so transient keystrokes don't bloat the log; blur/
   *  unmount is the primary trigger). */
  autosaveLog: 1500,
  /** Hover dwell before a Tooltip chip appears — long enough not to chase the pointer. */
  tooltipDelay: 450,
  /** Default time a toast stays up — long enough to read and reach "Undo". */
  toastDuration: 4000,
  /** Spring config for press / drag interactions (Reanimated). */
  spring: { damping: 18, stiffness: 220, mass: 0.8 },
} as const;

export const opacity = {
  /** Dimmed pressable/control while disabled or blocked by an async action. */
  disabled: 0.45,
  /** De-emphasized content that is still present (e.g. a completed/struck task). */
  muted: 0.6,
} as const;

export const layout = {
  /** Cap reading width on large/web screens. */
  maxContentWidth: 720,
  /** Document editor reading column — a touch wider than chrome content. */
  editorMaxWidth: 760,
  tabBarHeight: 64,
  headerMinHeight: 52,
  /** At/above this viewport width (web) the app switches to the desktop shell. */
  breakpointDesktop: 900,
  /** Vertical spaces rail at the left edge of the desktop shell. */
  railWidth: 64,
  /** Square space tile on the rail. */
  railTileSize: 40,
  /** Workspace sidebar between the rail and the main pane. */
  sidebarWidth: 248,
  /** Sidebar width when collapsed (mod+\\) — fully tucked away; a floating
   *  control in the main pane reopens it. */
  sidebarCollapsedWidth: 0,
  /** Fixed width of a kanban column. */
  boardColumnWidth: 236,
  /** Width of the task detail pane shown beside the board on wide screens. */
  boardDetailPaneWidth: 360,
  /** Object tree (sidebar + Work): per-depth indent step and disclosure row height. */
  objectTreeIndent: 16,
  objectTreeRowHeight: 34,
  /** Hover-revealed add/handle button size on a tree/block row. */
  rowAddButton: 20,
  /** Emoji glyph size in a Work doc/board hero header (larger than the title text). */
  objectHeroEmoji: 38,
  /** Notion/Anytype-style large object icon, shown ABOVE the title in a doc/board hero. */
  objectIconLg: 60,
  /** Rounded tile holding the large hero icon (icon sits centered inside). */
  objectIconTile: 78,
  /** Optional cover band height above a doc/board hero (Notion-style). */
  coverHeight: 184,
  /** Editorial reading column for a workspace list landing (Vault home, search). */
  listMaxWidth: 760,
  /** Shared column for onboarding/auth screens (welcome, seed, lock, pair…). */
  authColumnWidth: 460,
  /** Reading column for settings surfaces (/you, /space/[id]). */
  settingsColumnWidth: 640,
  /** Side panel for an opened board task on wide screens (replaces the bottom sheet). */
  taskPanelWidth: 380,
  /** Right-docked side-peek pane (board task detail on wide screens). */
  peekPaneWidth: 380,
  /** Block editor: left gutter that holds the hover "+" / drag handle. */
  blockGutterWidth: 26,
  /** Block editor: drag/add handle glyph size. */
  blockHandleSize: 18,
  /** Square todo-block / card done checkbox. */
  checkboxSize: 16,
  /** Block editor: vertical gap between block rows. */
  blockRowGap: 2,
  /** Block editor: per-nesting-level indent (reserved for nested blocks). */
  blockIndentStep: 24,
  /** Left accent bar on a quote block. */
  quoteBarWidth: 3,
  /** Anchored block-type / slash menu width. */
  blockMenuWidth: 232,
  /** Min height of the seamless doc editor surface (one borderless textarea over the
   *  whole doc) — generous so an empty/short doc still fills the page as a tap target,
   *  the way a Notion page does; the field auto-grows past this with content. */
  docEditorMinHeight: 320,
  /** Min height of the multiline content field in the task detail sheet/pane. */
  taskContentMinHeight: 120,
  /** Top toolbar above the main pane on desktop. */
  desktopTopbarHeight: 52,
  /** Max width of a breadcrumb crumb label before it truncates. */
  breadcrumbCrumbMaxWidth: 200,
  /** Avatar edit badge (camera) diameter on the account/space identity blocks. */
  avatarBadgeSize: 24,
  /** Author avatar in a block comment row. */
  commentAvatarSize: 26,
  /** "New comments" unread dot on a block's comment affordance. */
  commentUnreadDot: 7,
  /** Anchored popover (account/space context menu) width. */
  popoverWidth: 264,
  /** Minimum width of an anchored Menu so short option lists don't shrink-wrap. */
  menuMinWidth: 220,
  /** Quick-find / command palette card (mod+K). */
  quickFindWidth: 560,
  /** Centered Sheet dialog width cap (confirm dialogs, pickers on wide screens). */
  dialogMaxWidth: 480,
  /** Viewport-top offset of an `align="top"` Sheet dialog (the command palette
   *  sits high, Notion-style, so results grow downward instead of jumping). */
  dialogTopOffset: 120,
  /** Toast chip width in the desktop shell stack. */
  toastWidth: 360,
  /**
   * Draggable title strip reserved at the top of the macOS desktop shell so the
   * window's traffic-light buttons (hiddenInset titleBarStyle) don't overlap the
   * app's own chrome. macOS-only; Windows/Linux use a native title bar.
   */
  desktopTitlebarInset: 28,
  /** Max height of an inline image block preview (AttachmentBlock). Keeps tall
   *  portrait shots from dominating the reading column. */
  inlineImageMaxHeight: 320,
  /** Placeholder height before the intrinsic aspect ratio is measured, so the
   *  block never collapses to 0 height while the image is loading. */
  inlineImageMinHeight: 200,
  /** Touch target size for a vote/reaction button (square). */
  voteControlSize: 36,
  /** Minimum height for an "empty" section placeholder within a form/list editor. */
  emptySectionMinHeight: 180,
} as const;

// ── Semantic helpers ───────────────────────────────────────────────────────
// Map domain state → token, so screens stay declarative. Each takes the active
// Palette (from useTheme) since OctoVault is light/dark aware.

// PresenceStatus and VerificationLevel are owned by the SDK (domain types);
// imported here for use in function signatures, re-exported so existing app
// imports (`from '@/theme'`) continue to work.
import type { PresenceStatus, VerificationLevel } from '@drakkar.software/octovault-sdk';
export type { PresenceStatus, VerificationLevel };

export function presenceColor(p: Palette, status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return p.success;
    case 'away':
      return p.warning;
    case 'dnd':
      return p.danger;
    case 'offline':
      return p.inkFaint;
  }
}

export function verificationColor(p: Palette, level: VerificationLevel): string {
  switch (level) {
    case 'verified':
      return p.success;
    case 'pending':
      return p.warning;
    case 'unverified':
      return p.danger;
    case 'none':
    default:
      return p.inkFaint;
  }
}

/** Kanban task lifecycle → color. `doing` is the (previously unreachable) middle state. */
export type TaskStatus = 'todo' | 'doing' | 'done';

export function statusColor(p: Palette, status: TaskStatus): string {
  switch (status) {
    case 'todo':
      return p.inkFaint;
    case 'doing':
      return p.warning;
    case 'done':
      return p.success;
  }
}

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
};

// ── octospaces-ui theme adapter ────────────────────────────────────────────
// Maps OctoVault's Palette tokens to the octospaces-ui Theme contract so the
// shared UI primitives (presenceColor, verificationColor, focusRingStyle…) work
// without any per-component migration yet. Keep vault's palette as the single
// source of truth; update only this function when the octospaces-ui contract changes.

import type { Theme as OctoSpacesTheme } from '@drakkar.software/octospaces-ui';

export function resolveOctoSpacesTheme(scheme: ColorScheme): OctoSpacesTheme {
  const p = colors[scheme];
  const sw = swatches[scheme];

  return {
    scheme,

    colors: {
      background: p.canvas,
      surface: p.paper,
      surfaceElevated: p.fill,
      surfaceModal: p.paper,
      surfaceInput: p.paperAlt,
      sidebar: p.canvas,
      sidebarPanel: p.paperAlt,
      sidebarActive: p.selected,

      border: p.lineSoft,
      borderSubtle: p.lineFaint,
      borderStrong: p.line,

      text: p.ink,
      textSecondary: p.inkSoft,
      textTertiary: p.inkMuted,
      textDisabled: p.inkFaint,
      textInverse: p.onScrim,
      textOnPrimary: p.onAccent,

      primary: p.accent,
      primaryHover: p.accentBgStrong,
      primaryMuted: p.accentSoft,
      primarySubtle: p.accentBg,

      success: p.success,
      successMuted: p.successBg,
      warning: p.warning,
      warningMuted: p.warningBg,
      danger: p.danger,
      dangerMuted: p.dangerBg,
      info: p.accent,
      infoMuted: p.accentBg,

      // presence: dnd → busy
      presenceOnline: p.success,
      presenceAway: p.warning,
      presenceBusy: p.danger,
      presenceOffline: p.inkFaint,

      // verification: pending → partial, unverified/none → none
      verificationVerified: p.success,
      verificationPartial: p.warning,
      verificationNone: p.inkFaint,

      overlay: p.overlay,
      shadow: p.scrim,
      focus: p.focusRing,
      skeleton: p.fill,
      skeletonShimmer: p.fillDeep,

      editorCanvas: p.editorCanvas,
      tooltipBg: p.tooltipBg,
      onTooltip: p.onTooltip,
    },

    spacing: {
      none: spacing.none,
      xs: spacing.xs,
      sm: spacing.sm,
      md: spacing.md,
      lg: spacing.lg,
      xl: spacing.xl,
      xxl: spacing.xxl,
      xxxl: spacing.xxxl,
      screenX: spacing.screenX,
      gutter: spacing.gutter,
      controlMinHeight: spacing.controlMinHeight,
    },

    radii: {
      xs: radii.xs,
      sm: radii.sm,
      md: radii.md,
      lg: radii.lg,
      xl: radii.xl,
      card: radii.card,
      sheet: radii.sheet,
      pill: radii.pill,
    },

    type: {
      pageTitle: { size: type.pageTitle.fontSize, lineHeight: type.pageTitle.lineHeight },
      display: { size: type.display.fontSize, lineHeight: type.display.lineHeight },
      title: { size: type.title.fontSize, lineHeight: type.title.lineHeight },
      heading: { size: type.heading.fontSize, lineHeight: type.heading.lineHeight },
      subhead: { size: type.subhead.fontSize, lineHeight: type.subhead.lineHeight },
      body: { size: type.body.fontSize, lineHeight: type.body.lineHeight },
      callout: { size: type.callout.fontSize, lineHeight: type.callout.lineHeight },
      footnote: { size: type.footnote.fontSize, lineHeight: type.footnote.lineHeight },
      caption: { size: type.caption.fontSize, lineHeight: type.caption.lineHeight },
      micro: { size: type.micro.fontSize, lineHeight: type.micro.lineHeight },
    },

    fonts: {
      display: fonts.display,
      heading: fonts.heading,
      body: fonts.body,
      bodyMedium: fonts.bodyMedium,
      bodySemibold: fonts.bodySemibold,
      bodyBold: fonts.bodyBold,
      mono: fonts.mono,
      monoMedium: fonts.monoMedium,
      monoBold: fonts.monoBold,
    },

    // vault's motion durations → MotionToken { duration }; `spring` is native-only, skip
    motion: {
      fast: { duration: motion.fast },
      base: { duration: motion.base },
      slow: { duration: motion.slow },
      unlockFade: { duration: motion.unlockFade },
      pulse: { duration: motion.pulse },
      shimmer: { duration: motion.shimmer },
      autosaveDoc: { duration: motion.autosaveDoc },
      autosaveLog: { duration: motion.autosaveLog },
      tooltipDelay: { duration: motion.tooltipDelay },
      toastDuration: { duration: motion.toastDuration },
    },

    shadows: {
      none: shadows.none,
      // Override shadowColor per-scheme so octospaces-ui components pick up the
      // right tint (light: warm near-black; dark: pure black).
      sm: { ...shadows.sm, shadowColor: p.shadow },
      md: { ...shadows.md, shadowColor: p.shadow },
      lg: { ...shadows.lg, shadowColor: p.shadow },
      // accentGlow must use the scheme's glow rather than the hardcoded light-accent.
      accentGlow: glowShadow(p.glow, 0.22, 16),
    },

    layout: { ...layout },

    opacity: {
      disabled: opacity.disabled,
      muted: opacity.muted,
    },

    // flat swatches: each name → the saturated solid color
    swatches: {
      gray: sw.gray.solid,
      red: sw.red.solid,
      orange: sw.orange.solid,
      yellow: sw.yellow.solid,
      green: sw.green.solid,
      blue: sw.blue.solid,
      purple: sw.purple.solid,
      pink: sw.pink.solid,
    },

    layers: { ...layers },

    // CSS bezier strings → number[] control-point arrays
    easing: {
      out: [0.2, 0, 0, 1],
      in: [0.4, 0, 1, 1],
      inOut: [0.4, 0, 0.2, 1],
    },

    labelTracking: { mono: labelTracking },
  };
}
