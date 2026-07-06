/**
 * One source of truth for the onboarding/account funnels: the per-platform step
 * lists (so "Step 2 of 2" can never lie about a 3-step web flow again), the
 * in-memory stash that keeps a generated seed stable across back-navigation, and
 * the first-run hook that lands a brand-new identity in a usable workspace.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { generateSeedWords } from '@drakkar.software/octovault-sdk';
import { captureException } from './analytics';
import { useSession } from './session-context';
import { useSpaces } from './use-spaces';

// ── Stepper truth ────────────────────────────────────────────────────────────

/**
 * The funnels that show numbered steps. `create`/`recover` are the FIRST-identity
 * flows (web appends the PIN ceremony as a final step; native seals via the OS
 * keystore and has none); `add-account` appends to an unlocked vault (never a
 * lock step); `add-device` is the source-device pairing flow.
 */
export type AuthFlow = 'create' | 'recover' | 'nostr' | 'add-account' | 'add-device';

export function flowSteps(flow: AuthFlow): string[] {
  const lockStep = 'Secure this device';
  switch (flow) {
    case 'create':
      return Platform.OS === 'web' ? ['Back up seed', 'Verify', lockStep] : ['Back up seed', 'Verify'];
    case 'recover':
      return Platform.OS === 'web' ? ['Enter seed', lockStep] : ['Enter seed'];
    case 'nostr':
      // The extension signature happens on welcome; the only numbered work left
      // is the lock ceremony, so the flow reads as a single step.
      return [lockStep];
    case 'add-account':
      return ['Back up seed', 'Verify'];
    case 'add-device':
      return ['Create transfer PIN', 'Scan from new device'];
  }
}

/** "Step 2 of 3 · Verify" — or just the step name when the flow has one step. */
export function stepSubtitle(flow: AuthFlow, stepIndex: number): string {
  const steps = flowSteps(flow);
  const label = steps[Math.min(stepIndex, steps.length - 1)] ?? '';
  if (steps.length <= 1) return label;
  return `Step ${Math.min(stepIndex, steps.length - 1) + 1} of ${steps.length} · ${label}`;
}

/**
 * Which first-identity flow is in flight. The lock screen serves three different
 * funnels (create / recover / Nostr) and can't tell them apart from the staged
 * session state alone — the screen that stages the identity records the flow so
 * the lock step's "Step x of y" stays truthful. Module-level (not context) since
 * it's pure presentation state with no need to re-render anyone.
 */
let currentFlow: AuthFlow = 'create';
export function setAuthFlow(flow: AuthFlow): void {
  currentFlow = flow;
}
export function getAuthFlow(): AuthFlow {
  return currentFlow;
}

// ── Pending generated-seed stash ─────────────────────────────────────────────

/**
 * Generated-but-not-yet-confirmed seed words, keyed per funnel. Memory-only by
 * design (the same rationale as session-context's `pendingSeed`: the phrase must
 * never touch disk or the URL before it's sealed) — but module-level so backing
 * out of the seed screen and re-entering shows the SAME words. Before this, the
 * screen's `useMemo` regenerated on every mount: a user who wrote down the words,
 * tapped back, and came forward again would confirm a DIFFERENT seed than the one
 * on their paper — the highest-stakes silent failure in the product.
 *
 * Keyed separately from session-context's `pendingSeed` because that slot is also
 * used by RECOVERY (staging an existing seed for the web lock step); reusing it
 * here could resurface a recovered phrase as a "new" identity.
 */
const pendingGenerated = new Map<string, string[]>();

export type SeedStashKey = 'onboarding' | 'add-account';

/** The funnel's pending seed — generated once, stable until cleared. */
export function pendingSeedWords(key: SeedStashKey): string[] {
  let words = pendingGenerated.get(key);
  if (!words) {
    words = generateSeedWords();
    pendingGenerated.set(key, words);
  }
  return words;
}

/** Drop the stash once the identity is persisted (or deliberately abandoned). */
export function clearPendingSeedWords(key: SeedStashKey): void {
  pendingGenerated.delete(key);
}

// ── First-run workspace ──────────────────────────────────────────────────────

/**
 * Lands a finished sign-in in a usable vault. A brand-new identity has zero
 * spaces — without this the first thing a user sees after the seed ceremony is a
 * dead empty state. Call `finish()` INSTEAD of `router.replace('/(tabs)/work')`
 * in the onboarding completion paths; the hook waits for the spaces registry to
 * hydrate (so a RECOVERED identity with existing spaces is never polluted), auto-
 * creates a private "Personal" space only when the list is genuinely empty, and
 * then navigates. Failure-tolerant: if the create fails (offline), it continues
 * to the vault — the zero-space empty state covers it.
 *
 * The owning screen must also relax its `if (session) return <Redirect/>` guard
 * to `if (session && !finishing)` — the session lands BEFORE this hook navigates.
 */
export function useFirstRunSpace(): { finishing: boolean; finish: () => void } {
  const { session } = useSession();
  const { spaces, loading, createSpace } = useSpaces();
  const [finishing, setFinishing] = useState(false);
  // One-shot: the spaces array identity churns when createSpace refreshes the
  // registry, which re-runs the effect — the ref keeps the work single-fire.
  const ran = useRef(false);

  useEffect(() => {
    if (!finishing || !session || loading || ran.current) return;
    ran.current = true;
    void (async () => {
      if (spaces.length === 0) {
        try {
          await createSpace('Personal');
        } catch (e) {
          // Tolerated: the Vault's zero-space empty state is the fallback.
          captureException(e);
        }
      }
      clearPendingSeedWords('onboarding');
      // Router is module-global, so navigating here is safe even if the
      // onboarding screen unmounted while the create was in flight.
      router.replace('/(tabs)/work');
    })();
  }, [finishing, session, loading, spaces, createSpace]);

  return { finishing, finish: () => setFinishing(true) };
}
