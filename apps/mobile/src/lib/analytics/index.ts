/**
 * OctoVault analytics — thin wrapper over `@drakkar.software/dk-spaces-analytics-sdk`,
 * mirroring OctoChat's hand-rolled sunglasses wiring (now packaged by the SDK):
 * `createTelemetryClient()` for a module-level lazy singleton (safe to `capture()`
 * before init resolves), `createTelemetry()` to build the real client wired to the
 * same Starfish sync config the rest of the app uses.
 *
 * Privacy: this is an E2EE app — event props must never carry page/object content
 * or PII. Only structural metadata (object type, etc.) is captured.
 */
import { createTelemetry, createTelemetryClient, captureException as sgCaptureException } from '@drakkar.software/dk-spaces-analytics-sdk';
import type { CaptureExceptionOptions } from '@drakkar.software/dk-spaces-analytics-sdk';

import { SYNC_BASE, SYNC_NAMESPACE } from '../octovault-init';
import { ANALYTICS_EVENTS } from './constants';

interface AppEvents {
  object_created: { type: string };
  [key: string]: Record<string, unknown> | undefined;
}

/** Module-level lazy singleton — safe to capture() before init() resolves. */
export const analytics = createTelemetryClient<AppEvents>();

const ANALYTICS_APP = 'octovault';
let started = false;

/** Call once at app boot (see `app/_layout.tsx`). Idempotent. */
export async function initAnalytics(): Promise<void> {
  if (started) return;
  started = true;
  const client = await createTelemetry({
    syncBaseUrl: SYNC_BASE,
    app: ANALYTICS_APP,
    namespace: SYNC_NAMESPACE ?? 'dk',
    appName: 'octovault-mobile',
    debug: __DEV__,
  });
  analytics.init(client);
}

/** Manually capture a handled exception. Safe to call before initAnalytics() resolves. */
export function captureException(error: unknown, options?: CaptureExceptionOptions): void {
  sgCaptureException(analytics, error, options);
}

/** The closest OctoVault analog to OctoChat's `message_sent` — fired post-success
 *  right after a new object is created. Content-free: only the object type. */
export function captureObjectCreated(type: string): void {
  analytics.capture(ANALYTICS_EVENTS.OBJECT_CREATED, { type });
}
