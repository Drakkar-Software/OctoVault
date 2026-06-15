/** Pure helpers for the AttachmentBlock renderer. Extracted for testability. */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compute explicit pixel dimensions for an inline image preview.
 *
 * Returns null until both the intrinsic size (from onLoad) and the measured
 * column width (from onLayout, filtered to reject premature width=0 values)
 * are known. Explicit pixel sizing is used instead of CSS maxWidth because
 * Yoga on native doesn't reliably apply maxWidth on stretched flex children.
 *
 * Scale is capped at 1 — a small image is never upscaled.
 */
export function computeInlineImageSize(
  natural: { w: number; h: number } | null,
  boxWidth: number | null,
  maxHeight: number,
): { width: number; height: number } | null {
  if (!natural || !boxWidth) return null;
  const scale = Math.min(1, boxWidth / natural.w, maxHeight / natural.h);
  return { width: Math.round(natural.w * scale), height: Math.round(natural.h * scale) };
}
