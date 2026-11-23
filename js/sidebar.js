const settings = require('util/settings/settings.js')

const SIDEBAR_WIDTH_DEFAULT = 244

function resizeWebviews () {
  try {
    require('webviews.js').resize()
  } catch (e) {}
}

const sidebar = {
  el: document.getElementById('sidebar'),
  toggleButton: document.getElementById('sidebar-toggle-button'),
  collapsed: false,
  width: SIDEBAR_WIDTH_DEFAULT,
  getWidth: function () {
    if (sidebar.collapsed && !document.body.classList.contains('sidebar-peek')) {
      return 0
    }
    return sidebar.width || SIDEBAR_WIDTH_DEFAULT
  },
  apply: function () {
    document.body.classList.toggle('sidebar-collapsed', sidebar.collapsed)
    document.documentElement.style.setProperty('--sidebar-width', sidebar.width + 'px')
    if (sidebar.toggleButton) {
      sidebar.toggleButton.classList.toggle('carbon:open-panel-left', !sidebar.collapsed)
      sidebar.toggleButton.classList.toggle('carbon:open-panel-right', sidebar.collapsed)
    }
    resizeWebviews()
  },
  setCollapsed: function (collapsed, persist) {
    sidebar.collapsed = !!collapsed
    sidebar.apply()
    if (persist !== false) {
      settings.set('sidebarCollapsed', sidebar.collapsed)
    }
  },
  toggle: function () {
    sidebar.setCollapsed(!sidebar.collapsed)
  },
  initialize: function () {
    sidebar.el = document.getElementById('sidebar')
    sidebar.toggleButton = document.getElementById('sidebar-toggle-button')
    sidebar.width = settings.get('sidebarWidth') || SIDEBAR_WIDTH_DEFAULT
    // If a previous session left the sidebar "collapsed", the UI looks fine
    // in CSS variables but the page view can cover it — start expanded.
    sidebar.collapsed = false
    settings.set('sidebarCollapsed', false)
    sidebar.apply()

    if (sidebar.toggleButton) {
      sidebar.toggleButton.addEventListener('click', function () {
        sidebar.toggle()
      })
    }

    // Keep the page WebContentsView attached. Clicks work because page bounds
    // start after the sidebar — never detach/hide on hover (that looked like a reload
    // and risked losing in-progress form state).
    if (sidebar.el) {
      sidebar.el.addEventListener('pointerenter', function () {
        try { resizeWebviews() } catch (e) {}
      })
    }

    settings.listen('sidebarWidth', function (value) {
      if (typeof value === 'number' && value >= 140 && value <= 400) {
        sidebar.width = value
        sidebar.apply()
      }
    })

    settings.listen('sidebarCompact', function (compact) {
      document.body.classList.toggle('compact-sidebar', !!compact)
      resizeWebviews()
    })
  }
}

module.exports = sidebar
