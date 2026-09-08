/**
 * Joins optional CSS Module and global class names into one attribute value.
 */

/** Class name that may be absent because a module lookup or condition produced nothing. */
export type ClassNameValue = string | false | null | undefined

/** Returns every provided class name that is present, separated by single spaces. */
export const cx = (...values: ClassNameValue[]): string =>
  values.filter((value): value is string => Boolean(value)).join(' ')
