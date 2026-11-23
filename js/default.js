window.globalArgs = {}

process.argv.forEach(function (arg) {
  if (arg.startsWith('--')) {
    var key = arg.split('=')[0].replace('--', '')
    var value = arg.split('=')[1]
    globalArgs[key] = value
  }
})

window.windowId = globalArgs['window-id']

window.electron = require('electron')
window.fs = require('fs')
window.EventEmitter = require('events')
window.ipc = electron.ipcRenderer

if (navigator.platform === 'MacIntel') {
  document.body.classList.add('mac')
  window.platformType = 'mac'
} else if (navigator.platform === 'Win32') {
  document.body.classList.add('windows')
  window.platformType = 'windows'
} else {
  document.body.classList.add('linux')
  window.platformType = 'linux'
}

if (navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch')
}

/* add classes so that the window state can be used in CSS */
ipc.on('enter-full-screen', function () {
  document.body.classList.add('fullscreen')
})

ipc.on('leave-full-screen', function () {
  document.body.classList.remove('fullscreen')
})

ipc.on('maximize', function () {
  document.body.classList.add('maximized')
})

ipc.on('unmaximize', function () {
  document.body.classList.remove('maximized')
})

document.body.classList.add('focused')

ipc.on('focus', function () {
  document.body.classList.add('focused')
})

ipc.on('blur', function () {
  document.body.classList.remove('focused')
})

// https://remysharp.com/2010/07/21/throttling-function-calls

window.throttle = function (fn, threshhold, scope) {
  threshhold || (threshhold = 250)
  var last,
    deferTimer
  return function () {
    var context = scope || this

    var now = +new Date()
    var args = arguments
    if (last && now < last + threshhold) {
      // hold on to it
      clearTimeout(deferTimer)
      deferTimer = setTimeout(function () {
        last = now
        fn.apply(context, args)
      }, threshhold)
    } else {
      last = now
      fn.apply(context, args)
    }
  }
}

// https://remysharp.com/2010/07/21/throttling-function-calls

window.debounce = function (fn, delay) {
  var timer = null
  return function () {
    var context = this
    var args = arguments
    clearTimeout(timer)
    timer = setTimeout(function () {
      fn.apply(context, args)
    }, delay)
  }
}

window.empty = function (node) {
  var n
  while (n = node.firstElementChild) {
    node.removeChild(n)
  }
}

/* prevent a click event from firing after dragging the window */

window.addEventListener('load', function () {
  var isMouseDown = false
  var isDragging = false
  var distance = 0

  document.body.addEventListener('mousedown', function () {
    isMouseDown = true
    isDragging = false
    distance = 0
  })

  document.body.addEventListener('mouseup', function () {
    isMouseDown = false
  })

  var dragHandles = document.getElementsByClassName('windowDragHandle')

  for (var i = 0; i < dragHandles.length; i++) {
    dragHandles[i].addEventListener('mousemove', function (e) {
      if (isMouseDown) {
        isDragging = true
        distance += Math.abs(e.movementX) + Math.abs(e.movementY)
      }
    })
  }

  document.body.addEventListener('click', function (e) {
    if (isDragging && distance >= 10.0) {
      e.stopImmediatePropagation()
      isDragging = false
    }
  }, true)
})

require('tabState.js').initialize()
require('tabState/windowSync.js').initialize()
require('windowControls.js').initialize()
require('navbar/menuButton.js').initialize()

require('sidebar.js').initialize()
require('splitView.js').initialize()
require('chromeModes.js').initialize()
require('navbar/workspaceTray.js').initialize()
require('navbar/libraryTray.js').initialize()
require('browserImport.js').initialize()

// Clear any leftover modal/edit overlays that would swallow clicks
document.body.classList.remove('is-modal-mode', 'is-edit-mode', 'task-overlay-is-shown')
var leftoverImport = document.getElementById('zroot-import-modal')
if (leftoverImport) leftoverImport.remove()
var taskOverlayEl = document.getElementById('task-overlay')
if (taskOverlayEl) taskOverlayEl.hidden = true
var overlayEl = document.getElementById('overlay')
if (overlayEl) overlayEl.style.display = 'none'
require('navbar/addTabButton.js').initialize()
require('navbar/tabContextMenu.js').initialize()
require('navbar/tabActivity.js').initialize()
require('navbar/tabColor.js').initialize()
require('navbar/navigationButtons.js').initialize()
require('downloadManager.js').initialize()
require('webviewMenu.js').initialize()
require('contextMenu.js').initialize()
require('menuRenderer.js').initialize()
require('defaultKeybindings.js').initialize()
require('pdfViewer.js').initialize()
require('autofillSetup.js').initialize()
require('passwordManager/passwordManager.js').initialize()
require('passwordManager/passwordCapture.js').initialize()
require('passwordManager/passwordViewer.js').initialize()
require('util/theme.js').initialize()
require('util/galaxyTheme.js').initialize()
require('updateBanner.js').initialize()
require('userscripts.js').initialize()
require('statistics.js').initialize()
require('taskOverlay/taskOverlay.js').initialize()
require('sessionRestore.js').initialize()
require('bookmarkConverter.js').initialize()
require('newTabPage.js').initialize()
require('chromaLookup.js').initialize()
require('prismGX.js').initialize()
require('macHandoff.js').initialize()

// default searchbar plugins

require('searchbar/placesPlugin.js').initialize()
require('searchbar/instantAnswerPlugin.js').initialize()
require('searchbar/bangsPlugin.js').initialize()
require('searchbar/customBangs.js').initialize()
require('searchbar/searchSuggestionsPlugin.js').initialize()
require('searchbar/placeSuggestionsPlugin.js').initialize()
require('searchbar/updateNotifications.js').initialize()
require('searchbar/restoreTaskPlugin.js').initialize()
require('searchbar/bookmarkManager.js').initialize()
require('searchbar/historyViewer.js').initialize()
require('searchbar/developmentModeNotification.js').initialize()
require('searchbar/shortcutButtons.js').initialize()
require('searchbar/calculatorPlugin.js').initialize()

// once everything's loaded, start the session
require('sessionRestore.js').restore()

// Post-restore safety: chrome must always show at least one tab, dark chrome on,
// and the page view must sit to the right of the sidebar.
;(function ensureUsableChrome () {
  try {
    require('util/galaxyTheme.js').applyTheme(
      require('util/settings/settings.js').get('zrootTheme') || 'liquid-glass'
    )
  } catch (e) {}
  try {
    const browserUI = require('browserUI.js')
    const tabBar = require('navbar/tabBar.js')
    if (!tasks.getSelected()) {
      browserUI.addTask()
    } else if (!tasks.getSelected().tabs.count()) {
      browserUI.addTab(tasks.getSelected().tabs.add({ url: 'min://newtab' }), { enterEditMode: false })
    }
    tabBar.updateAll()
    require('navbar/tabEditor.js').hide()
    document.body.classList.remove('is-modal-mode', 'is-edit-mode', 'task-overlay-is-shown')
    require('webviews.js').resize()
    setTimeout(function () {
      try { require('webviews.js').resize() } catch (e) {}
    }, 100)
    setTimeout(function () {
      try { require('webviews.js').resize() } catch (e) {}
    }, 500)
  } catch (e) {
    console.error('ensureUsableChrome failed', e)
  }
})()
