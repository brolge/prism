/**
 * Build Windows NSIS installer + portable exe via electron-builder.
 * Usage: node scripts/distWin.js [--publish always|never]
 */
const builder = require('electron-builder')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const path = require('path')

const publishArg = process.argv.includes('--publish')
  ? process.argv[process.argv.indexOf('--publish') + 1] || 'always'
  : 'never'

async function afterPack (context) {
  const ext = {
    darwin: '.app',
    win32: '.exe',
    linux: ['']
  }[context.electronPlatformName]

  const IS_LINUX = context.electronPlatformName === 'linux'
  const executableName = IS_LINUX
    ? context.packager.appInfo.productFilename.toLowerCase().replace('-dev', '')
    : context.packager.appInfo.productFilename

  const electronBinaryPath = path.join(
    context.appOutDir,
    `${executableName}${ext}`
  )

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
  })
}

builder.build({
  targets: builder.Platform.WINDOWS.createTarget(['nsis', 'portable'], builder.Arch.x64),
  config: {
    afterPack: afterPack
  },
  publish: publishArg
}).then(function () {
  console.log('Windows build complete → dist/app/')
  console.log('Artifacts: Prism-Setup-*.exe (installer + Start Menu), Prism-Portable-*.exe')
  console.log('Updates: GitHub Releases on brolge/prism (or settings → custom feed URL)')
}).catch(function (err) {
  console.error(err)
  process.exit(1)
})
