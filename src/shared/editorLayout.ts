// Split tree of the editor groups: the leaves are groups and each inner node divides its space in a row (`row`, side
// by side) or column (`column`, stacked) with fractions that add up to 1. Pure and generic on the leaf: the renderer
// uses group ids, the session uses indices (and main validates it with `parseLayout`).
import { isFiniteNumber, isRecord } from './guards'

/** Each group keeps a live EditorView and the focus shortcuts reach the 1st to the 8th: 8 covers real use amply. */
export const MAX_EDITOR_GROUPS = 8
/** Minimum fraction of a child in its split: dragging the divider never makes a group disappear. */
const MIN_SPLIT_SIZE = 0.05

type SplitDirection = 'row' | 'column'
/** Side of a group: where to split, where to move focus. */
export type GroupSide = 'left' | 'right' | 'up' | 'down'

interface LayoutLeaf<T> {
  group: T
}

interface LayoutSplit<T> {
  direction: SplitDirection
  children: LayoutNode<T>[]
  /** Fraction of each child (same order as `children`), adding up to 1. */
  sizes: number[]
}

export type LayoutNode<T> = LayoutLeaf<T> | LayoutSplit<T>

/** Rectangle in fractions of the editor area (0–1). */
export interface LayoutRect {
  x: number
  y: number
  w: number
  h: number
}

/** A draggable divider between children `index` and `index + 1` of the split at `path`. */
export interface LayoutSash {
  /** Child indices from the root to the split. */
  path: number[]
  index: number
  direction: SplitDirection
  /** Divider position on the split axis (x in `row`, y in `column`). */
  at: number
  /** Start and length on the cross axis. */
  from: number
  length: number
  /** Size of the split on its axis: converts the drag in pixels into a fraction. */
  extent: number
}

const EPSILON = 1e-6

const isLeaf = <T>(node: LayoutNode<T>): node is LayoutLeaf<T> => 'group' in node

const sideDirection = (side: GroupSide): SplitDirection => (side === 'left' || side === 'right' ? 'row' : 'column')

const isBefore = (side: GroupSide): boolean => side === 'left' || side === 'up'

/** Groups in reading order (left → right, top → bottom, depth first). */
export function layoutGroups<T>(node: LayoutNode<T>): T[] {
  return isLeaf(node) ? [node.group] : node.children.flatMap((child) => layoutGroups(child))
}

function normalizeSizes(sizes: readonly number[], count: number): number[] {
  const valid = sizes.length === count && sizes.every((s) => isFiniteNumber(s) && s > 0)
  if (!valid) return Array.from({ length: count }, () => 1 / count)
  const total = sizes.reduce((a, b) => a + b, 0)
  return sizes.map((s) => s / total)
}

/** Builds a split: a single child becomes the child itself and a child splitting in the same direction is flattened. */
function makeSplit<T>(direction: SplitDirection, children: LayoutNode<T>[], sizes: number[]): LayoutNode<T> | null {
  const [first] = children
  if (!first) return null
  if (children.length === 1) return first
  const normalized = normalizeSizes(sizes, children.length)
  const flatChildren: LayoutNode<T>[] = []
  const flatSizes: number[] = []
  children.forEach((child, i) => {
    const size = normalized[i] ?? 0
    if (!isLeaf(child) && child.direction === direction) {
      const inner = normalizeSizes(child.sizes, child.children.length)
      child.children.forEach((c, j) => {
        flatChildren.push(c)
        flatSizes.push(size * (inner[j] ?? 0))
      })
    } else {
      flatChildren.push(child)
      flatSizes.push(size)
    }
  })
  return { direction, children: flatChildren, sizes: normalizeSizes(flatSizes, flatChildren.length) }
}

/** Row split with the given groups (invalid fractions become equal parts). */
export function rowLayout<T>(groups: readonly T[], sizes: readonly number[] = []): LayoutNode<T> | null {
  return makeSplit(
    'row',
    groups.map((group) => ({ group })),
    [...sizes]
  )
}

/**
 * Replaces each group with `fn(group)`; `null` removes it. The space of whoever leaves goes to the siblings
 * (proportionally) and the splits left with a single child disappear. `null` if no group is left.
 */
export function mapLayout<T, U>(node: LayoutNode<T>, fn: (group: T) => U | null): LayoutNode<U> | null {
  if (isLeaf(node)) {
    const group = fn(node.group)
    return group === null ? null : { group }
  }
  const children: LayoutNode<U>[] = []
  const sizes: number[] = []
  node.children.forEach((child, i) => {
    const mapped = mapLayout(child, fn)
    if (!mapped) return
    children.push(mapped)
    sizes.push(node.sizes[i] ?? 0)
  })
  return makeSplit(node.direction, children, sizes)
}

/** Splits group `target` on side `side`, putting `added` there; both get half of the space `target` had. */
export function splitLayout<T>(node: LayoutNode<T>, target: T, added: T, side: GroupSide): LayoutNode<T> {
  const direction = sideDirection(side)
  const pair = (leaf: LayoutNode<T>): LayoutNode<T>[] =>
    isBefore(side) ? [{ group: added }, leaf] : [leaf, { group: added }]
  const visit = (n: LayoutNode<T>): LayoutNode<T> => {
    if (isLeaf(n)) return n.group === target ? { direction, children: pair(n), sizes: [0.5, 0.5] } : n
    const at = n.children.findIndex((c) => isLeaf(c) && c.group === target)
    const leaf = n.children[at]
    if (leaf && n.direction === direction) {
      const half = (n.sizes[at] ?? 0) / 2
      return {
        direction,
        children: [...n.children.slice(0, at), ...pair(leaf), ...n.children.slice(at + 1)],
        sizes: [...n.sizes.slice(0, at), half, half, ...n.sizes.slice(at + 1)]
      }
    }
    return { ...n, children: n.children.map(visit) }
  }
  return visit(node)
}

/** Moves the divider between children `index` and `index + 1` of the split at `path` by `delta` (split fraction). */
export function resizeLayout<T>(
  node: LayoutNode<T>,
  path: readonly number[],
  index: number,
  delta: number
): LayoutNode<T> {
  if (isLeaf(node) || !isFiniteNumber(delta)) return node
  const [head, ...rest] = path
  if (head !== undefined) {
    const child = node.children[head]
    if (!child) return node
    const next = resizeLayout(child, rest, index, delta)
    return next === child ? node : { ...node, children: node.children.map((c, i) => (i === head ? next : c)) }
  }
  const a = node.sizes[index]
  const b = node.sizes[index + 1]
  if (a === undefined || b === undefined) return node
  const pair = a + b
  const min = Math.min(MIN_SPLIT_SIZE, pair / 2)
  const nextA = Math.min(Math.max(a + delta, min), pair - min)
  if (Math.abs(nextA - a) < EPSILON) return node
  const sizes = node.sizes.map((s, i) => (i === index ? nextA : i === index + 1 ? pair - nextA : s))
  return { ...node, sizes }
}

/** Rectangle of each group, in fractions of the area. */
export function layoutRects<T>(
  node: LayoutNode<T>,
  rect: LayoutRect = { x: 0, y: 0, w: 1, h: 1 }
): { group: T; rect: LayoutRect }[] {
  if (isLeaf(node)) return [{ group: node.group, rect }]
  let offset = 0
  return node.children.flatMap((child, i) => {
    const size = node.sizes[i] ?? 0
    const inner =
      node.direction === 'row'
        ? { x: rect.x + offset * rect.w, y: rect.y, w: size * rect.w, h: rect.h }
        : { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: size * rect.h }
    offset += size
    return layoutRects(child, inner)
  })
}

/** The dividers of all splits, to draw and drag. */
export function layoutSashes<T>(
  node: LayoutNode<T>,
  rect: LayoutRect = { x: 0, y: 0, w: 1, h: 1 },
  path: number[] = []
): LayoutSash[] {
  if (isLeaf(node)) return []
  const row = node.direction === 'row'
  const sashes: LayoutSash[] = []
  let offset = 0
  node.children.forEach((child, i) => {
    const size = node.sizes[i] ?? 0
    const inner = row
      ? { x: rect.x + offset * rect.w, y: rect.y, w: size * rect.w, h: rect.h }
      : { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: size * rect.h }
    offset += size
    if (i < node.children.length - 1)
      sashes.push({
        path,
        index: i,
        direction: node.direction,
        at: row ? rect.x + offset * rect.w : rect.y + offset * rect.h,
        from: row ? rect.y : rect.x,
        length: row ? rect.h : rect.w,
        extent: row ? rect.w : rect.h
      })
    sashes.push(...layoutSashes(child, inner, [...path, i]))
  })
  return sashes
}

const overlap = (a: number, aLen: number, b: number, bLen: number): number =>
  Math.min(a + aLen, b + bLen) - Math.max(a, b)

/** Neighbor group on side `side` (the one touching `from` the most), or `undefined` if `from` is on the edge. */
export function neighborGroup<T>(node: LayoutNode<T>, from: T, side: GroupSide): T | undefined {
  const rects = layoutRects(node)
  const me = rects.find((r) => r.group === from)?.rect
  if (!me) return undefined
  const near = (a: number, b: number): boolean => Math.abs(a - b) < EPSILON
  let best: T | undefined
  let bestOverlap = EPSILON
  for (const { group, rect } of rects) {
    if (group === from) continue
    const touches =
      side === 'left'
        ? near(rect.x + rect.w, me.x)
        : side === 'right'
          ? near(rect.x, me.x + me.w)
          : side === 'up'
            ? near(rect.y + rect.h, me.y)
            : near(rect.y, me.y + me.h)
    if (!touches) continue
    const shared =
      sideDirection(side) === 'row' ? overlap(me.y, me.h, rect.y, rect.h) : overlap(me.x, me.w, rect.x, rect.w)
    if (shared > bestOverlap) {
      best = group
      bestOverlap = shared
    }
  }
  return best
}

/**
 * Fits the tree to the existing groups: removes the leaves not in `groups` (or repeated) and appends the missing ones
 * on the right. Already consistent, it returns the same reference.
 */
export function reconcileLayout<T>(node: LayoutNode<T> | null | undefined, groups: readonly T[]): LayoutNode<T> {
  const leaves = node ? layoutGroups(node) : []
  const wanted = new Set(groups)
  if (
    node &&
    leaves.length === groups.length &&
    new Set(leaves).size === leaves.length &&
    leaves.every((g) => wanted.has(g))
  )
    return node
  const seen = new Set<T>()
  let next = node
    ? mapLayout(node, (g) => {
        if (!wanted.has(g) || seen.has(g)) return null
        seen.add(g)
        return g
      })
    : null
  for (const group of groups) {
    if (seen.has(group)) continue
    seen.add(group)
    if (!next) {
      next = { group }
      continue
    }
    const count = !isLeaf(next) && next.direction === 'row' ? next.children.length : 1
    next = makeSplit('row', [next, { group }], [count, 1]) ?? next
  }
  // `groups` is never empty for callers (the editor always has a group); without groups, the original tree stays.
  return next ?? node ?? { group: groups[0] as T }
}

/**
 * Validates a tree coming from disk (untrusted): each leaf is an integer index in `[0, groupCount)`, without
 * repetition; invalid leaves disappear and invalid fractions become equal parts. `null` if no tree is left.
 */
export function parseLayout(value: unknown, groupCount: number): LayoutNode<number> | null {
  const seen = new Set<number>()
  const visit = (raw: unknown, depth: number): LayoutNode<number> | null => {
    if (!isRecord(raw) || depth > MAX_EDITOR_GROUPS) return null
    if ('group' in raw) {
      const group = raw.group
      if (typeof group !== 'number' || !Number.isInteger(group) || group < 0 || group >= groupCount || seen.has(group))
        return null
      seen.add(group)
      return { group }
    }
    if ((raw.direction !== 'row' && raw.direction !== 'column') || !Array.isArray(raw.children)) return null
    const rawSizes: unknown[] = Array.isArray(raw.sizes) ? raw.sizes : []
    const children: LayoutNode<number>[] = []
    const sizes: number[] = []
    raw.children.slice(0, MAX_EDITOR_GROUPS).forEach((child: unknown, i) => {
      const parsed = visit(child, depth + 1)
      if (!parsed) return
      children.push(parsed)
      const size = rawSizes[i]
      sizes.push(isFiniteNumber(size) && size > 0 ? size : NaN)
    })
    return makeSplit(raw.direction, children, sizes)
  }
  return visit(value, 0)
}
