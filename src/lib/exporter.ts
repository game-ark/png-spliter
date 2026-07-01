import JSZip from 'jszip'
import type { SpriteRect, ExportOptions } from './types'
import { hasFixedExport } from './types'
import { imageDataToCanvas } from './imageUtils'

/** 触发浏览器下载一个 Blob */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 把指定矩形区域从源 ImageData 裁剪到新 canvas 并返回。
 * 若设置了固定导出尺寸：素材等比缩放（contain）后居中放置到固定尺寸的透明画布上，
 * 不会裁切素材内容。
 */
function cropToCanvas(
  srcCanvas: HTMLCanvasElement,
  rect: SpriteRect,
  exportOpts?: ExportOptions,
): HTMLCanvasElement {
  // 启用固定导出尺寸：等比缩放居中
  if (exportOpts && hasFixedExport(exportOpts)) {
    const tw = exportOpts.fixedWidth
    const th = exportOpts.fixedHeight
    const c = document.createElement('canvas')
    c.width = tw
    c.height = th
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('无法获取 2D 上下文')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // contain：取较小缩放比，保证完整放入
    const scale = Math.min(tw / rect.width, th / rect.height)
    const dw = rect.width * scale
    const dh = rect.height * scale
    const dx = (tw - dw) / 2
    const dy = (th - dh) / 2
    ctx.drawImage(
      srcCanvas,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      dx,
      dy,
      dw,
      dh,
    )
    return c
  }

  // 原尺寸裁剪
  const c = document.createElement('canvas')
  c.width = rect.width
  c.height = rect.height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('无法获取 2D 上下文')
  ctx.drawImage(
    srcCanvas,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  )
  return c
}

/** canvas 转 PNG Blob */
function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob 失败'))),
      'image/png',
    )
  })
}

function safeName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .trim() || 'image'
  )
}

/**
 * 生成素材文件名：sprite_000_64x48.png
 * 启用固定导出尺寸时用导出尺寸，否则用素材原尺寸。
 */
export function spriteFileName(
  r: SpriteRect,
  exportOpts?: ExportOptions,
): string {
  const w =
    exportOpts && hasFixedExport(exportOpts) ? exportOpts.fixedWidth : r.width
  const h =
    exportOpts && hasFixedExport(exportOpts) ? exportOpts.fixedHeight : r.height
  return `sprite_${String(r.index).padStart(3, '0')}_${w}x${h}.png`
}

/** 导出单个素材为 PNG */
export async function exportSingle(
  source: ImageData,
  rect: SpriteRect,
  exportOpts?: ExportOptions,
  filenamePrefix?: string,
): Promise<void> {
  const src = imageDataToCanvas(source)
  const c = cropToCanvas(src, rect, exportOpts)
  const blob = await canvasToBlob(c)
  const filename = filenamePrefix
    ? `${safeName(filenamePrefix)}_${spriteFileName(rect, exportOpts)}`
    : spriteFileName(rect, exportOpts)
  downloadBlob(blob, filename)
}

/**
 * 将所有素材打包为 ZIP 下载。
 * @param onProgress 进度回调 (已完成, 总数)
 */
export async function exportAllZip(
  source: ImageData,
  rects: SpriteRect[],
  exportOpts?: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip()
  const src = imageDataToCanvas(source)
  let done = 0
  for (const r of rects) {
    const c = cropToCanvas(src, r, exportOpts)
    const blob = await canvasToBlob(c)
    zip.file(spriteFileName(r, exportOpts), blob)
    done++
    onProgress?.(done, rects.length)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `pngspliter_${Date.now()}.zip`)
}

export interface ZipImageGroup {
  source: ImageData
  rects: SpriteRect[]
}

/** 将多张图片的全部素材平铺打包为 ZIP。 */
export async function exportManyZip(
  groups: ZipImageGroup[],
  exportOpts?: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip()
  const total = groups.reduce((sum, group) => sum + group.rects.length, 0)
  let done = 0

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    if (group.rects.length === 0) continue
    const src = imageDataToCanvas(group.source)
    const imagePrefix = `image_${String(i + 1).padStart(3, '0')}`

    for (const r of group.rects) {
      const c = cropToCanvas(src, r, exportOpts)
      const blob = await canvasToBlob(c)
      zip.file(`${imagePrefix}_${spriteFileName(r, exportOpts)}`, blob)
      done++
      onProgress?.(done, total)
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `pngspliter_${Date.now()}.zip`)
}
