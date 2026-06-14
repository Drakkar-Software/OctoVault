/**
 * Shared hook for decrypting an object blob and sharing/downloading it.
 *
 * Extracted from FileObjectView so both the full-page viewer AND the inline
 * AttachmentBlock renderer share a single implementation (design rule: logic
 * in src/lib, not in components). Builds a base64 data-URI for images so they
 * can be rendered by expo-image without an extra file-system step.
 */
import { useCallback, useEffect, useState } from 'react';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ByteSealer, ObjectNode } from '@drakkar.software/octovault-sdk';
import { loadObjectBlob, propsOf, getSpaceClient, buildEncryptor, keyringPull, ownerTrustedAdders } from '@drakkar.software/octovault-sdk';
import { useSession } from './session-context';

export interface ObjectBlobState {
  bytes: Uint8Array | null;
  /** `data:${mime};base64,…` — only built when `mime` starts with `image/`. */
  dataUri: string | null;
  loading: boolean;
  error: string | null;
  /** Write bytes to the cache dir and invoke the platform share sheet. */
  share: () => Promise<void>;
}

export function useObjectBlob(spaceId: string, node: ObjectNode | undefined): ObjectBlobState {
  const { session } = useSession();

  const props = node ? propsOf(node) : {};
  const blobId = props['blobId'] as string | undefined;
  const mime = (props['mime'] as string | undefined) ?? 'application/octet-stream';
  const name = (props['name'] as string | undefined) ?? 'file';
  const isImage = mime.startsWith('image/');

  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!blobId || !session) {
      setBytes(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const blobClient = getSpaceClient(spaceId, session);
        const blobEnc = await buildEncryptor(blobClient, session.keys, keyringPull(spaceId), ownerTrustedAdders(session));
        if (!blobEnc) throw new Error(`[octovault] no space keyring for ${spaceId}`);
        const enc = blobEnc as unknown as ByteSealer;
        const data = await loadObjectBlob(blobClient, enc, spaceId, blobId);
        if (!cancelled) setBytes(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load file');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [blobId, spaceId, session]);

  const dataUri = bytes && isImage
    ? `data:${mime};base64,${btoa(String.fromCharCode(...bytes))}`
    : null;

  const share = useCallback(async () => {
    if (!bytes) return;
    const cacheFile = new FSFile(Paths.cache, name);
    cacheFile.write(bytes);
    await Sharing.shareAsync(cacheFile.uri, { mimeType: mime, dialogTitle: name });
  }, [bytes, name, mime]);

  return { bytes, dataUri, loading, error, share };
}
