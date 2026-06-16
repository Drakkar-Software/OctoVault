# OctoVault — pnpm monorepo

Universal (web + native) **Expo** app for **OctoVault**, an end-to-end-encrypted,
**Notion/Anytype-style** knowledge app (pages of nested blocks + kanban boards)
with an editorial **"Ink & Pearl"** theme (warm pearl paper, octopus-ink indigo
accent, Newsreader serif + Spline Sans) and an octopus-vault mark. It syncs
against a **Starfish** server (default `http://localhost:8787`, override with
`EXPO_PUBLIC_STARFISH_URL`) over REST + SSE, with real end-to-end encryption
(BIP-39 seed → Ed25519/Kyber keys → per-space keyrings).

Its document layer is built on the Starfish **WAL/CRDT** primitive
(`@drakkar.software/starfish-wal`, 3.0.0-alpha.26): each page/board is an
append-only op-log of CRDT ops folded client-side (commutative + idempotent),
so concurrent/offline edits converge with full history and a trusted snapshot
for fast cold-start.

## Layout

- `apps/mobile` — the Expo (SDK 56) app, package `@octovault/mobile`. iOS, Android, web.
- `apps/server` — local Starfish sync server (`@octovault/server`): Hono + `starfish-server` + NATS.
- `apps/desktop` — Electron shell wrapping the Expo web build (optional).
- `packages/tsconfig` — shared base TypeScript config, `@octovault/tsconfig` (`workspace:*`).

pnpm workspace, `nodeLinker: hoisted` (React Native / Metro need a flat
`node_modules`). The `@drakkar.software/starfish-*` SDK is consumed as pinned npm
deps (`3.0.0-alpha.26` — the line that ships `starfish-wal`).
`apps/mobile/metro.config.js` watches the workspace root, enables package
`exports`, and blocks the Node-only `apps/server` from the app bundle.

## The WAL/CRDT data layer

The WAL engine and its wiring live in **`packages/sdk`** (`@drakkar.software/octovault-sdk`);
`apps/mobile/src/lib/` only consumes it through hooks.

- `packages/sdk/src/*-content.ts` (`page-content`, `board-content`, `calendar-content`,
  `form-content`, `feedback-content`, `comments-content`) and `task-model.ts` — pure
  projections + mutations over a `WalDocument` (blocks via RGA `order` + per-block
  char-RGA text + LWW prop registers; boards via column/task lists + per-task registers).
- `apps/mobile/src/lib/use-wal-doc.ts` — opens and owns a single WAL doc lifecycle
  (pull → commit, open error, version bumps).
- `apps/mobile/src/lib/use-object-content.ts` — routes between the E2EE WAL path
  (`objLog`) and the plaintext merge-doc paths (`objPub`/`objInv`) based on node
  access flags.
- `apps/mobile/src/lib/use-{page,board,calendar,form,feedback}.ts` — thin hooks
  composing `useObjectContent` + the SDK content model ops.
- The object **tree** (`use-objects`, `space-objects-context`) stays on the
  union-merge engine; WAL backs page/board/calendar/form/feedback **content**.

## Commands

- `pnpm install` — install every workspace.
- `pnpm web` / `pnpm start` / `pnpm ios` / `pnpm android` — run the app.
- `pnpm dev` — local sync server + whistlers SSE (needs `docker compose up -d nats`).
- `pnpm typecheck` — typecheck all workspaces. `pnpm test` — run tests.

## Design rules — ALWAYS respect

App code lives in `apps/mobile/src`. Non-negotiable:

1. **Reuse components** — build UI from the generic reusables in `src/components/**/*.tsx`.
2. **One theme source** — ALL constants live in `src/theme.ts`; never hardcode a color/size/font, never compute `rgba()` inline.
3. **Logic in `src/lib/*.ts`** — data access, hooks, helpers, platform branches; components/screens only consume them.
4. **Thin route pages** — files in `src/app/**` only read params, pull data from `src/lib`, wire navigation, compose generic components.

The full version is in [`apps/mobile/CLAUDE.md`](apps/mobile/CLAUDE.md).
