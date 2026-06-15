/**
 * Owner-side invite minting for ONE space:
 *  - PRIVATE → {@link inviteToSpace}: paste an invitee's join-request → an invite cap
 *    bundle (JSON) the invitee accepts on the Join screen.
 *
 * The result is a plain string surfaced through a <CopyField>.
 */
import { useCallback, useState } from 'react';

import { useSession } from './session-context';
import { humanizeError, inviteToSpace } from '@drakkar.software/octovault-sdk';

export interface SpaceInviteState {
  busy: boolean;
  error: string | null;
  /** The minted invite cap bundle, or null until generated. */
  result: string | null;
  /** Mint an invite cap from a pasted join-request. */
  generatePrivateInvite: (joinRequestJson: string) => Promise<void>;
  /** Clear the current result/error (e.g. when the input changes). */
  reset: () => void;
}

export function useSpaceInvite(spaceId: string): SpaceInviteState {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const generatePrivateInvite = useCallback(
    async (joinRequestJson: string) => {
      if (!session || busy) return;
      const req = joinRequestJson.trim();
      if (!req) {
        setError('Paste the invitee’s join request first.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const invite = await inviteToSpace(session, spaceId, req);
        setResult(invite);
      } catch (e) {
        setError(humanizeError(e, 'Could not generate that invite.'));
      } finally {
        setBusy(false);
      }
    },
    [session, busy, spaceId],
  );

  return { busy, error, result, generatePrivateInvite, reset };
}
