<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import type { SpriteRect, ExportOptions } from '../lib/types'
import { imageDataToCanvas } from '../lib/imageUtils'
import { exportSingle } from '../lib/exporter'

const props = defineProps<{
  source: ImageData | null
  rects: SpriteRect[]
  hoverIndex: number | null
  exportSize: ExportOptions
}>()
const emit = defineEmits<{
  (e: 'hover', index: number | null): void
  (e: 'merge', ids: number[]): void
}>()

// index -> dataURL 缩略图
const thumbs = ref<Map<number, string>>(new Map())
const busy = ref<number | null>(null)
// 多选合并用
const selected = ref<Set<number>>(new Set())

function buildThumbs() {
  // 释放旧的 dataURL（dataURL 无需 revoke，但清理引用）
  thumbs.value = new Map()
  if (!props.source || props.rects.length === 0) return

  const sc = imageDataToCanvas(props.source)
  const map = new Map<number, string>()
  for (const r of props.rects) {
    const c = document.createElement('canvas')
    c.width = r.width
    c.height = r.height
    c.getContext('2d')!.drawImage(
      sc,
      r.left,
      r.top,
      r.width,
      r.height,
      0,
      0,
      r.width,
      r.height,
    )
    map.set(r.index, c.toDataURL('image/png'))
  }
  thumbs.value = map
}

watch(
  [() => props.source, () => props.rects],
  buildThumbs,
  { immediate: true },
)

// 检测结果变化时清空选择（索引会重新编号）
watch(
  () => props.rects,
  () => {
    selected.value = new Set()
  },
)

function toggle(id: number) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

function clearSelect() {
  selected.value = new Set()
}

function onMerge() {
  if (selected.value.size < 2) return
  emit('merge', [...selected.value])
  selected.value = new Set()
}

async function onDownload(r: SpriteRect) {
  if (!props.source || busy.value !== null) return
  busy.value = r.index
  try {
    await exportSingle(props.source, r, props.exportSize)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-slate-600">
        素材列表
        <span class="text-slate-400 font-normal">({{ rects.length }})</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          v-if="selected.size >= 2"
          @click="onMerge"
          class="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded transition"
        >
          合并选中 ({{ selected.size }})
        </button>
        <button
          v-if="selected.size > 0"
          @click="clearSelect"
          class="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition"
        >
          取消
        </button>
      </div>
    </div>

    <div v-if="rects.length === 0" class="text-sm text-slate-400 py-8 text-center">
      未检测到素材
    </div>

    <template v-else>
      <div class="text-[11px] text-slate-400">点击多个素材选中后，点「合并选中」可合并为一</div>
      <div class="grid grid-cols-2 gap-2 max-h-[70vh] overflow-auto pr-1">
        <div
          v-for="r in rects"
          :key="r.index"
          @click="toggle(r.index)"
          @mouseenter="emit('hover', r.index)"
          @mouseleave="emit('hover', null)"
          :class="[
            selected.has(r.index)
              ? 'ring-2 ring-inset ring-emerald-400 bg-emerald-50/50'
              : hoverIndex === r.index
                ? 'ring-2 ring-inset ring-amber-400 bg-amber-50/50'
                : 'ring-1 ring-inset ring-slate-200 hover:ring-sky-300 bg-white',
          ]"
          class="relative rounded-lg p-2 flex flex-col items-center gap-1.5 cursor-pointer transition select-none"
        >
          <div
            v-if="selected.has(r.index)"
            class="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"
          >
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div
            class="checker-sm h-20 w-full flex items-center justify-center rounded overflow-hidden"
          >
            <img
              v-if="thumbs.get(r.index)"
              :src="thumbs.get(r.index)"
              class="max-h-20 max-w-full object-contain"
              alt="sprite"
            />
          </div>
          <div class="text-xs text-slate-500 w-full flex justify-between">
            <span>#{{ r.index }}</span>
            <span class="font-mono">{{ r.width }}×{{ r.height }}</span>
          </div>
          <button
            @click.stop="onDownload(r)"
            :disabled="busy !== null"
            class="w-full text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white py-1.5 rounded transition"
          >
            {{ busy === r.index ? '下载中…' : '下载' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
