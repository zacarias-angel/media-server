# Media Server — Documentación

Servidor propio para subir y servir imágenes/videos de proyectos. Pensado para
previews de porfolio: genera WebM/VP9 + MP4/H.264 + poster + thumbnail con FFmpeg
al subir, sin tocar Git ni recompilar Docker.

## Stack

- Node 22 (ESM) + Express + Multer + `file-type` (detección por magic bytes)
- FFmpeg (instalado en la imagen Alpine)
- Sin base de datos: el filesystem es la metadata
- Auth: un solo usuario admin, sesión por cookie firmada (HMAC)

## Estructura de almacenamiento (persistente)

```
/srv/media/
├── projects/
│   ├── hermes/
│   │   ├── preview.webm      (VP9, preferente)
│   │   ├── preview.mp4       (H.264, fallback)
│   │   ├── poster.webp
│   │   └── thumbnail.webp
│   └── ...
└── uploads/                  (temporal, se limpia tras procesar)
```

## Rutas

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/projects/:project/:file` | Público (solo whitelist) |
| GET | `/admin` | Panel (HTML público; los datos exigen auth) |
| GET | `/api/me` | Público (indica si hay sesión) |
| POST | `/api/login` | Público |
| POST | `/api/logout` | Auth |
| GET | `/api/projects` | Auth |
| POST | `/api/upload` | Auth |
| DELETE | `/api/projects/:project` | Auth |
| DELETE | `/api/projects/:project/:file` | Auth |

## Seguridad

- Whitelist de extensiones: `.mp4 .webm .jpg .jpeg .png .webp .avif`.
- Validación por magic bytes (`file-type`), no solo por extensión.
- Tamaño máximo (`MAX_UPLOAD_MB`, default 300 MB).
- Slug sanitizado (`/^[a-z0-9][a-z0-9_-]{0,63}$/`), sin path traversal.
- Archivos servidos **solo como datos**: `Content-Type` fijo por extensión,
  `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, sin listado
  de directorios. Nada de lo subido se ejecuta (`.php/.js/.sh/...` quedan fuera
  por whitelist + magic bytes).
- Rate limit básico por IP en `/api/login` para frenar fuerza bruta.
- `/admin` entrega headers de seguridad (`Content-Security-Policy`,
  `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`).

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | 3000 | Puerto interno |
| `MEDIA_ROOT` | /srv/media | Raíz del storage |
| `ADMIN_USER` | admin | Usuario del panel |
| `ADMIN_PASSWORD` | — | Contraseña (obligatoria) |
| `SESSION_SECRET` | — | Secreto para firmar sesiones (obligatorio en producción) |
| `SESSION_TTL_HOURS` | 12 | Duración de la sesión |
| `MAX_UPLOAD_MB` | 300 | Tamaño máximo de subida |
| `COOKIE_SECURE` | true | `Secure` en la cookie (false si probás por http) |

## Local

```bash
npm install
ADMIN_PASSWORD=prueba SESSION_SECRET=secreto-largo COOKIE_SECURE=false MEDIA_ROOT=./data npm run dev
# http://localhost:3000/admin
```

## Deploy en Coolify + VPS (15 GB para media)

1. Subí esta carpeta a un repo de GitHub.
2. En **Coolify**: `+ New` → Application → conectá el repo → Dockerfile (detecta solo).
   - **Ports Exposes**: `3000`.
   - **Domain**: `https://media.angelzacarias.uk`.
   - **Environment Variables**: `ADMIN_PASSWORD` (secreto), `SESSION_SECRET` (recomendado: secreto largo),
     `ADMIN_USER` (opcional), `MAX_UPLOAD_MB`, `COOKIE_SECURE=true`, `MEDIA_ROOT=/srv/media`.
   - **Storages → Add Persistent Storage**:
     - Host path: `/srv/media`
     - Container path: `/srv/media`
3. En el VPS, creá el directorio (una vez):
   ```bash
   sudo mkdir -p /srv/media/projects /srv/media/uploads
   ```
   Ajustá permisos si el contenedor no escribe (Coolify suele correr con el UID del usuario).
4. **DatabaseMart** → tu VPS → Manage → Networking → Add Domain:
   - Domain: `media.angelzacarias.uk`
   - Port: `80`
   - Enable Free SSL.
5. **Cloudflare** → DNS → registro **A** → `media.angelzacarias.uk` → IP del VPS,
   **nube gris (DNS only)**.
6. Listo: `https://media.angelzacarias.uk/admin`.

> El volumen `/srv/media` persiste entre reinicios, recreaciones de container,
> nuevos deploys y actualizaciones de imagen. No se borra.

## Uso desde el porfolio

```html
<video autoplay muted loop playsinline preload="metadata"
       poster="https://media.angelzacarias.uk/projects/hermes/poster.webp">
  <source src="https://media.angelzacarias.uk/projects/hermes/preview.webm" type="video/webm" />
  <source src="https://media.angelzacarias.uk/projects/hermes/preview.mp4" type="video/mp4" />
</video>
```

Ojo con el caché: los archivos usan `Cache-Control: max-age=86400`. Si re-subís
un `preview.webm` con el mismo nombre, podés forzar refresco con un query string
(`preview.webm?v=2`) o purgar el caché de Cloudflare.

## Notas

- El transcode a VP9 es CPU-intensivo. Si un VPS chico tarda mucho, podés:
  - subir `.webm` ya codificado en VP9 (se salta la re-codificación de ese formato), o
  - bajar la resolución editando `SCALE_VIDEO` en `src/ffmpeg.js`.
- Si `preview.webm` falla (por falta de libvpx), el servidor lo omite y entrega
  igual `preview.mp4` + poster + thumbnail.
