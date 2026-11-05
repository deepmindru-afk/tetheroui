export interface QueryData {
  query: string
  files: { name: string; mimeType: string; dataUrl: string }[]
}

export type TetherEvent = { type: 'query'; data: QueryData } | { type: 'voice' }

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGES = 4

export function validateQuery(value: QueryData): void {
  if (
    !value ||
    typeof value.query !== 'string' ||
    value.query.length > 100_000 ||
    !Array.isArray(value.files) ||
    value.files.length > MAX_IMAGES ||
    (!value.query.trim() && !value.files.length)
  )
    throw new Error('Enter a prompt or attach an image (up to four).')
  let size = 0
  for (const file of value.files) {
    if (
      !file ||
      typeof file.name !== 'string' ||
      file.name.length > 200 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimeType) ||
      typeof file.dataUrl !== 'string' ||
      !file.dataUrl.startsWith(`data:${file.mimeType};base64,`) ||
      file.dataUrl.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(file.dataUrl.slice(file.dataUrl.indexOf(',') + 1))
    )
      throw new Error('Use PNG, JPEG or WebP images up to 10 MB each.')
    size += file.dataUrl.length
  }
  if (size > Math.ceil((20 * 1024 * 1024 * 4) / 3))
    throw new Error('Attachments must total less than 20 MB.')
}

export function validateEvent(event: TetherEvent): void {
  if (!event || !['query', 'voice'].includes(event.type))
    throw new Error('Unsupported Tether event.')
  if (event.type === 'query') validateQuery(event.data)
}
