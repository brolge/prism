const settings = require('util/settings/settings.js')
const path = require('path')
const fs = require('fs')

const bundledThemes = {
  'liquid-glass': require('../../themes/liquid-glass.json'),
  galaxy: require('../../themes/galaxy.json'),
  nebula: require('../../themes/nebula.json'),
  aurora: require('../../themes/aurora.json'),
  'plain-dark': require('../../themes/plain-dark.json'),
  light: require('../../themes/light.json')
}

const galaxyTheme = {
  current: null,
  customStyleEl: null,
  listThemes: function () {
    const list = Object.keys(bundledThemes).map(id => ({
      id,
      name: bundledThemes[id].name,
      dark: bundledThemes[id].dark
    }))

    try {
      const userDir = path.join(window.globalArgs['user-data-path'], 'themes')
      if (fs.existsSync(userDir)) {
        fs.readdirSync(userDir).filter(f => f.endsWith('.json')).forEach(function (file) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(userDir, file), 'utf-8'))
            if (data && data.id) {
              list.push({ id: data.id, name: data.name || data.id, dark: !!data.dark, user: true })
              bundledThemes[data.id] = data
            }
          } catch (e) {}
        })
      }
    } catch (e) {}

    return list
  },
  getTheme: function (id) {
    return bundledThemes[id] || bundledThemes['liquid-glass']
  },
  applyTheme: function (id) {
    const theme = galaxyTheme.getTheme(id || 'liquid-glass')
    galaxyTheme.current = theme
    document.body.classList.add('zroot-theme')
    const isDark = theme.dark !== false
    document.body.classList.toggle('dark-mode', isDark)
    window.isDarkMode = isDark
    // Keep darkThemeIsActive in sync so tabColor / other listeners don't flip us back to light
    if (settings.get('darkThemeIsActive') !== isDark) {
      settings.set('darkThemeIsActive', isDark)
    }
    document.body.setAttribute('data-zroot-theme', theme.id)

    Object.keys(theme.variables || {}).forEach(function (key) {
      document.documentElement.style.setProperty(key, theme.variables[key])
    })

    const accent = settings.get('accentColor')
    if (accent) {
      document.documentElement.style.setProperty('--zroot-accent', accent)
    }

    const bgImage = settings.get('customBackgroundImage')
    if (bgImage) {
      document.documentElement.style.setProperty('--zroot-custom-bg', 'url("' + bgImage.replace(/"/g, '') + '")')
      document.body.classList.add('zroot-has-custom-bg')
    } else {
      document.body.classList.remove('zroot-has-custom-bg')
      document.documentElement.style.removeProperty('--zroot-custom-bg')
    }

    document.body.classList.toggle('zroot-no-animations', settings.get('animationsEnabled') === false)

    const width = settings.get('sidebarWidth')
    if (typeof width === 'number') {
      document.documentElement.style.setProperty('--sidebar-width', width + 'px')
    }

    document.body.classList.toggle('compact-sidebar', !!settings.get('sidebarCompact'))

    galaxyTheme.applyCustomCss(settings.get('customCss') || '')
  },
  applyCustomCss: function (cssText) {
    if (!galaxyTheme.customStyleEl) {
      galaxyTheme.customStyleEl = document.createElement('style')
      galaxyTheme.customStyleEl.id = 'zroot-custom-css'
      document.head.appendChild(galaxyTheme.customStyleEl)
    }
    galaxyTheme.customStyleEl.textContent = cssText || ''
  },
  initialize: function () {
    // Prefer a clean browser chrome; site-tinting fights the layout
    if (settings.get('siteTheme') === undefined) {
      settings.set('siteTheme', false)
    }
    if (!settings.get('zrootTheme')) {
      settings.set('zrootTheme', 'liquid-glass')
    }
    const themeId = settings.get('zrootTheme') || 'liquid-glass'
    galaxyTheme.applyTheme(themeId)

    settings.listen('zrootTheme', function (id) {
      galaxyTheme.applyTheme(id || 'liquid-glass')
    })
    settings.listen('accentColor', function () {
      galaxyTheme.applyTheme(settings.get('zrootTheme') || 'liquid-glass')
    })
    settings.listen('customBackgroundImage', function () {
      galaxyTheme.applyTheme(settings.get('zrootTheme') || 'liquid-glass')
    })
    settings.listen('animationsEnabled', function () {
      document.body.classList.toggle('zroot-no-animations', settings.get('animationsEnabled') === false)
    })
    settings.listen('customCss', function (css) {
      galaxyTheme.applyCustomCss(css || '')
    })
    settings.listen('sidebarCompact', function (compact) {
      document.body.classList.toggle('compact-sidebar', !!compact)
    })
  }
}

module.exports = galaxyTheme
