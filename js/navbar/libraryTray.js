/**
 * Permanent Bookmarks + Favorites shelves (cannot be deleted).
 * Favorites = bookmarks tagged "favorites".
 */
const places = require('places/places.js')
const browserUI = require('browserUI.js')
const webviews = require('webviews.js')
const urlParser = require('util/urlParser.js')

const FAVORITE_TAG = 'favorites'

const libraryTray = {
  overlay: null,
  listEl: null,
  titleEl: null,
  filterEl: null,
  view: 'bookmarks', // bookmarks | favorites
  cache: [],

  ensureOverlay: function () {
    if (libraryTray.overlay) return
    const host = document.getElementById('main-content') || document.body
    const el = document.createElement('div')
    el.id = 'library-overlay'
    el.hidden = true
    el.innerHTML =
      '<div class="library-panel">' +
        '<div class="library-head">' +
          '<div>' +
            '<strong id="library-title">Bookmarks</strong>' +
            '<span class="library-lock">Permanent - cannot be deleted</span>' +
          '</div>' +
          '<button type="button" id="library-close" class="library-close" title="Close">×</button>' +
        '</div>' +
        '<div class="library-toolbar">' +
          '<button type="button" class="library-view-btn active" data-view="bookmarks">Bookmarks</button>' +
          '<button type="button" class="library-view-btn" data-view="favorites">Favorites</button>' +
          '<input id="library-filter" type="search" placeholder="Filter…" spellcheck="false" />' +
        '</div>' +
        '<p class="library-hint">Star a page from the address bar (Ctrl+D) to bookmark it. Use the heart to pin Favorites.</p>' +
        '<div id="library-list" class="library-list"></div>' +
        '<p id="library-empty" class="library-empty" hidden>Nothing here yet.</p>' +
      '</div>'
    host.appendChild(el)
    libraryTray.overlay = el
    libraryTray.listEl = el.querySelector('#library-list')
    libraryTray.titleEl = el.querySelector('#library-title')
    libraryTray.filterEl = el.querySelector('#library-filter')

    el.querySelector('#library-close').addEventListener('click', libraryTray.hide)
    el.addEventListener('click', function (e) {
      if (e.target === el) libraryTray.hide()
    })
    el.querySelectorAll('.library-view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        libraryTray.open(btn.getAttribute('data-view'))
      })
    })
    libraryTray.filterEl.addEventListener('input', function () {
      libraryTray.renderList()
    })
  },

  isFavorite: function (item) {
    return item && Array.isArray(item.tags) && item.tags.indexOf(FAVORITE_TAG) !== -1
  },

  load: async function () {
    const all = await places.getAllItems()
    libraryTray.cache = (all || []).filter(function (item) {
      return item && item.isBookmarked && item.url
    }).sort(function (a, b) {
      return (b.lastVisit || 0) - (a.lastVisit || 0)
    })
  },

  filtered: function () {
    const q = (libraryTray.filterEl && libraryTray.filterEl.value || '').trim().toLowerCase()
    return libraryTray.cache.filter(function (item) {
      if (libraryTray.view === 'favorites' && !libraryTray.isFavorite(item)) return false
      if (!q) return true
      const hay = ((item.title || '') + ' ' + (item.url || '') + ' ' + (item.tags || []).join(' ')).toLowerCase()
      return hay.indexOf(q) !== -1
    })
  },

  favicon: function (url) {
    try {
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(new URL(url).hostname) + '&sz=32'
    } catch (e) {
      return ''
    }
  },

  openUrl: function (url) {
    libraryTray.hide()
    browserUI.addTab(tabs.add({ url: url }), { enterEditMode: false })
  },

  toggleFavorite: async function (url) {
    const item = await places.getItem(url)
    if (!item) return
    let tags = Array.isArray(item.tags) ? item.tags.slice() : []
    const idx = tags.indexOf(FAVORITE_TAG)
    if (idx === -1) {
      tags.push(FAVORITE_TAG)
      if (!item.isBookmarked) {
        await places.updateItem(url, { isBookmarked: true, tags: tags, title: item.title || url })
      } else {
        await places.updateItem(url, { tags: tags })
      }
    } else {
      tags.splice(idx, 1)
      await places.updateItem(url, { tags: tags })
    }
    await libraryTray.load()
    libraryTray.renderList()
    libraryTray.renderShelves()
  },

  removeBookmark: async function (url) {
    // Unbookmark but keep history — favorites tag cleared too
    const item = await places.getItem(url)
    if (!item) return
    const tags = (item.tags || []).filter(function (t) { return t !== FAVORITE_TAG })
    await places.updateItem(url, { isBookmarked: false, tags: tags })
    await libraryTray.load()
    libraryTray.renderList()
    libraryTray.renderShelves()
  },

  renderList: function () {
    if (!libraryTray.listEl) return
    const items = libraryTray.filtered()
    const empty = document.getElementById('library-empty')
    if (!items.length) {
      libraryTray.listEl.innerHTML = ''
      if (empty) {
        empty.hidden = false
        empty.textContent = libraryTray.view === 'favorites'
          ? 'No favorites yet. Heart a bookmark to pin it here.'
          : 'No bookmarks yet. Press Ctrl+D on a page to star it.'
      }
      return
    }
    if (empty) empty.hidden = true
    libraryTray.listEl.innerHTML = ''
    items.forEach(function (item) {
      const row = document.createElement('div')
      row.className = 'library-item'
      const fav = libraryTray.favicon(item.url)
      const host = (() => {
        try { return new URL(item.url).hostname.replace(/^www\./, '') } catch (e) { return item.url }
      })()
      row.innerHTML =
        (fav ? '<img src="' + fav + '" alt="" />' : '<span class="library-dot"></span>') +
        '<button type="button" class="library-open">' +
          '<strong></strong><span></span>' +
        '</button>' +
        '<div class="library-actions">' +
          '<button type="button" class="library-heart i carbon:favorite' + (libraryTray.isFavorite(item) ? ' on' : '') + '" title="Toggle favorite"></button>' +
          '<button type="button" class="library-remove i carbon:trash-can" title="Remove bookmark"></button>' +
        '</div>'
      row.querySelector('strong').textContent = item.title || host
      row.querySelector('.library-open span').textContent = host
      row.querySelector('.library-open').addEventListener('click', function () {
        libraryTray.openUrl(item.url)
      })
      row.querySelector('.library-heart').addEventListener('click', function (e) {
        e.stopPropagation()
        libraryTray.toggleFavorite(item.url)
      })
      row.querySelector('.library-remove').addEventListener('click', function (e) {
        e.stopPropagation()
        if (!window.confirm('Remove this bookmark?\n' + (item.title || item.url))) return
        libraryTray.removeBookmark(item.url)
      })
      libraryTray.listEl.appendChild(row)
    })
  },

  open: async function (view) {
    libraryTray.ensureOverlay()
    libraryTray.view = view === 'favorites' ? 'favorites' : 'bookmarks'
    libraryTray.titleEl.textContent = libraryTray.view === 'favorites' ? 'Favorites' : 'Bookmarks'
    libraryTray.overlay.querySelectorAll('.library-view-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === libraryTray.view)
    })
    try {
      webviews.requestPlaceholder('libraryOverlay')
      document.body.classList.add('is-modal-mode')
    } catch (e) {}
    libraryTray.overlay.hidden = false
    await libraryTray.load()
    libraryTray.renderList()
    if (libraryTray.filterEl) {
      libraryTray.filterEl.value = ''
      libraryTray.filterEl.focus()
    }
  },

  hide: function () {
    if (!libraryTray.overlay) return
    libraryTray.overlay.hidden = true
    try {
      webviews.hidePlaceholder('libraryOverlay')
      document.body.classList.remove('is-modal-mode')
    } catch (e) {}
  },

  bookmarkCurrent: async function () {
    const tab = tabs.get(tabs.getSelected())
    if (!tab || !tab.url || urlParser.isInternalURL(tab.url)) {
      window.alert('This page cannot be bookmarked.')
      return
    }
    await places.updateItem(tab.url, {
      isBookmarked: true,
      title: tab.title || tab.url
    })
    libraryTray.renderShelves()
  },

  favoriteCurrent: async function () {
    const tab = tabs.get(tabs.getSelected())
    if (!tab || !tab.url || urlParser.isInternalURL(tab.url)) {
      window.alert('This page cannot be favorited.')
      return
    }
    const item = await places.getItem(tab.url)
    let tags = (item && item.tags) ? item.tags.slice() : []
    if (tags.indexOf(FAVORITE_TAG) === -1) tags.push(FAVORITE_TAG)
    await places.updateItem(tab.url, {
      isBookmarked: true,
      title: (item && item.title) || tab.title || tab.url,
      tags: tags
    })
    libraryTray.renderShelves()
  },

  renderShelves: async function () {
    const el = document.getElementById('library-tray')
    if (!el) return
    let bookmarkCount = 0
    let favoriteCount = 0
    try {
      await libraryTray.load()
      bookmarkCount = libraryTray.cache.length
      favoriteCount = libraryTray.cache.filter(libraryTray.isFavorite).length
    } catch (e) {}

    el.innerHTML = ''
    ;[
      { id: 'bookmarks', name: 'Bookmarks', count: bookmarkCount, color: '#c084fc', icon: 'carbon:bookmark' },
      { id: 'favorites', name: 'Favorites', count: favoriteCount, color: '#f43f5e', icon: 'carbon:favorite' }
    ].forEach(function (shelf) {
      const row = document.createElement('div')
      row.className = 'library-shelf-row'
      row.style.setProperty('--ws-color', shelf.color)
      row.innerHTML =
        '<span class="workspace-row-swatch" aria-hidden="true"></span>' +
        '<button type="button" class="workspace-row-main">' +
          '<span class="workspace-row-meta">' +
            '<span class="workspace-row-name"></span>' +
            '<span class="workspace-row-count"></span>' +
          '</span>' +
          '<span class="library-shelf-lock" title="Permanent — cannot be deleted">🔒</span>' +
        '</button>'
      row.querySelector('.workspace-row-name').textContent = shelf.name
      row.querySelector('.workspace-row-count').textContent =
        shelf.count + (shelf.id === 'favorites' ? ' favorite' : ' bookmark') + (shelf.count === 1 ? '' : 's')
      row.querySelector('button').addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        libraryTray.open(shelf.id)
      })
      // Block delete attempts via context menu
      row.addEventListener('contextmenu', function (e) {
        e.preventDefault()
        e.stopPropagation()
        const remoteMenu = require('remoteMenuRenderer.js')
        remoteMenu.open([[
          {
            label: 'Open ' + shelf.name,
            click: function () { libraryTray.open(shelf.id) }
          },
          {
            label: 'This shelf cannot be deleted',
            enabled: false
          }
        ]])
      })
      el.appendChild(row)
    })
  },

  initialize: function () {
    libraryTray.renderShelves()
    // Refresh counts occasionally / when returning focus
    window.addEventListener('focus', function () {
      libraryTray.renderShelves()
    })
  }
}

module.exports = libraryTray
