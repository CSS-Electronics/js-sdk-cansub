/** Cached per definition: rows re-render at the batch rate, and the definitions are stable singletons. */
const titleCache = new WeakMap<object, string>();

/**
 * `title` for a decoded MESSAGE / SIGNAL cell: `name`, plus the DBC `CM_` description when set.
 * `owner` is the definition the text came from, used as the cache key.
 */
export function nameWithDescription(owner: object, name: string, description?: string): string {
  if (!description) return name;
  let title = titleCache.get(owner);
  if (title === undefined) {
    // UNMATCHED rows have an empty name; never emit a leading newline.
    title = name ? `${name}\n\n${description}` : description;
    titleCache.set(owner, title);
  }
  return title;
}
