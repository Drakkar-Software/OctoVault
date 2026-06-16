/**
 * OctoVault-specific object-tree extensions.
 *
 * These helpers bridge the vault's `props`/`automation` concept (which used to be
 * top-level ObjectNode fields) onto the octospaces-sdk `node.meta` bag.
 *
 * Migration:
 *   OLD: node.props?.[key]         → NEW: propsOf(node)[key]
 *   OLD: node.automation            → NEW: automationOf(node)
 *   OLD: addObject(nodes, { type, title, props, automation }, now)
 *        → addVaultObject(nodes, { type, title, props, automation }, now)
 *   OLD: setProps(nodes, id, patch, now)  → same, from here
 *   OLD: clearProp(nodes, id, key, now)   → same, from here
 */
import type { ObjectNode } from '@drakkar.software/octospaces-sdk';
import { patchObject, addObject, nextOrder } from '@drakkar.software/octospaces-sdk';
import type { NewObjectInput } from '@drakkar.software/octospaces-sdk';
import type { AutomationMeta, PropValue } from '../domain/types';
import { randomId } from '../domain/ids';

/** Read the `props` map from a node's `meta` bag (typed for vault usage). */
export function propsOf(node: ObjectNode): Record<string, PropValue> {
  const meta = node.meta;
  if (!meta || typeof meta.props !== 'object' || meta.props === null) return {};
  return meta.props as Record<string, PropValue>;
}

/** Read the `automation` config from a node's `meta` bag. Returns `null` when absent. */
export function automationOf(node: ObjectNode): AutomationMeta | null {
  return (node.meta?.automation as AutomationMeta | undefined) ?? null;
}

/** Vault-specific new-node input (adds `props` and `automation` fields). */
interface VaultNewObjectInput {
  type: string;
  parentId?: string | null;
  title: string;
  emoji?: string;
  id?: string;
  access?: ObjectNode['access'];
  enc?: boolean;
  /** Structured property values (stored under `meta.props`). */
  props?: Record<string, PropValue>;
  /** Automation config (stored under `meta.automation`). */
  automation?: AutomationMeta;
  /** Any additional meta fields (merged with props/automation). */
  meta?: Record<string, unknown>;
}

/**
 * Create a new vault object node, mapping vault-specific `props`/`automation`
 * into `meta.props`/`meta.automation` as required by the octospaces model.
 */
export function addVaultObject(
  nodes: ObjectNode[],
  input: VaultNewObjectInput,
  now: number,
): { nodes: ObjectNode[]; node: ObjectNode } {
  const meta: Record<string, unknown> = { ...input.meta };
  if (input.props && Object.keys(input.props).length > 0) meta.props = input.props;
  if (input.automation) meta.automation = input.automation;
  return addObject(nodes, {
    type: input.type,
    parentId: input.parentId,
    title: input.title,
    emoji: input.emoji,
    id: input.id,
    access: input.access,
    enc: input.enc,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  }, now);
}

/** Merge a props patch into a node's `meta.props` (node-level LWW write; bumps `updatedAt`). */
export function setProps(
  nodes: ObjectNode[],
  id: string,
  patch: Record<string, PropValue>,
  now: number,
): ObjectNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const existingProps = propsOf(n);
    const newMeta: Record<string, unknown> = { ...(n.meta ?? {}), props: { ...existingProps, ...patch } };
    return { ...n, meta: newMeta, updatedAt: now };
  });
}

/** Remove a single key from a node's `meta.props` (LWW write; bumps `updatedAt`). */
export function clearProp(
  nodes: ObjectNode[],
  id: string,
  key: string,
  now: number,
): ObjectNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const existingProps = { ...propsOf(n) };
    delete existingProps[key];
    const newMeta: Record<string, unknown> = { ...(n.meta ?? {}), props: existingProps };
    return { ...n, meta: newMeta, updatedAt: now };
  });
}

/** Patch a node's `automation` field (stored as `meta.automation`), bumping `updatedAt`. */
export function patchAutomation(
  nodes: ObjectNode[],
  id: string,
  automation: AutomationMeta | null,
  now: number,
): ObjectNode[] {
  return nodes.map((n) => {
    if (n.id !== id) return n;
    const newMeta: Record<string, unknown> = { ...(n.meta ?? {}) };
    if (automation !== null) {
      newMeta.automation = automation;
    } else {
      delete newMeta.automation;
    }
    return { ...n, meta: newMeta, updatedAt: now };
  });
}
