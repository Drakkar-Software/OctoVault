/**
 * Hook for creating file/image objects by picking + uploading a blob.
 *
 * Handles: document picker → read bytes → encrypt + upload → create ObjectNode
 * with props {blobId, name, mime, size}. Returns an imperative API called from
 * event handlers, NOT during render (it's async).
 */
import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import type { ByteSealer } from '@drakkar.software/octovault-sdk';
import { uploadObjectBlob, MAX_OBJECT_BLOB_BYTES, FileTooLargeError, getSpaceClient, buildEncryptor, ownerTrustedAdders } from '@drakkar.software/octovault-sdk';
import type { Encryptor } from '@drakkar.software/starfish-client';
import { useSession } from './session-context';
import { useSpaceObjects } from './space-objects-context';
import type { ID } from '@drakkar.software/octovault-sdk';

export interface UseObjectFilesResult {
  /** Pick a document, upload it as a `file` object, return the created id (or null on cancel). */
  createFileObject: (opts?: { parentId?: ID }) => Promise<string | null>;
  /** Pick an image document, upload it as an `image` object, return the created id (or null on cancel). */
  createImageObject: (opts?: { parentId?: ID }) => Promise<string | null>;
  /** Update an existing file/image object's blob by picking a new file. */
  attachBlob: (objectId: string, asImage?: boolean) => Promise<void>;
}

export function useObjectFiles(spaceId: string): UseObjectFilesResult {
  const { session } = useSession();
  const { objects } = useSpaceObjects();

  const pickAndUpload = useCallback(async (mimeFilter: string[], asImage: boolean) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: mimeFilter,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    const uri = asset.uri;
    const name = asset.name ?? 'file';
    const mime = asset.mimeType ?? (asImage ? 'image/jpeg' : 'application/octet-stream');

    // Pre-upload size guard: check BEFORE reading bytes into memory.
    // DocumentPicker provides `size` when available (native); may be undefined on web.
    const knownSize = (asset as { size?: number }).size;
    if (knownSize !== undefined && knownSize > MAX_OBJECT_BLOB_BYTES) {
      throw new FileTooLargeError(knownSize, MAX_OBJECT_BLOB_BYTES);
    }

    const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
    // Secondary guard in case the picker didn't supply size (web fallback).
    if (bytes.length > MAX_OBJECT_BLOB_BYTES) {
      throw new FileTooLargeError(bytes.length, MAX_OBJECT_BLOB_BYTES);
    }

    if (!session) throw new Error('No active session');
    // Blobs are always space-keyring sealed; open the keyring directly.
    const blobClient = getSpaceClient(spaceId, session);
    const blobEnc = await buildEncryptor(blobClient, session.keys, spaceId, ownerTrustedAdders(session));
    if (!blobEnc) throw new Error(`[octovault] no space keyring for ${spaceId}`);
    const enc = blobEnc as unknown as ByteSealer;

    const ref = await uploadObjectBlob(blobClient, enc, spaceId, bytes, name, mime);
    return { ...ref, asImage };
  }, [session, spaceId]);

  /** Swallow cancellation silently; re-throw real errors (FileTooLargeError, network, etc.). */
  const pickAndUploadOrNull = useCallback(async (mimeFilter: string[], asImage: boolean) => {
    try {
      return await pickAndUpload(mimeFilter, asImage);
    } catch (err) {
      // The picker was cancelled — DocumentPicker throws an AbortError or returns
      // canceled:true; we return null for that case. Everything else propagates.
      if (err instanceof Error && err.name === 'AbortError') return null;
      throw err;
    }
  }, [pickAndUpload]);

  const createFileObject = useCallback(async (opts?: { parentId?: ID }): Promise<string | null> => {
    const uploaded = await pickAndUploadOrNull(['*/*'], false);
    if (!uploaded) return null;
    const id = objects.create({
      type: 'file',
      title: uploaded.name,
      parentId: opts?.parentId,
      meta: { props: { blobId: uploaded.blobId, name: uploaded.name, mime: uploaded.mime, size: uploaded.size } },
    });
    return id ?? null;
  }, [pickAndUploadOrNull, objects]);

  const createImageObject = useCallback(async (opts?: { parentId?: ID }): Promise<string | null> => {
    const uploaded = await pickAndUploadOrNull(['image/*'], true);
    if (!uploaded) return null;
    const id = objects.create({
      type: 'image',
      title: uploaded.name,
      parentId: opts?.parentId,
      meta: { props: { blobId: uploaded.blobId, name: uploaded.name, mime: uploaded.mime, size: uploaded.size } },
    });
    return id ?? null;
  }, [pickAndUploadOrNull, objects]);

  const attachBlob = useCallback(async (objectId: string, asImage = false): Promise<void> => {
    const uploaded = await pickAndUploadOrNull(asImage ? ['image/*'] : ['*/*'], asImage);
    if (!uploaded) return;
    objects.setProps(objectId, { blobId: uploaded.blobId, name: uploaded.name, mime: uploaded.mime, size: uploaded.size });
  }, [pickAndUploadOrNull, objects]);

  return { createFileObject, createImageObject, attachBlob };
}
