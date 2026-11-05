<script lang="ts">
  import { onMount } from 'svelte'

  let { paused = false }: { paused?: boolean } = $props()
  let canvas: HTMLCanvasElement
  let update: (() => void) | undefined
  $effect(() => {
    void paused
    update?.()
  })

  onMount(() => {
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const glyphs = '.,:;=!*#$@'
    const points: number[] = []
    // Rounded rectangular links with a softened square cross-section, like forged metal.
    const rounded = (value: number, power: number): number =>
      Math.sign(value) * Math.abs(value) ** power
    for (let link = 0; link < 2; link++) {
      const twist = (link * Math.PI) / 2 + 0.18 * (link - 0.5)
      const ct = Math.cos(twist)
      const st = Math.sin(twist)
      for (let u = 0; u < 280; u++) {
        const angle = (u / 280) * Math.PI * 2
        const cx = Math.cos(angle)
        const cy = Math.sin(angle)
        const rx = rounded(cx, 1.3) / 1.08
        const ry = rounded(cy, 1.3) / 0.62
        const length = Math.hypot(rx, ry)
        for (let v = 0; v < 48; v++) {
          const tube = (v / 48) * Math.PI * 2
          const radial = rounded(Math.cos(tube), 0.7)
          const axial = rounded(Math.sin(tube), 0.7)
          const normalR = rounded(Math.cos(tube), 1.3)
          const normalZ = rounded(Math.sin(tube), 1.3)
          const normalLength = Math.hypot(normalR, normalZ)
          const nx = ((rx / length) * normalR) / normalLength
          const ny = ((ry / length) * normalR) / normalLength
          const nz = normalZ / normalLength
          const x = 1.08 * rounded(cx, 0.7) + (0.23 * radial * rx) / length + (link - 0.5) * 1.55
          const y = 0.62 * rounded(cy, 0.7) + (0.23 * radial * ry) / length
          const z = 0.23 * axial
          points.push(x, y * ct - z * st, y * st + z * ct, nx, ny * ct - nz * st, ny * st + nz * ct)
        }
      }
    }
    const surface = new Float32Array(points)
    let width = 0
    let height = 0
    let columns = 0
    let rows = 0
    let depths = new Float32Array(0)
    let shades = new Uint8Array(0)
    let timer: ReturnType<typeof setTimeout> | undefined
    let angle = 0.55
    let last = performance.now()
    let color = '#171717'
    const cellWidth = 5
    const cellHeight = 8

    const draw = (): void => {
      if (!width || !height) return
      depths.fill(-Infinity)
      shades.fill(0)
      const yaw = angle
      const pitch = 0.45 + Math.sin(angle * 0.6) * 0.16
      const roll = -0.42 + Math.sin(angle * 0.3) * 0.12
      const ca = Math.cos(yaw),
        sa = Math.sin(yaw)
      const cb = Math.cos(pitch),
        sb = Math.sin(pitch)
      const cc = Math.cos(roll),
        sc = Math.sin(roll)
      const scale = Math.min(width * 0.19, height * 0.4, 210)
      for (let i = 0; i < surface.length; i += 6) {
        const x = surface[i] * ca + surface[i + 2] * sa
        const z = -surface[i] * sa + surface[i + 2] * ca
        const y = surface[i + 1] * cb - z * sb
        const depth = surface[i + 1] * sb + z * cb
        const perspective = 5 / (5 - depth)
        const column = Math.floor((width / 2 + (x * cc - y * sc) * scale * perspective) / cellWidth)
        const row = Math.floor((height / 2 + (x * sc + y * cc) * scale * perspective) / cellHeight)
        if (column < 0 || column >= columns || row < 0 || row >= rows) continue
        const index = row * columns + column
        if (depth <= depths[index]) continue
        depths[index] = depth
        const nx = surface[i + 3] * ca + surface[i + 5] * sa
        const nz = -surface[i + 3] * sa + surface[i + 5] * ca
        const ny = surface[i + 4] * cb - nz * sb
        const normalZ = surface[i + 4] * sb + nz * cb
        const light = Math.max(
          0,
          -(nx * cc - ny * sc) * 0.3 - (nx * sc + ny * cc) * 0.5 + normalZ * 0.8
        )
        const highlight = Math.max(0, -nx * 0.15 - ny * 0.25 + normalZ * 0.95) ** 18
        const rim = (1 - Math.abs(normalZ)) ** 3 * 0.16
        const brightness = light * 0.7 + highlight * 0.4 + rim
        shades[index] = 1 + Math.min(glyphs.length - 1, Math.floor(brightness * glyphs.length))
      }
      context.clearRect(0, 0, width, height)
      context.fillStyle = color
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const shade = shades[row * columns + column]
          if (!shade) continue
          context.globalAlpha = 0.3 + (shade / glyphs.length) * 0.7
          context.fillText(glyphs[shade - 1], column * cellWidth, row * cellHeight)
        }
      }
      context.globalAlpha = 1
    }

    const canAnimate = (): boolean => !paused && !motion.matches
    const frame = (): void => {
      if (!canAnimate()) return
      const now = performance.now()
      angle += Math.min(now - last, 100) * 0.0000125
      last = now
      draw()
      timer = setTimeout(frame, 1000 / 18)
    }
    const schedule = (): void => {
      clearTimeout(timer)
      if (!canAnimate()) return
      last = performance.now()
      timer = setTimeout(frame, 1000 / 18)
    }
    update = schedule
    const resize = new ResizeObserver(() => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      const ratio = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.font = '8px Menlo, Consolas, monospace'
      context.textBaseline = 'top'
      columns = Math.ceil(width / cellWidth)
      rows = Math.ceil(height / cellHeight)
      depths = new Float32Array(columns * rows)
      shades = new Uint8Array(columns * rows)
      draw()
    })
    const theme = (): void => {
      color = getComputedStyle(canvas).color
      draw()
    }
    const observer = new MutationObserver(theme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    resize.observe(canvas)
    theme()
    schedule()
    motion.addEventListener('change', schedule)
    return () => {
      update = undefined
      clearTimeout(timer)
      resize.disconnect()
      observer.disconnect()
      motion.removeEventListener('change', schedule)
    }
  })
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    color: #171717;
    opacity: 0.12;
  }
  :global(.dark) canvas {
    color: #ceced0;
    opacity: 0.13;
  }
</style>
