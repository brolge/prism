/* Prism Control — main-process helpers (metrics, cleaner, network quiet) */

function getPrismMetrics () {
  const metrics = app.getAppMetrics()
  let cpu = 0
  let memKB = 0
  metrics.forEach(function (m) {
    if (m.cpu && typeof m.cpu.percentCPUUsage === 'number') {
      cpu += m.cpu.percentCPUUsage
    }
    if (m.memory && typeof m.memory.workingSetSize === 'number') {
      memKB += m.memory.workingSetSize
    }
  })
  let systemMem = null
  try {
    systemMem = process.getSystemMemoryInfo()
  } catch (e) {}
  return {
    cpu: Math.round(cpu * 10) / 10,
    memoryMB: Math.round(memKB / 1024),
    processCount: metrics.length,
    system: systemMem
      ? {
          totalMB: Math.round(systemMem.total / 1024),
          freeMB: Math.round(systemMem.free / 1024)
        }
      : null
  }
}

ipc.handle('prism-gx-metrics', function () {
  return getPrismMetrics()
})

ipc.handle('prism-gx-cleaner', async function () {
  const ses = session.fromPartition('persist:webcontent')
  await ses.clearCache()
  await ses.clearHostResolverCache()
  try { await ses.clearAuthCache() } catch (e) {}
  try { await ses.clearCodeCaches({}) } catch (e) {}
  if (global.gc) {
    try { global.gc() } catch (e) {}
  }
  return { ok: true, metrics: getPrismMetrics() }
})

var networkQuietActive = false

ipc.handle('prism-gx-network-quiet', function (e, enabled, mbps) {
  networkQuietActive = !!enabled
  const ses = session.fromPartition('persist:webcontent')
  try {
    if (!enabled) {
      ses.disableNetworkEmulation()
      return { ok: true, enabled: false }
    }
    const rate = Math.max(0.25, Number(mbps) || 2)
    // bytes/sec — soft cap like Opera GX network limiter
    const bps = Math.round(rate * 1024 * 1024 / 8)
    ses.enableNetworkEmulation({
      offline: false,
      latency: 0,
      downloadThroughput: bps,
      uploadThroughput: bps
    })
    return { ok: true, enabled: true, mbps: rate }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
})

ipc.handle('prism-gx-network-quiet-state', function () {
  return { enabled: networkQuietActive }
})
