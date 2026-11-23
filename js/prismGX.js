/**
 * Prism Control — focus, sound, and performance tools
 * 1 Resource Guard  2 Force Dark  3 Sound Control  4 Battery Saver
 * 5 Screenshot  6 Lucid Mode  7 Sidebar Apps  8 Cleaner
 * 9 Snappy Mode  10 Network Quiet
 */
const { ipcRenderer } = require('electron')
const webviews = require('webviews.js')
const browserUI = require('browserUI.js')
const settings = require('util/settings/settings.js')
const keybindings = require('keybindings.js')

const DARK_CSS = `
html{background:#121212!important;color-scheme:dark!important}
html,body,div,section,article,main,aside,nav,header,footer,ul,ol,li,table,tr,td,th,form,fieldset{
  background-color:transparent!important;border-color:rgba(255,255,255,.12)!important;color:#e8e8e8!important}
p,span,a,h1,h2,h3,h4,h5,h6,label,li,td,th{color:#e8e8e8!important}
a{color:#c4b5fd!important}
img,video{opacity:.92}
input,textarea,select,button{background:#1e1e1e!important;color:#eee!important;border-color:#444!important}
`

const LUCID_CSS = `
video,img{filter:contrast(1.08) saturate(1.12) brightness(1.03)!important}
video{image-rendering:auto}
`

const SIDEBAR_APPS = [
  { id: 'discord', label: 'Discord', url: 'https://discord.com/app' },
  { id: 'twitch', label: 'Twitch', url: 'https://www.twitch.tv' },
  { id: 'ytmusic', label: 'YT Music', url: 'https://music.youtube.com' },
  { id: 'reddit', label: 'Reddit', url: 'https://www.reddit.com' },
  { id: 'x', label: 'X', url: 'https://x.com' },
  { id: 'spotify', label: 'Spotify', url: 'https://open.spotify.com' }
]

const prismGX = {
  panel: null,
  button: null,
  metricsTimer: null,
  state: {
    forceDark: false,
    lucid: false,
    batterySaver: false,
    snappy: false,
    networkQuiet: false,
    networkMbps: 2,
    ramLimitMB: 0
  },

  injectStyle: function (tabId, id, css) {
    if (!webviews.hasViewForTab(tabId)) return
    const code = `(function(){var id=${JSON.stringify(id)};var css=${JSON.stringify(css)};
      var el=document.getElementById(id);if(!el){el=document.createElement('style');el.id=id;document.documentElement.appendChild(el)}
      el.textContent=css;})()`
    webviews.callAsync(tabId, 'executeJavaScript', [code])
  },

  removeStyle: function (tabId, id) {
    if (!webviews.hasViewForTab(tabId)) return
    const code = `(function(){var el=document.getElementById(${JSON.stringify(id)});if(el)el.remove()})()`
    webviews.callAsync(tabId, 'executeJavaScript', [code])
  },

  applyPageEffects: function (tabId) {
    if (!tabId) return
    const tab = (() => {
      try { return tasks.getTaskContainingTab(tabId).tabs.get(tabId) } catch (e) { return null }
    })()
    if (tab && tab.url && String(tab.url).startsWith('min://')) return

    if (prismGX.state.forceDark) {
      prismGX.injectStyle(tabId, 'prism-gx-force-dark', DARK_CSS)
    } else {
      prismGX.removeStyle(tabId, 'prism-gx-force-dark')
    }
    if (prismGX.state.lucid) {
      prismGX.injectStyle(tabId, 'prism-gx-lucid', LUCID_CSS)
    } else {
      prismGX.removeStyle(tabId, 'prism-gx-lucid')
    }
  },

  applyAllTabs: function () {
    tasks.forEach(function (task) {
      task.tabs.get().forEach(function (tab) {
        if (tab.hasWebContents) prismGX.applyPageEffects(tab.id)
      })
    })
  },

  setStatus: function (text) {
    const el = document.getElementById('prism-gx-status')
    if (el) el.textContent = text || ''
  },

  refreshMeters: async function () {
    try {
      const m = await ipcRenderer.invoke('prism-gx-metrics')
      const cpuEl = document.getElementById('prism-gx-cpu')
      const ramEl = document.getElementById('prism-gx-ram')
      const cpuBar = document.getElementById('prism-gx-cpu-bar')
      const ramBar = document.getElementById('prism-gx-ram-bar')
      if (cpuEl) cpuEl.textContent = m.cpu.toFixed(1) + '%'
      if (ramEl) ramEl.textContent = m.memoryMB + ' MB'
      if (cpuBar) cpuBar.style.width = Math.min(100, m.cpu) + '%'
      if (ramBar) {
        const total = (m.system && m.system.totalMB) || 16000
        ramBar.style.width = Math.min(100, (m.memoryMB / Math.max(512, total * 0.35)) * 100) + '%'
      }

      // Soft RAM guard — throttle everything harder when over limit
      if (prismGX.state.ramLimitMB > 0 && m.memoryMB > prismGX.state.ramLimitMB) {
        tasks.forEach(function (task) {
          task.tabs.get().forEach(function (tab) {
            if (!tab.hasWebContents) return
            if (tab.id === tabs.getSelected()) return
            try {
              webviews.callAsync(tab.id, 'setBackgroundThrottling', [true])
            } catch (e) {}
          })
        })
        prismGX.setStatus('RAM guard active — background tabs throttled')
      }
    } catch (e) {}
  },

  muteOthers: function () {
    const selected = tabs.getSelected()
    let n = 0
    tasks.forEach(function (task) {
      task.tabs.get().forEach(function (tab) {
        if (tab.id === selected) return
        if (tab.hasAudio || tab.muted) {
          webviews.callAsync(tab.id, 'setAudioMuted', [true])
          task.tabs.update(tab.id, { muted: true })
          n++
        }
      })
    })
    prismGX.setStatus(n ? ('Muted ' + n + ' other tab(s)') : 'No other audio tabs')
  },

  muteAll: function () {
    let n = 0
    tasks.forEach(function (task) {
      task.tabs.get().forEach(function (tab) {
        if (tab.hasWebContents) {
          webviews.callAsync(tab.id, 'setAudioMuted', [true])
          task.tabs.update(tab.id, { muted: true })
          n++
        }
      })
    })
    prismGX.setStatus('Muted ' + n + ' tab(s)')
  },

  jumpToNoisy: function () {
    let found = null
    tasks.forEach(function (task) {
      task.tabs.get().forEach(function (tab) {
        if (!found && tab.hasAudio && !tab.muted) {
          found = { taskId: task.id, tabId: tab.id }
        }
      })
    })
    if (!found) {
      prismGX.setStatus('No tab is playing audio')
      return
    }
    if (tasks.getSelected().id !== found.taskId) {
      browserUI.switchToTask(found.taskId)
    }
    browserUI.switchToTab(found.tabId)
    prismGX.setStatus('Jumped to noisy tab')
  },

  takeScreenshot: function () {
    const id = tabs.getSelected()
    if (!id) return
    ipcRenderer.send('saveViewCapture', { id: id })
    prismGX.setStatus('Screenshot saving…')
  },

  runCleaner: async function () {
    prismGX.setStatus('Cleaning cache…')
    try {
      const res = await ipcRenderer.invoke('prism-gx-cleaner')
      prismGX.setStatus('Cleaned · Prism now ~' + res.metrics.memoryMB + ' MB')
      prismGX.refreshMeters()
    } catch (e) {
      prismGX.setStatus('Cleaner failed')
    }
  },

  setBatterySaver: function (on) {
    prismGX.state.batterySaver = !!on
    settings.set('prismBatterySaver', prismGX.state.batterySaver)
    document.body.classList.toggle('prism-battery-saver', prismGX.state.batterySaver)
    if (on) {
      settings.set('animationsEnabled', false)
      document.body.classList.add('zroot-no-animations', 'prism-snappy')
      // Throttle every background tab hard
      tasks.forEach(function (task) {
        task.tabs.get().forEach(function (tab) {
          if (tab.id === tabs.getSelected()) return
          if (!tab.hasWebContents) return
          try {
            webviews.callAsync(tab.id, 'setBackgroundThrottling', [true])
            webviews.callAsync(tab.id, 'setAudioMuted', [true])
            task.tabs.update(tab.id, { muted: true })
          } catch (e) {}
        })
      })
      prismGX.setStatus('Battery Saver on — background quiet')
    } else {
      document.body.classList.remove('prism-battery-saver')
      if (!prismGX.state.snappy) {
        document.body.classList.remove('prism-snappy')
        settings.set('animationsEnabled', true)
        document.body.classList.remove('zroot-no-animations')
      }
      prismGX.setStatus('Battery Saver off')
    }
  },

  setSnappy: function (on) {
    prismGX.state.snappy = !!on
    settings.set('prismSnappy', prismGX.state.snappy)
    document.body.classList.toggle('prism-snappy', prismGX.state.snappy)
    settings.set('animationsEnabled', !on)
    document.body.classList.toggle('zroot-no-animations', on || prismGX.state.batterySaver)
    prismGX.setStatus(on ? 'Snappy Mode — animations off' : 'Snappy Mode off')
  },

  setForceDark: function (on) {
    prismGX.state.forceDark = !!on
    settings.set('prismForceDark', prismGX.state.forceDark)
    prismGX.applyAllTabs()
    prismGX.setStatus(on ? 'Force Dark Pages on' : 'Force Dark Pages off')
  },

  setLucid: function (on) {
    prismGX.state.lucid = !!on
    settings.set('prismLucid', prismGX.state.lucid)
    prismGX.applyAllTabs()
    prismGX.setStatus(on ? 'Lucid Mode — media enhanced' : 'Lucid Mode off')
  },

  setNetworkQuiet: async function (on) {
    prismGX.state.networkQuiet = !!on
    settings.set('prismNetworkQuiet', prismGX.state.networkQuiet)
    const res = await ipcRenderer.invoke('prism-gx-network-quiet', on, prismGX.state.networkMbps)
    if (!res.ok) {
      prismGX.setStatus('Network Quiet unavailable')
      return
    }
    prismGX.setStatus(on ? ('Network Quiet · ~' + prismGX.state.networkMbps + ' Mbps') : 'Network Quiet off')
  },

  openApp: function (url) {
    browserUI.addTab(tabs.add({ url: url }), { enterEditMode: false })
    prismGX.hide()
  },

  show: function () {
    if (!prismGX.panel) return
    try { webviews.requestPlaceholder('prismControl') } catch (e) {}
    prismGX.panel.hidden = false
    if (prismGX.button) prismGX.button.classList.add('active')
    prismGX.refreshMeters()
    clearInterval(prismGX.metricsTimer)
    prismGX.metricsTimer = setInterval(prismGX.refreshMeters, 2000)
  },

  hide: function () {
    if (!prismGX.panel) return
    prismGX.panel.hidden = true
    if (prismGX.button) prismGX.button.classList.remove('active')
    clearInterval(prismGX.metricsTimer)
    prismGX.metricsTimer = null
    try { webviews.hidePlaceholder('prismControl') } catch (e) {}
  },

  toggle: function () {
    if (!prismGX.panel) return
    if (prismGX.panel.hidden) prismGX.show()
    else prismGX.hide()
  },

  buildPanel: function () {
    const panel = document.createElement('div')
    panel.id = 'prism-gx-panel'
    panel.hidden = true
    panel.innerHTML = `
      <div class="prism-gx-head">
        <div>
          <strong>Prism Control</strong>
          <span>Focus, sound, and performance</span>
        </div>
        <button type="button" class="prism-gx-close" id="prism-gx-close" title="Close">×</button>
      </div>
      <div class="prism-gx-meters">
        <div class="prism-gx-meter">
          <label>CPU</label>
          <b id="prism-gx-cpu">—</b>
          <div class="bar"><i id="prism-gx-cpu-bar"></i></div>
        </div>
        <div class="prism-gx-meter">
          <label>RAM</label>
          <b id="prism-gx-ram">—</b>
          <div class="bar"><i id="prism-gx-ram-bar"></i></div>
        </div>
      </div>

      <div class="prism-gx-section">
        <h4>1 · Resource Guard</h4>
        <div class="prism-gx-row">
          <span>RAM limit (0 = off)</span>
          <input type="range" id="prism-gx-ram-limit" min="0" max="8000" step="256" value="0" />
        </div>
        <div class="prism-gx-row"><span id="prism-gx-ram-limit-label">Off</span></div>
      </div>

      <div class="prism-gx-section">
        <h4>2–4 · Page &amp; power</h4>
        <div class="prism-gx-row"><label><input type="checkbox" id="prism-gx-force-dark" /> Force Dark Pages</label></div>
        <div class="prism-gx-row"><label><input type="checkbox" id="prism-gx-lucid" /> Lucid Mode (media)</label></div>
        <div class="prism-gx-row"><label><input type="checkbox" id="prism-gx-battery" /> Battery Saver</label></div>
        <div class="prism-gx-row"><label><input type="checkbox" id="prism-gx-snappy" /> Snappy Mode</label></div>
      </div>

      <div class="prism-gx-section">
        <h4>5 · Sound Control</h4>
        <div class="prism-gx-actions">
          <button type="button" id="prism-gx-mute-others">Mute others</button>
          <button type="button" id="prism-gx-mute-all">Mute all</button>
          <button type="button" id="prism-gx-find-audio">Find noisy tab</button>
        </div>
      </div>

      <div class="prism-gx-section">
        <h4>6–8 · Capture &amp; clean</h4>
        <div class="prism-gx-actions">
          <button type="button" id="prism-gx-shot">Screenshot</button>
          <button type="button" id="prism-gx-clean">Prism Cleaner</button>
        </div>
      </div>

      <div class="prism-gx-section">
        <h4>9 · Network Quiet</h4>
        <div class="prism-gx-row">
          <label><input type="checkbox" id="prism-gx-net" /> Cap bandwidth</label>
          <input type="range" id="prism-gx-net-mbps" min="1" max="20" step="1" value="2" />
        </div>
        <div class="prism-gx-row"><span id="prism-gx-net-label">2 Mbps</span></div>
      </div>

      <div class="prism-gx-section">
        <h4>10 · Quick Apps</h4>
        <div class="prism-gx-apps" id="prism-gx-apps"></div>
      </div>

      <p class="prism-gx-status" id="prism-gx-status"></p>
    `
    document.body.appendChild(panel)
    prismGX.panel = panel

    const apps = panel.querySelector('#prism-gx-apps')
    SIDEBAR_APPS.forEach(function (app) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = app.label
      b.addEventListener('click', function () { prismGX.openApp(app.url) })
      apps.appendChild(b)
    })

    panel.querySelector('#prism-gx-close').addEventListener('click', prismGX.hide)
    panel.querySelector('#prism-gx-force-dark').addEventListener('change', function (e) {
      prismGX.setForceDark(e.target.checked)
    })
    panel.querySelector('#prism-gx-lucid').addEventListener('change', function (e) {
      prismGX.setLucid(e.target.checked)
    })
    panel.querySelector('#prism-gx-battery').addEventListener('change', function (e) {
      prismGX.setBatterySaver(e.target.checked)
    })
    panel.querySelector('#prism-gx-snappy').addEventListener('change', function (e) {
      prismGX.setSnappy(e.target.checked)
    })
    panel.querySelector('#prism-gx-mute-others').addEventListener('click', prismGX.muteOthers)
    panel.querySelector('#prism-gx-mute-all').addEventListener('click', prismGX.muteAll)
    panel.querySelector('#prism-gx-find-audio').addEventListener('click', prismGX.jumpToNoisy)
    panel.querySelector('#prism-gx-shot').addEventListener('click', prismGX.takeScreenshot)
    panel.querySelector('#prism-gx-clean').addEventListener('click', prismGX.runCleaner)

    const ramLimit = panel.querySelector('#prism-gx-ram-limit')
    const ramLabel = panel.querySelector('#prism-gx-ram-limit-label')
    ramLimit.addEventListener('input', function () {
      const v = Number(ramLimit.value)
      prismGX.state.ramLimitMB = v
      settings.set('prismRamLimitMB', v)
      ramLabel.textContent = v === 0 ? 'Off' : ('Throttle over ' + v + ' MB')
    })

    const net = panel.querySelector('#prism-gx-net')
    const netMbps = panel.querySelector('#prism-gx-net-mbps')
    const netLabel = panel.querySelector('#prism-gx-net-label')
    net.addEventListener('change', function () {
      prismGX.setNetworkQuiet(net.checked)
    })
    netMbps.addEventListener('input', function () {
      prismGX.state.networkMbps = Number(netMbps.value)
      settings.set('prismNetworkMbps', prismGX.state.networkMbps)
      netLabel.textContent = prismGX.state.networkMbps + ' Mbps'
      if (prismGX.state.networkQuiet) prismGX.setNetworkQuiet(true)
    })
  },

  buildSidebarApps: function () {
    const sidebar = document.getElementById('sidebar')
    if (!sidebar || document.getElementById('sidebar-apps')) return
    const strip = document.createElement('div')
    strip.id = 'sidebar-apps'
    strip.setAttribute('aria-label', 'Quick apps')
    SIDEBAR_APPS.forEach(function (app) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = app.label
      b.title = 'Open ' + app.label
      b.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        prismGX.openApp(app.url)
      })
      strip.appendChild(b)
    })
    const tabs = document.getElementById('tabs')
    if (tabs) sidebar.insertBefore(strip, tabs)
    else sidebar.appendChild(strip)
  },

  buildButton: function () {
    let btn = document.getElementById('prism-gx-button')
    if (!btn) {
      const nav = document.getElementById('navbar')
      if (!nav) return
      btn = document.createElement('button')
      btn.type = 'button'
      btn.id = 'prism-gx-button'
      btn.className = 'navbar-action-button i carbon:meter'
      btn.title = 'Prism Control (Ctrl+Shift+G)'
      btn.setAttribute('aria-label', 'Prism Control')
      btn.tabIndex = -1
      const menu = document.getElementById('menu-button')
      if (menu && menu.parentNode === nav) {
        nav.insertBefore(btn, menu.nextSibling)
      } else {
        nav.appendChild(btn)
      }
    }
    btn.style.webkitAppRegion = 'no-drag'
    btn.style.position = 'relative'
    btn.style.zIndex = '5'
    if (!btn.getAttribute('data-prism-bound')) {
      btn.setAttribute('data-prism-bound', '1')
      btn.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        prismGX.toggle()
      })
    }
    prismGX.button = btn
  },

  restoreState: function () {
    prismGX.state.forceDark = !!settings.get('prismForceDark')
    prismGX.state.lucid = !!settings.get('prismLucid')
    prismGX.state.batterySaver = !!settings.get('prismBatterySaver')
    prismGX.state.snappy = !!settings.get('prismSnappy')
    prismGX.state.networkQuiet = !!settings.get('prismNetworkQuiet')
    prismGX.state.networkMbps = Number(settings.get('prismNetworkMbps')) || 2
    prismGX.state.ramLimitMB = Number(settings.get('prismRamLimitMB')) || 0

    if (!prismGX.panel) return
    prismGX.panel.querySelector('#prism-gx-force-dark').checked = prismGX.state.forceDark
    prismGX.panel.querySelector('#prism-gx-lucid').checked = prismGX.state.lucid
    prismGX.panel.querySelector('#prism-gx-battery').checked = prismGX.state.batterySaver
    prismGX.panel.querySelector('#prism-gx-snappy').checked = prismGX.state.snappy
    prismGX.panel.querySelector('#prism-gx-net').checked = prismGX.state.networkQuiet
    prismGX.panel.querySelector('#prism-gx-net-mbps').value = String(prismGX.state.networkMbps)
    prismGX.panel.querySelector('#prism-gx-net-label').textContent = prismGX.state.networkMbps + ' Mbps'
    prismGX.panel.querySelector('#prism-gx-ram-limit').value = String(prismGX.state.ramLimitMB)
    prismGX.panel.querySelector('#prism-gx-ram-limit-label').textContent =
      prismGX.state.ramLimitMB === 0 ? 'Off' : ('Throttle over ' + prismGX.state.ramLimitMB + ' MB')

    document.body.classList.toggle('prism-battery-saver', prismGX.state.batterySaver)
    document.body.classList.toggle('prism-snappy', prismGX.state.snappy || prismGX.state.batterySaver)
    if (prismGX.state.forceDark || prismGX.state.lucid) {
      setTimeout(prismGX.applyAllTabs, 800)
    }
    if (prismGX.state.networkQuiet) {
      ipcRenderer.invoke('prism-gx-network-quiet', true, prismGX.state.networkMbps)
    }
  },

  initialize: function () {
    prismGX.buildButton()
    prismGX.buildPanel()
    prismGX.buildSidebarApps()
    prismGX.restoreState()

    keybindings.defineShortcut({ keys: 'mod+shift+g' }, prismGX.toggle)

    webviews.bindEvent('did-finish-load', function (tabId) {
      prismGX.applyPageEffects(tabId)
    })
    webviews.bindEvent('dom-ready', function (tabId) {
      prismGX.applyPageEffects(tabId)
    })

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && prismGX.panel && !prismGX.panel.hidden) {
        prismGX.hide()
      }
    })
  }
}

module.exports = prismGX
