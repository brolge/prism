/**
 * Strip Min product name / URLs / mangled anchors from localization JSON text.
 * Preserves file structure and comments.
 */
const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '..', 'localization', 'languages')

function scrub (raw) {
  let s = raw
  s = s.replace(/https?:\/\/(?:github\.com\/minbrowser\/min|minbrowser\.org|minbrowser\.github\.io|services\.minbrowser\.org)[^\s"'\\]*/gi, '')
  s = s.replace(/<a\b[^>]*href=\\"\\"[^>]*>(.*?)<\/a>/gi, '$1')
  s = s.replace(/<a\b[^>]*href=\\"#[^"]*\\"[^>]*>(.*?)<\/a>/gi, '$1')
  s = s.replace(/<a\b[^>]*href=\\"[^"]*(?:userscripts|statistics\.md|Content-blocking)[^"]*\\"[^>]*>(.*?)<\/a>/gi, '$1')
  s = s.replace(/\s*-\s*<a\b[^>]*>.*?<\/a>\.?/gi, '.')
  s = s.replace(/\s*\(<a\b[^>]*>.*?<\/a>\)/gi, '')
  s = s.replace(/serscripts/g, '')
  s = s.replace(/ster\/docs\/statistics\.md/g, '')
  s = s.replace(/\bMin\b/g, 'Zroot')
  return s
}

let updated = 0
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.json')) continue
  const p = path.join(dir, file)
  const raw = fs.readFileSync(p, 'utf8')
  const next = scrub(raw)
  if (next !== raw) {
    fs.writeFileSync(p, next)
    updated++
    console.log('updated', file)
  }
}
console.log('done', updated)
