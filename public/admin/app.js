const $ = (id) => document.getElementById(id)

async function api(path, opts = {}) {
  const headers = opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } })
  let data = {}
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

function show(view) {
  $('login-view').hidden = view !== 'login'
  $('panel-view').hidden = view !== 'panel'
  $('logout-btn').hidden = view !== 'panel'
}

async function refreshProjects() {
  const { projects } = await api('/api/projects')
  const list = $('projects-list')
  list.innerHTML = ''
  if (!projects.length) {
    list.innerHTML = '<p class="muted">Todavía no hay proyectos.</p>'
    return
  }
  for (const p of projects) {
    const el = document.createElement('div')
    el.className = 'project'
    const files = p.files
      .map((f) => `<li><span>${f}</span><button data-project="${p.project}" data-file="${f}" class="del">Borrar</button></li>`)
      .join('')
    el.innerHTML = `
      <div class="project-head">
        <strong>${p.project}</strong>
        <a class="muted" href="/projects/${p.project}/${p.files[0] || ''}" target="_blank">ver</a>
        <button class="ghost del-project" data-project="${p.project}">Borrar proyecto</button>
      </div>
      <ul>${files || '<li class="muted">sin archivos</li>'}</ul>`
    list.appendChild(el)
  }
}

async function handleLogin(e) {
  e.preventDefault()
  $('login-error').hidden = true
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('login-user').value, password: $('login-pass').value }),
    })
    enterPanel()
  } catch (err) {
    $('login-error').textContent = err.message
    $('login-error').hidden = false
  }
}

function enterPanel() {
  show('panel')
  refreshProjects().catch(console.error)
}

function handleUpload(e) {
  e.preventDefault()
  const fileInput = $('upload-file')
  const file = fileInput.files[0]
  const project = $('upload-project').value.trim()
  if (!file || !project) return

  const form = new FormData()
  form.append('file', file)
  form.append('project', project)

  const status = $('upload-status')
  const progress = $('upload-progress')
  status.textContent = 'Subiendo…'
  progress.hidden = false
  progress.value = 0

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/upload')
  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) progress.value = Math.round((ev.loaded / ev.total) * 100)
  }
  xhr.upload.onload = () => {
    status.textContent = 'Procesando con FFmpeg…'
  }
  xhr.onload = () => {
    let data = {}
    try { data = JSON.parse(xhr.responseText) } catch {}
    progress.hidden = true
    if (xhr.status >= 200 && xhr.status < 300) {
      status.textContent = 'Listo.'
      fileInput.value = ''
      refreshProjects().catch(console.error)
    } else {
      status.textContent = 'Error: ' + (data.error || xhr.statusText)
    }
  }
  xhr.onerror = () => {
    status.textContent = 'Error de red.'
  }
  xhr.send(form)
}

async function handleDeleteFile(project, file) {
  if (!confirm(`¿Borrar ${project}/${file}?`)) return
  await api(`/api/projects/${project}/${file}`, { method: 'DELETE' })
  refreshProjects()
}

async function handleDeleteProject(project) {
  if (!confirm(`¿Borrar todo el proyecto "${project}"?`)) return
  await api(`/api/projects/${project}`, { method: 'DELETE' })
  refreshProjects()
}

$('login-form').addEventListener('submit', handleLogin)
$('upload-form').addEventListener('submit', handleUpload)
$('logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {})
  show('login')
})
$('projects-list').addEventListener('click', (e) => {
  const del = e.target.closest('.del')
  if (del) return handleDeleteFile(del.dataset.project, del.dataset.file)
  const delProject = e.target.closest('.del-project')
  if (delProject) return handleDeleteProject(delProject.dataset.project)
})

api('/api/me').then(enterPanel).catch(() => show('login'))
