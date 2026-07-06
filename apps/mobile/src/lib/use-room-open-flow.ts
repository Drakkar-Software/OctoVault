/**
 * Shared space-open effect for {@link ./use-merge-doc} (merge-doc) and
 * append-only content hooks. Resolves the crypto context for a space:
 *  - E2EE node (enc:true): opens the space keyring encryptor via getNodeAccess.
 *  - Plaintext node (enc:false, public, invite-plaintext): encryptor is null.
 *  - Space-wide plaintext (no node, plaintext:true): member client, no encryptor.
 *  - Space-wide E2EE (no node, plaintext:false — typeindex etc.): space keyring.
 * Builds on {@link useSpaceOpenState} for the opening/error/offline flags + reconnect.
 *
 * Reachability is NOT reported here — building the encryptor may have used the
 * cache (offline); the caller reports it from its first fresh pull.
 */
import { useEffect, useState } from 'react';
import type { Encryptor, StarfishClient } from '@drakkar.software/starfish-client';

import { getMemberCap } from '@drakkar.software/octovault-sdk';
import { getNodeAccess, getSpaceClient, buildEncryptor, buildEncryptorTofu, ownerTrustedAdders } from '@drakkar.software/octovault-sdk';
import type { NodeAccess } from '@drakkar.software/octovault-sdk';
import { useSpaceRegistryActions } from './space-registry-context';
import { useSession } from './session-context';
import { useSpaceOpenState } from './use-space-open';
import { useTrustBypass } from './use-trust-bypass';

export interface RoomOpenFlow {
  encryptor: Encryptor | null;
  client: StarfishClient | null;
  opening: boolean;
  openError: string | null;
  offline: boolean;
  reload: () => void;
}

export function useSpaceOpen(opts: {
  docId: string;
  spaceId: string;
  enabled: boolean;
  /** Per-node crypto: getNodeAccess for enc:true, null encryptor for plaintext nodes. */
  node?: { id: string; access?: NodeAccess; enc?: boolean };
  /** When true, always use null encryptor (space-wide plaintext docs like objindex). */
  plaintext?: boolean;
}): RoomOpenFlow {
  const { docId, spaceId, enabled } = opts;
  const { session } = useSession();
  const { ensure: ensureRegistry } = useSpaceRegistryActions();
  const { isBypassed } = useTrustBypass();
  const bypassed = isBypassed(spaceId);
  const [encryptor, setEncryptor] = useState<Encryptor | null>(null);
  const [client, setClient] = useState<StarfishClient | null>(null);
  const { opening, openError, offline, reloadNonce, reload, beginOpen, finishOpening, failOpen } =
    useSpaceOpenState();

  const nodeId = opts.node?.id;
  const nodeAccess = opts.node?.access;
  const nodeEnc = opts.node?.enc;
  const plaintext = opts.plaintext;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset doc crypto/open state before reopening when doc or session changes
    setEncryptor(null);
    setClient(null);
    beginOpen();
    if (!enabled || !session) return;
    (async () => {
      try {
        if (plaintext) {
          // Space-wide plaintext (e.g., objindex): member client, no encryption.
          const docClient = getSpaceClient(spaceId, session);
          if (!cancelled) {
            setEncryptor(null);
            setClient(docClient);
            finishOpening();
          }
        } else if (nodeId && !bypassed) {
          // Per-node: use getNodeAccess — null encryptor for plaintext nodes,
          // space-keyring encryptor for enc:true nodes.
          const reg = getMemberCap(spaceId) ? null : await ensureRegistry(spaceId);
          const { encryptor: enc, client: docClient } = await getNodeAccess(
            spaceId, nodeId, { access: nodeAccess, enc: nodeEnc }, session, reg,
          );
          if (!cancelled) {
            setEncryptor(enc);
            setClient(docClient);
            finishOpening();
          }
        } else {
          // Space-wide E2EE (typeindex, or any call without a node), OR any node
          // once the user has opted into the trust bypass for this space: open the
          // space keyring directly. Bypassed uses buildEncryptorTofu, which also
          // trusts the keyring's own observed `addedBy` — the recovery path for the
          // userId-vs-edPub trusted-adder mismatch.
          const reg = getMemberCap(spaceId) ? null : await ensureRegistry(spaceId);
          const docClient = getSpaceClient(spaceId, session);
          const trustedAdders = reg?.owner ? [reg.owner] : ownerTrustedAdders(session);
          const enc = bypassed
            ? await buildEncryptorTofu(docClient, session.keys, spaceId, trustedAdders)
            : await buildEncryptor(docClient, session.keys, spaceId, trustedAdders);
          if (!cancelled) {
            setEncryptor(enc);
            setClient(docClient);
            // NOTE: no openReached() — building the encryptor may have used the cached
            // keyring (offline). Reachability is reported from the caller's first fresh pull.
            finishOpening();
          }
        }
      } catch (e) {
        if (!cancelled) failOpen(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, session, docId, spaceId, nodeId, nodeAccess, nodeEnc, plaintext, bypassed, ensureRegistry, reloadNonce, beginOpen, finishOpening, failOpen]);

  return { encryptor, client, opening, openError, offline, reload };
}
