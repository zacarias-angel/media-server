import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { initAuth } from './auth.js'
import { ensureDirs } from './storage.js'
import publicRouter from './routes/public.js'
import adminRouter from './routes/admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

initAuth()
ensureDirs()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

app.use((req, _res, next) => {
  req.cookies = {}
  const header = req.headers.cookie
  if (header) {
    for (const part of header.split(';')) {
      const eq = part.indexOf('=')
      if (eq < 0) continue
      const k = part.slice(0, eq).trim()
      const v = part.slice(eq + 1).trim()
      if (k) req.cookies[k] = decodeURIComponent(v)
    }
  }
  next()
})

app.get('/', (_req, res) => res.redirect('/admin'))
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')))

app.use(publicRouter)
app.use('/api', adminRouter)

app.use((_req, res) => res.status(404).json({ error: 'No encontrado' }))

app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Archivo demasiado grande (máx ${config.maxUploadBytes / 1024 / 1024} MB)` })
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' })
  }
  console.error('[server]', err)
  res.status(500).json({ error: 'Error interno' })
})

app.listen(config.port, () => {
  console.log(`[media] Media Server escuchando en :${config.port}`)
  console.log(`[media] Media root: ${config.mediaRoot}`)
})
