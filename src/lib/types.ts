export interface SpriteRect {
  /** 素材序号（按位置排序后） */
  index: number
  /** 左边缘（含） */
  left: number
  /** 上边缘（含） */
  top: number
  /** 右边缘（不含，用于裁剪；显示时用 right-1） */
  right: number
  /** 下边缘（不含，用于裁剪；显示时用 bottom-1） */
  bottom: number
  width: number
  height: number
  /** 该连通域的像素面积 */
  area: number
}

export interface DetectOptions {
  /** alpha 通道大于该值视为内容像素（0-255） */
  alphaThreshold: number
  /** 小于此面积的连通域视为噪点丢弃 */
  minArea: number
  /** bounding box 向外扩展的像素 */
  padding: number
}

export const DEFAULT_OPTIONS: DetectOptions = {
  alphaThreshold: 10,
  minArea: 16,
  padding: 0,
}

/** 导出尺寸配置：固定画布尺寸，素材等比缩放居中放置；0 表示按原尺寸导出 */
export interface ExportOptions {
  fixedWidth: number
  fixedHeight: number
}

export const DEFAULT_EXPORT: ExportOptions = {
  fixedWidth: 0,
  fixedHeight: 0,
}

/** 是否启用了固定导出尺寸 */
export function hasFixedExport(opts: ExportOptions): boolean {
  return opts.fixedWidth > 0 && opts.fixedHeight > 0
}
