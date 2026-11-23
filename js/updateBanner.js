const updateBanner = {
  el: null,
  ensure: function () {
    if (updateBanner.el) {
      return updateBanner.el
    }
    const el = document.createElement('div')
    el.id = 'zroot-update-banner'
    el.hidden = true
    el.innerHTML =
      '<span id="zroot-update-text">Update ready — restart to install.</span>' +
      '<button type="button" id="zroot-update-restart">Restart</button>' +
      '<button type="button" id="zroot-update-dismiss" class="i carbon:close" aria-label="Dismiss"></button>'
    document.body.appendChild(el)
    el.querySelector('#zroot-update-restart').addEventListener('click', function () {
      ipc.invoke('zrootInstallUpdateNow')
    })
    el.querySelector('#zroot-update-dismiss').addEventListener('click', function () {
      el.hidden = true
    })
    updateBanner.el = el
    return el
  },
  setText: function (text, showRestart) {
    const el = updateBanner.ensure()
    el.querySelector('#zroot-update-text').textContent = text
    el.querySelector('#zroot-update-restart').hidden = !showRestart
    el.hidden = false
  },
  show: function (info) {
    const ver = info && info.version ? ' v' + info.version : ''
    updateBanner.setText('Update ready' + ver + ' — restart to install.', true)
  },
  initialize: function () {
    ipc.on('zroot-update-available', function (e, info) {
      const ver = info && info.version ? ' v' + info.version : ''
      updateBanner.setText('Downloading update' + ver + '…', false)
    })
    ipc.on('zroot-update-progress', function (e, progress) {
      const pct = progress && typeof progress.percent === 'number'
        ? Math.round(progress.percent)
        : null
      updateBanner.setText(
        pct != null ? ('Downloading update… ' + pct + '%') : 'Downloading update…',
        false
      )
    })
    ipc.on('zroot-update-ready', function (e, info) {
      updateBanner.show(info)
    })
  }
}

module.exports = updateBanner
