/**
 * Import open tabs from Chrome / Edge / Brave / Vivaldi —
 * each selected profile becomes its own Prism workspace (never merged).
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const browserUI = require('browserUI.js')
const webviews = require('webviews.js')

function localAppData () {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
}

function readFileLenient (filePath) {
  try {
    return fs.readFileSync(filePath)
  } catch (err) {
    if (!(err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES'))) {
      throw err
    }
    const tmp = path.join(os.tmpdir(), 'prism-session-' + Date.now() + '-' + Math.random().toString(36).slice(2))
    // 1) cmd copy
    try {
      execFileSync('cmd', ['/c', 'copy', '/Y', '"' + filePath + '"', '"' + tmp + '"'], {
        stdio: 'ignore',
        windowsVerbatimArguments: true
      })
      const buf = fs.readFileSync(tmp)
      try { fs.unlinkSync(tmp) } catch (e) {}
      return buf
    } catch (e1) {}
    // 2) PowerShell Copy-Item
    try {
      execFileSync('powershell', [
        '-NoProfile', '-Command',
        'Copy-Item -LiteralPath $env:PRISM_SRC -Destination $env:PRISM_DST -Force'
      ], {
        stdio: 'ignore',
        env: Object.assign({}, process.env, { PRISM_SRC: filePath, PRISM_DST: tmp })
      })
      const buf = fs.readFileSync(tmp)
      try { fs.unlinkSync(tmp) } catch (e) {}
      return buf
    } catch (e2) {}
    // 3) robocopy single-file trick
    try {
      const dir = path.dirname(filePath)
      const base = path.basename(filePath)
      const tmpDir = path.join(os.tmpdir(), 'prism-sess-dir-' + Date.now())
      fs.mkdirSync(tmpDir, { recursive: true })
      execFileSync('robocopy', [dir, tmpDir, base, '/R:1', '/W:0', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'], {
        stdio: 'ignore'
      })
      const buf = fs.readFileSync(path.join(tmpDir, base))
      try { fs.unlinkSync(path.join(tmpDir, base)); fs.rmdirSync(tmpDir) } catch (e) {}
      return buf
    } catch (e3) {
      try { fs.unlinkSync(tmp) } catch (e) {}
      throw err
    }
  }
}

function isJunkUrl (u) {
  const host = u.hostname.toLowerCase()
  const href = u.href.toLowerCase()
  const pathName = u.pathname || ''

  if (host === 'localhost' || host.endsWith('.local')) return true
  if (/^(ntp\.msn\.com|chrome\.google\.com|clients[0-9]\.google\.com)$/i.test(host)) return true
  if (host === 'newtab' || href.includes('chrome://') || href.includes('edge://')) return true
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|css|js|map|mp4|webm)(\?|$)/i.test(pathName)) return true
  if (/\/(logo|favicon|sprite|assets?|static)\//i.test(pathName) && pathName.split('/').length > 3) return true
  // Bing click-tracking redirects, oauth noise
  if (/bing\.com\/ck\//i.test(href)) return true
  if (/oauth|accounts\.google\.com\/o\/oauth|login\.live\.com/i.test(href) && href.length > 160) return true
  if (href.length > 450) return true
  return false
}

function extractUrlsFromSessionBuffer (buf) {
  const seen = new Set()
  const urls = []
  const s = buf.toString('latin1')
  // Prefer quoted http URLs (common in SNSS payloads), then bare
  const patterns = [
    /https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]{8,}/g
  ]

  patterns.forEach(function (re) {
    let m
    while ((m = re.exec(s))) {
      let raw = m[0]
      raw = raw.replace(/[^\x20-\x7E]+.*$/, '')
      raw = raw.replace(/[>"'\\].*$/, '')
      raw = raw.replace(/[.,);\]}]+$/, '')
      if (raw.length < 12 || raw.length > 500) continue
      try {
        const u = new URL(raw)
        if (!['http:', 'https:'].includes(u.protocol)) continue
        if (!u.hostname || u.hostname.length < 2 || !u.hostname.includes('.')) continue
        if (isJunkUrl(u)) continue
        u.hash = ''
        // strip obvious tracking query spam for dedupe key, keep full href for navigation
        const key = u.origin + u.pathname.replace(/\/$/, '')
        if (seen.has(key)) continue
        seen.add(key)
        urls.push(u.href)
      } catch (e) {}
    }
  })
  return urls
}

function listSessionCandidates (sessionsDir) {
  if (!fs.existsSync(sessionsDir)) return []
  return fs.readdirSync(sessionsDir)
    .filter(f => /^(Tabs_|Session_|Current Tabs|Current Session|Last Tabs|Last Session)/i.test(f))
    .map(f => {
      try {
        const full = path.join(sessionsDir, f)
        const st = fs.statSync(full)
        return {
          f: f,
          t: st.mtimeMs,
          size: st.size,
          full: full,
          isTabs: /^Tabs_|Current Tabs|Last Tabs/i.test(f)
        }
      } catch (e) {
        return null
      }
    })
    .filter(Boolean)
    .filter(x => x.size > 64)
    .sort((a, b) => {
      // Newest first; slight preference for Tabs_* when ages are close
      if (Math.abs(b.t - a.t) > 60000) return b.t - a.t
      if (a.isTabs !== b.isTabs) return a.isTabs ? -1 : 1
      return b.size - a.size
    })
}

function readBestSessionUrls (sessionsDir) {
  const files = listSessionCandidates(sessionsDir)
  const errors = []
  let best = { urls: [], path: null, stale: false, errors: errors }

  for (var i = 0; i < files.length; i++) {
    try {
      const buf = readFileLenient(files[i].full)
      const urls = extractUrlsFromSessionBuffer(buf)
      if (urls.length > best.urls.length) {
        best = {
          urls: urls,
          path: files[i].full,
          stale: i > 0,
          errors: errors
        }
      }
      // Good enough — don't keep scanning forever
      if (urls.length >= 8 && i >= 1) break
    } catch (e) {
      errors.push(files[i].f + ': ' + (e.code || e.message))
    }
  }
  return best
}

function discoverProfiles () {
  const browsers = [
    { id: 'chrome', name: 'Chrome', root: path.join(localAppData(), 'Google', 'Chrome', 'User Data') },
    { id: 'edge', name: 'Edge', root: path.join(localAppData(), 'Microsoft', 'Edge', 'User Data') },
    { id: 'brave', name: 'Brave', root: path.join(localAppData(), 'BraveSoftware', 'Brave-Browser', 'User Data') },
    { id: 'vivaldi', name: 'Vivaldi', root: path.join(localAppData(), 'Vivaldi', 'User Data') }
  ]

  const results = []
  browsers.forEach(function (browser) {
    if (!fs.existsSync(browser.root)) return
    let entries = []
    try {
      entries = fs.readdirSync(browser.root)
    } catch (e) {
      return
    }
    entries.filter(n => n === 'Default' || /^Profile \d+$/.test(n)).forEach(function (dir) {
      const prefPath = path.join(browser.root, dir, 'Preferences')
      let profileName = dir === 'Default' ? 'Person 1' : dir
      try {
        const prefs = JSON.parse(readFileLenient(prefPath).toString('utf8'))
        if (prefs.profile && prefs.profile.name) profileName = prefs.profile.name
      } catch (e) {}

      const session = readBestSessionUrls(path.join(browser.root, dir, 'Sessions'))
      const urls = session.urls || []
      results.push({
        browserId: browser.id,
        browserName: browser.name,
        profileDir: dir,
        profileRoot: path.join(browser.root, dir),
        profileName: profileName,
        label: browser.name + ' — ' + profileName,
        sessionPath: session.path,
        tabCount: urls.length,
        urls: urls,
        stale: !!session.stale,
        error: (!urls.length && session.errors && session.errors.length)
          ? 'Could not read session (close the browser or try again)'
          : null
      })
    })
  })
  return results
}

function dedupeUrls (urls) {
  const seen = new Set()
  const out = []
  urls.forEach(function (href) {
    try {
      const u = new URL(href)
      u.hash = ''
      const key = u.origin + u.pathname.replace(/\/$/, '')
      if (seen.has(key)) return
      seen.add(key)
      out.push(u.href)
    } catch (e) {}
  })
  return out
}

function createImportWorkspace (urls, label) {
  const list = dedupeUrls(urls).slice(0, 200)
  if (!list.length) return null

  const colors = ['#c084fc', '#f43f5e', '#8ab4f8', '#fdd663', '#81c995', '#78d9ec', '#ff8bcb']
  const id = tasks.add({
    name: label,
    icon: 'carbon:document-import',
    color: colors[tasks.getLength() % colors.length],
    groups: []
  })

  const task = tasks.get(id)
  list.forEach(function (url, index) {
    let title = url
    try {
      title = new URL(url).hostname.replace(/^www\./, '')
    } catch (e) {}
    task.tabs.add({
      url: url,
      title: title,
      selected: index === 0
    }, { atEnd: true }, false)
  })

  // Ensure first tab is selected in state
  const first = task.tabs.getAtIndex(0)
  if (first) {
    task.tabs.setSelected(first.id, false)
  }

  return { id: id, tabs: list.length, label: label }
}

function releaseImportOverlay () {
  try { webviews.hidePlaceholder('browserImport') } catch (e) {}
  document.body.classList.remove('is-modal-mode')
}

const browserImport = {
  discover: discoverProfiles,

  /**
   * Import selected browser profiles — one Prism workspace each (kept separate).
   */
  importProfiles: function (profiles, options) {
    options = options || {}
    const createdList = []
    const when = new Date()
    const stamp = when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

    profiles.forEach(function (profile) {
      let urls = profile.urls || []
      if (!urls.length && profile.profileRoot) {
        const session = readBestSessionUrls(path.join(profile.profileRoot, 'Sessions'))
        urls = session.urls || []
        profile.urls = urls
        profile.tabCount = urls.length
      }
      if (!urls.length) return

      const base = profile.label || profile.browserName || 'Browser'
      const name = options.namePrefix
        ? (options.namePrefix + ' · ' + base)
        : (base + ' · ' + stamp)

      const created = createImportWorkspace(urls, name)
      if (created) createdList.push(created)
    })

    if (!createdList.length) {
      return []
    }

    // Switch into the last imported workspace so tabs show / load
    const last = createdList[createdList.length - 1]
    browserUI.switchToTask(last.id)
    try {
      const task = tasks.get(last.id)
      const selected = task.tabs.getSelected() || (task.tabs.getAtIndex(0) && task.tabs.getAtIndex(0).id)
      if (selected) {
        browserUI.switchToTab(selected, { focusWebview: true })
      }
    } catch (e) {}

    try { require('navbar/workspaceTray.js').render() } catch (e) {}
    try { require('navbar/tabBar.js').updateAll() } catch (e) {}
    try { require('sessionRestore.js').save(true, false) } catch (e) {}

    return createdList
  },

  showImportDialog: function () {
    // Page WebContentsView sits above HTML — park it so the modal is clickable
    try {
      webviews.requestPlaceholder('browserImport')
      document.body.classList.add('is-modal-mode')
    } catch (e) {}

    let profiles
    try {
      profiles = discoverProfiles()
    } catch (err) {
      releaseImportOverlay()
      window.alert('Import failed while scanning browsers:\n' + (err && err.message))
      return
    }

    if (!profiles.length) {
      releaseImportOverlay()
      window.alert('No Chrome, Edge, Brave, or Vivaldi profiles were found on this PC.')
      return
    }

    let existing = document.getElementById('zroot-import-modal')
    if (existing) existing.remove()

    const modal = document.createElement('div')
    modal.id = 'zroot-import-modal'
    modal.className = 'zroot-import-modal'
    modal.innerHTML = '<div class="zroot-import-panel">' +
      '<h2>Import into Prism</h2>' +
      '<p>Each selected profile becomes its <strong>own workspace</strong> — nothing is merged. Close other browsers if a profile shows 0 tabs.</p>' +
      '<div class="zroot-import-list"></div>' +
      '<div class="zroot-import-actions">' +
      '<button type="button" class="zroot-import-cancel">Cancel</button>' +
      '<button type="button" class="zroot-import-run">Import as separate workspaces</button>' +
      '</div></div>'

    const list = modal.querySelector('.zroot-import-list')
    profiles.forEach(function (p, idx) {
      const row = document.createElement('label')
      row.className = 'zroot-import-row'
      const checked = p.tabCount > 0 ? ' checked' : ''
      const detail = p.error
        ? p.error
        : (p.tabCount + ' tab' + (p.tabCount === 1 ? '' : 's') + (p.stale ? ' (snapshot)' : ''))
      row.innerHTML = '<input type="checkbox" data-idx="' + idx + '"' + checked + (p.tabCount ? '' : ' disabled') + '>' +
        '<span class="zroot-import-label">' + p.label + '</span>' +
        '<span class="zroot-import-meta">' + detail + '</span>'
      list.appendChild(row)
    })

    function closeModal () {
      modal.remove()
      releaseImportOverlay()
    }

    modal.querySelector('.zroot-import-cancel').addEventListener('click', closeModal)
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal()
    })
    modal.querySelector('.zroot-import-run').addEventListener('click', function () {
      const selected = []
      list.querySelectorAll('input[type=checkbox]:checked').forEach(function (cb) {
        selected.push(profiles[parseInt(cb.getAttribute('data-idx'), 10)])
      })
      if (!selected.length) {
        window.alert('Select at least one profile with tabs.')
        return
      }

      let created
      try {
        created = browserImport.importProfiles(selected)
      } catch (err) {
        closeModal()
        window.alert('Import failed:\n' + (err && err.message))
        return
      }
      closeModal()

      if (!created.length) {
        window.alert('No tabs could be read. Fully quit Chrome/Edge and try again.')
        return
      }
      const totalTabs = created.reduce(function (n, c) { return n + c.tabs }, 0)
      const names = created.map(function (c) { return c.label }).join('\n• ')
      window.alert(
        'Created ' + created.length + ' workspace' + (created.length === 1 ? '' : 's') +
        ' (' + totalTabs + ' tab' + (totalTabs === 1 ? '' : 's') + '):\n• ' + names
      )
    })

    document.body.appendChild(modal)
  },

  initialize: function () {}
}

module.exports = browserImport
