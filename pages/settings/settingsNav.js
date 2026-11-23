(function () {
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.settings-nav button[data-panel]'))
  var panels = Array.prototype.slice.call(document.querySelectorAll('.settings-panel'))

  function showPanel (id) {
    panels.forEach(function (panel) {
      panel.classList.toggle('active', panel.id === id)
    })
    buttons.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-panel') === id)
    })
    try {
      history.replaceState(null, '', '#' + id)
    } catch (e) {}
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      showPanel(btn.getAttribute('data-panel'))
    })
  })

  var hash = (location.hash || '').replace(/^#/, '')
  if (hash && document.getElementById(hash)) {
    showPanel(hash)
  } else {
    showPanel('panel-general')
  }
})()
