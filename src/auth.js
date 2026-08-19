import crypto from 'node:crypto'
import { config } from './config.js'

export const COOKIE_NAME = 'media_admin'

let adminHash = null

export function initAuth() {
  if (!config.adminPassword) {
    console.warn('[auth] ADMIN_PASSWORD vacío: el login queda deshabilitado.')
    adminHash = null
    return
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(config.adminPassword, salt, 64).toString('hex')
  adminHash = `${salt}:${hash}`
}

function secret() {
  return config.sessionSecret || `media-server:${config.adminPassword}`
}

function hmac(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url')
}

export function verifyLogin(username, password) {
  if (!adminHash || !password || typeof password !== 'string') return false
  if (username !== config.adminUser) return false
  const [salt, hash] = adminHash.split(':')
  const candidate = crypto.scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

export function signSession(user) {
  const payload = Buffer.from(
    JSON.stringify({ user, exp: Date.now() + config.sessionTtlMs }),
  ).toString('base64url')
  return `${payload}.${hmac(payload)}`
}

export function verifySession(token) {
  if (!token || typeof token !== 'string') return null
  const i = token.lastIndexOf('.')
  if (i < 0) return null
  const payload = token.slice(0, i)
  const sig = token.slice(i + 1)
  const a = Buffer.from(sig)
  const b = Buffer.from(hmac(payload))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return data.user
  } catch {
    return null
  }
}

export function requireAuth(req, res, next) {
  const user = verifySession(req.cookies?.[COOKIE_NAME])
  if (!user || user !== config.adminUser) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  next()
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionTtlMs,
    path: '/',
  }
}
