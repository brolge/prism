var regedit = require('regedit')

var installPath = process.execPath

var keysToCreate = [
  'HKCU\\Software\\Classes\\Zroot',
  'HKCU\\Software\\Classes\\Zroot\\Application',
  'HKCU\\Software\\Classes\\Zroot\\DefaultIcon',
  'HKCU\\Software\\Classes\\Zroot\\shell\\open\\command',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\Capabilities\\FileAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\Capabilities\\StartMenu',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\Capabilities\\URLAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\DefaultIcon',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\InstallInfo',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\shell\\open\\command'
]

var registryConfig = {
  'HKCU\\Software\\RegisteredApplications': {
    Zroot: {
      value: 'Software\\Clients\\StartMenuInternet\\Zroot\\Capabilities',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Zroot': {
    default: {
      value: 'Zroot Browser Document',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\Zroot\\Application': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    },
    ApplicationName: {
      value: 'Zroot',
      type: 'REG_SZ'
    },
    AppUserModelId: {
      value: 'Zroot',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Zroot\\DefaultIcon': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Zroot\\shell\\open\\command': {
    default: {
      value: '"' + installPath + '" "%1"',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\.htm\\OpenWithProgIds': {
    Zroot: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\.html\\OpenWithProgIds': {
    Zroot: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\Capabilities\\FileAssociations': {
    '.htm': {
      value: 'Zroot',
      type: 'REG_SZ'
    },
    '.html': {
      value: 'Zroot',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\Capabilities\\StartMenu': {
    StartMenuInternet: {
      value: 'Zroot',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\Capabilities\\URLAssociations': {
    http: {
      value: 'Zroot',
      type: 'REG_SZ'
    },
    https: {
      value: 'Zroot',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\DefaultIcon': {
    default: {
      value: installPath + ',0',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\InstallInfo': {
    IconsVisible: {
      value: 1,
      type: 'REG_DWORD'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Zroot\\shell\\open\\command': {
    default: {
      value: installPath,
      type: 'REG_DEFAULT'
    }
  }
}

var registryInstaller = {
  install: function () {
    return new Promise(function (resolve, reject) {
      regedit.createKey(keysToCreate, function (err) {
        regedit.putValue(registryConfig, function (err) {
          if (err) {
            reject()
          } else {
            resolve()
          }
        })
      })
    })
  },
  uninstall: function () {
    return new Promise(function (resolve, reject) {
      regedit.deleteKey(keysToCreate, function (err) {
        if (err) {
          reject()
        } else {
          resolve()
        }
      })
    })
  }
}
