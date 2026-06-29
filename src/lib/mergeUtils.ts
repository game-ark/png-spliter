import type { SpriteRect } from './types'
import { countContentPixels } from './imageUtils'
import { sortByProximity } from './spriteDetector'

export interface MergeResult {
  /** 合并后的新素材 */
  merged: SpriteRect
  /** 合并后剩余的全部素材（已重新排序、重新编号） */
  remaining: SpriteRect[]
}

/**
 * 合并多个素材为一个：取它们的最小外接矩形作为新包围盒，
 * 重算该区域内的非透明像素面积，从列表中移除被合并项并加入新项，
 * 最后按位置重新排序、重新编号。
 *
 * 返回 null 表示无法合并（少于 2 个有效项）。
 */
export function mergeRects(
  source: ImageData,
  rects: SpriteRect[],
  ids: number[],
  alphaThreshold: number,
): MergeResult | null {
  if (ids.length < 2) return null
  const idSet = new Set(ids)
  const selected = rects.filter((r) => idSet.has(r.index))
  if (selected.length < 2) return null

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of selected) {
    if (r.left < left) left = r.left
    if (r.top < top) top = r.top
    if (r.right > right) right = r.right
    if (r.bottom > bottom) bottom = r.bottom
  }

  const area = countContentPixels(
    source,
    { left, top, right, bottom },
    alphaThreshold,
  )

  const merged: SpriteRect = {
    index: 0,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    area,
  }

  const remaining = rects.filter((r) => !idSet.has(r.index))
  remaining.push(merged)
  sortByProximity(remaining)

  return { merged, remaining }
}
