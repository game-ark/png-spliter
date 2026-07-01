<script setup lang="ts">
import { ref, computed, shallowRef, watch } from 'vue'
import UploadPanel from './components/UploadPanel.vue'
import PreviewCanvas from './components/PreviewCanvas.vue'
import ControlPanel from './components/ControlPanel.vue'
import SpriteList from './components/SpriteList.vue'
import { loadImage, imageToImageData } from './lib/imageUtils'
import { detectSprites } from './lib/spriteDetector'
import { mergeRects } from './lib/mergeUtils'
import { exportManyZip } from './lib/exporter'
import {
  DEFAULT_OPTIONS,
  DEFAULT_EXPORT,
  type DetectOptions,
  type ExportOptions,
  type SpriteRect,
} from './lib/types'

interface ImageEntry {
  id: string
  fileName: string
  previewUrl: string
  data: ImageData
  detectedRects: SpriteRect[]
  rects: SpriteRect[]
  hasMerge: boolean
}

interface HoverTarget {
  imageId: string
  rectIndex: number
}

interface SpriteListEntry {
  key: string
  imageId: string
  source: ImageData
  rect: SpriteRect
}

const images = shallowRef<ImageEntry[]>([])
const activeImageId = ref('')
const options = ref<DetectOptions>({ ...DEFAULT_OPTIONS })
const exportSize = ref<ExportOptions>({ ...DEFAULT_EXPORT })
const hoverTarget = ref<HoverTarget | null>(null)
const exporting = ref(false)
const exportPct = ref(0)
const loading = ref(false)
const error = ref('')
let imageSeq = 0

function cloneRects(rects: SpriteRect[]): SpriteRect[] {
  return rects.map((r) => ({ ...r }))
}

function createPreviewUrl(img: HTMLImageElement): string {
  const maxWidth = 144
  const maxHeight = 96
  const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取 2D 上下文')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

function createEntry(file: File, img: HTMLImageElement): ImageEntry {
  const data = imageToImageData(img)
  const detected = detectSprites(data, options.value)
  imageSeq += 1
  return {
    id: `${Date.now()}-${imageSeq}`,
    fileName: file.name,
    previewUrl: createPreviewUrl(img),
    data,
    detectedRects: cloneRects(detected),
    rects: cloneRects(detected),
    hasMerge: false,
  }
}

const activeImage = computed<ImageEntry | null>(
  () =>
    images.value.find((image) => image.id === activeImageId.value) ??
    images.value[0] ??
    null,
)

const activeRects = computed(() => activeImage.value?.rects ?? [])
const totalRectCount = computed(() =>
  images.value.reduce((sum, image) => sum + image.rects.length, 0),
)
const hasMerge = computed(() => images.value.some((image) => image.hasMerge))
const activeHoverIndex = computed(() => {
  const active = activeImage.value
  if (!active || !hoverTarget.value || hoverTarget.value.imageId !== active.id) {
    return null
  }
  return hoverTarget.value.rectIndex
})

const imageSize = computed(() =>
  activeImage.value
    ? { width: activeImage.value.data.width, height: activeImage.value.data.height }
    : null,
)

const spriteItems = computed<SpriteListEntry[]>(() =>
  images.value.flatMap((image) =>
    image.rects.map((rect) => ({
      key: `${image.id}:${rect.index}`,
      imageId: image.id,
      source: image.data,
      rect,
    })),
  ),
)

watch(
  options,
  () => {
    if (images.value.length === 0) return
    images.value = images.value.map((image) => {
      const detected = detectSprites(image.data, options.value)
      return {
        ...image,
        detectedRects: cloneRects(detected),
        rects: cloneRects(detected),
        hasMerge: false,
      }
    })
    hoverTarget.value = null
  },
  { deep: true },
)

async function onSelect(files: File[]) {
  loading.value = true
  error.value = ''
  try {
    const loaded: ImageEntry[] = []
    const failed: string[] = []

    for (const file of files) {
      try {
        const img = await loadImage(file)
        loaded.push(createEntry(file, img))
      } catch {
        failed.push(file.name)
      }
    }

    if (loaded.length === 0) {
      error.value = failed.length > 0 ? '图片加载失败，请确认是有效的 PNG 文件' : ''
      return
    }

    images.value = loaded
    activeImageId.value = loaded[0].id
    hoverTarget.value = null
    exportSize.value = { ...DEFAULT_EXPORT }

    if (failed.length > 0) {
      error.value = `有 ${failed.length} 张图片加载失败`
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function reset() {
  images.value = []
  activeImageId.value = ''
  hoverTarget.value = null
  exportSize.value = { ...DEFAULT_EXPORT }
  error.value = ''
}

/**
 * 合并选中的素材：委托纯函数 mergeRects 计算最小外接包围盒，
 * 重算内容像素面积，替换被选中项并重新编号。
 */
function onMerge(payload: { imageId: string; ids: number[] }) {
  const image = images.value.find((item) => item.id === payload.imageId)
  if (!image || payload.ids.length < 2) return
  const result = mergeRects(
    image.data,
    cloneRects(image.rects),
    payload.ids,
    options.value.alphaThreshold,
  )
  if (!result) return
  images.value = images.value.map((item) =>
    item.id === payload.imageId
      ? { ...item, rects: result.remaining, hasMerge: true }
      : item,
  )
  activeImageId.value = payload.imageId
  hoverTarget.value = null
}

/** 撤销所有手动合并，恢复纯算法检测结果 */
function resetMerge() {
  images.value = images.value.map((image) => ({
    ...image,
    rects: cloneRects(image.detectedRects),
    hasMerge: false,
  }))
  hoverTarget.value = null
}

async function onExportAll() {
  if (images.value.length === 0 || totalRectCount.value === 0 || exporting.value) return
  exporting.value = true
  exportPct.value = 0
  try {
    await exportManyZip(
      images.value.map((image) => ({
        source: image.data,
        rects: image.rects,
      })),
      exportSize.value,
      (d, t) => {
        exportPct.value = Math.round((d / t) * 100)
      },
    )
  } finally {
    exporting.value = false
  }
}

function activateImage(id: string) {
  activeImageId.value = id
  hoverTarget.value = null
}

function onPreviewHover(index: number | null) {
  const active = activeImage.value
  hoverTarget.value =
    active && index !== null ? { imageId: active.id, rectIndex: index } : null
}

function onListHover(target: { imageId: string; index: number } | null) {
  hoverTarget.value = target
    ? { imageId: target.imageId, rectIndex: target.index }
    : null
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <header class="border-b border-slate-200 bg-white sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-md bg-sky-500 flex items-center justify-center text-white text-sm font-bold">
            P
          </div>
          <h1 class="text-base font-semibold">
            PNGSpliter
            <span class="text-slate-400 text-sm font-normal ml-1">PNG 素材分割工具</span>
          </h1>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="images.length > 0"
            @click="reset"
            class="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-100 transition"
          >
            重新选择
          </button>
          <button
            v-if="images.length > 0 && hasMerge"
            @click="resetMerge"
            class="text-sm text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-md hover:bg-amber-50 transition"
          >
            撤销合并
          </button>
          <button
            v-if="images.length > 0"
            @click="onExportAll"
            :disabled="exporting || totalRectCount === 0"
            class="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-md transition"
          >
            {{ exporting ? `打包中 ${exportPct}%` : `下载全部 (ZIP)` }}
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 py-6">
      <!-- 上传区 -->
      <div v-if="images.length === 0" class="py-10">
        <UploadPanel @select="onSelect" />
        <p v-if="error" class="text-center text-sm text-rose-500 mt-4">{{ error }}</p>
        <p v-else-if="loading" class="text-center text-sm text-slate-400 mt-4">加载中…</p>
        <p v-else class="text-center text-xs text-slate-400 mt-4">
          可一次上传多张 PNG，工具会按透明像素自动分离每个素材并计算其上下左右边缘
        </p>
      </div>

      <!-- 工作区 -->
      <div v-else class="grid grid-cols-12 gap-5">
        <!-- 左：控制面板 -->
        <aside class="col-span-12 lg:col-span-3">
          <div class="bg-white rounded-xl p-4 shadow-sm sticky top-20">
            <div class="text-xs text-slate-400 mb-1">
              全部 {{ totalRectCount }} 个素材
            </div>
            <ControlPanel
              :options="options"
              :count="activeRects.length"
              :image-size="imageSize"
              :export-size="exportSize"
              @update="options = $event"
              @update-export="exportSize = $event"
            />
          </div>
        </aside>

        <!-- 中：预览 -->
        <section class="col-span-12 lg:col-span-5">
          <div class="bg-white rounded-xl p-3 shadow-sm">
            <div class="flex gap-2 overflow-x-auto pb-2 mb-2 border-b border-slate-100">
              <button
                v-for="(image, index) in images"
                :key="image.id"
                @click="activateImage(image.id)"
                :class="image.id === activeImage?.id
                  ? 'border-sky-300 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:bg-sky-50/60'"
                class="shrink-0 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition"
                aria-label="切换图片"
              >
                <span class="checker-sm relative w-24 h-16 rounded overflow-hidden shrink-0 border border-slate-200">
                  <img
                    :src="image.previewUrl"
                    class="w-full h-full object-contain"
                    alt=""
                  />
                </span>
              </button>
            </div>
            <PreviewCanvas
              :source="activeImage?.data ?? null"
              :rects="activeRects"
              :hover-index="activeHoverIndex"
              @hover="onPreviewHover"
            />
          </div>
        </section>

        <!-- 右：素材列表 -->
        <section class="col-span-12 lg:col-span-4">
          <div class="bg-white rounded-xl p-4 shadow-sm">
            <SpriteList
              :items="spriteItems"
              :active-image-id="activeImage?.id ?? ''"
              :hover-image-id="hoverTarget?.imageId ?? null"
              :hover-index="hoverTarget?.rectIndex ?? null"
              :export-size="exportSize"
              @hover="onListHover"
              @activate="activateImage"
              @merge="onMerge"
            />
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
