const focusMode = require('focusMode.js')

const GROUP_COLORS = ['#8ab4f8', '#f28b82', '#fdd663', '#81c995', '#c58af9', '#78d9ec', '#ff8bcb']

function getBrowserUI () {
  // Lazy require — avoids circular init (tabBar → tabGroups → workspaceTray → browserUI)
  return require('browserUI.js')
}

function workspaceName (task, index) {
  return task.name || ('Workspace ' + (index + 1))
}

/**
 * Prism-themed 2-step delete confirm (async).
 * Native window.confirm stacks break in Electron — use this instead.
 */
function confirmDeleteWorkspace (name) {
  return new Promise(function (resolve) {
    const webviews = require('webviews.js')
    try {
      webviews.requestPlaceholder('workspaceDelete')
      document.body.classList.add('is-modal-mode')
    } catch (e) {}

    const existing = document.getElementById('prism-delete-modal')
    if (existing) existing.remove()

    const modal = document.createElement('div')
    modal.id = 'prism-delete-modal'
    modal.className = 'prism-delete-modal'
    modal.innerHTML =
      '<div class="prism-delete-panel" role="dialog" aria-modal="true">' +
        '<h2>Delete workspace?</h2>' +
        '<p class="prism-delete-lead">Close all tabs in <strong></strong> and remove this workspace.</p>' +
        '<div class="prism-delete-step" data-step="1">' +
          '<div class="prism-delete-actions">' +
            '<button type="button" class="prism-delete-cancel" data-act="cancel">Cancel</button>' +
            '<button type="button" class="prism-delete-danger" data-act="next">Delete</button>' +
          '</div>' +
        '</div>' +
        '<div class="prism-delete-step" data-step="2" hidden>' +
          '<p class="prism-delete-warn">Final confirm — type <kbd>DELETE</kbd> below. This cannot be undone.</p>' +
          '<input type="text" class="prism-delete-input" placeholder="Type DELETE" spellcheck="false" autocomplete="off" />' +
          '<div class="prism-delete-actions">' +
            '<button type="button" class="prism-delete-cancel" data-act="cancel">Cancel</button>' +
            '<button type="button" class="prism-delete-danger" data-act="confirm" disabled>Delete forever</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    modal.querySelector('.prism-delete-lead strong').textContent = name

    function finish (ok) {
      modal.remove()
      try {
        webviews.hidePlaceholder('workspaceDelete')
        document.body.classList.remove('is-modal-mode')
      } catch (e) {}
      resolve(!!ok)
    }

    const step1 = modal.querySelector('[data-step="1"]')
    const step2 = modal.querySelector('[data-step="2"]')
    const input = modal.querySelector('.prism-delete-input')
    const confirmBtn = modal.querySelector('[data-act="confirm"]')

    modal.addEventListener('click', function (e) {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act')
      if (e.target === modal || act === 'cancel') {
        finish(false)
        return
      }
      if (act === 'next') {
        step1.hidden = true
        step2.hidden = false
        input.focus()
        return
      }
      if (act === 'confirm') {
        if (input.value.trim().toUpperCase() === 'DELETE') finish(true)
      }
    })

    input.addEventListener('input', function () {
      confirmBtn.disabled = input.value.trim().toUpperCase() !== 'DELETE'
    })
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !confirmBtn.disabled) finish(true)
      if (e.key === 'Escape') finish(false)
    })
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') finish(false)
    })

    document.body.appendChild(modal)
  })
}

const workspaceTray = {
  el: null,
  panel: null,
  addButton: null,
  importButton: null,
  bound: false,
  renamingId: null,
  switchTo: function (taskId) {
    if (!taskId) return false
    if (focusMode.enabled()) {
      focusMode.warn()
      return false
    }
    const task = tasks.get(taskId)
    if (!task) {
      console.warn('workspaceTray: unknown task', taskId)
      return false
    }
    const current = tasks.getSelected()
    if (current && String(current.id) === String(task.id)) {
      return true
    }
    try {
      getBrowserUI().switchToTask(task.id)
    } catch (err) {
      console.error('switchToTask failed', err)
      return false
    }
    workspaceTray.render()
    try { require('webviews.js').resize() } catch (e) {}
    return true
  },
  startRename: function (taskId) {
    const task = tasks.get(taskId)
    if (!task) return
    workspaceTray.renamingId = String(task.id)
    workspaceTray.render()
    requestAnimationFrame(function () {
      const input = workspaceTray.el && workspaceTray.el.querySelector('.workspace-rename-input')
      if (input) {
        input.focus()
        input.select()
      }
    })
  },
  commitRename: function (taskId, value) {
    workspaceTray.renamingId = null
    const task = tasks.get(taskId)
    if (!task) {
      workspaceTray.render()
      return
    }
    const next = (value || '').trim()
    if (next && next !== task.name) {
      tasks.update(task.id, { name: next })
    }
    workspaceTray.render()
  },
  cancelRename: function () {
    workspaceTray.renamingId = null
    workspaceTray.render()
  },
  addWorkspace: function () {
    if (focusMode.enabled()) {
      focusMode.warn()
      return
    }
    const index = tasks.getLength()
    const id = tasks.add({
      name: 'Workspace ' + (index + 1),
      color: GROUP_COLORS[index % GROUP_COLORS.length]
    })
    const task = tasks.get(id)
    if (task && task.tabs.count() === 0) {
      task.tabs.add({ url: 'min://newtab' })
    }
    getBrowserUI().switchToTask(id)
    workspaceTray.render()
  },
  render: function () {
    workspaceTray.el = document.getElementById('workspace-tray')
    if (!workspaceTray.el) return
    empty(workspaceTray.el)

    const list = tasks.filter(function () { return true })
    const selected = tasks.getSelected()

    list.forEach(function (task, index) {
      const isActive = selected && String(selected.id) === String(task.id)
      const isRenaming = workspaceTray.renamingId && String(workspaceTray.renamingId) === String(task.id)
      const color = task.color || GROUP_COLORS[index % GROUP_COLORS.length]
      const name = workspaceName(task, index)

      const row = document.createElement('div')
      row.className = 'workspace-row' + (isActive ? ' active' : '')
      row.setAttribute('role', 'listitem')
      row.setAttribute('data-workspace-id', String(task.id))
      row.style.setProperty('--ws-color', color)

      const swatch = document.createElement('span')
      swatch.className = 'workspace-row-swatch'
      swatch.setAttribute('aria-hidden', 'true')

      const mainBtn = document.createElement('button')
      mainBtn.type = 'button'
      mainBtn.className = 'workspace-row-main'
      mainBtn.title = name + ' — Ctrl+' + (index + 1)

      if (isRenaming) {
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'workspace-rename-input'
        input.value = task.name || name
        input.maxLength = 40
        input.addEventListener('click', function (e) { e.stopPropagation() })
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault()
            workspaceTray.commitRename(task.id, input.value)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            workspaceTray.cancelRename()
          }
        })
        input.addEventListener('blur', function () {
          setTimeout(function () {
            if (workspaceTray.renamingId && String(workspaceTray.renamingId) === String(task.id)) {
              workspaceTray.commitRename(task.id, input.value)
            }
          }, 120)
        })
        mainBtn.appendChild(input)
      } else {
        const meta = document.createElement('span')
        meta.className = 'workspace-row-meta'
        const nameEl = document.createElement('span')
        nameEl.className = 'workspace-row-name'
        nameEl.textContent = name
        const countEl = document.createElement('span')
        countEl.className = 'workspace-row-count'
        countEl.textContent = task.tabs.count() + ' tab' + (task.tabs.count() === 1 ? '' : 's')
        meta.appendChild(nameEl)
        meta.appendChild(countEl)
        mainBtn.appendChild(meta)
      }

      const indexEl = document.createElement('span')
      indexEl.className = 'workspace-row-index'
      indexEl.textContent = String(index + 1)
      mainBtn.appendChild(indexEl)

      mainBtn.addEventListener('click', function (e) {
        if (isRenaming) return
        e.preventDefault()
        e.stopPropagation()
        workspaceTray.switchTo(task.id)
      })

      const renameBtn = document.createElement('button')
      renameBtn.type = 'button'
      renameBtn.className = 'workspace-row-rename i carbon:edit'
      renameBtn.title = 'Rename workspace'
      renameBtn.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        workspaceTray.startRename(task.id)
      })

      row.appendChild(swatch)
      row.appendChild(mainBtn)
      row.appendChild(renameBtn)
      workspaceTray.el.appendChild(row)
    })
  },
  showMenu: function (task, index) {
    const remoteMenu = require('remoteMenuRenderer.js')
    const name = workspaceName(task, index)
    remoteMenu.open([[
      {
        label: 'Rename…',
        click: function () {
          workspaceTray.startRename(task.id)
        }
      },
      {
        label: 'Switch to workspace',
        click: function () {
          workspaceTray.switchTo(task.id)
        }
      },
      {
        label: 'Delete workspace…',
        click: async function () {
          if (tasks.getLength() <= 1) {
            window.alert('You need at least one workspace.')
            return
          }
          if (!(await confirmDeleteWorkspace(name))) return
          getBrowserUI().closeTask(task.id)
          workspaceTray.render()
        }
      }
    ]])
  },
  initialize: function () {
    workspaceTray.el = document.getElementById('workspace-tray')
    workspaceTray.panel = document.getElementById('workspace-panel')
    workspaceTray.addButton = document.getElementById('workspace-add-button')
    workspaceTray.importButton = document.getElementById('workspace-import-button')

    workspaceTray.render()

    if (!workspaceTray.bound) {
      workspaceTray.bound = true

      if (workspaceTray.addButton) {
        workspaceTray.addButton.addEventListener('click', function (e) {
          e.preventDefault()
          e.stopPropagation()
          workspaceTray.addWorkspace()
        })
      }
      if (workspaceTray.importButton) {
        workspaceTray.importButton.addEventListener('click', function (e) {
          e.preventDefault()
          e.stopPropagation()
          require('browserImport.js').showImportDialog()
        })
      }

      if (workspaceTray.panel) {
        workspaceTray.panel.addEventListener('contextmenu', function (e) {
          const row = e.target && e.target.closest && e.target.closest('[data-workspace-id]')
          if (!row) return
          e.preventDefault()
          const id = row.getAttribute('data-workspace-id')
          const list = tasks.filter(function () { return true })
          const index = list.findIndex(t => String(t.id) === String(id))
          if (index >= 0) workspaceTray.showMenu(list[index], index)
        })
      }
    }

    let renderTimer = null
    function scheduleRender () {
      if (workspaceTray.renamingId) return
      clearTimeout(renderTimer)
      renderTimer = setTimeout(workspaceTray.render, 30)
    }

    tasks.on('task-added', scheduleRender)
    tasks.on('task-destroyed', scheduleRender)
    tasks.on('task-updated', scheduleRender)
    tasks.on('task-selected', scheduleRender)
    tasks.on('tab-added', scheduleRender)
    tasks.on('tab-destroyed', scheduleRender)
  },
  colors: GROUP_COLORS
}

workspaceTray.confirmDelete = confirmDeleteWorkspace
module.exports = workspaceTray
