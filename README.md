# Zroot

**Zroot** is a galaxy-themed Windows browser by Chromatech. Vertical sidebar, workspaces, tab groups, split view, focus/fullscreen chrome modes, theme presets, and GitHub-powered auto-updates.

Licensed under Apache-2.0 — see `LICENSE.txt`.

## Features

- Vertical collapsible tab sidebar (`Ctrl+B`), favicons, drag-reorder, pinned tabs
- Workspaces with tray switcher and `Ctrl+1`…`9`
- Collapsible coloured tab groups (right-click a tab → Move to group)
- Session restore for workspaces, groups, pins, and open tabs
- Split view (`Ctrl+Shift+S`) — 2 panes, then 4, with draggable dividers
- `F11` fullscreen with edge-reveal chrome; `Ctrl+Shift+F` windowed focus mode
- Galaxy / Nebula / Aurora / Plain Dark / Light themes + custom CSS

## Develop

```bash
npm install
npm run generateIcons   # once, or after updating icons/source/zroot-512.png
npm run start
```

Reload the UI with `Ctrl+Alt+R`.

## Build Windows installer (local)

```bash
npm run dist:win
```

## License

Apache-2.0. Keep `LICENSE.txt` intact when redistributing.
