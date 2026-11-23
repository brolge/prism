var browserUI = require('browserUI.js')
var webviews = require('webviews.js')
var tabEditor = require('navbar/tabEditor.js')
var tabState = require('tabState.js')
var settings = require('util/settings/settings.js')
var taskOverlay = require('taskOverlay/taskOverlay.js')
const writeFileAtomic = require('write-file-atomic')
const statistics = require('js/statistics.js')

const sessionRestore = {
  savePath: window.globalArgs['user-data-path'] + (platformType === 'windows' ? '\\sessionRestore.json' : '/sessionRestore.json'),
  previousState: null,
  saveTimer: null,
  save: function (forceSave, sync) {
    // forceSave bypasses the focused-window gate so quit/blur/crash-risk saves always land
    if (!forceSave && !document.body.classList.contains('focused')) {
      return
    }

    var selected = tasks.getSelected()
    var stateString = JSON.stringify(tasks.getStringifyableState())
    var data = {
      version: 2,
      state: JSON.parse(stateString),
      saveTime: Date.now(),
      lastSelectedTaskId: selected ? selected.id : null
    }

    // save all tabs that aren't private
    for (var i = 0; i < data.state.tasks.length; i++) {
      data.state.tasks[i].tabs = data.state.tasks[i].tabs.filter(function (tab) {
        return !tab.private
      })
    }

    // Only discard the active workspace's tabs when the user explicitly chose "blank task" startup
    if (settings.get('startupTabOption') === 3) {
      for (var j = 0; j < data.state.tasks.length; j++) {
        var live = tasks.get(data.state.tasks[j].id)
        if (live && live.selectedInWindow) {
          data.state.tasks[j].tabs = []
        }
      }
    }

    if (forceSave === true || stateString !== sessionRestore.previousState) {
      try {
        if (sync === true) {
          writeFileAtomic.sync(sessionRestore.savePath, JSON.stringify(data), {})
        } else {
          writeFileAtomic(sessionRestore.savePath, JSON.stringify(data), {}, function (err) {
            if (err) {
              console.warn(err)
              statistics.incrementValue('sessionRestoreSaveAsyncWriteErrors')
            }
          })
        }
        sessionRestore.previousState = stateString
      } catch (err) {
        console.warn('sessionRestore.save failed', err)
      }
    }

    // Flush site cookies / localStorage so logins survive restarts
    try {
      ipc.send('flush-storage-data')
    } catch (e) {}
  },
  scheduleSave: function () {
    clearTimeout(sessionRestore.saveTimer)
    sessionRestore.saveTimer = setTimeout(function () {
      sessionRestore.save(true, false)
    }, 750)
  },
  restoreFromFile: function () {
    var savedStringData
    try {
      savedStringData = fs.readFileSync(sessionRestore.savePath, 'utf-8')
    } catch (e) {
      console.warn('failed to read session restore data', e)
    }

    // Default: always reopen previous tabs/workspaces
    var startupConfigOption = settings.get('startupTabOption')
    if (startupConfigOption == null) {
      startupConfigOption = 1
      settings.set('startupTabOption', 1)
    }

    try {
      if (!savedStringData) {
        tasks.setSelected(tasks.add({ name: 'Workspace 1' }))
        var newTab = tasks.getSelected().tabs.add({
          url: 'min://newtab'
        })
        browserUI.addTab(newTab, {
          enterEditMode: false
        })
        sessionRestore.save(true, true)
        return
      }

      var data = JSON.parse(savedStringData)

      if ((data.version && data.version !== 2) || (data.state && data.state.tasks && data.state.tasks.length === 0)) {
        tasks.setSelected(tasks.add({ name: 'Workspace 1' }))
        browserUI.addTab(tasks.getSelected().tabs.add({ url: 'min://newtab' }), { enterEditMode: false })
        return
      }

      data.state.tasks.forEach(function (task) {
        tasks.add(task)
        if (task.tabs.length === 0) {
          tasks.get(task.id).tabs.add({ url: 'min://newtab' })
        }
      })

      var mostRecentTasks = tasks.slice().sort((a, b) => {
        return tasks.getLastActivity(b.id) - tasks.getLastActivity(a.id)
      })

      // Prefer the workspace that was active when we last saved
      var restoreId = data.lastSelectedTaskId && tasks.get(data.lastSelectedTaskId)
        ? data.lastSelectedTaskId
        : (mostRecentTasks[0] && mostRecentTasks[0].id)

      if (startupConfigOption === 3) {
        // User wants a blank workspace; keep old ones in the tray
        window.createdNewTaskOnStartup = true
        browserUI.addTask()
        tabEditor.hide()
      } else if (startupConfigOption === 2) {
        // Keep previous workspaces, focus the last real one (do not discard)
        window.createdNewTaskOnStartup = true
        if (restoreId) {
          browserUI.switchToTask(restoreId)
        } else {
          browserUI.addTask()
        }
        tabEditor.hide()
      } else {
        // Option 1 (default): reopen exactly where you left off
        if (restoreId) {
          browserUI.switchToTask(restoreId)
        } else {
          browserUI.addTask()
        }
        tabEditor.hide()
      }
    } catch (e) {
      console.error('restoring session failed: ', e)

      var backupSavePath = require('path').join(window.globalArgs['user-data-path'], 'sessionRestoreBackup-' + Date.now() + '.json')

      try {
        writeFileAtomic.sync(backupSavePath, savedStringData || '', {})
      } catch (e2) {}

      tabState.initialize()

      var newTask = tasks.add()
      var newSessionErrorTab = tasks.get(newTask).tabs.add({
        url: 'min://app/pages/sessionRestoreError/index.html?backupLoc=' + encodeURIComponent(backupSavePath)
      })

      browserUI.switchToTask(newTask)
      browserUI.switchToTab(newSessionErrorTab)

      statistics.incrementValue('sessionRestorationErrors')
    }
  },
  syncWithWindow: function () {
    const data = ipc.sendSync('request-tab-state')
    console.log('got from window', data)

    data.tasks.forEach(function (task) {
      tasks.add(task, undefined, false)
    })

    if (Object.hasOwn(window.globalArgs, 'initial-task')) {
      browserUI.switchToTask(window.globalArgs['initial-task'])
      return
    }

    var newTaskCandidates = tasks.filter(task => task.tabs.isEmpty() && !task.selectedInWindow && !task.name)
      .sort((a, b) => {
        return tasks.getLastActivity(b.id) - tasks.getLastActivity(a.id)
      })
    if (newTaskCandidates.length > 0) {
      browserUI.switchToTask(newTaskCandidates[0].id)
      tabEditor.hide()
    } else {
      browserUI.addTask()
    }
  },
  restore: function () {
    if (Object.hasOwn(window.globalArgs, 'initial-window')) {
      sessionRestore.restoreFromFile()
    } else {
      sessionRestore.syncWithWindow()
    }
    if (settings.get('newWindowOption') === 2 && !Object.hasOwn(window.globalArgs, 'launch-window') && !Object.hasOwn(window.globalArgs, 'initial-task')) {
      taskOverlay.show()
    }
  },
  initialize: function () {
    // Zroot default: always reopen previous tabs/workspaces
    if (settings.get('startupTabOption') == null) {
      settings.set('startupTabOption', 1)
    }

    // Frequent autosave
    setInterval(function () {
      sessionRestore.save(true, false)
    }, 10000)

    // Save whenever the session changes
    ;['task-added', 'task-destroyed', 'task-updated', 'task-selected', 'tab-added', 'tab-destroyed', 'tab-updated', 'tab-selected'].forEach(function (evt) {
      tasks.on(evt, sessionRestore.scheduleSave)
    })

    window.onbeforeunload = function () {
      sessionRestore.save(true, true)
      try {
        if (tasks.getSelected()) {
          ipc.send('tab-state-change', [
            ['task-updated', tasks.getSelected().id, 'selectedInWindow', null]
          ])
        }
      } catch (e) {}
    }

    // Save as soon as the window loses focus (closing / switching apps / shutdown)
    ipc.on('blur', function () {
      sessionRestore.save(true, true)
    })

    ipc.on('save-session-sync', function () {
      sessionRestore.save(true, true)
    })

    ipc.on('read-tab-state', function () {
      ipc.send('return-tab-state', tasks.getCopyableState())
    })
  }
}

module.exports = sessionRestore
