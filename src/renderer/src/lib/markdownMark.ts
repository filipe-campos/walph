import { Tag } from '@lezer/highlight'

/**
 * Markdown markers (`#`, `*`, `>`, `-`, backticks…): their own tag so `#include`/`<?xml` of other languages are not
 * recolored.
 */
export const markdownMark = Tag.define('markdownMark')
