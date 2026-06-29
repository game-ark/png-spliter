import { build } from 'esbuild'
import { writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const PROJECT = 'D:/MORE_TRY/GITHUB_WORK_SPACE/PNGSpliter'

// ---- 用 esbuild 加载真实的 detectSprites + mergeRects ----
const result = await build({
  stdin: {
    contents: `export { detectSprites } from './src/lib/spriteDetector.ts'; export { mergeRects } from './src/lib/mergeUtils.ts'`,
    resolveDir: PROJECT,
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
})
const code = result.outputFiles[0].text
const tmp = fileURLToPath(new URL('./.verify-merge-tmp.mjs', import.meta.url))
writeFileSync(tmp, code)
const mod = await import(pathToFileURL(tmp).href + '?t=' + Date.now())
unlinkSync(tmp)
const { detectSprites, mergeRects } = mod

// ---- 合成 sprite sheet：两个本应一体但被透明缝切开的块 + 一个独立块 ----
const W = 200
const H = 200
const data = new Uint8ClampedArray(W * H * 4) // 全透明
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
// A: 20,20 -> 50,80 (30x60)；B: 60,20 -> 90,80 (30x60)，中间 x=50..60 透明
fillRect(20, 20, 50, 80, 255, 80, 80)
fillRect(60, 20, 90, 80, 255, 80, 80)
// C: 独立块 120,120 -> 180,180 (60x60)
fillRect(120, 120, 180, 180, 80, 160, 255)

const imageData = { width: W, height: H, data }
const opts = { alphaThreshold: 10, minArea: 16, padding: 0 }

// 1) 检测：应为 3 个（A、B 因透明缝分离）
const rects = detectSprites(imageData, opts)
console.log(`检测到 ${rects.length} 个素材（期望 3，A/B 被透明缝分离）：`)
for (const r of rects) {
  console.log(`  #${r.index} L=${r.left} T=${r.top} R=${r.right} B=${r.bottom} ${r.width}x${r.height} area=${r.area}`)
}

// 2) 合并 A、B（索引 0 和 1）
const mergeRes = mergeRects(imageData, rects, [0, 1], opts.alphaThreshold)
if (!mergeRes) {
  console.log('\nFAIL ✗ mergeRects 返回 null')
  process.exit(1)
}
const m = mergeRes.merged
console.log(`\n合并 #0+#1 后：`)
console.log(`  merged L=${m.left} T=${m.top} R=${m.right} B=${m.bottom} ${m.width}x${m.height} area=${m.area}`)
console.log(`  remaining 共 ${mergeRes.remaining.length} 个（期望 2）`)
for (const r of mergeRes.remaining) {
  console.log(`  #${r.index} L=${r.left} T=${r.top} R=${r.right} B=${r.bottom}`)
}

// 3) 断言
let ok = true
if (rects.length !== 3) ok = false
if (mergeRes.remaining.length !== 2) ok = false
const exp = { left: 20, top: 20, right: 90, bottom: 80, width: 70, height: 60, area: 3600 }
if (
  m.left !== exp.left ||
  m.top !== exp.top ||
  m.right !== exp.right ||
  m.bottom !== exp.bottom ||
  m.width !== exp.width ||
  m.height !== exp.height ||
  m.area !== exp.area
) {
  ok = false
  console.log(`\n期望 merged: L=${exp.left} T=${exp.top} R=${exp.right} B=${exp.bottom} ${exp.width}x${exp.height} area=${exp.area}`)
}
// 合并项应排在前面（top=20 < C 的 top=120）
if (mergeRes.remaining[0].index !== 0 || mergeRes.remaining[0].top !== 20) ok = false
if (mergeRes.remaining[1].index !== 1 || mergeRes.remaining[1].top !== 120) ok = false

console.log(ok ? '\nPASS ✓ 合并包围盒与面积计算正确，编号已重排' : '\nFAIL ✗')
process.exit(ok ? 0 : 1)
