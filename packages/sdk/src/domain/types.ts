/**
 * Domain model for OctoVault.
 *
 * Re-exports the shared octospaces-sdk types (Space, ObjectNode, NodeAccess, …)
 * and adds vault-specific types (User, Profile, AutomationMeta, PropValue, etc.).
 *
 * ObjectNode.access / ObjectNode.enc (from octospaces) replace the old Space.type
 * ('private'|'public') model. Space is now a neutral container (no `type`, `ownerId`,
 * or `write` field). The per-node access:'public' model replaces public spaces.
 *
 * ObjectNode.automation and ObjectNode.props moved into ObjectNode.meta:
 *   node.meta?.automation  →  automationOf(node)  (from objects-ext.ts)
 *   node.meta?.props       →  propsOf(node)       (from objects-ext.ts)
 */

import type { PresenceStatus, VerificationLevel, SealedBlob } from '@drakkar.software/octospaces-sdk';

// ── Re-export shared octospaces domain types ───────────────────────────────
export type {
  ID,
  NodeAccess,
  ObjectNode,
  ObjectType,
  ObjectContentKind,
  ObjectsIndex,
  Space,
  CapMap,
  PubAccessMap,
  MuteValue,
  MutePrefs,
  ReadValue,
  ReadPrefs,
  PresenceStatus,
  VerificationLevel,
  SealedBlob,
} from '@drakkar.software/octospaces-sdk';

// ── Vault-specific types ────────────────────────────────────────────────────

/** A vault user display record (enriched from the public profile). */
export interface User {
  id: string;
  name: string;
  handle: string;
  initials: string;
  presence?: PresenceStatus;
  /** Uploaded avatar as a data URI; absent → render the monogram initials. */
  avatar?: string;
}

export interface SecurityItem {
  id: string;
  icon: 'shield' | 'devices' | 'key';
  title: string;
  detail: string;
  level: VerificationLevel;
  mono?: boolean;
}

export interface Profile {
  user: User;
  pronouns: string;
  description: string;
  status: string;
  fingerprint: string;
  security: SecurityItem[];
}

/** Scalar value that can be stored in an ObjectNode's `meta.props` map. */
export type PropValue = string | number | boolean | null;

/** Stored, synced config of an automation node (`type:'automation'`), kept in
 *  `node.meta.automation`. Use {@link automationOf} / `objects-ext.ts` to access. */
export interface AutomationMeta {
  /** FK into the built-in provider catalog (e.g. 'rss' / 'http'). */
  providerId: string;
  /** Non-secret provider params (URLs, locations, etc.). */
  params: Record<string, unknown>;
  /** Scheduled-fetch cadence in minutes; `0` = commands-only (no scheduled run). */
  intervalMin: number;
  /** When set, the automation fires on every room open / background check,
   *  bypassing the `intervalMin` time gate. */
  onOpen?: boolean;
  /** Off → ticker skips and `onCommand` ignores; the room itself still renders. */
  enabled: boolean;
  /** Bot write credential SEALED to the minting account key. */
  credential: SealedBlob;
  /** The deterministic id of the device elected to run this automation. */
  runOnDeviceId: string | null;
  /** Last successful tick (epoch ms). */
  lastRunAt: number | null;
  /** Hash of the last text a scheduled fetch posted. */
  lastFetchHash?: string | null;
  /** Last error message — set on throw, cleared on success. */
  lastError: string | null;
}

/** The builtin object types shipped with OctoVault renderers. A custom type is
 *  any `string` beyond these (the ObjectType union is open-ended). */
export type BuiltinObjectType =
  | 'folder'
  | 'page'
  | 'board'
  | 'task'
  | 'file'
  | 'image'
  | 'automation'
  | 'note'
  | 'calendar'
  | 'form'
  | 'feedback';

/** Runtime set of builtin type strings — use to branch "do we ship a renderer?". */
export const BUILTIN_OBJECT_TYPES: readonly BuiltinObjectType[] = [
  'folder', 'page', 'board', 'task', 'file', 'image', 'automation', 'note', 'calendar', 'form', 'feedback',
];
