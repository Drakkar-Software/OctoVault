/**
 * Maps a blob's MIME type (and optionally its filename extension) to a
 * render category for the AttachmentBlock inline renderer:
 *
 *  - 'image' → expo-image inline preview
 *  - 'code'  → capped source-code preview (TextDecoder + CodeChrome + Txt mono)
 *  - 'file'  → download/share chip (video, audio, PDFs, archives, unknown)
 */

/** Code-like MIME types that warrant an inline text preview. */
const CODE_MIMES = new Set([
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'text/typescript',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++src',
  'text/x-ruby',
  'text/x-rust',
  'text/x-go',
  'text/x-swift',
  'text/x-kotlin',
  'text/x-scala',
  'text/x-shellscript',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-shellscript',
  'application/graphql',
  'application/toml',
]);

/** File extensions that signal code/text when MIME is vague (e.g. octet-stream). */
const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'scala', 'cs',
  'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'fish',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'json', 'yaml', 'yml', 'toml', 'xml',
  'md', 'mdx', 'markdown', 'txt',
  'csv', 'sql', 'graphql', 'gql',
  'env', 'gitignore', 'dockerfile', 'makefile',
]);

export type AttachmentKind = 'image' | 'code' | 'file';

/**
 * Categorise an uploaded blob for the inline renderer.
 * @param mime   MIME type string from the blob/object props.
 * @param name   Filename (used as extension fallback when MIME is opaque).
 */
export function attachmentKind(mime: string, name?: string): AttachmentKind {
  const m = mime.trim().toLowerCase();

  if (m.startsWith('image/')) return 'image';

  // text/* is always code/text — including text/plain.
  if (m.startsWith('text/') || CODE_MIMES.has(m)) return 'code';

  // Opaque blob MIME — check extension
  if (name) {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (CODE_EXTS.has(ext)) return 'code';
  }

  return 'file';
}
