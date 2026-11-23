(function () {
  var form = document.getElementById('lookup-form')
  var input = document.getElementById('lookup-input')
  if (!form || !input) return

  function looksLikeUrl (text) {
    var t = (text || '').trim()
    if (!t) return false
    if (/^(https?:\/\/|min:\/\/|file:\/\/)/i.test(t)) return true
    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(t)) return true
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/[^\s]*)?$/i.test(t) && !/\s/.test(t)) return true
    return false
  }

  function destination (raw) {
    var q = (raw || '').trim()
    if (!q) return null
    if (looksLikeUrl(q)) {
      if (!/^[a-z]+:\/\//i.test(q)) {
        return 'https://' + q
      }
      return q
    }
    return 'min://app/pages/lookup/index.html?q=' + encodeURIComponent(q)
  }

  function go (raw) {
    var url = destination(raw)
    if (!url) return
    window.location.href = url
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault()
    go(input.value)
  })

  document.querySelectorAll('[data-query]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var q = chip.getAttribute('data-query')
      input.value = q
      go(q)
    })
  })

  document.querySelectorAll('[data-href]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      window.location.href = chip.getAttribute('data-href')
    })
  })

  setTimeout(function () {
    input.focus()
  }, 80)
})()
