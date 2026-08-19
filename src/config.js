const bool = (v, def) => (v === undefined ? def : String(v).toLowerCase() === 'true')

export const config = {
  port: Number(process.env.PORT || 3000),
  mediaRoot: process.env.MEDIA_ROOT || '/srv/media',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 300) * 1024 * 1024,
  cookieSecure: bool(process.env.COOKIE_SECURE, true),
  sessionTtlMs: Number(process.env.SESSION_TTL_HOURS || 12) * 3600 * 1000,
}
