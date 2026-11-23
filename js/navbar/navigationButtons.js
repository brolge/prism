const webviews = require('webviews.js')
const urlParser = require('util/urlParser.js')

var navigationButtons = {
  container: document.getElementById('toolbar-navigation-buttons'),
  backButton: document.getElementById('back-button'),
  forwardButton: document.getElementById('forward-button'),
  reloadButton: document.getElementById('reload-button'),
  homeButton: document.getElementById('home-button'),
  update: function () {
    const selected = tabs.getSelected()
    if (!selected || !tabs.get(selected) || !tabs.get(selected).url) {
      navigationButtons.backButton.disabled = true
      navigationButtons.forwardButton.disabled = true
      if (navigationButtons.reloadButton) {
        navigationButtons.reloadButton.disabled = true
      }
      return
    }
    if (navigationButtons.reloadButton) {
      navigationButtons.reloadButton.disabled = false
    }
    webviews.callAsync(selected, 'canGoBack', function (err, canGoBack) {
      if (err) {
        return
      }
      navigationButtons.backButton.disabled = !canGoBack
    })
    webviews.callAsync(selected, 'canGoForward', function (err, canGoForward) {
      if (err) {
        return
      }
      navigationButtons.forwardButton.disabled = !canGoForward
      if (canGoForward) {
        navigationButtons.container.classList.add('can-go-forward')
      } else {
        navigationButtons.container.classList.remove('can-go-forward')
      }
    })
  },
  initialize: function () {
    navigationButtons.container.hidden = false

    navigationButtons.backButton.addEventListener('click', function (e) {
      webviews.goBackIgnoringRedirects(tabs.getSelected())
    })

    navigationButtons.forwardButton.addEventListener('click', function () {
      webviews.callAsync(tabs.getSelected(), 'goForward')
    })

    if (navigationButtons.reloadButton) {
      navigationButtons.reloadButton.addEventListener('click', function () {
        const id = tabs.getSelected()
        if (!id) return
        webviews.callAsync(id, 'reload')
      })
    }

    if (navigationButtons.homeButton) {
      navigationButtons.homeButton.addEventListener('click', function () {
        const id = tabs.getSelected()
        if (!id) return
        webviews.update(id, urlParser.parse('min://newtab'))
        document.body.classList.add('is-ntp')
        try {
          require('chromaLookup.js').focus()
        } catch (e) {}
      })
    }

    tasks.on('tab-selected', this.update)
    webviews.bindEvent('did-navigate', this.update)
    webviews.bindEvent('did-navigate-in-page', this.update)
  }
}

module.exports = navigationButtons
