import type { WriteEvent } from "@drakkar.software/starfish-protocol";
import type { Projection, ProjectionOp } from "@drakkar.software/starfish-projection";

/**
 * Public object directory projection for OctoVault.
 *
 * The `starfish-projection` plugin folds every write of a watched `source`
 * collection into a single queryable list document. This projection indexes
 * nodes with `access:'public'` across all spaces: on each `objindex` write it
 * upserts that space's `{ nodes, ts }` into the target doc at
 * `_index/objects/public`, or removes the entry when the space has no public
 * nodes. Anonymous clients may pull the directory with no auth required.
 *
 * Directory doc shape (one entry per space):
 *   { "<spaceId>": { nodes: PubNode[], ts } }
 *
 * Source is `objindex` (always plaintext in the per-node access model): the
 * `objects[]` array carries `access:'public'` flags readable without decryption,
 * so the projection can filter from the write body alone.
 *
 * PRIVACY: the filter is strict — only nodes with `access === 'public'` are
 * included. A misconfiguration here would leak private node titles into the
 * world-readable directory. Unit-tested in projections.test.ts.
 *
 * Keep in sync with:
 * - drakkar_sync/apps/octovault/projections.py   (Python mirror, same logic)
 * - @drakkar.software/starfish-spaces readObjectDirectory (client reader)
 * - The `objectindex` collection in config.ts     (pullOnly target collection)
 */

/** A minimal public node stub stored in the directory entry. */
export interface PubNode {
  id: string;
  title: string;
  type: string;
  emoji?: string;
  updatedAt: number;
}

/**
 * Extract live public node stubs from an `objindex` write body's `objects` array.
 * Returns ONLY nodes with `access === 'public'` that are NOT archived.
 */
export function extractPublicNodes(body: unknown): PubNode[] {
  if (!body || typeof body !== "object") return [];
  const objects = (body as Record<string, unknown>).objects;
  if (!Array.isArray(objects)) return [];
  const result: PubNode[] = [];
  for (const n of objects) {
    if (!n || typeof n !== "object") continue;
    const node = n as Record<string, unknown>;
    if (node.access !== "public") continue;
    if (node.archived) continue;
    const rawId = String(node.id ?? "");
    if (!rawId) continue; // skip nodes with missing/empty id — an empty id would corrupt the directory
    const stub: PubNode = {
      id: rawId,
      title: typeof node.title === "string" ? node.title : "",
      type: typeof node.type === "string" ? node.type : "page",
      updatedAt: typeof node.updatedAt === "number" ? node.updatedAt : 0,
    };
    if (typeof node.emoji === "string") stub.emoji = node.emoji;
    result.push(stub);
  }
  return result;
}

/**
 * Map an `objindex` write to a public-object directory upsert or remove.
 * Returns null (no-op) when the event carries no spaceId.
 */
export function projectObjIndexPublic(e: WriteEvent): ProjectionOp {
  const spaceId = e.params.spaceId;
  if (!spaceId) return null;
  const nodes = extractPublicNodes(e.body);
  if (nodes.length === 0) return { id: spaceId, remove: true };
  return { id: spaceId, value: { nodes, ts: e.timestamp } };
}

/** Projections this server maintains. Passed to `createProjectionServerPlugin`. */
export const projections: Projection[] = [
  {
    source: "objindex",
    target: "_index/objects/public",
    project: projectObjIndexPublic,
  },
];
