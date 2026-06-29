/**
 * 加载 PNG 文件为 HTMLImageElement。
 * 加载完成后立即释放对象 URL，避免内存泄漏。
 */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败，请确认是有效的 PNG 文件'))
    }
    img.src = url
  })
}

/**
 * 将 HTMLImageElement 绘制到离屏 canvas 并取出 ImageData。
 */
export function imageToImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法获取 2D 上下文')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * 用 ImageData 创建一个可复用的源 canvas（供裁剪 drawImage 使用）。
 */
export function imageDataToCanvas(source: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = source.width
  c.height = source.height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('无法获取 2D 上下文')
  ctx.putImageData(source, 0, 0)
  return c
}

/**
 * 统计指定矩形区域内 alpha > alphaThreshold 的像素数。
 * 合并多个素材后用于重算合并区域的实际内容面积。
 */
export function countContentPixels(
  source: ImageData,
  rect: { left: number; top: number; right: number; bottom: number },
  alphaThreshold: number,
): number {
  const { width: w, data } = source
  let count = 0
  for (let y = rect.top; y < rect.bottom; y++) {
    const rowStart = (y * w + rect.left) << 2
    const rowEnd = (y * w + rect.right) << 2
    for (let i = rowStart + 3; i < rowEnd; i += 4) {
      if (data[i] > alphaThreshold) count++
    }
  }
  return count
}
