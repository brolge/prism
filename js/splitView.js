const webviews = require('webviews.js')
const browserUI = require('browserUI.js')

const DIVIDER = 4

const splitView = {
  mode: null, // null | 2 | 4
  tabIds: [],
  ratioX: 0.5,
  ratioY: 0.5,
  dividerEls: [],
  isActive: function () {
    return !!splitView.mode && splitView.tabIds.length > 1
  },
  getBaseBounds: function () {
    // Temporarily ignore split when computing the chrome content area
    const prev = splitView.mode
    splitView.mode = null
    const bounds = webviews.getViewBounds()
    splitView.mode = prev
    return bounds
  },
  computePanes: function () {
    const base = splitView.getBaseBounds()
    const panes = []
    const ids = splitView.tabIds

    if (splitView.mode === 2) {
      const leftW = Math.max(80, Math.floor((base.width - DIVIDER) * splitView.ratioX))
      const rightW = base.width - leftW - DIVIDER
      panes.push({ id: ids[0], bounds: { x: base.x, y: base.y, width: leftW, height: base.height } })
      panes.push({ id: ids[1], bounds: { x: base.x + leftW + DIVIDER, y: base.y, width: rightW, height: base.height } })
    } else if (splitView.mode === 4) {
      const leftW = Math.max(80, Math.floor((base.width - DIVIDER) * splitView.ratioX))
      const rightW = base.width - leftW - DIVIDER
      const topH = Math.max(80, Math.floor((base.height - DIVIDER) * splitView.ratioY))
      const bottomH = base.height - topH - DIVIDER
      const positions = [
        { x: base.x, y: base.y, width: leftW, height: topH },
        { x: base.x + leftW + DIVIDER, y: base.y, width: rightW, height: topH },
        { x: base.x, y: base.y + topH + DIVIDER, width: leftW, height: bottomH },
        { x: base.x + leftW + DIVIDER, y: base.y + topH + DIVIDER, width: rightW, height: bottomH }
      ]
      for (let i = 0; i < 4; i++) {
        if (ids[i]) {
          panes.push({ id: ids[i], bounds: positions[i] })
        }
      }
    }
    return panes
  },
  apply: function () {
    if (!splitView.isActive()) {
      document.body.classList.remove('split-active')
      splitView.clearDividers()
      return
    }

    document.body.classList.add('split-active')
    splitView.renderDividers()

    splitView.tabIds.forEach(function (id) {
      if (!webviews.hasViewForTab(id)) {
        webviews.add(id)
      }
    })

    const panes = splitView.computePanes()
    const focusId = splitView.tabIds.includes(tabs.getSelected()) ? tabs.getSelected() : splitView.tabIds[0]

    ipc.send('setSplitLayout', {
      id: focusId,
      splitIds: splitView.tabIds.slice(),
      panes: panes,
      focus: true
    })
  },
  clearDividers: function () {
    splitView.dividerEls.forEach(el => el.remove())
    splitView.dividerEls = []
  },
  renderDividers: function () {
    splitView.clearDividers()
    const base = splitView.getBaseBounds()
    const host = document.getElementById('main-content') || document.body

    if (splitView.mode === 2 || splitView.mode === 4) {
      const v = document.createElement('div')
      v.className = 'split-divider split-divider-v'
      v.style.left = (base.x + Math.floor((base.width - DIVIDER) * splitView.ratioX)) + 'px'
      v.style.top = base.y + 'px'
      v.style.height = base.height + 'px'
      splitView.bindDrag(v, 'x')
      host.appendChild(v)
      splitView.dividerEls.push(v)
    }

    if (splitView.mode === 4) {
      const h = document.createElement('div')
      h.className = 'split-divider split-divider-h'
      h.style.top = (base.y + Math.floor((base.height - DIVIDER) * splitView.ratioY)) + 'px'
      h.style.left = base.x + 'px'
      h.style.width = base.width + 'px'
      splitView.bindDrag(h, 'y')
      host.appendChild(h)
      splitView.dividerEls.push(h)
    }
  },
  bindDrag: function (el, axis) {
    el.addEventListener('mousedown', function (e) {
      e.preventDefault()
      const base = splitView.getBaseBounds()
      function onMove (ev) {
        if (axis === 'x') {
          splitView.ratioX = Math.min(0.8, Math.max(0.2, (ev.clientX - base.x) / base.width))
        } else {
          splitView.ratioY = Math.min(0.8, Math.max(0.2, (ev.clientY - base.y) / base.height))
        }
        splitView.apply()
      }
      function onUp () {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    })
  },
  pickTabs: function (count) {
    const selected = tabs.getSelected()
    const all = tabs.get().map(t => t.id)
    const result = [selected]
    for (let i = 0; i < all.length && result.length < count; i++) {
      if (!result.includes(all[i])) {
        result.push(all[i])
      }
    }
    while (result.length < count) {
      const id = tabs.add({}, { atEnd: true })
      browserUI.addTab(id, { enterEditMode: false, openInBackground: true })
      result.push(id)
    }
    return result
  },
  enter: function (count) {
    count = count === 4 ? 4 : 2
    splitView.mode = count
    splitView.tabIds = splitView.pickTabs(count)
    splitView.apply()
  },
  exit: function () {
    splitView.mode = null
    splitView.tabIds = []
    splitView.clearDividers()
    document.body.classList.remove('split-active')
    if (tabs.getSelected()) {
      webviews.setSelected(tabs.getSelected())
    }
  },
  toggle: function () {
    if (splitView.isActive()) {
      if (splitView.mode === 2) {
        splitView.enter(4)
      } else {
        splitView.exit()
      }
    } else {
      splitView.enter(2)
    }
  },
  onTabSelected: function (tabId) {
    if (!splitView.isActive()) {
      return
    }
    if (splitView.tabIds.includes(tabId)) {
      ipc.send('focusView', tabId)
      return
    }
    // Replace the focused pane with the newly selected tab
    const focusIdx = Math.max(0, splitView.tabIds.indexOf(webviews.selectedId))
    splitView.tabIds[focusIdx] = tabId
    splitView.apply()
  },
  initialize: function () {
    window.addEventListener('resize', function () {
      if (splitView.isActive()) {
        splitView.apply()
      }
    })

    const originalResize = webviews.resize
    webviews.resize = function () {
      if (splitView.isActive()) {
        splitView.apply()
      } else {
        originalResize.call(webviews)
      }
    }
  }
}

module.exports = splitView
