<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { SpriteRect } from '../lib/types'
import { imageDataToCanvas } from '../lib/imageUtils'

const props = defineProps<{
  source: ImageData | null
  rects: SpriteRect[]
  hoverIndex: number | null
}>()
const emit = defineEmits<{
  (e: 'hover', index: number | null): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
let srcCanvas: HTMLCanvasElement | null = null
let ro: ResizeObserver | null = null

function draw() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container || !props.source) return

  const src = props.source
  if (!srcCanvas || srcCanvas.width !== src.width || srcCanvas.height !== src.height) {
    srcCanvas = imageDataToCanvas(src)
  }

  // 计算缩放以适配容器宽度，最大不超过原图
  const maxW = Math.max(1, container.clientWidth - 16)
  const scale = Math.min(1, maxW / src.width)
  const dw = Math.max(1, Math.round(src.width * scale))
  const dh = Math.max(1, Math.round(src.height * scale))
  canvas.width = dw
  canvas.height = dh

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, dw, dh)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(srcCanvas, 0, 0, dw, dh)

  // 叠加素材矩形
  ctx.lineWidth = Math.max(1, scale * 1.5)
  const fontSize = Math.max(10, Math.round(13 * scale))

  for (const r of props.rects) {
    const isHover = props.hoverIndex === r.index
    ctx.strokeStyle = isHover ? '#f59e0b' : '#0ea5e9'
    ctx.fillStyle = isHover
      ? 'rgba(245,158,11,0.18)'
      : 'rgba(14,165,233,0.12)'
    const x = r.left * scale
    const y = r.top * scale
    const w = r.width * scale
    const h = r.height * scale
    ctx.fillRect(x, y, w, h)
    // 描边向内缩半个线宽：strokeRect 以路径为中心，不内缩则贴边时有一半超出 canvas 被裁切
    const half = ctx.lineWidth / 2
    if (w > ctx.lineWidth && h > ctx.lineWidth) {
      ctx.strokeRect(x + half, y + half, w - ctx.lineWidth, h - ctx.lineWidth)
    }

    // 序号标签
    const label = String(r.index)
    ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
    const tw = ctx.measureText(label).width
    const lh = fontSize + 4
    ctx.fillStyle = isHover ? '#f59e0b' : '#0284c7'
    ctx.fillRect(x, y, tw + 8, lh)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, x + 4, y + fontSize)
  }
}

function onMove(e: MouseEvent) {
  const canvas = canvasRef.value
  const src = props.source
  if (!canvas || !src) return
  const rect = canvas.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * src.width
  const y = ((e.clientY - rect.top) / rect.height) * src.height
  let found: number | null = null
  for (const r of props.rects) {
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) {
      found = r.index
      break
    }
  }
  emit('hover', found)
}

onMounted(() => {
  if (containerRef.value) {
    ro = new ResizeObserver(() => draw())
    ro.observe(containerRef.value)
  }
  nextTick(draw)
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
})

watch(() => props.source, draw)
watch(() => props.rects, draw)
watch(() => props.hoverIndex, draw)
</script>

<template>
  <div
    ref="containerRef"
    class="checker rounded-lg p-2 w-full overflow-auto flex items-center justify-center min-h-[200px]"
  >
    <canvas
      v-if="source"
      ref="canvasRef"
      class="block max-w-full h-auto shadow-sm"
      @mousemove="onMove"
      @mouseleave="emit('hover', null)"
    />
    <div v-else class="text-sm text-slate-400 py-20">暂无图片</div>
  </div>
</template>
