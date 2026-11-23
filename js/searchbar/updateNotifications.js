var searchbarPlugins = require('searchbar/searchbarPlugins.js')
var compareVersions = require('util/compareVersions.js')

/* Legacy remote update JSON removed — Zroot uses electron-updater instead. */

function showUpdateNotification (text, input, inputFlags) {
  function displayUpdateNotification () {
    searchbarPlugins.reset('updateNotifications')
    searchbarPlugins.addResult('updateNotifications', {
      title: l('updateNotificationTitle'),
      descriptionBlock: update.releaseHeadline || 'View release notes',
      url: update.releaseNotes,
      icon: 'carbon:renew'
    }, { allowDuplicates: true })
  }
  var raw = localStorage.getItem('availableUpdate')
  if (!raw) {
    return
  }
  var update
  try {
    update = JSON.parse(raw)
  } catch (e) {
    localStorage.removeItem('availableUpdate')
    return
  }
  if (!update || !update.version) {
    return
  }
  if (compareVersions(window.globalArgs['app-version'], update.version) <= 0) {
    return
  }
  var updateAge = Date.now() - (update.releaseTime || 0)
  if (updateAge < (3 * 7 * 24 * 60 * 60 * 1000)) {
    if (tabs.isEmpty()) {
      displayUpdateNotification()
    }
  } else if (!tabs.get(tabs.getSelected()).url) {
    displayUpdateNotification()
  }
}

function initialize () {
  // Drop any leftover update banner from a previous product channel
  localStorage.removeItem('availableUpdate')
  searchbarPlugins.register('updateNotifications', {
    index: 11,
    trigger: function (text) {
      return !text && performance.now() > 5000
    },
    showResults: showUpdateNotification
  })
}

module.exports = { initialize }
