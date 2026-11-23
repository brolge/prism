window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('min://')) {
    return
  }
  if (!e.data || !e.data.message) {
    return
  }

  if (e.data.message === 'chromaSearch') {
    const query = e.data.query || ''
    const requestId = e.data.requestId
    ipc.invoke('chroma-search', query).then(function (payload) {
      window.postMessage({
        message: 'chromaSearchResults',
        requestId: requestId,
        payload: payload
      }, window.location.toString())
    }).catch(function (err) {
      window.postMessage({
        message: 'chromaSearchResults',
        requestId: requestId,
        payload: {
          query: query,
          answer: null,
          insights: [],
          results: [],
          related: [],
          error: String(err && err.message || err)
        }
      }, window.location.toString())
    })
    return
  }

  if (e.data.message === 'chromaSuggest') {
    const query = e.data.query || ''
    const requestId = e.data.requestId
    ipc.invoke('chroma-suggest', query).then(function (suggestions) {
      window.postMessage({
        message: 'chromaSuggestResults',
        requestId: requestId,
        suggestions: suggestions || []
      }, window.location.toString())
    }).catch(function () {
      window.postMessage({
        message: 'chromaSuggestResults',
        requestId: requestId,
        suggestions: []
      }, window.location.toString())
    })
  }
})
