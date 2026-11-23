/* Prism Lookup — enhanced search (intent, ranking, answers, suggestions) */
const https = require('https')
const { URL } = require('url')

function fetchText (url, opts) {
  opts = opts || {}
  return new Promise(function (resolve, reject) {
    const parsed = new URL(url)
    const reqOpts = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Prism/1.0',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }, opts.headers || {}),
      timeout: opts.timeoutMs || 12000
    }
    const req = https.request(reqOpts, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : (parsed.protocol + '//' + parsed.host + res.headers.location)
        fetchText(next, opts).then(resolve, reject)
        return
      }
      const chunks = []
      res.on('data', function (c) { chunks.push(c) })
      res.on('end', function () {
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
    })
    req.on('error', reject)
    req.on('timeout', function () {
      req.destroy()
      reject(new Error('timeout'))
    })
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

function fetchJson (url) {
  return fetchText(url).then(function (t) {
    return JSON.parse(t)
  })
}

function stripTags (s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unwrapDuckLink (href) {
  try {
    const u = new URL(href, 'https://lite.duckduckgo.com')
    const uddg = u.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return u.href
  } catch (e) {
    return href
  }
}

function parseAnchors (html, className) {
  const out = []
  const linkRe = new RegExp('<a\\b([^>]*\\bclass=["\'][^"\']*\\b' + className + '\\b[^"\']*["\'][^>]*)>([\\s\\S]*?)<\\/a>', 'gi')
  let m
  while ((m = linkRe.exec(html)) !== null) {
    const attrs = m[1]
    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i)
    if (!hrefMatch) continue
    let href = hrefMatch[1]
    if (href.startsWith('//')) href = 'https:' + href
    const url = unwrapDuckLink(href)
    const title = stripTags(m[2])
    if (!url || !title || !/^https?:/i.test(url)) continue
    if (/duckduckgo\.com\/(?:y\.js|chrome|android|newbang)/i.test(url)) continue

    const window = html.slice(m.index, m.index + 1400)
    const snipMatch = window.match(/class=["']result(?:__|-)?snippet["'][^>]*>([\s\S]*?)<\/(?:a|div|span|t[dh])/i)
    out.push({
      title: title,
      url: url,
      snippet: stripTags(snipMatch && snipMatch[1] || ''),
      source: 'web'
    })
  }
  return out
}

function parseLiteResults (html) { return parseAnchors(html, 'result-link') }
function parseHtmlResults (html) { return parseAnchors(html, 'result__a') }

function dedupeKeepOrder (items) {
  const seen = Object.create(null)
  return items.filter(function (it) {
    let key
    try {
      key = new URL(it.url).hostname + new URL(it.url).pathname.replace(/\/$/, '').toLowerCase()
    } catch (e) {
      key = (it.url || '') + '|' + (it.title || '')
    }
    if (!key || seen[key]) return false
    seen[key] = 1
    return true
  })
}

function tokens (q) {
  return String(q || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s.+%-]/gu, ' ')
    .split(/\s+/)
    .filter(function (t) { return t && t.length > 1 })
}

function classifyIntent (q) {
  const raw = String(q || '').trim()
  const lower = raw.toLowerCase()

  if (/^[\d.\s+\-*/()^%]+$/.test(raw.replace(/,/g, '')) && /[+\-*/^%]/.test(raw)) {
    return { type: 'math', expression: raw }
  }
  const calc = lower.match(/^(?:what(?:'| i)?s|calculate|compute|solve)\s+(.+)$/i)
  if (calc && /^[\d.\s+\-*/()^%]+$/.test(calc[1].replace(/,/g, ''))) {
    return { type: 'math', expression: calc[1] }
  }

  if (/\bweather\b|\bforecast\b|\btemperature\b/.test(lower)) {
    const place = raw
      .replace(/^(what(?:'| i)?s\s+)?(the\s+)?/i, '')
      .replace(/\b(weather|forecast|temperature)\b/gi, ' ')
      .replace(/\b(in|for|at|near)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return { type: 'weather', place: place || 'London' }
  }

  if (/^(define|definition of|meaning of)\s+/i.test(lower) || /^what does .+ mean\??$/i.test(lower)) {
    return { type: 'define', topic: raw.replace(/^(define|definition of|meaning of)\s+/i, '').replace(/\?+$/, '').trim() }
  }

  if (/^who (is|was|are)\s+/i.test(lower)) {
    return { type: 'person', topic: raw.replace(/^who (is|was|are)\s+/i, '').replace(/\?+$/, '').trim() }
  }

  if (/^how (to|do|does|can)\s+/i.test(lower)) {
    return { type: 'howto', topic: raw }
  }

  if (/\bnews\b|\bheadlines\b|\bbreaking\b/.test(lower)) {
    return { type: 'news', topic: raw }
  }

  if (/^(convert|how many)\b/i.test(lower) || /\bto\b.+\b(usd|eur|gbp|celsius|fahrenheit|km|miles|kg|lbs)\b/i.test(lower)) {
    return { type: 'convert', topic: raw }
  }

  // Bang-style site jump: !yt query / site:reddit.com
  const bang = lower.match(/^!([a-z0-9]+)\s+(.+)/i)
  if (bang) {
    const map = {
      yt: 'https://www.youtube.com/results?search_query=',
      youtube: 'https://www.youtube.com/results?search_query=',
      gh: 'https://github.com/search?q=',
      github: 'https://github.com/search?q=',
      reddit: 'https://www.reddit.com/search/?q=',
      wiki: 'https://en.wikipedia.org/w/index.php?search=',
      maps: 'https://www.openstreetmap.org/search?query=',
      so: 'https://stackoverflow.com/search?q=',
      tw: 'https://x.com/search?q=',
      x: 'https://x.com/search?q='
    }
    if (map[bang[1]]) {
      return { type: 'bang', url: map[bang[1]] + encodeURIComponent(bang[2]) }
    }
  }

  return { type: 'web', topic: raw }
}

function safeEvalMath (expr) {
  const cleaned = String(expr).replace(/\s+/g, '').replace(/\^/g, '**')
  if (!/^[\d+\-*/().%*]+$/.test(cleaned.replace(/\*\*/g, ''))) throw new Error('unsafe')
  // eslint-disable-next-line no-new-func
  const result = Function('"use strict"; return (' + cleaned + ')')()
  if (typeof result !== 'number' || !isFinite(result)) throw new Error('bad')
  return result
}

function scoreResult (item, intent, queryTokens, orderIndex) {
  let score = Math.max(0, 40 - orderIndex) // preserve original relevance bias
  const title = (item.title || '').toLowerCase()
  const snippet = (item.snippet || '').toLowerCase()
  const url = (item.url || '').toLowerCase()
  let host = ''
  try { host = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase() } catch (e) {}

  queryTokens.forEach(function (t) {
    if (title.includes(t)) score += 5
    else if (snippet.includes(t)) score += 2
    else if (host.includes(t)) score += 3
  })

  // Exact-ish title match
  if (queryTokens.length && queryTokens.every(function (t) { return title.includes(t) })) score += 8

  // Authority boosts
  if (/wikipedia\.org$/.test(host)) score += 6
  if (/\.gov$|\.edu$|\.gov\./.test(host)) score += 7
  if (/developer\.|docs\.|mdn\.|stackoverflow\.com|github\.com|arxiv\.org|britannica\.com|fandom\.com|imdb\.com/.test(host)) score += 5
  if (/rockstargames\.com|ign\.com|gamespot|polygon|kotaku|pcgamer/.test(host) && /gta|game|lucia|trailer/.test(queryTokens.join(' '))) score += 6
  if (/(reuters|apnews|bbc\.|npr\.|theguardian|nytimes|aljazeera)/.test(host) && intent.type === 'news') score += 8

  // Spam / SEO junk demotion
  if (/pinterest\.com|quizlet|coursehero|brainly|scribd|coupon|deal-of|clickbait|best-10|top-10-best/.test(host + title)) score -= 10
  if (/\/ads?\/|utm_|sponsored|affiliate/.test(url)) score -= 6
  if (/\b(buy now|free download|crack|torrent)\b/.test(title + snippet)) score -= 8

  if (intent.type === 'howto' && /(stackoverflow|stackexchange|github|docs\.|developer\.|reddit\.com)/.test(host)) score += 7
  if (intent.type === 'person' && /wikipedia\.org|britannica|imdb/.test(host)) score += 6
  if (intent.type === 'define' && /dictionary|merriam|oxford|cambridge|wikipedia/.test(host)) score += 8

  if (item.source === 'wiki') score += 4
  if (item.badge === 'Official') score += 10

  return score
}

async function webResults (query) {
  const q = encodeURIComponent(query)
  const attempts = []

  attempts.push((async function () {
    const lite = await fetchText('https://lite.duckduckgo.com/lite/?q=' + q)
    return parseLiteResults(lite)
  })())

  attempts.push((async function () {
    const body = 'q=' + q + '&b='
    const html = await fetchText('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        Referer: 'https://html.duckduckgo.com/'
      },
      body: body
    })
    return parseHtmlResults(html)
  })())

  const settled = await Promise.allSettled(attempts)
  let best = []
  settled.forEach(function (s) {
    if (s.status === 'fulfilled' && s.value && s.value.length > best.length) {
      best = s.value
    }
  })
  if (best.length) return best

  try {
    const html = await fetchText('https://html.duckduckgo.com/html/?q=' + q)
    return parseHtmlResults(html)
  } catch (e) {
    return []
  }
}

async function wikipediaHits (query, limit) {
  try {
    const data = await fetchJson(
      'https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=' + (limit || 3) +
      '&utf8=1&format=json&srsearch=' + encodeURIComponent(query)
    )
    const rows = (data.query && data.query.search) || []
    return rows.map(function (row) {
      return {
        title: row.title,
        url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(row.title.replace(/ /g, '_')),
        snippet: stripTags(row.snippet || ''),
        source: 'wiki',
        badge: 'Wikipedia'
      }
    })
  } catch (e) {
    return []
  }
}

async function wikipediaSummaryFor (query) {
  try {
    const hits = await wikipediaHits(query, 1)
    if (!hits[0]) return null
    const summary = await fetchJson(
      'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(hits[0].title.replace(/ /g, '_'))
    )
    if (!summary || !summary.extract) return null
    return {
      eyebrow: 'Quick fact',
      title: summary.title,
      body: summary.extract,
      href: summary.content_urls && summary.content_urls.desktop && summary.content_urls.desktop.page,
      image: summary.thumbnail && summary.thumbnail.source
    }
  } catch (e) {
    return null
  }
}

async function ddgInstant (query) {
  try {
    return await fetchJson(
      'https://api.duckduckgo.com/?t=prism&skip_disambig=1&no_redirect=1&no_html=1&format=json&q=' +
      encodeURIComponent(query)
    )
  } catch (e) {
    return null
  }
}

async function weatherFor (place) {
  const geo = await fetchJson(
    'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' +
    encodeURIComponent(place)
  )
  if (!geo || !geo.results || !geo.results[0]) throw new Error('no place')
  const p = geo.results[0]
  const label = [p.name, p.admin1, p.country].filter(Boolean).join(', ')
  const wx = await fetchJson(
    'https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude +
    '&longitude=' + p.longitude +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&temperature_unit=celsius&wind_speed_unit=mph'
  )
  return { place: label, current: wx.current }
}

function weatherCodeText (code) {
  const map = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 51: 'Drizzle', 61: 'Rain', 71: 'Snow', 80: 'Showers', 95: 'Thunderstorm'
  }
  return map[code] || ('Code ' + code)
}

function relatedFromInstant (instant) {
  const related = []
  if (!instant) return related
  function pushTopic (item) {
    if (!item || !item.Text) return
    const name = stripTags((item.Result || '').replace(/.*>(.+?)<.*/g, '$1') || item.Text).split(' - ')[0]
    if (!name || name.length < 2) return
    related.push(name.slice(0, 72))
  }
  ;(instant.RelatedTopics || []).forEach(function (item) {
    if (item.Topics) item.Topics.slice(0, 2).forEach(pushTopic)
    else pushTopic(item)
  })
  return related.slice(0, 8)
}

function buildRelatedQueries (query, intent, related) {
  const out = []
  const base = intent.topic || query
  if (intent.type === 'web' || intent.type === 'person' || intent.type === 'define') {
    out.push(base + ' explained', 'what is ' + base, base + ' wiki')
  }
  if (intent.type === 'howto') out.push(base + ' reddit', base + ' stackoverflow')
  if (intent.type === 'news') out.push(base + ' today', 'latest ' + base)
  related.forEach(function (r) {
    if (out.indexOf(r) === -1) out.push(r)
  })
  return out.slice(0, 8)
}

async function suggest (query) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  try {
    const raw = await fetchText(
      'https://ac.duckduckgo.com/ac/?q=' + encodeURIComponent(q) + '&type=list&t=prism'
    )
    const data = JSON.parse(raw)
    // format: [query, [suggestions...]]
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].slice(0, 8).map(String)
    }
    if (Array.isArray(data)) {
      return data.filter(function (x) { return x && x.phrase }).map(function (x) { return x.phrase }).slice(0, 8)
    }
  } catch (e) {}
  try {
    const data = await fetchJson(
      'https://en.wikipedia.org/w/api.php?action=opensearch&limit=8&namespace=0&format=json&search=' +
      encodeURIComponent(q)
    )
    return (data[1] || []).slice(0, 8)
  } catch (e) {
    return []
  }
}

async function prismSearch (query) {
  const q = String(query || '').trim()
  if (!q) {
    return { query: q, answer: null, insights: [], results: [], related: [], intent: 'web' }
  }

  const intent = classifyIntent(q)

  if (intent.type === 'bang') {
    return {
      query: q,
      redirect: intent.url,
      answer: null,
      insights: [],
      results: [],
      related: [],
      intent: 'bang'
    }
  }

  if (intent.type === 'math') {
    try {
      const value = safeEvalMath(intent.expression)
      return {
        query: q,
        intent: 'math',
        answer: {
          eyebrow: 'Calculated',
          title: String(value),
          body: intent.expression.replace(/\s+/g, ' ') + ' = ' + value
        },
        insights: [
          { label: 'Expression', value: intent.expression },
          { label: 'Result', value: String(value) }
        ],
        results: [{
          title: 'Open in WolframAlpha',
          url: 'https://www.wolframalpha.com/input?i=' + encodeURIComponent(intent.expression),
          snippet: 'Advanced / symbolic calculation',
          badge: 'Tool'
        }],
        related: [intent.expression + ' in words', 'convert ' + value]
      }
    } catch (e) {
      intent.type = 'web'
      intent.topic = q
    }
  }

  const searchQuery = intent.topic || q
  const queryTokens = tokens(searchQuery)

  const jobs = [
    webResults(searchQuery),
    ddgInstant(searchQuery),
    wikipediaHits(searchQuery, intent.type === 'define' || intent.type === 'person' ? 4 : 2)
  ]
  if (intent.type === 'weather') {
    jobs.push(weatherFor(intent.place).catch(function () { return null }))
  } else {
    jobs.push(Promise.resolve(null))
  }

  const [web, instant, wiki, weather] = await Promise.all(jobs)

  let answer = null
  const insights = []

  if (weather && weather.current) {
    answer = {
      eyebrow: 'Live weather',
      title: weather.current.temperature_2m + '°C · ' + weather.place,
      body: weatherCodeText(weather.current.weather_code) +
        ' · Humidity ' + weather.current.relative_humidity_2m + '%' +
        ' · Wind ' + weather.current.wind_speed_10m + ' mph',
      href: 'https://open-meteo.com/'
    }
    insights.push(
      { label: 'Temp', value: weather.current.temperature_2m + ' °C' },
      { label: 'Humidity', value: weather.current.relative_humidity_2m + '%' },
      { label: 'Wind', value: weather.current.wind_speed_10m + ' mph' }
    )
  }

  if (!answer && instant) {
    if (typeof instant.Answer === 'string' && instant.Answer.trim()) {
      answer = {
        eyebrow: instant.AnswerType ? ('Answer · ' + instant.AnswerType) : 'Quick answer',
        title: stripTags(instant.Answer),
        body: stripTags(instant.Abstract || ''),
        href: instant.AbstractURL || null,
        image: instant.Image && !instant.ImageIsLogo
          ? (String(instant.Image).startsWith('/') ? 'https://duckduckgo.com' + instant.Image : instant.Image)
          : null
      }
    } else if (instant.Abstract && instant.Abstract.length > 40) {
      answer = {
        eyebrow: (instant.AbstractSource || 'Knowledge') + (instant.Entity ? ' · ' + instant.Entity : ''),
        title: stripTags(instant.Heading || searchQuery),
        body: stripTags(instant.Abstract),
        href: instant.AbstractURL || null,
        image: instant.Image && !instant.ImageIsLogo
          ? (String(instant.Image).startsWith('/') ? 'https://duckduckgo.com' + instant.Image : instant.Image)
          : null
      }
    }

    // Official site shortcut from Instant Answer
    if (instant.Results && instant.Results[0] && instant.Results[0].FirstURL) {
      web.unshift({
        title: stripTags(instant.Results[0].Text || 'Official site'),
        url: instant.Results[0].FirstURL,
        snippet: 'Official / suggested destination',
        source: 'web',
        badge: 'Official'
      })
    }
  }

  if (!answer) {
    answer = await wikipediaSummaryFor(searchQuery)
  }

  // Merge wiki as light enrichment (not a wiki-only SERP)
  const merged = dedupeKeepOrder([].concat(web, wiki || []))
  const ranked = merged
    .map(function (item, i) {
      return Object.assign({}, item, { _score: scoreResult(item, intent, queryTokens, i) })
    })
    .sort(function (a, b) { return b._score - a._score })
    .slice(0, 18)
    .map(function (item) {
      return {
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        source: item.source || 'web',
        badge: item.badge || null
      }
    })

  if (intent.type === 'howto') {
    ranked.unshift({
      title: 'How-to on Stack Overflow',
      url: 'https://stackoverflow.com/search?q=' + encodeURIComponent(searchQuery),
      snippet: 'Practical answers from developers',
      badge: 'Guides'
    })
  }

  const related = buildRelatedQueries(q, intent, relatedFromInstant(instant))

  return {
    query: q,
    intent: intent.type,
    answer: answer,
    insights: insights,
    results: dedupeKeepOrder(ranked).slice(0, 16),
    related: related,
    resultCount: ranked.length
  }
}

ipc.handle('chroma-search', async function (e, query) {
  try {
    return await prismSearch(query)
  } catch (err) {
    console.error('prism-search failed', err)
    return {
      query: query,
      answer: null,
      insights: [],
      results: [],
      related: [],
      error: String(err && err.message || err)
    }
  }
})

ipc.handle('chroma-suggest', async function (e, query) {
  try {
    return await suggest(query)
  } catch (err) {
    return []
  }
})

module.exports = { prismSearch, suggest }
