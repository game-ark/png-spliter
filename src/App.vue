<script setup lang="ts">
import { ref, computed, shallowRef, watch } from 'vue'
import UploadPanel from './components/UploadPanel.vue'
import PreviewCanvas from './components/PreviewCanvas.vue'
import ControlPanel from './components/ControlPanel.vue'
import SpriteList from './components/SpriteList.vue'
import { loadImage, imageToImageData } from './lib/imageUtils'
import { detectSprites } from './lib/spriteDetector'
import { mergeRects } from './lib/mergeUtils'
import { exportAllZip } from './lib/exporter'
import {
  DEFAULT_OPTIONS,
  DEFAULT_EXPORT,
  type DetectOptions,
  type ExportOptions,
  type SpriteRect,
} from './lib/types'

const imageData = shallowRef<ImageData | null>(null)
const fileName = ref('')
const options = ref<DetectOptions>({ ...DEFAULT_OPTIONS })
const exportSize = ref<ExportOptions>({ ...DEFAULT_EXPORT })
const hoverIndex = ref<number | null>(null)
const exporting = ref(false)
const exportPct = ref(0)
const loading = ref(false)
const error = ref('')

// 纯算法检测结果（随 options / imageData 变化重新计算）
const detectedRects = computed<SpriteRect[]>(() => {
  if (!imageData.value) return []
  return detectSprites(imageData.value, options.value)
})

// 实际使用的结果，允许手动合并编辑
const rects = ref<SpriteRect[]>([])
const hasMerge = ref(false)

// 算法结果变化时（调参/换图）重置，清除手动合并
watch(detectedRects, (v) => {
  rects.value = v
  hasMerge.value = false
})

const imageSize = computed(() =>
  imageData.value
    ? { width: imageData.value.width, height: imageData.value.height }
    : null,
)

async function onSelect(file: File) {
  loading.value = true
  error.value = ''
  try {
    const img = await loadImage(file)
    imageData.value = imageToImageData(img)
    fileName.value = file.name
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function reset() {
  imageData.value = null
  fileName.value = ''
  hoverIndex.value = null
  exportSize.value = { ...DEFAULT_EXPORT }
}

/**
 * 合并选中的素材：委托纯函数 mergeRects 计算最小外接包围盒，
 * 重算内容像素面积，替换被选中项并重新编号。
 */
function onMerge(ids: number[]) {
  if (!imageData.value || ids.length < 2) return
  const result = mergeRects(
    imageData.value,
    rects.value,
    ids,
    options.value.alphaThreshold,
  )
  if (!result) return
  rects.value = result.remaining
  hasMerge.value = true
}

/** 撤销所有手动合并，恢复纯算法检测结果 */
function resetMerge() {
  rects.value = detectedRects.value
  hasMerge.value = false
}

async function onExportAll() {
  if (!imageData.value || rects.value.length === 0 || exporting.value) return
  exporting.value = true
  exportPct.value = 0
  try {
    await exportAllZip(imageData.value, rects.value, exportSize.value, (d, t) => {
      exportPct.value = Math.round((d / t) * 100)
    })
  } finally {
    exporting.value = false
  }
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
            v-if="imageData"
            @click="reset"
            class="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-100 transition"
          >
            重新选择
          </button>
          <button
            v-if="imageData && hasMerge"
            @click="resetMerge"
            class="text-sm text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-md hover:bg-amber-50 transition"
          >
            撤销合并
          </button>
          <button
            v-if="imageData"
            @click="onExportAll"
            :disabled="exporting || rects.length === 0"
            class="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-md transition"
          >
            {{ exporting ? `打包中 ${exportPct}%` : `下载全部 (ZIP)` }}
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 py-6">
      <!-- 上传区 -->
      <div v-if="!imageData" class="py-10">
        <UploadPanel @select="onSelect" />
        <p v-if="error" class="text-center text-sm text-rose-500 mt-4">{{ error }}</p>
        <p v-else-if="loading" class="text-center text-sm text-slate-400 mt-4">加载中…</p>
        <p v-else class="text-center text-xs text-slate-400 mt-4">
          将多张素材合在一张 PNG 上传，工具会按透明像素自动分离每个素材并计算其上下左右边缘
        </p>
      </div>

      <!-- 工作区 -->
      <div v-else class="grid grid-cols-12 gap-5">
        <!-- 左：控制面板 -->
        <aside class="col-span-12 lg:col-span-3">
          <div class="bg-white rounded-xl p-4 shadow-sm sticky top-20">
            <div class="text-sm font-medium text-slate-600 mb-3 truncate" :title="fileName">
              {{ fileName }}
            </div>
            <ControlPanel
              :options="options"
              :count="rects.length"
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
            <PreviewCanvas
              :source="imageData"
              :rects="rects"
              :hover-index="hoverIndex"
              @hover="hoverIndex = $event"
            />
          </div>
        </section>

        <!-- 右：素材列表 -->
        <section class="col-span-12 lg:col-span-4">
          <div class="bg-white rounded-xl p-4 shadow-sm">
            <SpriteList
              :source="imageData"
              :rects="rects"
              :hover-index="hoverIndex"
              :export-size="exportSize"
              @hover="hoverIndex = $event"
              @merge="onMerge"
            />
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
