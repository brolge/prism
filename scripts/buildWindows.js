const fs = require('fs')
const archiver = require('archiver')
const builder = require('electron-builder')
const Arch = builder.Arch

const packageFile = require('./../package.json')
const version = packageFile.version

const createPackage = require('./createPackage.js')

async function afterPackageBuilt (packagePath) {
  /* create output directory if it doesn't exist */
  if (!fs.existsSync('dist/app')) {
    fs.mkdirSync('dist/app')
  }

  let archSuffix

  if (packagePath.includes('arm64')) {
    archSuffix = '-arm64'
  } else {
    archSuffix = ''
  }

  /* create zip files */
  var output = fs.createWriteStream('dist/app/' + 'Zroot-v' + version + '-windows' + archSuffix + '.zip')
  var archive = archiver('zip', {
    zlib: { level: 9 }
  })
  archive.directory(packagePath, 'Zroot-v' + version)
  archive.pipe(output)
  await archive.finalize()

  /* create installer */
  const installer = require('electron-installer-windows')

  const options = {
    src: packagePath,
    dest: 'dist/app/zroot-installer' + archSuffix,
    icon: 'icons/icon256.ico',
    animation: 'icons/windows-installer.gif',
    licenseUrl: 'https://github.com/YOUR_GITHUB_OWNER/zroot/blob/master/LICENSE.txt',
    noMsi: true,
    name: 'Zroot',
    productName: 'Zroot'
  }

  console.log('Creating package (this may take a while)')

  fs.copyFileSync('LICENSE.txt', packagePath + '/LICENSE')

  await installer(options)
    .then(function () {
      const from = './dist/app/zroot-installer' + archSuffix + '/zroot-' + version + '-setup.exe'
      const to = './dist/app/Zroot-Setup-' + version + archSuffix + '.exe'
      fs.renameSync(from, to)
    })
    .catch(err => {
      console.error(err, err.stack)
      process.exit(1)
    })
}

// creating multiple packages simultaneously causes errors in electron-rebuild, so do one arch at a time instead
createPackage('win32', { arch: Arch.x64 })
  .then(afterPackageBuilt)
  .then(function () {
    return createPackage('win32', { arch: Arch.arm64 })
  })
  .then(afterPackageBuilt)
