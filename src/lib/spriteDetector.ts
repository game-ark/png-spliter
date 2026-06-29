import type { DetectOptions, SpriteRect } from './types'

/**
 * 基于透明像素的连通域检测，分离 PNG 素材。
 *
 * 使用显式栈 BFS 进行连通域填充，避免递归在大图上爆栈。
 * 每个连通域即为一个素材，同时计算其 bounding box（上下左右边缘）。
 *
 * right/bottom 为「不含」边界，便于直接用于裁剪；显示时用 right-1 / bottom-1。
 */
export function detectSprites(
  imageData: ImageData,
  options: DetectOptions,
): SpriteRect[] {
  const { width: w, height: h, data } = imageData
  const { alphaThreshold, minArea, padding } = options

  const total = w * h
  const visited = new Uint8Array(total)
  // 预分配栈：最坏情况下每个内容像素入栈一次，用 Uint32Array 存像素索引
  const stack = new Uint32Array(total)
  let stackPtr = 0

  // alpha > 阈值 视为内容
  const isContent = (x: number, y: number): boolean => {
    const idx = (y * w + x) << 2
    return data[idx + 3] > alphaThreshold
  }

  // 4 连通邻域偏移（上、右、下、左）
  const offsets = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]

  const results: SpriteRect[] = []

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (visited[p] || !isContent(x, y)) continue

      // 开始一个新连通域的 BFS
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      let area = 0

      stackPtr = 0
      stack[stackPtr++] = p
      visited[p] = 1

      while (stackPtr > 0) {
        const cur = stack[--stackPtr]
        const cx = cur % w
        const cy = (cur - cx) / w
        area++

        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy

        for (let k = 0; k < offsets.length; k++) {
          const nx = cx + offsets[k][0]
          const ny = cy + offsets[k][1]
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const np = ny * w + nx
          if (visited[np]) continue
          if (!isContent(nx, ny)) continue
          visited[np] = 1
          stack[stackPtr++] = np
        }
      }

      // 过滤噪点
      if (area < minArea) continue

      // 加 padding 并夹紧到图片边界
      let left = Math.max(0, minX - padding)
      let top = Math.max(0, minY - padding)
      let right = Math.min(w, maxX + padding + 1) // 不含
      let bottom = Math.min(h, maxY + padding + 1) // 不含

      results.push({
        index: 0, // 排序后统一赋值
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        area,
      })
    }
  }

  // 按空间邻近度排序：被透明缝切开的同一素材会相邻，便于合并
  return sortByProximity(results)
}

/**
 * 两个轴对齐矩形之间的最小欧氏距离（边到边）。
 * 相交/相邻（边贴合）时为 0。
 */
function rectDistance(a: SpriteRect, b: SpriteRect): number {
  // x 方向间隙：若水平重叠则为 0
  const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right))
  // y 方向间隙：若垂直重叠则为 0
  const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
  return Math.hypot(dx, dy)
}

/**
 * 最近邻链排序：从最左上角的素材出发，每次把距离当前链尾最近的素材接在后面。
 * 这样空间上相邻的素材在列表里也相邻——被透明缝切开的同一素材会排在一起，
 * 方便连续点选合并。O(n²)，对几百个素材足够。
 *
 * 原地排序（类似 Array.sort）：重排输入数组元素并重新编号，同时返回该数组。
 */
export function sortByProximity(rects: SpriteRect[]): SpriteRect[] {
  const n = rects.length
  if (n <= 1) {
    if (n === 1) rects[0].index = 0
    return rects
  }

  // 起点：top 最小，相同则 left 最小（保持从左上开始的直觉）
  let start = 0
  for (let i = 1; i < n; i++) {
    if (
      rects[i].top < rects[start].top ||
      (rects[i].top === rects[start].top && rects[i].left < rects[start].left)
    ) {
      start = i
    }
  }

  const used = new Uint8Array(n)
  used[start] = 1
  // 记录最近邻访问顺序的下标
  const order: number[] = [start]
  let cur = rects[start]

  for (let k = 1; k < n; k++) {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      const d = rectDistance(cur, rects[i])
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    used[best] = 1
    order.push(best)
    cur = rects[best]
  }

  // 按邻近顺序原地重排并重新编号
  const snapshot = rects.slice()
  for (let i = 0; i < n; i++) {
    rects[i] = snapshot[order[i]]
    rects[i].index = i
  }
  return rects
}
