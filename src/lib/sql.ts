/**
 * Helpers for building LanceDB/Datafusion filter predicates safely.
 * Always route user-supplied values through these — never interpolate raw
 * strings into a predicate (that's the bug that wiped the table once).
 */

/** Quote a value as a SQL string literal, escaping embedded single quotes. */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Predicate matching rows whose `tags` list contains any of the given tags. */
export function tagFilter(tags: string[]): string {
  const list = tags.map(sqlString).join(", ");
  return `array_has_any(tags, [${list}])`;
}

/** Combine non-empty predicates with AND. */
export function andWhere(...clauses: (string | undefined | null | false)[]): string | undefined {
  const parts = clauses.filter((c): c is string => typeof c === "string" && c.length > 0);
  return parts.length ? parts.map((c) => `(${c})`).join(" AND ") : undefined;
}

/** Parse a comma-separated tag string into trimmed, non-empty tags. */
export function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
