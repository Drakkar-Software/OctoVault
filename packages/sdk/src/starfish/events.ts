/**
 * Re-exports the shared SSE events transport from octospaces-sdk.
 */
export {
  buildSignedEventsRequest,
  parseSseFrames,
  subscribeChanges,
} from '@drakkar.software/octospaces-sdk';
export type { SubscribeChangesOptions } from '@drakkar.software/octospaces-sdk';
