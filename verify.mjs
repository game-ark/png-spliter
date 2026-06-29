import { build } from 'esbuild'
import { writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'
import { resolve } from 'node:path'

const PROJECT = 'D:/MORE_TRY/GITHUB_WORK_SPACE/PNGSpliter'

// ---- 用 esbuild 加载真实的 detectSprites（不重复实现算法）----
const result = await build({
  stdin: {
    contents: `export { detectSprites } from './src/lib/spriteDetector.ts'`,
    resolveDir: PROJECT,
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
  mainFields: ['module'],
})
const code = result.outputFiles[0].text
const tmp = fileURLToPath(new URL('./.verify-tmp.mjs', import.meta.url))
writeFileSync(tmp, code)
const mod = await import(pathToFileURL(tmp).href + '?t=' + Date.now())
unlinkSync(tmp)
const { detectSprites } = mod

// ---- 最小 PNG 编码器（RGBA）----
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- 合成 sprite sheet：4 个不透明矩形，中间透明 ----
const W = 256
const H = 256
const data = new Uint8ClampedArray(W * H * 4) // 全 0 = 全透明
function fillRect(x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
}
const sheet = [
  { x0: 10, y0: 10, x1: 50, y1: 60, c: [255, 100, 100] },
  { x0: 100, y0: 20, x1: 160, y1: 80, c: [100, 255, 100] },
  { x0: 20, y0: 120, x1: 80, y1: 200, c: [100, 100, 255] },
  { x0: 150, y0: 150, x1: 220, y1: 230, c: [255, 255, 100] },
]
for (const s of sheet) fillRect(s.x0, s.y0, s.x1, s.y1, ...s.c)

// ---- 运行真实检测器 ----
const rects = detectSprites(
  { width: W, height: H, data },
  { alphaThreshold: 10, minArea: 16, padding: 0 },
)
console.log(`检测到 ${rects.length} 个素材：`)
for (const r of rects) {
  console.log(
    `  #${r.index} left=${r.left} top=${r.top} right=${r.right} bottom=${r.bottom}  ${r.width}x${r.height} area=${r.area}`,
  )
}

// ---- 断言 ----
const expected = [
  { left: 10, top: 10, right: 50, bottom: 60 },
  { left: 100, top: 20, right: 160, bottom: 80 },
  { left: 20, top: 120, right: 80, bottom: 200 },
  { left: 150, top: 150, right: 220, bottom: 230 },
]
let ok = rects.length === expected.length
for (let i = 0; i < expected.length && ok; i++) {
  const r = rects[i]
  const e = expected[i]
  if (r.left !== e.left || r.top !== e.top || r.right !== e.right || r.bottom !== e.bottom) ok = false
}
console.log(ok ? '\nPASS ✓ 分割结果与预期完全一致' : '\nFAIL ✗ 结果不符')

// ---- 输出测试 PNG ----
const png = encodePng(W, H, data)
const outPath = resolve(PROJECT, 'test-sprites.png')
writeFileSync(outPath, png)
console.log('测试 sprite sheet 已生成：', outPath)

process.exit(ok ? 0 : 1)
