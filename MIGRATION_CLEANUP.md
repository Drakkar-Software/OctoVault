# Migration cleanup — octospaces → dk-spaces (2026-07-06)

Temporary code and notes from the `@drakkar.software/octospaces-sdk@0.26.0` →
`@drakkar.software/dk-spaces-sdk@0.32.0` bump (package rename + starfish TS
`alpha.31/32/33` → `alpha.65`), same shape as OctoChat's own migration cleanup.
Remove the items below once the rollout window has passed (all active clients
have launched at least once on the new build).

## Remove after rollout

- **KV prefix-rename shim** — `apps/mobile/src/lib/kv-migration.ts` (web/localStorage)
  and `apps/mobile/src/lib/kv-migration.native.ts` (native/AsyncStorage) each have
  a one-time migration block guarded by the `dk-migration:v1:done` flag that
  copies `octospaces.spaceaccess.*` → `dk.spaceaccess.*`.

  **Narrower than OctoChat's equivalent shim**: OctoVault does NOT need the
  `octospaces.profile.v1.*` → `starfish.profile.v1.*` half — OctoVault never calls
  `cacheProfile`/`loadCachedProfile` (its `starfish/client.ts` reads
  `readProfile`/`readProfiles` directly, no caching layer in front). Mutes/reads
  KV keys are also unaffected — `mutePrefsConfig('octovault')`/
  `readPrefsConfig('octovault')` preserve the same `'octovault'` namespace string.

  Delete both files (and the `import './kv-migration'` line in
  `apps/mobile/src/lib/octovault-init.ts`) once no client is expected to still be
  running a pre-bump build.

- **Legacy pairing QR prefix acceptance** — `starfish-spaces`' `completeDevicePairing`
  dual-accepts any `*-pair:` QR prefix, so `octovault-pair:` (this app's own prefix,
  set in `packages/sdk/src/starfish/pairing.ts`) keeps working unconditionally —
  there is no OTHER legacy prefix to retire here (OctoVault never used
  `dk-spaces-sdk`'s own default `dk-pair:` prefix). Nothing to remove; noted for
  parity with OctoChat's cleanup doc.

## Known limitation — not fixed here

- **The default object-blob store has no KV persistence.** `starfish/object-blobs.ts`
  (the bare `uploadObjectBlob`/`loadObjectBlob` singleton used by
  `use-object-files.ts`/`use-object-blob.ts`) is in-memory-cache-only, matching the
  old octospaces-sdk default singleton's behavior exactly — this was a deliberate
  parity choice, not a regression, but it means a cold app restart always re-pulls
  blobs from the network once (no cross-session cache). If a KV-persisted cache is
  ever wanted here, add `kvAdapter`/`persistPrefix`/`persistIndexKey` options to its
  `createSealedBlobStore(...)` call — mirroring `starfish/attachments.ts`'s store.

## Security-posture note — not a downgrade, verified

- **`completeDevicePairing`'s `confirmUnpinnedRoot` always returns `true`**
  (`packages/sdk/src/starfish/pairing.ts`). starfish `alpha.63` made root-trust
  verification mandatory on pairing completion (`expectedRootEdPub` or
  `confirmUnpinnedRoot`, else it throws). OctoVault's QR actually DOES carry a
  pinned root: `startDevicePairing` mints it as `octovault-pair:<nonce>.<edPub>`
  (the existing device's session `edPub`), so on completion `expectedRootEdPub`
  resolves from the QR itself and root-trust IS enforced against that pinned key
  — the `confirmUnpinnedRoot: () => true` callback is an inert fallback that only
  fires if the QR were ever minted without its `.edPub` suffix, which OctoVault
  never does. Net posture is unchanged from pre-bump: PIN-sealed bundle
  (Argon2id→AES-GCM) + physical QR proximity remain the real gate. No action
  needed here.

## Runtime behavior change — not a bug, but scoped narrowly

- **`createSpacesRoleEnricher(store, undefined, { allowTofu: true })`**
  (`apps/server/src/index.ts`) restores first-write provisioning on the sync
  router's gate, which is now fail-closed by default upstream (starfish
  alpha.39). This is required — without it, `createSpace` 403s the first time a
  fresh account's `_access` doc hasn't been durably seen yet. `allowTofu: true`
  re-opens the original TOFU (trust-on-first-use) window for space creation
  specifically; it does not affect read/write gating on already-provisioned
  spaces (the branch only fires when the `_access` doc is absent).

  Because `allowTofu: true` grants owner+member for *any* spaceId whose `_access`
  doc is absent — not just on the create-write path — it is deliberately **not**
  shared with the `/events` SSE proxy, which only ever reads membership and never
  provisions anything. `/events` uses a second, strict (`allowTofu: false`)
  enricher instance instead, so a caller can't TOFU-subscribe to an
  unprovisioned spaceId's event stream. See the enricher comment block in
  `apps/server/src/index.ts` for the full rationale.

## Wire-format note — cross-version invite links

- starfish `alpha.63` changed `encodeLinkFragment`'s wire format to canonical
  `base64url(JSON([origin, path, token]))`. An invite/space link minted by a
  pre-bump (`alpha.31/32/33`) client and opened by a post-bump client (or vice
  versa) during the rollout window may fail to decode. No stored data is
  affected; worst case the recipient re-requests a fresh link.

## Wire topic rename — dk.object.changed

- `apps/server/src/index.ts` now publishes all six object collections
  (`objindex`/`objlog`/`objdoc`/`objpub`/`objinv`/`typeindex`) on
  `dk.object.changed` (renamed from `octospaces.object.changed`), and
  `apps/server/src/events.ts`'s `/events` SSE proxy reconstructs the matching
  sanitized Whistlers topic (`WHISTLERS_NAMESPACE = "dk"`). The mobile client's
  SSE parser (`apps/mobile/src/lib/events-stream.ts`) matches on the new
  `dk.object.changed.` prefix. This requires the deployed Whistlers bridge config
  to already be on the `dk` namespace — verify against Infra's bridge rename
  before shipping to production (not checked from this sandboxed session).

## Operational — not code, don't forget

- The deployed Starfish namespace env var must be updated from `octospaces` to
  `dk`: `EXPO_PUBLIC_STARFISH_NAMESPACE=dk` (see
  `apps/mobile/src/lib/octovault-init.ts`,
  `apps/desktop/scripts/check-build-env.mjs`). This repo's hosting/CI dashboard
  env vars were not checked (sandboxed from this session) — verify directly.
- `EXPO_PUBLIC_SHARED_SPACES_NAMESPACE` (the cross-app namespace shared with
  OctoChat for a joined-space list both apps can read) must also become `dk`, and
  must match whatever OctoChat's own equivalent value ends up being, or the
  shared space list silently splits between the two apps.
- Confirm the deployed Whistlers bridge config (`infra/whistlers.config.json` or
  equivalent) is on the `dk` namespace key — the wire-topic rename above assumes
  it already is.
