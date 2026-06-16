/** Derive the sibling WAL doc id for a page's per-block comments.
 *  Uses `__` (double-underscore) — identical to the `__snapshot` sibling convention
 *  and accepted by the server's SAFE_PARAM charset (`^[a-zA-Z0-9._:@-]+$`). */
export const commentsDocId = (pageId: string) => `${pageId}__comments`;

/** Local read-mark KV key for a (page, block) pair. Not a server path, but uses the
 *  same safe charset to avoid any future confusion. */
export const readKey = (pageId: string, blockId: string) => `${pageId}__comments__${blockId}`;
