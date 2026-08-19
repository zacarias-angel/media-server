import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { config } from '../config.js'
import { requireAuth, verifySession, verifyLogin, signSession, cookieOptions, COOKIE_NAME } from '../auth.js'
import { projectsDir, uploadsDir, isValidSlug, sanitizeSlug, resolveProjectFile } from '../storage.js'
import { inspectFile, ALLOWED_EXT } from '../validation.js'
import { processVideo, processImage } from '../ffmpeg.js'

const router = Router()

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir()),
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
})

function failUpload(filePath, res, status, error) {
  if (filePath) fs.rmSync(filePath, { force: true })
  res.status(status).json({ error })
}

router.get('/me', (req, res) => {
  const user = verifySession(req.cookies?.[COOKIE_NAME])
  if (user === config.adminUser) return res.json({ ok: true, user })
  res.status(401).json({ ok: false })
})

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!verifyLogin(username, password)) {
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }
  res.cookie(COOKIE_NAME, signSession(username), cookieOptions())
  res.json({ ok: true, user: username })
})

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

router.get('/projects', requireAuth, (_req, res) => {
  const dir = projectsDir()
  if (!fs.existsSync(dir)) return res.json({ projects: [] })
  const out = []
  for (const name of fs.readdirSync(dir)) {
    if (!isValidSlug(name)) continue
    const p = path.join(dir, name)
    if (!fs.statSync(p).isDirectory()) continue
    const files = fs.readdirSync(p).filter((f) => fs.statSync(path.join(p, f)).isFile()).sort()
    out.push({ project: name, files })
  }
  out.sort((a, b) => a.project.localeCompare(b.project))
  res.json({ projects: out })
})

router.delete('/projects/:project', requireAuth, (req, res) => {
  const { project } = req.params
  if (!isValidSlug(project)) return res.status(400).json({ error: 'Nombre de proyecto inválido' })
  const dir = path.join(projectsDir(), project)
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Proyecto no encontrado' })
  fs.rmSync(dir, { recursive: true, force: true })
  res.json({ ok: true })
})

router.delete('/projects/:project/:file', requireAuth, (req, res) => {
  const { project, file } = req.params
  const ext = path.extname(file).slice(1).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) return res.status(400).json({ error: 'Tipo de archivo no permitido' })
  const full = resolveProjectFile(project, file)
  if (!full) return res.status(400).json({ error: 'Ruta inválida' })
  fs.unlink(full, (err) => {
    if (err) return res.status(404).json({ error: 'Archivo no encontrado' })
    res.json({ ok: true })
  })
})

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' })

  const project = sanitizeSlug(req.body.project)
  if (!project) return failUpload(req.file.path, res, 400, 'Nombre de proyecto inválido')

  let outDir = null
  try {
    const info = await inspectFile(req.file.path)
    if (!info.ok) return failUpload(req.file.path, res, 415, info.error)

    const projectDir = path.join(projectsDir(), project)
    fs.mkdirSync(projectDir, { recursive: true })

    outDir = path.join(uploadsDir(), crypto.randomUUID())
    fs.mkdirSync(outDir, { recursive: true })

    if (info.kind === 'video') await processVideo(req.file.path, outDir)
    else await processImage(req.file.path, outDir)

    const created = []
    for (const name of fs.readdirSync(outDir)) {
      fs.renameSync(path.join(outDir, name), path.join(projectDir, name))
      created.push(name)
    }
    created.sort()

    fs.rmSync(outDir, { recursive: true, force: true })
    fs.rmSync(req.file.path, { force: true })

    res.json({ ok: true, project, files: created })
  } catch (err) {
    console.error('[upload] error:', err)
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true })
    failUpload(req.file.path, res, 500, `Error de procesamiento: ${err.message || err}`)
  }
})

export default router
