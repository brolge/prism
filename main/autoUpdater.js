/**
 * Prism auto-updates via electron-updater.
 * Default feed: GitHub Releases (package.json → build.publish).
 * Optional override: settings.updateFeedUrl (generic provider base URL).
 * Concatenated into main.build.js — uses globals: app, ipc, settings, windows, sendIPCToWindow, path, fs
 */
var updateLogPath = path.join(app.getPath('userData'), 'prism-updates.log')

function updateLog (message, extra) {
  const line = '[' + new Date().toISOString() + '] ' + message + (extra ? ' ' + JSON.stringify(extra) : '') + '\n'
  try {
    fs.appendFileSync(updateLogPath, line)
  } catch (e) {}
  console.log('[updater]', message, extra || '')
}

let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch (e) {
  updateLog('electron-updater not available', { error: String(e) })
}

function broadcast (channel, payload) {
  windows.getAll().forEach(function (win) {
    try {
      sendIPCToWindow(win, channel, payload)
    } catch (e) {}
  })
}

function applyFeedUrl () {
  if (!autoUpdater) return
  const feed = settings.get('updateFeedUrl')
  if (feed && typeof feed === 'string' && /^https?:\/\//i.test(feed.trim())) {
    try {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: feed.trim().replace(/\/$/, '')
      })
      updateLog('using custom update feed', { url: feed.trim() })
      return
    } catch (e) {
      updateLog('custom feed failed; falling back to GitHub', { error: String(e && e.message || e) })
    }
  }
  // Default: GitHub Releases from package.json build.publish
}

function configureUpdater () {
  if (!autoUpdater) {
    return
  }

  applyFeedUrl()
  autoUpdater.autoDownload = settings.get('autoUpdatesEnabled') !== false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = {
    info: (m) => updateLog(String(m)),
    warn: (m) => updateLog('WARN ' + String(m)),
    error: (m) => updateLog('ERROR ' + String(m)),
    debug: (m) => updateLog('DEBUG ' + String(m))
  }

  autoUpdater.removeAllListeners()
  autoUpdater.on('checking-for-update', () => {
    updateLog('checking-for-update')
    broadcast('zroot-update-checking', {})
  })
  autoUpdater.on('update-available', (info) => {
    updateLog('update-available', info)
    broadcast('zroot-update-available', info)
  })
  autoUpdater.on('update-not-available', (info) => {
    updateLog('update-not-available', info)
    broadcast('zroot-update-not-available', info)
  })
  autoUpdater.on('error', (err) => {
    updateLog('error', { message: err && err.message })
    broadcast('zroot-update-error', { message: err && err.message })
  })
  autoUpdater.on('download-progress', (progress) => {
    updateLog('download-progress', { percent: progress && progress.percent })
    broadcast('zroot-update-progress', {
      percent: progress && progress.percent,
      transferred: progress && progress.transferred,
      total: progress && progress.total
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    updateLog('update-downloaded', info)
    broadcast('zroot-update-ready', info)
  })
}

function checkForUpdates (manual) {
  if (!autoUpdater) {
    return Promise.resolve('Updater unavailable in this build.')
  }
  if (settings.get('autoUpdatesEnabled') === false && !manual) {
    updateLog('auto updates disabled; skipping')
    return Promise.resolve('Automatic updates are disabled.')
  }
  configureUpdater()
  autoUpdater.autoDownload = settings.get('autoUpdatesEnabled') !== false || !!manual
  return autoUpdater.checkForUpdates().then(function (result) {
    if (!result || !result.updateInfo) {
      return 'No updates found.'
    }
    return 'Update check started (latest: ' + result.updateInfo.version + ').'
  }).catch(function (err) {
    updateLog('check failed', { message: err.message })
    throw err
  })
}

ipc.handle('getAppVersion', function () {
  return app.getVersion()
})

ipc.handle('zrootCheckForUpdates', async function () {
  if (!app.isPackaged) {
    return 'Updates only work in the installed Prism app (not the dev build).'
  }
  configureUpdater()
  if (!autoUpdater) {
    return 'Updater unavailable.'
  }
  autoUpdater.autoDownload = true
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result && result.updateInfo) {
      const remote = result.updateInfo.version
      if (remote && remote !== app.getVersion()) {
        return 'Found version ' + remote + '. Downloading…'
      }
      return 'You are up to date (' + app.getVersion() + ').'
    }
    return 'You are up to date (' + app.getVersion() + ').'
  } catch (err) {
    updateLog('manual check failed', { message: err.message })
    return 'Update check failed: ' + err.message
  }
})

ipc.handle('zrootInstallUpdateNow', function () {
  if (!autoUpdater) return false
  setImmediate(function () {
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (e) {
      updateLog('quitAndInstall failed', { message: e && e.message })
    }
  })
  return true
})

ipc.handle('zrootGetUpdateLogPath', function () {
  return updateLogPath
})

ipc.handle('prismTriggerUpdateCheck', async function (e, opts) {
  opts = opts || {}
  if (!app.isPackaged && !opts.force) {
    return { ok: false, message: 'Packaged app only.' }
  }
  try {
    const message = await checkForUpdates(true)
    return { ok: true, message: message }
  } catch (err) {
    return { ok: false, message: err && err.message }
  }
})

if (app.isPackaged) {
  configureUpdater()
  app.whenReady().then(function () {
    // Startup check
    setTimeout(function () {
      checkForUpdates(false).catch(function () {})
    }, 8000)

    // Periodic check every 4 hours
    setInterval(function () {
      checkForUpdates(false).catch(function () {})
    }, 4 * 60 * 60 * 1000)
  })
} else {
  updateLog('skipping updater in development')
}
