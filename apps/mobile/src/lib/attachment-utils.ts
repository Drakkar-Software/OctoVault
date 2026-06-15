/** Pure helpers for the AttachmentBlock renderer. Extracted for testability. */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns React Native style constraints for an inline image preview.
 *
 * Principles:
 * - Before intrinsic size is known (natural === null): full-width placeholder.
 * - After onLoad: `width: '100%'` fills the container (which is already capped
 *   to the image's natural width via maxWidth on the container), so the image
 *   never upscales. `aspectRatio` + `maxHeight` handle tall portraits.
 */
export function inlineImageConstraints(
  natural: { w: number; h: number } | null,
  maxHeight: number,
  minHeight: number,
): { width: '100%'; maxWidth?: number; aspectRatio?: number; maxHeight?: number; height?: number } {
  if (!natural) return { width: '100%', height: minHeight };
  return {
    width: '100%',
    maxWidth: natural.w,
    aspectRatio: natural.w / natural.h,
    maxHeight,
  };
}
