const sidebar = require('sidebar.js')
const webviews = require('webviews.js')

const EDGE = 6

const chromeModes = {
  focusChromeHidden: false,
  fullscreenChromeHidden: false,
  peekSidebar: false,
  peekToolbar: false,
  apply: function () {
    const hideChrome = chromeModes.focusChromeHidden || chromeModes.fullscreenChromeHidden
    document.body.classList.toggle('chrome-hidden', hideChrome)
    document.body.classList.toggle('zroot-focus-chrome', chromeModes.focusChromeHidden)
    document.body.classList.toggle('sidebar-peek', chromeModes.peekSidebar)
    document.body.classList.toggle('toolbar-peek', chromeModes.peekToolbar)

    // When chrome is hidden in windowed focus mode, collapse sidebar for layout math
    if (chromeModes.focusChromeHidden && !document.body.classList.contains('fullscreen')) {
      sidebar.setCollapsed(true, false)
    }

    webviews.resize()
  },
  toggleFocusMode: function () {
    chromeModes.focusChromeHidden = !chromeModes.focusChromeHidden
    if (!chromeModes.focusChromeHidden) {
      chromeModes.peekSidebar = false
      chromeModes.peekToolbar = false
      // restore sidebar from settings
      sidebar.setCollapsed(!!require('util/settings/settings.js').get('sidebarCollapsed'), false)
    }
    chromeModes.apply()
  },
  setFullscreenChrome: function (enabled) {
    chromeModes.fullscreenChromeHidden = !!enabled
    if (!enabled) {
      chromeModes.peekSidebar = false
      chromeModes.peekToolbar = false
    }
    chromeModes.apply()
  },
  onMouseMove: function (e) {
    const hideChrome = chromeModes.focusChromeHidden || chromeModes.fullscreenChromeHidden
    if (!hideChrome) {
      return
    }

    const nearLeft = e.clientX <= EDGE
    const nearTop = e.clientY <= EDGE
    const leaveSidebar = e.clientX > (sidebar.getWidth() || 220) + 24
    const leaveToolbar = e.clientY > 48 + 24

    let changed = false
    if (nearLeft && !chromeModes.peekSidebar) {
      chromeModes.peekSidebar = true
      changed = true
    } else if (!nearLeft && chromeModes.peekSidebar && leaveSidebar) {
      chromeModes.peekSidebar = false
      changed = true
    }

    if (nearTop && !chromeModes.peekToolbar) {
      chromeModes.peekToolbar = true
      changed = true
    } else if (!nearTop && chromeModes.peekToolbar && leaveToolbar) {
      chromeModes.peekToolbar = false
      changed = true
    }

    if (changed) {
      chromeModes.apply()
    }
  },
  initialize: function () {
    // Never start stuck in a chrome-hidden state from a previous session quirk
    chromeModes.focusChromeHidden = false
    chromeModes.fullscreenChromeHidden = false
    chromeModes.peekSidebar = false
    chromeModes.peekToolbar = false
    document.body.classList.remove('chrome-hidden', 'zroot-focus-chrome', 'sidebar-peek', 'toolbar-peek')

    window.addEventListener('mousemove', chromeModes.onMouseMove)

    ipc.on('enter-full-screen', function () {
      chromeModes.setFullscreenChrome(true)
    })

    ipc.on('leave-full-screen', function () {
      chromeModes.setFullscreenChrome(false)
    })

    ipc.on('zroot-toggle-fullscreen', function () {
      ipc.invoke('zrootSetFullScreen')
    })

    // After first paint, re-measure chrome and push BrowserView bounds
    requestAnimationFrame(function () {
      webviews.resize()
      setTimeout(function () { webviews.resize() }, 100)
      setTimeout(function () { webviews.resize() }, 500)
    })
  }
}

module.exports = chromeModes
