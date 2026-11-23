const fs = require('fs')
const path = require('path')

function extractUrls (buf) {
  const seen = new Set()
  const urls = []
  // Chromium stores URL strings as length-prefixed; scanning printable http(s) works well enough
  const s = buf.toString('latin1')
  const re = /https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g
  let m
  while ((m = re.exec(s))) {
    let raw = m[0]
    // trim trailing junk often glued in binary blobs
    raw = raw.replace(/[^\x20-\x7E]+.*$/, '')
    raw = raw.replace(/[>"'\\].*$/, '')
    try {
      const u = new URL(raw)
      if (!['http:', 'https:'].includes(u.protocol)) continue
      if (u.hostname.length < 2) continue
      if (seen.has(u.href)) continue
      seen.add(u.href)
      urls.push(u.href)
    } catch (e) {}
  }
  return urls
}

function latestSessionFile (sessionsDir) {
  if (!fs.existsSync(sessionsDir)) return null
  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.startsWith('Tabs_') || f.startsWith('Session_'))
    .map(f => ({ f, t: fs.statSync(path.join(sessionsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  // Prefer Tabs_ (open tabs) over Session_
  const tabs = files.find(x => x.f.startsWith('Tabs_'))
  return path.join(sessionsDir, (tabs || files[0]).f)
}

const roots = [
  ['Chrome', path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data')],
  ['Edge', path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/User Data')]
]

for (const [browser, root] of roots) {
  if (!fs.existsSync(root)) continue
  const profiles = fs.readdirSync(root).filter(n => n === 'Default' || n.startsWith('Profile '))
  for (const profile of profiles) {
    const prefPath = path.join(root, profile, 'Preferences')
    let name = profile
    try {
      const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf8'))
      name = prefs.profile?.name || profile
    } catch (e) {}
    const sess = latestSessionFile(path.join(root, profile, 'Sessions'))
    if (!sess) {
      console.log(browser, name, 'no session')
      continue
    }
    try {
      const buf = fs.readFileSync(sess)
      const urls = extractUrls(buf)
      console.log(browser, '|', name, '|', path.basename(sess), '|', urls.length, 'tabs')
      console.log(urls.slice(0, 8).map(u => '  ' + u).join('\n'))
    } catch (e) {
      console.log(browser, name, 'READ FAIL', e.message)
    }
  }
}
