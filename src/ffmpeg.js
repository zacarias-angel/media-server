import { spawn } from 'node:child_process'
import path from 'node:path'

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.slice(-1500) || `ffmpeg terminó con código ${code}`))
    })
  })
}

const SCALE_VIDEO = "scale='min(1280\\,iw)':-2"
const SCALE_IMAGE = "scale='min(1600\\,iw)':-2"

export async function processVideo(inputPath, outDir) {
  await run(['-y', '-ss', '1', '-i', inputPath, '-frames:v', '1', '-vf', SCALE_VIDEO, '-quality', '82', path.join(outDir, 'poster.webp')])
  await run(['-y', '-ss', '1', '-i', inputPath, '-frames:v', '1', '-vf', 'scale=480:-2', '-quality', '78', path.join(outDir, 'thumbnail.webp')])
  await run(['-y', '-i', inputPath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-vf', SCALE_VIDEO, path.join(outDir, 'preview.mp4')])

  try {
    await run([
      '-y', '-i', inputPath,
      '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0',
      '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
      '-an', '-vf', SCALE_VIDEO, path.join(outDir, 'preview.webm'),
    ])
  } catch (err) {
    console.warn('[ffmpeg] no se pudo generar preview.webm (VP9), se omite:', err.message)
  }
}

export async function processImage(inputPath, outDir) {
  await run(['-y', '-i', inputPath, '-vf', SCALE_IMAGE, '-quality', '85', path.join(outDir, 'cover.webp')])
  await run(['-y', '-i', inputPath, '-vf', 'scale=480:-2', '-quality', '78', path.join(outDir, 'thumbnail.webp')])
}
