<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'select', file: File): void
}>()

const error = ref('')
const dragging = ref(false)

function handleFile(f: File | undefined) {
  if (!f) return
  if (f.type !== 'image/png') {
    error.value = '仅支持 PNG 文件'
    return
  }
  error.value = ''
  emit('select', f)
}

function onFile(e: Event) {
  const target = e.target as HTMLInputElement
  handleFile(target.files?.[0])
  target.value = ''
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  handleFile(e.dataTransfer?.files?.[0])
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragging.value = true
}

function onDragLeave() {
  dragging.value = false
}
</script>

<template>
  <div class="flex flex-col items-center gap-3">
    <label
      class="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-12 cursor-pointer transition w-full max-w-xl"
      :class="dragging
        ? 'border-sky-500 bg-sky-50'
        : 'border-slate-300 hover:border-sky-400 hover:bg-sky-50/50'"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
    >
      <input type="file" accept="image/png" class="hidden" @change="onFile" />
      <svg
        class="w-12 h-12 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <div class="text-slate-600 text-sm">拖拽 PNG 素材图到此处，或点击选择文件</div>
      <div class="text-xs text-slate-400">单张合图，按透明像素自动分离</div>
    </label>
    <div v-if="error" class="text-sm text-rose-500">{{ error }}</div>
  </div>
</template>
