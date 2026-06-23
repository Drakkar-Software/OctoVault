/**
 * Editable details (name + image) for ONE space, plus its derived ownership flag.
 *
 * Autosave model (no Save button): the screen seeds an `<AutosaveField>` with
 * {@link SpaceDetails.name} and calls {@link SpaceDetails.commitName} for each
 * committed value; image edits persist the moment they're picked/removed. The
 * name updates optimistically and rolls back on failure unless a newer commit
 * superseded it. Writes are SERIALIZED through a promise chain: each save is a
 * read-modify-write of the `_access` record, so a debounced mid-typing commit
 * never interleaves with the blur flush that follows it.
 *
 * All spaces use the private `_access` record path via {@link writeSpaceAccess}
 * (owner-gated; threads owner+members through so a meta edit never drops the roster).
 * Ownership resolves ASYNC (from `_access.owner`), so {@link SpaceDetails.loading}
 * holds skeletons on owner-only sections until it lands.
 *
 * `image` reuses the avatar data-URI contract (Space.image is the same shape as a
 * profile avatar — see avatar-image / types.ts), so it goes through the same
 * {@link pickAndProcessAvatar} picker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Space } from '@drakkar.software/octovault-sdk';

import { pickAndProcessAvatar } from './avatar-image';
import { useSession } from './session-context';
import { useSpaces } from './use-spaces';
import { broadcastSpaceMeta, humanizeError, readSpaceAccess, writeSpaceAccess } from '@drakkar.software/octovault-sdk';

/** Hard cap on a space name (the old field's maxLength, now enforced in the lib —
 *  the rail tile, switcher and breadcrumbs all assume a short label). */
const NAME_MAX = 40;

export interface SpaceDetails {
  /** The space record (from the user's `_spaces` list), or null until it loads. */
  space: Space | null;
  isOwner: boolean;
  /** True until the shared identity (owner + name/image) resolves — hold skeletons
   *  on the owner-gated sections so they don't pop in after the roundtrip. */
  loading: boolean;
  /** Persisted display name — the autosave field's seed; updates optimistically
   *  on commit so a re-seed never shows a stale value. */
  name: string;
  /** Owner: persist a trimmed new name. Blank / unchanged values are no-ops, so an
   *  abandoned edit can never blank the shared identity. */
  commitName: (next: string) => Promise<void>;
  /** Persisted image (data URI), or null to render the monogram. */
  image: string | null;
  /** Owner: pick a new image and persist it immediately (autosave — no Save step). */
  pickImage: () => Promise<void>;
  /** Owner: clear the image and persist immediately. */
  removeImage: () => Promise<void>;
  /** A write is in flight — drive a quiet "Saving…" hint, never a blocking state. */
  saving: boolean;
  error: string | null;
}

export function useSpaceDetails(spaceId: string): SpaceDetails {
  const { session } = useSession();
  const { spaces } = useSpaces();
  const space = useMemo(() => spaces.find((s) => s.id === spaceId) ?? null, [spaces, spaceId]);
  // The signed-in identity owns this space when its userId is the owner.
  // The `_access.owner` field is the source of truth — fetched below.
  const [owner, setOwner] = useState<string | null>(null); // resolved from _access by readSpaceAccess
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(space?.name ?? '');
  const [image, setImage] = useState<string | null>(space?.image ?? null);
  // Count (not boolean): the serialized queue can hold several writes at once and
  // "saving" must stay true until the LAST one settles.
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Once the user persisted an edit, async (re)loads must not clobber the newer
  // local truth (the broadcast keeps the registry copies in sync anyway).
  const mutated = useRef(false);
  // Mutation-time mirrors of name/image: queued persists and supersede checks read
  // these instead of capturing possibly-stale render state.
  const nameRef = useRef(name);
  const imageRef = useRef(image);

  const spaceLoaded = !!space;
  useEffect(() => {
    if (!session || !spaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const { owner: ownr, name: sharedName, image: sharedImage } = await readSpaceAccess(
            session.contentClient,
            spaceId,
            session,
          );
          if (cancelled) return;
          setOwner(ownr);
          if (!mutated.current) {
            if (sharedName) {
              nameRef.current = sharedName;
              setName(sharedName);
            }
            imageRef.current = sharedImage;
            setImage(sharedImage);
          }
          setLoading(false);
      } catch (e) {
        if (!cancelled) {
          console.error('[useSpaceDetails] failed to read space access record', e);
          // Fall back to the `_spaces` copy; ownership stays unresolved (read-only view)
          // rather than holding the screen on skeletons forever.
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, spaceId, spaceLoaded]);

  // Adopt the loaded space record into local state unless an edit was persisted
  // (post-save the local copy IS the freshest truth — see `mutated`).
  useEffect(() => {
    if (!space || mutated.current) return;
    nameRef.current = space.name;
    setName(space.name);
    imageRef.current = space.image ?? null;
    setImage(space.image ?? null);
  }, [space]);

  const isOwner = !!session && !!owner && owner === session.userId;

  // The serialization backbone: every save chains onto the previous one (success
  // OR failure), so two read-modify-writes of `_access` can never interleave.
  const persistQueue = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback(
    (nextName: string, nextImage: string | null): Promise<void> => {
      if (!session) return Promise.resolve();
      setPendingSaves((n) => n + 1);
      const job = async () => {
        try {
          // Re-read the access record for the freshest owner/members/hash, then rewrite it
          // with the new shared name/image (owner-gated). Threads owner+members through so
          // the meta edit never drops the roster.
          const { owner: ownr, members, hash } = await readSpaceAccess(session.contentClient, spaceId, session);
          await writeSpaceAccess(session.contentClient, spaceId, ownr ?? session.userId, members, hash, session, {
            name: nextName,
            image: nextImage,
          });
          // Fan the new identity out so the live rail/header adopt it WITHOUT re-reading the
          // user's `_spaces` doc — writeSpaceAccess does not touch that doc, so a refresh would
          // re-read the stale name/image and revert the save. Self-heals via reconcileSpaceMeta
          // on the next space open.
          broadcastSpaceMeta(spaceId, {
            name: nextName,
            short: nextName.slice(0, 2).toUpperCase(),
            image: nextImage ?? undefined,
          });
        } finally {
          setPendingSaves((n) => n - 1);
        }
      };
      const run = persistQueue.current.then(job, job);
      // Keep the chain alive past a failure so the NEXT save still runs.
      persistQueue.current = run.catch(() => {});
      return run;
    },
    [session, spaceId],
  );

  const commitName = useCallback(
    async (next: string) => {
      const trimmed = next.trim().slice(0, NAME_MAX);
      if (!session || !space || !isOwner) return;
      if (!trimmed || trimmed === nameRef.current) return;
      const prev = nameRef.current;
      mutated.current = true;
      nameRef.current = trimmed;
      setName(trimmed); // optimistic — a field re-seed shows what was typed, instantly
      setError(null);
      try {
        await persist(trimmed, imageRef.current);
      } catch (e) {
        // Roll back only if no newer commit superseded this one while it was queued.
        if (nameRef.current === trimmed) {
          nameRef.current = prev;
          setName(prev);
        }
        setError(humanizeError(e, 'Could not save the space name.'));
      }
    },
    [session, space, isOwner, persist],
  );

  const pickImage = useCallback(async () => {
    if (!session || !space || !isOwner) return;
    setError(null);
    let uri: string | null = null;
    try {
      uri = await pickAndProcessAvatar();
    } catch (e) {
      setError(humanizeError(e, 'Could not use that image.'));
      return;
    }
    if (uri == null) return; // cancelled
    const prev = imageRef.current;
    mutated.current = true;
    imageRef.current = uri;
    setImage(uri);
    try {
      await persist(nameRef.current, uri);
    } catch (e) {
      if (imageRef.current === uri) {
        imageRef.current = prev;
        setImage(prev);
      }
      setError(humanizeError(e, 'Could not save the space image.'));
    }
  }, [session, space, isOwner, persist]);

  const removeImage = useCallback(async () => {
    if (!session || !space || !isOwner || imageRef.current == null) return;
    const prev = imageRef.current;
    mutated.current = true;
    imageRef.current = null;
    setImage(null);
    setError(null);
    try {
      await persist(nameRef.current, null);
    } catch (e) {
      if (imageRef.current == null) {
        imageRef.current = prev;
        setImage(prev);
      }
      setError(humanizeError(e, 'Could not remove the space image.'));
    }
  }, [session, space, isOwner, persist]);

  return {
    space,
    isOwner,
    loading,
    name,
    commitName,
    image,
    pickImage,
    removeImage,
    saving: pendingSaves > 0,
    error,
  };
}
