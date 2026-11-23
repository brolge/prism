(function () {
  var form = document.getElementById('lookup-form')
  var input = document.getElementById('q')
  var statusEl = document.getElementById('status')
  var answerEl = document.getElementById('answer')
  var insightsEl = document.getElementById('insights')
  var resultsEl = document.getElementById('results')
  var relatedEl = document.getElementById('related')
  var intentEl = document.getElementById('intent-pill')
  var suggestEl = document.getElementById('suggest')
  var pendingId = 0
  var suggestId = 0
  var suggestItems = []
  var suggestIndex = -1
  var suggestTimer = null
  var lastQueryTokens = []

  function params () {
    return new URLSearchParams(location.search)
  }

  function setStatus (text) {
    statusEl.textContent = text || ''
  }

  function escapeHtml (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function hostOf (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch (e) {
      return ''
    }
  }

  function looksLikeUrl (text) {
    var t = (text || '').trim()
    if (!t) return false
    if (/^(https?:\/\/|min:\/\/|file:\/\/)/i.test(t)) return true
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/[^\s]*)?$/i.test(t) && !/\s/.test(t)) return true
    return false
  }

  function highlight (text, tokens) {
    var out = escapeHtml(text || '')
    ;(tokens || []).forEach(function (t) {
      if (!t || t.length < 2) return
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig')
      out = out.replace(re, '<mark>$1</mark>')
    })
    return out
  }

  function renderAnswer (data) {
    if (!data) {
      answerEl.hidden = true
      answerEl.innerHTML = ''
      return
    }
    answerEl.hidden = false
    var html = '<div class="eyebrow">' + escapeHtml(data.eyebrow || 'Quick fact') + '</div>'
    html += '<h1>' + escapeHtml(data.title) + '</h1>'
    if (data.body) html += '<p>' + escapeHtml(data.body) + '</p>'
    html += '<div class="meta">'
    if (data.image) html += '<img class="thumb" src="' + escapeHtml(data.image) + '" alt="" />'
    if (data.href) html += '<a class="cta" href="' + escapeHtml(data.href) + '">Read more</a>'
    html += '</div>'
    answerEl.innerHTML = html
  }

  function renderInsights (items) {
    if (!items || !items.length) {
      insightsEl.hidden = true
      insightsEl.innerHTML = ''
      return
    }
    insightsEl.hidden = false
    insightsEl.innerHTML = items.map(function (it) {
      return '<div class="insight"><strong>' + escapeHtml(it.label) + '</strong><span>' + escapeHtml(it.value) + '</span></div>'
    }).join('')
  }

  function renderRelated (items) {
    if (!items || !items.length) {
      relatedEl.hidden = true
      relatedEl.innerHTML = ''
      return
    }
    relatedEl.hidden = false
    relatedEl.innerHTML = items.map(function (q) {
      return '<button type="button" data-q="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>'
    }).join('')
  }

  function faviconFor (url) {
    var host = hostOf(url)
    if (!host) return ''
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=32'
  }

  function renderResults (items) {
    if (!items || !items.length) {
      resultsEl.innerHTML =
        '<div class="empty">' +
          '<h2>No results</h2>' +
          '<p>Try different words, a bang like <code>!yt</code>, or “what is …”.</p>' +
        '</div>'
      return
    }

    resultsEl.innerHTML = items.map(function (it) {
      var host = hostOf(it.url)
      var path = ''
      try {
        path = new URL(it.url).pathname
        if (path === '/') path = ''
      } catch (e) {}
      var fav = faviconFor(it.url)
      var badge = it.badge ? '<span class="badge">' + escapeHtml(it.badge) + '</span>' : ''
      return (
        '<a class="result" href="' + escapeHtml(it.url) + '">' +
          '<div class="url-line">' +
            (fav ? '<img class="favicon" src="' + escapeHtml(fav) + '" alt="" />' : '') +
            '<span class="url">' + escapeHtml(host) + (path ? ' › ' + escapeHtml(path.slice(0, 48)) : '') + '</span>' +
            badge +
          '</div>' +
          '<div class="title">' + highlight(it.title, lastQueryTokens) + '</div>' +
          (it.snippet ? '<div class="snippet">' + highlight(it.snippet, lastQueryTokens) + '</div>' : '') +
        '</a>'
      )
    }).join('')
  }

  function hideSuggest () {
    suggestEl.hidden = true
    suggestEl.innerHTML = ''
    suggestItems = []
    suggestIndex = -1
  }

  function showSuggest (items) {
    suggestItems = items || []
    suggestIndex = -1
    if (!suggestItems.length) {
      hideSuggest()
      return
    }
    suggestEl.hidden = false
    suggestEl.innerHTML = suggestItems.map(function (s, i) {
      return '<li role="option" data-i="' + i + '">' + escapeHtml(s) + '</li>'
    }).join('')
  }

  function requestSuggest (query) {
    var requestId = ++suggestId
    postMessage({
      message: 'chromaSuggest',
      query: query,
      requestId: requestId
    })
  }

  function requestSearch (query) {
    var requestId = ++pendingId
    setStatus('Searching Prism…')
    answerEl.hidden = true
    insightsEl.hidden = true
    relatedEl.hidden = true
    intentEl.hidden = true
    resultsEl.innerHTML = ''
    hideSuggest()

    postMessage({
      message: 'chromaSearch',
      query: query,
      requestId: requestId
    })
  }

  function applyPayload (payload) {
    if (!payload) return

    if (payload.redirect) {
      setStatus('Opening…')
      location.href = payload.redirect
      return
    }

    lastQueryTokens = String(payload.query || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(function (t) { return t.length > 1 })

    if (payload.intent && payload.intent !== 'web') {
      intentEl.hidden = false
      intentEl.textContent = 'Intent · ' + payload.intent
    } else {
      intentEl.hidden = true
    }

    renderAnswer(payload.answer || null)
    renderInsights(payload.insights || [])
    renderRelated(payload.related || [])
    renderResults(payload.results || [])

    var n = (payload.results && payload.results.length) || 0
    if (payload.error && !n) {
      setStatus('Search failed — try again')
      return
    }
    if (n) {
      setStatus('About ' + n + ' results' + (payload.answer ? ' · answer on top' : ''))
    } else if (payload.answer) {
      setStatus('Direct answer')
    } else {
      setStatus('No results found')
    }
  }

  window.addEventListener('message', function (e) {
    if (!e.data) return
    if (e.data.message === 'chromaSearchResults') {
      if (e.data.requestId && e.data.requestId !== pendingId) return
      applyPayload(e.data.payload)
      return
    }
    if (e.data.message === 'chromaSuggestResults') {
      if (e.data.requestId && e.data.requestId !== suggestId) return
      if (document.activeElement !== input) return
      showSuggest(e.data.suggestions || [])
    }
  })

  function runLookup (query) {
    var q = String(query || '').trim()
    if (!q) {
      setStatus('Type something to search.')
      return
    }

    if (looksLikeUrl(q)) {
      setStatus('Opening…')
      location.href = /^[a-z]+:\/\//i.test(q) ? q : ('https://' + q)
      return
    }

    document.title = q + ' — Prism'
    input.value = q
    requestSearch(q)
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault()
    var next = input.value.trim()
    if (suggestIndex >= 0 && suggestItems[suggestIndex]) {
      next = suggestItems[suggestIndex]
    }
    if (!next) return
    history.replaceState(null, '', '?q=' + encodeURIComponent(next))
    runLookup(next)
  })

  relatedEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-q]')
    if (!btn) return
    var q = btn.getAttribute('data-q')
    history.replaceState(null, '', '?q=' + encodeURIComponent(q))
    runLookup(q)
  })

  suggestEl.addEventListener('mousedown', function (e) {
    var li = e.target.closest('li[data-i]')
    if (!li) return
    e.preventDefault()
    var q = suggestItems[Number(li.getAttribute('data-i'))]
    if (!q) return
    history.replaceState(null, '', '?q=' + encodeURIComponent(q))
    runLookup(q)
  })

  input.addEventListener('input', function () {
    var q = input.value.trim()
    clearTimeout(suggestTimer)
    if (q.length < 2) {
      hideSuggest()
      return
    }
    suggestTimer = setTimeout(function () {
      requestSuggest(q)
    }, 140)
  })

  input.addEventListener('keydown', function (e) {
    if (suggestEl.hidden || !suggestItems.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      suggestIndex = Math.min(suggestItems.length - 1, suggestIndex + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      suggestIndex = Math.max(-1, suggestIndex - 1)
    } else if (e.key === 'Escape') {
      hideSuggest()
      return
    } else {
      return
    }
    Array.prototype.forEach.call(suggestEl.children, function (li, i) {
      li.classList.toggle('active', i === suggestIndex)
    })
    if (suggestIndex >= 0) input.value = suggestItems[suggestIndex]
  })

  input.addEventListener('blur', function () {
    setTimeout(hideSuggest, 120)
  })

  var initial = params().get('q') || ''
  if (initial) {
    runLookup(initial)
  } else {
    setStatus('Search the web with Prism')
    input.focus()
  }
})()
