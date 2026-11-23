const remoteMenu = require('remoteMenuRenderer.js')
const browserUI = require('browserUI.js')
const webviews = require('webviews.js')
const readerView = require('readerView.js')
const urlParser = require('util/urlParser.js')
const tabGroups = require('navbar/tabGroups.js')

const tabContextMenu = {
  show: function (tabId) {
    const isPinned = !!tabs.get(tabId).pinned
    const currentGroup = tabs.get(tabId).groupId
    const groupItems = (tabGroups.ensureTaskGroups() || []).map(function (group) {
      return {
        label: (currentGroup === group.id ? '✓ ' : '') + group.name,
        click: function () {
          tabGroups.assignTab(tabId, group.id)
          require('navbar/tabBar.js').updateAll()
        }
      }
    })
    groupItems.push({
      label: l('tabMenuNewGroup') || 'New group…',
      click: function () {
        const name = window.prompt(l('tabMenuNewGroup') || 'New group…', 'Group')
        if (!name) {
          return
        }
        const group = tabGroups.createGroup(name.trim())
        tabGroups.assignTab(tabId, group.id)
        require('navbar/tabBar.js').updateAll()
      }
    })
    if (currentGroup) {
      groupItems.push({
        label: l('tabMenuRemoveFromGroup') || 'Remove from group',
        click: function () {
          tabGroups.assignTab(tabId, null)
          require('navbar/tabBar.js').updateAll()
        }
      })
    }

    const tabMenu = [
      [
        {
          label: isPinned ? (l('tabMenuUnpinTab') || 'Unpin tab') : (l('tabMenuPinTab') || 'Pin tab'),
          click: function () {
            tabs.update(tabId, { pinned: !isPinned })
            require('navbar/tabBar.js').updateAll()
          }
        },
        {
          label: l('tabMenuMoveToGroup') || 'Move to group',
          submenu: groupItems
        },
        {
          label: l('appMenuDuplicateTab'),
          click: function () {
            const sourceTab = tabs.get(tabId)
            // strip tab id so that a new one is generated
            const newTab = tabs.add({ ...sourceTab, id: undefined })

            browserUI.addTab(newTab, { enterEditMode: false })
          }
        },
        {
          label: l('tabMenuNewWindow'),
          click: function () {
            // insert after current task
            let index
            if (tasks.getSelected()) {
              index = tasks.getIndex(tasks.getSelected().id) + 1
            }
            const newTask = tasks.get(tasks.add({}, index))

            const targetTab = tabs.get(tabId)
            tabs.destroy(targetTab.id)

            newTask.tabs.add(targetTab)

            ipc.send('newWindow', { initialTask: newTask.id })

            browserUI.switchToTask(tasks.getSelected().id)
          }
        }
      ]
    ]

    if (tabs.get(tabId).url && (readerView.isReader(tabId) || !urlParser.isInternalURL(tabs.get(tabId).url))) {
      if (!readerView.isReader(tabId)) {
        tabMenu[0].push({
          label: l('enterReaderView'),
          click: function () {
            readerView.enter(tabId, tabs.get(tabId).url)
          }
        })
      } else {
        tabMenu[0].push({
          label: l('exitReaderView'),
          click: function () {
            readerView.exit(tabId)
          }
        })
      }
    }

    tabMenu[0].push( {
      label: l('tabMenuReload'),
      click: function () {
        if (tabs.get(tabId).url.startsWith(webviews.internalPages.error)) {
          // reload the original page rather than show the error page again
          webviews.update(tabId, new URL(tabs.get(tabId).url).searchParams.get('url'))
        } else {
          // this can't be an error page, use the normal reload method
          webviews.callAsync(tabId, 'reload')
        }
      }
    })

    remoteMenu.open(tabMenu)
  },
  initialize: function () {
    const container = document.getElementById('tabs-inner')
    container.addEventListener('contextmenu', function (e) {
      let node = e.target

      while (node) {
        if (node.classList.contains('tab-item')) {
          tabContextMenu.show(node.getAttribute('data-tab'))
          e.stopPropagation()
          break
        }
        node = node.parentNode
      }
    })
  }
}

module.exports = tabContextMenu
