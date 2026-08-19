import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { resolveProjectFile } from '../storage.js'
import { ALLOWED_EXT, EXT_MIME } from '../validation.js'

const router = Router()

router.get('/projects/:project/:file', (req, res) => {
  const { project, file } = req.params
  const ext = path.extname(file).slice(1).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) return res.status(404).end()

  const full = resolveProjectFile(project, file)
  if (!full) return res.status(404).end()

  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) return res.status(404).end()
    res.setHeader('Content-Type', EXT_MIME[ext])
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.sendFile(full)
  })
})

export default router
