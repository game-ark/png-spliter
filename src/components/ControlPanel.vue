<script setup lang="ts">
import type { DetectOptions, ExportOptions } from '../lib/types'

const props = defineProps<{
  options: DetectOptions
  count: number
  imageSize: { width: number; height: number } | null
  exportSize: ExportOptions
}>()
const emit = defineEmits<{
  (e: 'update', options: DetectOptions): void
  (e: 'updateExport', size: ExportOptions): void
}>()

function patch(p: Partial<DetectOptions>) {
  emit('update', { ...props.options, ...p })
}

function onRange(e: Event, key: keyof DetectOptions) {
  const v = Number((e.target as HTMLInputElement).value)
  patch({ [key]: v } as Partial<DetectOptions>)
}

function patchExport(p: Partial<ExportOptions>) {
  emit('updateExport', { ...props.exportSize, ...p })
}

function onSize(e: Event, key: keyof ExportOptions) {
  const raw = (e.target as HTMLInputElement).value
  const v = raw === '' ? 0 : Math.max(0, Math.round(Number(raw)))
  patchExport({ [key]: v } as Partial<ExportOptions>)
}

const presets = [0, 32, 64, 128, 256, 512]
function applyPreset(n: number) {
  patchExport({ fixedWidth: n, fixedHeight: n })
}
</script>

<template>
  <div class="space-y-5">
    <!-- 图片信息 -->
    <div
      v-if="imageSize"
      class="text-xs text-slate-400 pb-3 border-b border-slate-100"
    >
      原图尺寸：{{ imageSize.width }} × {{ imageSize.height }} px
    </div>

    <!-- alpha 阈值 -->
    <div>
      <div class="flex justify-between text-sm text-slate-600 mb-1.5">
        <span>透明阈值</span>
        <span class="font-mono text-slate-500">alpha &gt; {{ options.alphaThreshold }}</span>
      </div>
      <input
        type="range"
        min="0"
        max="254"
        step="1"
        :value="options.alphaThreshold"
        @input="onRange($event, 'alphaThreshold')"
        class="w-full accent-sky-500"
      />
      <p class="text-xs text-slate-400 mt-1">alpha 通道大于此值才视为素材像素</p>
    </div>

    <!-- 最小面积 -->
    <div>
      <div class="flex justify-between text-sm text-slate-600 mb-1.5">
        <span>最小面积</span>
        <span class="font-mono text-slate-500">{{ options.minArea }} px</span>
      </div>
      <input
        type="range"
        min="1"
        max="2000"
        step="1"
        :value="options.minArea"
        @input="onRange($event, 'minArea')"
        class="w-full accent-sky-500"
      />
      <p class="text-xs text-slate-400 mt-1">过滤小于该面积的碎片噪点</p>
    </div>

    <!-- 外边距 -->
    <div>
      <div class="flex justify-between text-sm text-slate-600 mb-1.5">
        <span>外边距</span>
        <span class="font-mono text-slate-500">{{ options.padding }} px</span>
      </div>
      <input
        type="range"
        min="0"
        max="40"
        step="1"
        :value="options.padding"
        @input="onRange($event, 'padding')"
        class="w-full accent-sky-500"
      />
      <p class="text-xs text-slate-400 mt-1">裁剪时向四周扩展的像素数</p>
    </div>

    <!-- 导出尺寸 -->
    <div class="pt-3 border-t border-slate-100">
      <div class="text-sm text-slate-600 mb-1.5">导出尺寸</div>
      <div class="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="1"
          :value="exportSize.fixedWidth || ''"
          @input="onSize($event, 'fixedWidth')"
          placeholder="宽"
          class="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-sky-400"
        />
        <span class="text-slate-400 text-sm">×</span>
        <input
          type="number"
          min="0"
          step="1"
          :value="exportSize.fixedHeight || ''"
          @input="onSize($event, 'fixedHeight')"
          placeholder="高"
          class="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-sky-400"
        />
      </div>
      <div class="flex flex-wrap gap-1.5 mt-2">
        <button
          v-for="n in presets"
          :key="n"
          @click="applyPreset(n)"
          :class="
            exportSize.fixedWidth === n && exportSize.fixedHeight === n
              ? 'bg-sky-500 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          "
          class="px-2 py-1 rounded text-xs transition"
        >
          {{ n === 0 ? '原尺寸' : n }}
        </button>
      </div>
      <p class="text-xs text-slate-400 mt-1.5">
        素材等比缩放后居中放到该尺寸的透明画布，不会裁切内容；留空或 0 按原尺寸导出
      </p>
    </div>

    <!-- 结果统计 -->
    <div class="pt-3 border-t border-slate-100">
      <div class="text-sm text-slate-500">
        检测到
        <span class="font-semibold text-sky-600 text-base">{{ count }}</span>
        个素材
      </div>
    </div>
  </div>
</template>
