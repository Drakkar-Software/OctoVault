/**
 * Viewer for file and image objects — the `editor:'file'` renderer.
 *
 * - If no blob is attached yet: shows an "Attach file"/"Attach image" CTA.
 * - For image objects: displays the decrypted image using expo-image.
 * - For file objects: shows metadata + a "Share / download" button.
 *
 * Decryption and share logic live in `use-object-blob` (design rule: logic in
 * src/lib) — this component is a pure rendering consumer.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { spacing } from '@/theme';
import { propsOf } from '@drakkar.software/octovault-sdk';
import { useSpaceObjects } from '@/lib/space-objects-context';
import { useObjectFiles } from '@/lib/use-object-files';
import { useObjectBlob } from '@/lib/use-object-blob';
import type { PropValue } from '@drakkar.software/octovault-sdk';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Txt } from '@/components/ui/Txt';

interface FileObjectViewProps {
  spaceId: string;
  objectId: string;
  onRenameTitle?: (text: string) => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileObjectView({ spaceId, objectId, onRenameTitle: _onRenameTitle }: FileObjectViewProps) {
  const { objects } = useSpaceObjects();
  const { attachBlob } = useObjectFiles(spaceId);
  const node = objects.get(objectId);
  const isImage = node?.type === 'image';

  const props = node ? propsOf(node) : {};
  const blobId = props['blobId'] as PropValue;
  const mime = (props['mime'] as string | undefined) ?? (isImage ? 'image/jpeg' : 'application/octet-stream');
  const name = (props['name'] as string | undefined) ?? (isImage ? 'image' : 'file');
  const size = props['size'] as number | undefined;

  const { dataUri, loading, error, share } = useObjectBlob(spaceId, node);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Txt variant="callout" tone="danger">{error}</Txt>
      </View>
    );
  }

  if (!blobId) {
    return (
      <EmptyState
        iconName={isImage ? 'image' : 'file'}
        title={isImage ? 'No image attached' : 'No file attached'}
        subtitle={isImage ? 'Attach an image to this object.' : 'Attach a file to this object.'}
      >
        <Button
          label={isImage ? 'Attach image' : 'Attach file'}
          variant="primary"
          iconName="plus"
          size="sm"
          onPress={() => void attachBlob(objectId, isImage)}
        />
      </EmptyState>
    );
  }

  if (isImage && dataUri) {
    return (
      <View style={styles.imageContainer}>
        <Image source={{ uri: dataUri }} style={styles.image} contentFit="contain" />
        <View style={styles.imageMeta}>
          <Txt variant="caption" tone="inkMuted">{name}{size != null ? ` · ${formatBytes(size)}` : ''}</Txt>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fileMeta}>
      <Txt variant="heading" weight="medium" numberOfLines={1}>{name}</Txt>
      {size != null ? <Txt variant="callout" tone="inkMuted">{formatBytes(size)}</Txt> : null}
      <Txt variant="caption" tone="inkFaint" mono>{mime}</Txt>
      <Button label="Share / download" variant="secondary" iconName="arrow-r" onPress={() => void share()} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  imageContainer: { flex: 1 },
  image: { flex: 1 },
  imageMeta: { padding: spacing.sm, alignItems: 'center' },
  fileMeta: { padding: spacing.lg, gap: spacing.md },
});
