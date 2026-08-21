import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { config } from '../config.js'
import { requireAuth, verifySession, verifyLogin, signSession, cookieOptions, COOKIE_NAME } from '../auth.js'
import { projectsDir, uploadsDir, isValidSlug, sanitizeSlug, resolveProjectFile } from '../storage.js'
import { inspectFile, ALLOWED_EXT } from '../validation.js'

const router = Router()

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 10
const loginAttempts = new Map()

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

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function checkLoginRateLimit(req, res) {
  const now = Date.now()
  const ip = clientIp(req)
  const entry = loginAttempts.get(ip)
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 0, resetAt: now + LOGIN_WINDOW_MS })
    return true
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    res.setHeader('Retry-After', String(retryAfter))
    res.status(429).json({ error: 'Demasiados intentos de login. Probá de nuevo más tarde.' })
    return false
  }
  return true
}

function recordFailedLogin(req) {
  const now = Date.now()
  const ip = clientIp(req)
  const entry = loginAttempts.get(ip)
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }
  entry.count += 1
}

function clearLoginRateLimit(req) {
  loginAttempts.delete(clientIp(req))
}

function sanitizeUploadBaseName(name, fallback) {
  const base = path.basename(name || '', path.extname(name || ''))
  const safe = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return safe || fallback
}

function targetFileName(file, info) {
  if (info.kind === 'video') {
    if (info.ext !== 'webm') {
      return { ok: false, error: 'Los videos deben subirse ya en formato .webm' }
    }
    return { ok: true, name: 'preview.webm' }
  }

  const base = sanitizeUploadBaseName(file.originalname, 'image')
  return { ok: true, name: `${base}.${info.ext}` }
}

router.get('/me', (req, res) => {
  const user = verifySession(req.cookies?.[COOKIE_NAME])
  if (user === config.adminUser) return res.json({ ok: true, user })
  res.json({ ok: false })
})

router.post('/login', (req, res) => {
  if (!checkLoginRateLimit(req, res)) return
  const { username, password } = req.body || {}
  if (!verifyLogin(username, password)) {
    recordFailedLogin(req)
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }
  clearLoginRateLimit(req)
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

  try {
    const info = await inspectFile(req.file.path)
    if (!info.ok) return failUpload(req.file.path, res, 415, info.error)

    const target = targetFileName(req.file, info)
    if (!target.ok) return failUpload(req.file.path, res, 400, target.error)

    const projectDir = path.join(projectsDir(), project)
    fs.mkdirSync(projectDir, { recursive: true })

    const destination = path.join(projectDir, target.name)
    fs.rmSync(destination, { force: true })
    fs.renameSync(req.file.path, destination)

    res.json({ ok: true, project, files: [target.name] })
  } catch (err) {
    console.error('[upload] error:', err)
    failUpload(req.file.path, res, 500, `Error al guardar el archivo: ${err.message || err}`)
  }
})

export default router
