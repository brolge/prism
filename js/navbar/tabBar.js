const EventEmitter = require('events')

const webviews = require('webviews.js')
const focusMode = require('focusMode.js')
const readerView = require('readerView.js')
const tabAudio = require('tabAudio.js')
const dragula = require('dragula')
const settings = require('util/settings/settings.js')
const urlParser = require('util/urlParser.js')

const tabEditor = require('navbar/tabEditor.js')
const progressBar = require('navbar/progressBar.js')
const permissionRequests = require('navbar/permissionRequests.js')
const tabGroups = require('navbar/tabGroups.js')

var lastTabDeletion = 0 // TODO get rid of this

const tabBar = {
  navBar: document.getElementById('navbar'),
  container: document.getElementById('tabs'),
  containerInner: document.getElementById('tabs-inner'),
  pinnedContainer: document.getElementById('tabs-pinned'),
  addressDisplay: document.getElementById('address-bar-display'),
  tabElementMap: {}, // tabId: tab element
  events: new EventEmitter(),
  dragulaInstance: null,
  getTab: function (tabId) {
    return tabBar.tabElementMap[tabId]
  },
  getTabInput: function (tabId) {
    return tabBar.getTab(tabId).querySelector('.tab-input')
  },
  getTargetContainer: function (tabData) {
    return tabData.pinned ? tabBar.pinnedContainer : tabBar.containerInner
  },
  syncPinnedVisibility: function () {
    const hasPinned = tabBar.pinnedContainer && tabBar.pinnedContainer.childNodes.length > 0
    if (tabBar.pinnedContainer) {
      tabBar.pinnedContainer.hidden = !hasPinned
    }
  },
  setActiveTab: function (tabId) {
    var activeTab = document.querySelector('.tab-item.active')

    if (activeTab) {
      activeTab.classList.remove('active')
      activeTab.removeAttribute('aria-selected')
    }

    var el = tabBar.getTab(tabId)
    if (!el) {
      return
    }
    el.classList.add('active')
    el.setAttribute('aria-selected', 'true')

    requestAnimationFrame(function () {
      el.scrollIntoView({ block: 'nearest' })
    })

    tabBar.updateAddressDisplay(tabId)
  },
  updateAddressDisplay: function (tabId) {
    if (!tabBar.addressDisplay) {
      return
    }
    const tabData = tabs.get(tabId || tabs.getSelected())
    if (!tabData) {
      tabBar.addressDisplay.textContent = ''
      return
    }
    const isNewTab = tabData.url === '' || tabData.url === urlParser.parse('min://newtab')
    if (isNewTab) {
      tabBar.addressDisplay.textContent = 'Prism Lookup'
    } else {
      tabBar.addressDisplay.textContent = urlParser.getSourceURL(tabData.url) || tabData.title || ''
    }
  },
  createTab: function (data) {
    var tabEl = document.createElement('div')
    tabEl.className = 'tab-item' + (data.pinned ? ' pinned' : '')
    tabEl.setAttribute('data-tab', data.id)
    tabEl.setAttribute('role', 'tab')

    tabEl.appendChild(readerView.getButton(data.id))
    tabEl.appendChild(tabAudio.getButton(data.id))
    tabEl.appendChild(progressBar.create())

    // favicon
    var favicon = document.createElement('img')
    favicon.className = 'tab-favicon placeholder'
    favicon.alt = ''
    favicon.draggable = false
    tabEl.appendChild(favicon)

    // icons
    var iconArea = document.createElement('span')
    iconArea.className = 'tab-icon-area'

    if (data.private) {
      var pbIcon = document.createElement('i')
      pbIcon.className = 'icon-tab-is-private tab-icon tab-info-icon i carbon:view-off'
      iconArea.appendChild(pbIcon)
    }

    var closeTabButton = document.createElement('button')
    closeTabButton.className = 'tab-icon tab-close-button i carbon:close'

    closeTabButton.addEventListener('click', function (e) {
      tabBar.events.emit('tab-closed', data.id)
      e.stopPropagation()
    })

    iconArea.appendChild(closeTabButton)
    tabEl.appendChild(iconArea)

    var titleContainer = document.createElement('div')
    titleContainer.className = 'title-container'

    var title = document.createElement('span')
    title.className = 'title'

    var urlElement = document.createElement('span')
    urlElement.className = 'url-element'

    titleContainer.appendChild(title)
    titleContainer.appendChild(urlElement)
    tabEl.appendChild(titleContainer)

    tabEl.addEventListener('click', function (e) {
      if (tabs.getSelected() !== data.id) {
        tabBar.events.emit('tab-selected', data.id)
      } else {
        tabEditor.show(data.id)
      }
    })

    tabEl.addEventListener('auxclick', function (e) {
      if (e.which === 2) {
        tabBar.events.emit('tab-closed', data.id)
      }
    })

    tabEl.addEventListener('wheel', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return
      }
      if (e.deltaY > 65 && e.deltaX < 10 && Date.now() - lastTabDeletion > 900) {
        lastTabDeletion = Date.now()

        if (focusMode.enabled()) {
          focusMode.warn()
          return
        }

        this.style.transform = 'translateX(-100%)'

        setTimeout(function () {
          tabBar.events.emit('tab-closed', data.id)
        }, 150)
      }
    })

    tabBar.updateTab(data.id, tabEl)

    return tabEl
  },
  updateTab: function (tabId, tabEl = tabBar.getTab(tabId)) {
    if (!tabEl) {
      return
    }
    var tabData = tabs.get(tabId)

    var tabTitle

    const isNewTab = tabData.url === '' || tabData.url === urlParser.parse('min://newtab')
    if (isNewTab) {
      tabTitle = l('newTabLabel')
    } else if (tabData.title) {
      tabTitle = tabData.title
    } else if (tabData.loaded) {
      tabTitle = tabData.url
    }

    tabTitle = (tabTitle || l('newTabLabel')).substring(0, 500)

    var titleEl = tabEl.querySelector('.title')
    titleEl.textContent = tabTitle

    tabEl.title = tabTitle
    if (tabData.private) {
      tabEl.title += ' (' + l('privateTab') + ')'
    }

    var tabUrl = urlParser.getDomain(tabData.url)
    if (tabUrl.startsWith('www.') && tabUrl.split('.').length > 2) {
      tabUrl = tabUrl.replace('www.', '')
    }

    tabEl.querySelector('.url-element').textContent = tabUrl

    if (tabUrl && !urlParser.isInternalURL(tabData.url)) {
      tabEl.classList.add('has-url')
    } else {
      tabEl.classList.remove('has-url')
    }

    tabEl.classList.toggle('pinned', !!tabData.pinned)

    var faviconEl = tabEl.querySelector('.tab-favicon')
    if (faviconEl) {
      if (tabData.favicon && tabData.favicon.url) {
        faviconEl.src = tabData.favicon.url
        faviconEl.classList.remove('placeholder')
      } else {
        faviconEl.removeAttribute('src')
        faviconEl.classList.add('placeholder')
      }
    }

    var audioButton = tabEl.querySelector('.tab-audio-button')
    tabAudio.updateButton(tabId, audioButton)

    tabEl.querySelectorAll('.permission-request-icon').forEach(el => el.remove())

    permissionRequests.getButtons(tabId).reverse().forEach(function (button) {
      tabEl.insertBefore(button, tabEl.children[0])
    })

    var iconArea = tabEl.getElementsByClassName('tab-icon-area')[0]

    var insecureIcon = tabEl.getElementsByClassName('icon-tab-not-secure')[0]
    if (tabData.secure === true && insecureIcon) {
      insecureIcon.remove()
    } else if (tabData.secure === false && !insecureIcon) {
      var insecureIconEl = document.createElement('i')
      insecureIconEl.className = 'icon-tab-not-secure tab-icon tab-info-icon i carbon:unlocked'
      insecureIconEl.title = l('connectionNotSecure')
      iconArea.appendChild(insecureIconEl)
    }

    if (tabId === tabs.getSelected()) {
      tabBar.updateAddressDisplay(tabId)
    }
  },
  createGroupHeader: function (group) {
    const header = document.createElement('div')
    header.className = 'tab-group-header'
    header.setAttribute('data-group', group.id)

    const swatch = document.createElement('span')
    swatch.className = 'tab-group-swatch'
    swatch.style.background = group.color || '#a78bfa'

    const name = document.createElement('span')
    name.className = 'tab-group-name'
    name.textContent = group.name || 'Group'

    const chevron = document.createElement('i')
    chevron.className = 'i ' + (group.collapsed ? 'carbon:chevron-right' : 'carbon:chevron-down')

    header.appendChild(chevron)
    header.appendChild(swatch)
    header.appendChild(name)

    header.addEventListener('click', function () {
      tabGroups.toggleCollapsed(group.id)
      tabBar.updateAll()
    })

    header.addEventListener('dblclick', function (e) {
      e.stopPropagation()
      const next = window.prompt('Group name', group.name || 'Group')
      if (next != null && next.trim()) {
        tabGroups.updateGroup(group.id, { name: next.trim() })
        tabBar.updateAll()
      }
    })

    return header
  },
  updateAll: function () {
    try {
      empty(tabBar.containerInner)
      if (tabBar.pinnedContainer) {
        empty(tabBar.pinnedContainer)
      }
      tabBar.tabElementMap = {}

      const allTabs = tabs.get() || []
      const pinned = allTabs.filter(t => t.pinned)
      const unpinned = allTabs.filter(t => !t.pinned)
      const groups = tabGroups.ensureTaskGroups() || []

      pinned.forEach(function (tab) {
        var el = tabBar.createTab(tab)
        tabBar.pinnedContainer.appendChild(el)
        tabBar.tabElementMap[tab.id] = el
      })

      const groupedIds = new Set()
      groups.forEach(function (group) {
        const members = unpinned.filter(t => t.groupId === group.id)
        members.forEach(t => groupedIds.add(t.id))

        tabBar.containerInner.appendChild(tabBar.createGroupHeader(group))
        if (!group.collapsed) {
          members.forEach(function (tab) {
            var el = tabBar.createTab(tab)
            el.style.borderLeft = '3px solid ' + (group.color || '#a78bfa')
            tabBar.containerInner.appendChild(el)
            tabBar.tabElementMap[tab.id] = el
          })
        }
      })

      unpinned.filter(t => !groupedIds.has(t.id)).forEach(function (tab) {
        var el = tabBar.createTab(tab)
        tabBar.containerInner.appendChild(el)
        tabBar.tabElementMap[tab.id] = el
      })

      tabBar.syncPinnedVisibility()

      if (tabs.getSelected()) {
        tabBar.setActiveTab(tabs.getSelected())
      }
    } catch (err) {
      console.error('tabBar.updateAll failed', err)
    }
  },
  addTab: function (tabId) {
    var tab = tabs.get(tabId)
    var tabEl = tabBar.createTab(tab)
    const target = tabBar.getTargetContainer(tab)

    // Insert near siblings in the same pin group
    const siblings = tabs.get().filter(t => !!t.pinned === !!tab.pinned)
    const indexInGroup = siblings.findIndex(t => t.id === tabId)
    if (indexInGroup >= 0 && indexInGroup < target.childNodes.length) {
      target.insertBefore(tabEl, target.childNodes[indexInGroup])
    } else {
      target.appendChild(tabEl)
    }

    tabBar.tabElementMap[tabId] = tabEl
    tabBar.syncPinnedVisibility()
  },
  removeTab: function (tabId) {
    var tabEl = tabBar.getTab(tabId)
    if (tabEl) {
      tabEl.parentNode.removeChild(tabEl)
      delete tabBar.tabElementMap[tabId]
      tabBar.syncPinnedVisibility()
    }
  },
  handleDividerPreference: function (dividerPreference) {
    if (dividerPreference === true) {
      tabBar.navBar.classList.add('show-dividers')
    } else {
      tabBar.navBar.classList.remove('show-dividers')
    }
  },
  syncOrderFromDom: function () {
    const orderedIds = []
    const pinnedFlags = {}

    function collect (container, pinned) {
      Array.from(container.childNodes).forEach(function (el) {
        if (!el.getAttribute) {
          return
        }
        const id = el.getAttribute('data-tab')
        if (!id) {
          return
        }
        orderedIds.push(id)
        pinnedFlags[id] = pinned
      })
    }

    if (tabBar.pinnedContainer) {
      collect(tabBar.pinnedContainer, true)
    }
    collect(tabBar.containerInner, false)

    const byId = {}
    while (tabs.count() > 0) {
      const tabObj = tabs.splice(0, 1)[0]
      byId[tabObj.id] = tabObj
    }

    orderedIds.forEach(function (id, index) {
      const tabObj = byId[id]
      if (!tabObj) {
        return
      }
      tabObj.pinned = !!pinnedFlags[id]
      tabs.splice(index, 0, tabObj)
    })

    // Restore any tabs missing from the DOM (should not happen)
    Object.keys(byId).forEach(function (id) {
      if (tabs.getIndex(id) === -1) {
        tabs.splice(tabs.count(), 0, byId[id])
      }
    })

    tabBar.syncPinnedVisibility()
  },
  initializeTabDragging: function () {
    const containers = [tabBar.containerInner]
    if (tabBar.pinnedContainer) {
      containers.unshift(tabBar.pinnedContainer)
    }

    tabBar.dragulaInstance = dragula(containers, {
      direction: 'vertical',
      slideFactorY: 20,
      moves: function (el) {
        return el.classList && el.classList.contains('tab-item')
      },
      accepts: function (el, target) {
        return containers.includes(target)
      }
    })

    tabBar.dragulaInstance.on('drop', function () {
      tabBar.syncOrderFromDom()
    })
  },
  handleSizeChange: function () {
    // Vertical sidebar does not use compact horizontal tabs; kept for API compatibility
  }
}

settings.listen('showDividerBetweenTabs', function (dividerPreference) {
  tabBar.handleDividerPreference(dividerPreference)
})

webviews.bindEvent('did-start-loading', function (tabId) {
  const tabEl = tabBar.getTab(tabId)
  if (!tabEl) return
  progressBar.update(tabEl.querySelector('.progress-bar'), 'start')
  tabs.update(tabId, { loaded: false })
})

webviews.bindEvent('did-stop-loading', function (tabId) {
  const tabEl = tabBar.getTab(tabId)
  if (!tabEl) return
  progressBar.update(tabEl.querySelector('.progress-bar'), 'finish')
  tabs.update(tabId, { loaded: true })
  tabBar.updateTab(tabId)
})

tasks.on('tab-updated', function (id, key) {
  var updateKeys = ['title', 'secure', 'url', 'muted', 'hasAudio', 'favicon', 'pinned']
  if (updateKeys.includes(key)) {
    if (key === 'pinned') {
      tabBar.updateAll()
    } else {
      tabBar.updateTab(id)
    }
  }
})

permissionRequests.onChange(function (tabId) {
  if (tabs.get(tabId)) {
    tabBar.updateTab(tabId)
  }
})

tabBar.initializeTabDragging()

if (tabBar.addressDisplay) {
  tabBar.addressDisplay.addEventListener('click', function () {
    if (tabs.getSelected()) {
      tabEditor.show(tabs.getSelected())
    }
  })
}

tabBar.container.addEventListener('dragover', e => e.preventDefault())

tabBar.container.addEventListener('drop', e => {
  e.preventDefault()
  var data = e.dataTransfer
  var path = data.files[0] ? 'file://' + electron.webUtils.getPathForFile(data.files[0]) : data.getData('text')
  if (!path) {
    return
  }
  if (tabEditor.isShown || tabs.isEmpty()) {
    webviews.update(tabs.getSelected(), path)
    tabEditor.hide()
  } else {
    require('browserUI.js').addTab(tabs.add({
      url: path,
      private: tabs.get(tabs.getSelected()).private
    }), { enterEditMode: false, openInBackground: !settings.get('openTabsInForeground') })
  }
})

module.exports = tabBar
