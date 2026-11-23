/**
 * Renders icons/source/prism-512.png (or zroot-512.png / zroot-logo.svg)
 * to PNG sizes and icon256.ico. Requires: sharp, to-ico (devDependencies).
 */
const fs = require('fs')
const path = require('path')

async function main () {
  const sharp = require('sharp')
  const toIco = require('to-ico')

  const outDir = path.join(__dirname, '..', 'icons')
  const sourceDir = path.join(outDir, 'source')
  const prismSource = path.join(sourceDir, 'prism-512.png')
  const pngSource = path.join(sourceDir, 'zroot-512.png')
  const svgSource = path.join(sourceDir, 'zroot-logo.svg')

  let input
  let pipeline
  if (fs.existsSync(prismSource)) {
    input = prismSource
    pipeline = () => sharp(prismSource).ensureAlpha()
    console.log('using Prism PNG source', prismSource)
  } else if (fs.existsSync(pngSource)) {
    input = pngSource
    pipeline = () => sharp(pngSource).ensureAlpha()
    console.log('using PNG source', pngSource)
  } else if (fs.existsSync(svgSource)) {
    input = svgSource
    pipeline = () => sharp(svgSource)
    console.log('using SVG source', svgSource)
  } else {
    throw new Error('No icon source found (expected prism-512.png, zroot-512.png, or zroot-logo.svg)')
  }

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
  const pngBuffers = {}

  for (const size of sizes) {
    const buf = await pipeline()
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer()
    pngBuffers[size] = buf
    const out = path.join(outDir, size === 256 ? 'icon256.png' : `icon${size}.png`)
    fs.writeFileSync(out, buf)
    console.log('wrote', out)
  }

  // Keep a 512 reference copy next to source when we started from a different file
  if (input !== pngSource) {
    fs.writeFileSync(pngSource, pngBuffers[512])
  } else {
    // Refresh source copy from the resized 512 for consistency
    fs.writeFileSync(pngSource, pngBuffers[512])
  }

  const ico = await toIco([pngBuffers[16], pngBuffers[32], pngBuffers[48], pngBuffers[256]])
  const icoPath = path.join(outDir, 'icon256.ico')
  fs.writeFileSync(icoPath, ico)
  console.log('wrote', icoPath)

  // Also copy icon512.png alias used by some Electron paths
  fs.writeFileSync(path.join(outDir, 'icon512.png'), pngBuffers[512])
  console.log('wrote', path.join(outDir, 'icon512.png'))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
