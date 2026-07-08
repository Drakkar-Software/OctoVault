@AGENTS.md

# OctoVault (mobile) — universal Expo app

End-to-end-encrypted, **Notion/Anytype-style** knowledge app: pages of nested
typed blocks + kanban boards, organized in a folder/page tree per space. Editorial
**"Ink & Pearl"** look (warm pearl paper, octopus-ink indigo accent) with an
octopus-vault mark. One codebase runs on iOS, Android and web. **Wired to a live
backend**: it syncs against a **Starfish** server (default `http://localhost:8787`,
override with `EXPO_PUBLIC_STARFISH_URL`) over REST + SSE, with real end-to-end
encryption — onboarding derives a BIP-39 seed into Ed25519/Kyber keys (persisted via
`expo-secure-store`) and page/board content is sealed per-space with space keyrings.
All sync/crypto logic lives in the **`@drakkar.software/octovault-sdk`** package
(`packages/sdk`); consume it through the `use-*` hooks and context providers in
`src/lib/`.

## Design rules — ALWAYS respect

Non-negotiable. Follow these for every change:

1. **Reuse components.** Build UI from the generic, reusable components in
   `src/components/**/*.tsx` (`ui/`, `brand/`, `work/`, `objects/`, `onboarding/`).
   Before writing markup, look for an existing component. If you repeat a pattern,
   extract a new reusable component — never copy-paste UI.
2. **One theme source.** EVERY design constant — colors (light & dark), the 8-color
   categorical `swatches`, fonts, type scale, spacing, radii, shadows, motion —
   lives in `src/theme.ts`. ALWAYS reuse these tokens. Never hardcode a hex, font
   name or magic size in a component, and never compute `rgba()` inline — add a
   token instead. Read the active palette via `useTheme()` (`src/lib/use-theme.ts`).
3. **Logic lives in `src/lib/*.ts`.** ALWAYS extract logic — data access, hooks,
   helpers, platform branches — into `src/lib`. Components and screens consume it;
   they never implement it.
4. **Thin route pages.** Files in `src/app/**` (Expo Router) stay small: read route
   params, pull data from `src/lib` selectors, wire navigation, and compose generic
   components. No business logic and no large inline UI in a page.

## Structure

- `src/app/` — Expo Router file-based routes. `(onboarding)/` stack (welcome, seed,
  lock, recover, unlock), `(tabs)/` (Vault + Search), `work/page/[id]` +
  `work/board/[id]` (the editors), `space/[id]` (space details), `account/*`,
  `join`, `pair`, `you`, `+not-found`. Keep thin.
- `src/components/` — `ui/` primitives (`Txt`, `Button`, `IconButton`, `Card`,
  `Pill`, `Badge`, `Avatar`, `Icon`, `Divider`, `Row`, `Callout`, `AppBar`,
  `Screen`, `StackScreen`, `EmptyState`, `TextField`, `AutosaveField`), `brand/`
  (`Wordmark`, `HeroMark`), `work/` (the editors: `PageView`,
  `BoardView`, `BlockTypeMenu`, `ObjectHero`, `WorkObjects`, `WorkspaceNav`,
  `TaskDetailSheet`), `objects/` (`ObjectTree`, `Breadcrumbs`, `ObjectActions`),
  `onboarding/`, `account/`, `settings/`.
- `src/lib/` — hooks, helpers and platform branches. Object tree + content:
  `use-objects` + `space-objects-context` (ONE shared index store per active space),
  `use-object-content` (WAL/plaintext routing), `use-page`/`use-board`/`use-wal-doc`
  (WAL content hooks), `object-types`. Spaces: `spaces-context`/`use-spaces`,
  `use-space-details`/`use-space-members`/`use-space-invite`. Session/state:
  `session-context`, `room-events-bus`. UI helpers: `use-theme`, `use-responsive`,
  `use-hover`, `use-app-fonts`, `haptics`, `types`.
  Note: content models (`page-content`, `board-content`, etc.) and all WAL/crypto
  wiring live in **`packages/sdk`** (`@drakkar.software/octovault-sdk`), not in
  `src/lib/`.
- `src/theme.ts` — design tokens (the single source of truth).

## The WAL/CRDT data layer

All WAL wiring and content models live in **`packages/sdk`** (`@drakkar.software/octovault-sdk`);
the app consumes them through hooks in `src/lib/`.

- `packages/sdk/src/*-content.ts` — pure projections + mutations over a `WalDocument`
  (e.g. `page-content`, `board-content`, `calendar-content`, `comments-content`).
- `src/lib/use-wal-doc.ts` — opens and manages a single WAL doc lifecycle.
- `src/lib/use-object-content.ts` — routes between E2EE WAL (`objLog`) and plaintext
  merge-doc paths (`objPub`/`objInv`) based on node access flags. Also exports the
  shared `useWalMutator` helper and `classifyNodeAccess` used by all content hooks.
- `src/lib/use-page.ts` / `use-board.ts` / `use-calendar.ts` etc. — thin hooks
  composing `useObjectContent` with model-specific read/mutate ops.
- The object **tree** stays on the union-merge engine (`use-objects`); WAL backs
  page/board/calendar/form/feedback **content**.

## Conventions

- **Styling:** React Native `StyleSheet` for layout + theme tokens for color/size.
  No CSS, no NativeWind.
- **Text:** render through `<Txt>` (never a bare `<Text>`) so type, weight and color
  stay consistent. The display/heading variants use the Newsreader serif; body uses
  Spline Sans. Inline editing flows through `<AutosaveField>` (wraps `<TextField>`).
- **Fonts:** Newsreader (editorial serif — display/headings), Spline Sans (body),
  JetBrains Mono (labels, keys, fingerprints, timestamps). Loaded in
  `src/lib/use-app-fonts.ts`; names mirrored in `theme.ts` `fonts`.
- **Cross-platform:** every screen must work on web AND native. Branch with
  `Platform.OS`/`useResponsive().isWide` where needed; the desktop shell
  (`AppFrame` + `WorkspaceNav`) appears at/above `breakpointDesktop`. Haptics are
  native-only via `src/lib/haptics.ts`.

## Native UI — `@octovault/ui` (@expo/ui wrappers)

Native controls (real SwiftUI / Jetpack Compose) live in the workspace package
**`@octovault/ui`** (`packages/octovault-ui`), consumed by the `ui/*` primitives.
Each `ui/*` wrapper keeps its public API and branches `Platform.OS === 'web'` to
the RN fallback, so screens are untouched. Rules (learned the hard way):

- **Never import `@expo/ui/swift-ui/modifiers` directly** — it runs
  `requireNativeModule('ExpoUI')` at load and crashes the web bundle (and the
  Electron shell, which ships the same web export). Import from
  `_host/modifiers` (the `.ts`/`.web.ts` split). Web-safety is a definition of
  done: after `pnpm --filter @octovault/mobile export:web`,
  `grep -rc ExpoUI apps/mobile/dist/_expo/static/js/web/entry-*.js` MUST be `0`.
- **One barrel export only.** `@octovault/ui` exposes a single `.` export; never
  add per-file export subpaths (a new subpath resolves to unbuilt `dist` on web
  and breaks `expo export`).
- **Host seed** = the accent, fed live from `useTheme()` via `OctoUIThemeProvider`
  in `_layout.tsx`. Native sheet backgrounds use the SOLID `paper` token, never
  the translucent `surface` (which ghosts the screen behind the sheet).
- **BottomSheet**: iOS needs `enableDynamicSizing={false}` (fitToContents desyncs
  the RNHostView touch handler). Only phone `sheet` mode goes native; dialog/panel
  stay on the hand-rolled Modal.
- **SegmentedControl**: iOS-native only; Android/web keep the brand pill (native
  Android paints the selected label with a Material default that reads poorly on
  the accent fill).
- **Button**: keep the custom gradient/glow `primary`; native `.plain` variant
  only fits `secondary`/`ghost`/`danger` (a custom `backgroundColor` under a
  filled native variant double-draws a halo). `foregroundStyle` is iOS-only —
  Android needs a colored `Text` child for the label color.

## Commands (from the repo root)

- `pnpm web` / `pnpm start` / `pnpm ios` / `pnpm android`
- `pnpm typecheck` / `pnpm test`

## OTA updates (EAS Update)

- `expo-updates` is wired to EAS Update (`app.json` `updates.url` → `u.expo.dev`,
  `runtimeVersion.policy: appVersion`; channels set per profile in `eas.json`).
- Publish: `eas update --channel <development|preview|production> --message "…"`.
- `appVersion` policy: bump `version` in `app.json` when native deps change, or OTA
  updates won't reach existing builds.
