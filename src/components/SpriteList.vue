<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SpriteRect, ExportOptions } from '../lib/types'
import { imageDataToCanvas } from '../lib/imageUtils'
import { exportSingle } from '../lib/exporter'

interface SpriteListItem {
  key: string
  imageId: string
  source: ImageData
  rect: SpriteRect
}

const props = defineProps<{
  items: SpriteListItem[]
  activeImageId: string
  hoverImageId: string | null
  hoverIndex: number | null
  exportSize: ExportOptions
}>()
const emit = defineEmits<{
  (e: 'hover', target: { imageId: string; index: number } | null): void
  (e: 'activate', imageId: string): void
  (e: 'merge', payload: { imageId: string; ids: number[] }): void
}>()

// index -> dataURL 缩略图
const thumbs = ref<Map<string, string>>(new Map())
const busy = ref<string | null>(null)
// 多选合并用
const selected = ref<Set<string>>(new Set())

function itemKey(item: SpriteListItem): string {
  return item.key
}

function hoverKey(item: SpriteListItem): boolean {
  return (
    props.hoverImageId === item.imageId &&
    props.hoverIndex === item.rect.index
  )
}

function buildThumbs() {
  // 释放旧的 dataURL（dataURL 无需 revoke，但清理引用）
  thumbs.value = new Map()
  if (props.items.length === 0) return

  const sourceCanvases = new Map<string, HTMLCanvasElement>()
  const map = new Map<string, string>()
  for (const item of props.items) {
    let sc = sourceCanvases.get(item.imageId)
    if (!sc) {
      sc = imageDataToCanvas(item.source)
      sourceCanvases.set(item.imageId, sc)
    }
    const r = item.rect
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
    map.set(itemKey(item), c.toDataURL('image/png'))
  }
  thumbs.value = map
}

watch(
  () => props.items,
  buildThumbs,
  { immediate: true },
)

// 检测结果变化时清空选择（索引会重新编号）
watch(
  () => props.items,
  () => {
    selected.value = new Set()
  },
)

function selectedImageId(): string | null {
  const first = [...selected.value][0]
  return first ? first.split(':')[0] : null
}

function selectedIds(): number[] {
  return [...selected.value].map((key) => Number(key.split(':')[1]))
}

function toggle(item: SpriteListItem) {
  emit('activate', item.imageId)
  const key = itemKey(item)
  const s = new Set(selected.value)
  if (s.has(key)) s.delete(key)
  else {
    const currentImageId = selectedImageId()
    if (currentImageId && currentImageId !== item.imageId) s.clear()
    s.add(key)
  }
  selected.value = s
}

function clearSelect() {
  selected.value = new Set()
}

function onMerge() {
  if (selected.value.size < 2) return
  const imageId = selectedImageId()
  if (!imageId) return
  emit('merge', { imageId, ids: selectedIds() })
  selected.value = new Set()
}

async function onDownload(item: SpriteListItem) {
  if (busy.value !== null) return
  const key = itemKey(item)
  busy.value = key
  try {
    await exportSingle(item.source, item.rect, props.exportSize)
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
        <span class="text-slate-400 font-normal">({{ items.length }})</span>
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

    <div v-if="items.length === 0" class="text-sm text-slate-400 py-8 text-center">
      未检测到素材
    </div>

    <template v-else>
      <div class="text-[11px] text-slate-400">点击同一图片里的多个素材后，点「合并选中」可合并为一</div>
      <div class="grid grid-cols-2 gap-2 max-h-[70vh] overflow-auto pr-1">
        <div
          v-for="item in items"
          :key="item.key"
          @click="toggle(item)"
          @mouseenter="emit('hover', { imageId: item.imageId, index: item.rect.index })"
          @mouseleave="emit('hover', null)"
          :class="[
            item.imageId === activeImageId ? 'border-sky-100' : 'border-transparent',
            selected.has(item.key)
              ? 'ring-2 ring-inset ring-emerald-400 bg-emerald-50/50'
              : hoverKey(item)
                ? 'ring-2 ring-inset ring-amber-400 bg-amber-50/50'
                : 'ring-1 ring-inset ring-slate-200 hover:ring-sky-300 bg-white',
          ]"
          class="relative rounded-lg border p-2 flex flex-col items-center gap-1.5 cursor-pointer transition select-none"
        >
          <div
            v-if="selected.has(item.key)"
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
              v-if="thumbs.get(item.key)"
              :src="thumbs.get(item.key)"
              class="max-h-20 max-w-full object-contain"
              alt="sprite"
            />
          </div>
          <div class="text-xs text-slate-500 w-full flex justify-between gap-2">
            <span>#{{ item.rect.index }}</span>
            <span class="font-mono">{{ item.rect.width }}×{{ item.rect.height }}</span>
          </div>
          <button
            @click.stop="onDownload(item)"
            :disabled="busy !== null"
            class="w-full text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white py-1.5 rounded transition"
          >
            {{ busy === item.key ? '下载中…' : '下载' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
