import { fileTypeFromFile } from 'file-type'

export const ALLOWED_EXT = new Set(['mp4', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'avif'])

export const EXT_MIME = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
}

const VIDEO_EXT = new Set(['mp4', 'webm'])

export async function inspectFile(filePath) {
  const detected = await fileTypeFromFile(filePath)
  if (!detected) {
    return { ok: false, error: 'No se pudo detectar el tipo de archivo' }
  }
  if (!ALLOWED_EXT.has(detected.ext)) {
    return { ok: false, error: `Tipo de archivo no permitido: ${detected.ext}` }
  }
  return {
    ok: true,
    ext: detected.ext,
    mime: detected.mime,
    kind: VIDEO_EXT.has(detected.ext) ? 'video' : 'image',
  }
}
