import path from 'node:path'
import fs from 'node:fs'
import { config } from './config.js'

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

export function projectsDir() {
  return path.join(config.mediaRoot, 'projects')
}

export function uploadsDir() {
  return path.join(config.mediaRoot, 'uploads')
}

export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug)
}

export function sanitizeSlug(input) {
  if (typeof input !== 'string') return null
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return isValidSlug(slug) ? slug : null
}

export function resolveProjectFile(project, file) {
  if (!isValidSlug(project)) return null
  if (!file || typeof file !== 'string' || file.includes('\0')) return null
  const base = path.join(projectsDir(), project)
  const full = path.resolve(base, file)
  if (full !== base && !full.startsWith(base + path.sep)) return null
  return full
}

export function ensureDirs() {
  fs.mkdirSync(projectsDir(), { recursive: true })
  fs.mkdirSync(uploadsDir(), { recursive: true })
}
