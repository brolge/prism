const searchEngine = require('util/searchEngine.js')
const urlParser = require('util/urlParser.js')
const webviews = require('webviews.js')
const tabEditor = require('navbar/tabEditor.js')

const chromaLookup = {
  form: null,
  input: null,
  looksLikeUrl: function (text) {
    const t = (text || '').trim()
    if (!t) return false
    if (/^(https?:\/\/|min:\/\/|file:\/\/)/i.test(t)) return true
    if (/^\w+:\/\//.test(t)) return true
    // domain.tld or localhost with optional path
    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(t)) return true
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/[^\s]*)?$/i.test(t) && !/\s/.test(t)) return true
    return false
  },
  resolveDestination: function (raw) {
    const q = (raw || '').trim()
    if (!q) return null
    if (chromaLookup.looksLikeUrl(q)) {
      return urlParser.parse(q)
    }
    const engine = searchEngine.getCurrent()
    const template = (engine && engine.searchURL) || 'https://duckduckgo.com/?q=%s'
    return template.replace('%s', encodeURIComponent(q))
  },
  submit: function (raw) {
    const dest = chromaLookup.resolveDestination(raw)
    if (!dest) return
    const tabId = tabs.getSelected()
    if (!tabId) return
    tabEditor.hide()
    webviews.update(tabId, dest)
    document.body.classList.remove('is-ntp')
  },
  focus: function () {
    if (chromaLookup.input && document.body.classList.contains('is-ntp')) {
      chromaLookup.input.focus()
      chromaLookup.input.select()
    }
  },
  initialize: function () {
    chromaLookup.form = document.getElementById('chroma-lookup-form')
    chromaLookup.input = document.getElementById('chroma-lookup-input')
    if (!chromaLookup.form || !chromaLookup.input) return

    chromaLookup.form.addEventListener('submit', function (e) {
      e.preventDefault()
      chromaLookup.submit(chromaLookup.input.value)
    })

    document.querySelectorAll('.chroma-lookup-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        if (chip.getAttribute('data-url')) {
          chromaLookup.submit(chip.getAttribute('data-url'))
          return
        }
        const q = chip.getAttribute('data-query') || chip.textContent
        chromaLookup.input.value = q
        chromaLookup.submit(q)
      })
    })

    // When landing on a new tab / empty page, focus Lookup
    tasks.on('tab-selected', function () {
      const tab = tabs.get(tabs.getSelected())
      if (!tab) return
      const isEmpty = !tab.url || tab.url === '' || tab.url === urlParser.parse('min://newtab')
      if (isEmpty) {
        setTimeout(chromaLookup.focus, 50)
      }
    })
  }
}

module.exports = chromaLookup
