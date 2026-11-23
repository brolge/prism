const GROUP_COLORS = ['#8ab4f8', '#f28b82', '#fdd663', '#81c995', '#c58af9', '#78d9ec', '#ff8bcb']

const tabGroups = {
  ensureTaskGroups: function () {
    const task = tasks.getSelected()
    if (!task) {
      return []
    }
    if (!Array.isArray(task.groups)) {
      tasks.update(task.id, { groups: [] })
    }
    return tasks.getSelected().groups || []
  },
  createGroup: function (name, color) {
    const task = tasks.getSelected()
    if (!task) {
      return null
    }
    const groups = (task.groups || []).slice()
    const group = {
      id: String(Math.round(Math.random() * 1e15)),
      name: name || ('Group ' + (groups.length + 1)),
      color: color || GROUP_COLORS[groups.length % GROUP_COLORS.length],
      collapsed: false
    }
    groups.push(group)
    tasks.update(task.id, { groups: groups })
    return group
  },
  updateGroup: function (groupId, data) {
    const task = tasks.getSelected()
    if (!task || !task.groups) {
      return
    }
    const groups = task.groups.map(function (g) {
      if (g.id === groupId) {
        return Object.assign({}, g, data)
      }
      return g
    })
    tasks.update(task.id, { groups: groups })
  },
  removeGroup: function (groupId) {
    const task = tasks.getSelected()
    if (!task) {
      return
    }
    const groups = (task.groups || []).filter(g => g.id !== groupId)
    tasks.update(task.id, { groups: groups })
    tabs.get().forEach(function (tab) {
      if (tab.groupId === groupId) {
        tabs.update(tab.id, { groupId: null })
      }
    })
  },
  assignTab: function (tabId, groupId) {
    tabs.update(tabId, { groupId: groupId || null })
  },
  toggleCollapsed: function (groupId) {
    const task = tasks.getSelected()
    const group = (task.groups || []).find(g => g.id === groupId)
    if (!group) {
      return
    }
    tabGroups.updateGroup(groupId, { collapsed: !group.collapsed })
  },
  getGroup: function (groupId) {
    const task = tasks.getSelected()
    return (task && task.groups || []).find(g => g.id === groupId) || null
  }
}

module.exports = tabGroups
