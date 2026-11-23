const fs = require('fs')
const path = require('path')

function listSessionCandidates (sessionsDir) {
  if (!fs.existsSync(sessionsDir)) return []
  return fs.readdirSync(sessionsDir)
    .filter(f => f.startsWith('Tabs_') || f.startsWith('Session_'))
    .map(f => {
      try {
        return { f, t: fs.statSync(path.join(sessionsDir, f)).mtimeMs, full: path.join(sessionsDir, f) }
      } catch (e) {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Prefer Tabs_ then newer
      const at = a.f.startsWith('Tabs_') ? 1 : 0
      const bt = b.f.startsWith('Tabs_') ? 1 : 0
      if (bt !== at) return bt - at
      return b.t - a.t
    })
}

function readFirstAvailable (sessionsDir) {
  const files = listSessionCandidates(sessionsDir)
  const errors = []
  for (const file of files) {
    try {
      const buf = fs.readFileSync(file.full)
      return { file: file.f, buf, tried: files.length, errors }
    } catch (e) {
      errors.push(file.f + ': ' + e.code)
    }
  }
  return { file: null, buf: null, tried: files.length, errors }
}

const roots = [
  path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Default/Sessions'),
  path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Profile 3/Sessions'),
  path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/User Data/Default/Sessions'),
  path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/User Data/Profile 1/Sessions')
]

for (const root of roots) {
  const r = readFirstAvailable(root)
  console.log(root)
  console.log(' ->', r.file, r.buf ? r.buf.length : 'FAIL', r.errors.slice(0, 3).join('; '))
}
