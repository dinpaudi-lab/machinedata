// ============ INDEXED DB FOR CROSS-DEVICE HISTORY SYNC ============
// Menyimpan history ke IndexedDB untuk sinkronisasi manual lintas perangkat

const DB_NAME = 'LayoutMesinDB'
const DB_VERSION = 1
const HISTORY_STORE = 'history_entries'
const METADATA_STORE = 'sync_metadata'

let db = null
let isIndexedDBAvailable = true

// Initialize IndexedDB
async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    try {
      // Check if IndexedDB is supported
      if (!window.indexedDB) {
        console.warn('⚠️ IndexedDB tidak tersedia di browser ini')
        isIndexedDBAvailable = false
        resolve(null)
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('❌ IndexedDB error:', request.error)
        isIndexedDBAvailable = false
        reject(request.error)
      }

      request.onsuccess = () => {
        db = request.result
        console.log('✅ IndexedDB initialized')
        resolve(db)
      }

      request.onupgradeneeded = (event) => {
        const database = event.target.result

        // Create history store
        if (!database.objectStoreNames.contains(HISTORY_STORE)) {
          const historyStore = database.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true })
          historyStore.createIndex('timestamp', 'timestamp', { unique: false })
          historyStore.createIndex('machine_id', 'machine_id', { unique: false })
          historyStore.createIndex('sync_status', 'sync_status', { unique: false })
          console.log('📦 Created history store')
        }

        // Create metadata store
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE, { keyPath: 'key' })
          console.log('📦 Created metadata store')
        }
      }
    } catch (e) {
      console.error('❌ IndexedDB initialization failed:', e)
      isIndexedDBAvailable = false
      reject(e)
    }
  })
}

// Save history entry to IndexedDB
async function saveHistoryToIndexedDB(entry) {
  if (!isIndexedDBAvailable || !db) return false

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([HISTORY_STORE], 'readwrite')
      const store = transaction.objectStore(HISTORY_STORE)

      const historyEntry = {
        timestamp: entry.date || new Date().toISOString(),
        machine_id: entry.machine,
        from: entry.from,
        to: entry.to,
        editor: entry.editor,
        sync_status: 'local', // 'local', 'synced', 'pending'
        local_timestamp: Date.now(),
        device_id: getDeviceId()
      }

      const request = store.add(historyEntry)

      request.onsuccess = () => {
        console.log('💾 Saved to IndexedDB:', historyEntry.machine_id)
        resolve(true)
      }

      request.onerror = () => {
        console.warn('⚠️ IndexedDB save error:', request.error)
        resolve(false)
      }
    } catch (e) {
      console.warn('⚠️ Error saving to IndexedDB:', e)
      resolve(false)
    }
  })
}

// Load all history from IndexedDB
async function loadHistoryFromIndexedDB() {
  if (!isIndexedDBAvailable || !db) return []

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([HISTORY_STORE], 'readonly')
      const store = transaction.objectStore(HISTORY_STORE)
      const index = store.index('timestamp')
      const range = IDBKeyRange.bound(-Infinity, Infinity)

      const request = index.getAll(range)

      request.onsuccess = () => {
        const entries = request.result
        // Sort by timestamp descending (newest first)
        entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        console.log(`📚 Loaded ${entries.length} entries from IndexedDB`)
        resolve(entries)
      }

      request.onerror = () => {
        console.warn('⚠️ IndexedDB load error:', request.error)
        resolve([])
      }
    } catch (e) {
      console.warn('⚠️ Error loading from IndexedDB:', e)
      resolve([])
    }
  })
}

// Export history as JSON file for manual sync
async function exportHistoryAsJSON() {
  const localHistory = getHistory()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `layout_history_${timestamp}_${getDeviceId().slice(0, 8)}.json`

  const exportData = {
    exported_at: new Date().toISOString(),
    device_id: getDeviceId(),
    device_name: getDeviceName(),
    total_entries: localHistory.length,
    history: localHistory
  }

  const dataStr = JSON.stringify(exportData, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)

  console.log(`📥 Exported ${localHistory.length} history entries to ${filename}`)
  return true
}

// Import history from JSON file
async function importHistoryFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result)
        if (!data.history || !Array.isArray(data.history)) {
          throw new Error('Invalid history format')
        }

        let imported = 0
        for (const entry of data.history) {
          await saveHistoryToIndexedDB(entry)
          imported++
        }

        console.log(`✅ Imported ${imported} history entries from ${file.name}`)
        resolve(imported)
      } catch (error) {
        console.error('❌ Import error:', error)
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(reader.error)
    }

    reader.readAsText(file)
  })
}

// Merge histories from different devices
async function mergeHistories(importedHistory) {
  if (!Array.isArray(importedHistory)) return 0

  let mergedCount = 0
  for (const entry of importedHistory) {
    // Check if entry already exists (by timestamp and machine_id)
    const existingIndex = getHistory().findIndex(
      e => e.machine === entry.machine && e.date === entry.date
    )

    if (existingIndex === -1) {
      // New entry, add it
      addHistory(entry)
      mergedCount++
    }
  }

  console.log(`✅ Merged ${mergedCount} new history entries`)
  return mergedCount
}

// Get unique device ID (based on browser + device fingerprint)
function getDeviceId() {
  let deviceId = localStorage.getItem('device_id')
  if (!deviceId) {
    // Generate unique device ID
    deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now()
    localStorage.setItem('device_id', deviceId)
  }
  return deviceId
}

// Get device name (for user reference)
function getDeviceName() {
  let deviceName = localStorage.getItem('device_name')
  if (!deviceName) {
    // Generate default name based on OS
    const ua = navigator.userAgent
    let osName = 'Unknown'
    if (ua.indexOf('Windows') > -1) osName = 'Windows PC'
    else if (ua.indexOf('Mac') > -1) osName = 'Mac'
    else if (ua.indexOf('Linux') > -1) osName = 'Linux'
    else if (ua.indexOf('Android') > -1) osName = 'Android'
    else if (ua.indexOf('iPhone') > -1) osName = 'iPhone'
    else if (ua.indexOf('iPad') > -1) osName = 'iPad'

    deviceName = `${osName} (${new Date().toLocaleDateString()})`
    localStorage.setItem('device_name', deviceName)
  }
  return deviceName
}

// Allow user to set custom device name
function setDeviceName(name) {
  localStorage.setItem('device_name', name.trim())
  return true
}

// ============ CLOUD SYNC STATUS ============
async function getSyncStatus() {
  const localHistory = getHistory()
  const indexedDBHistory = await loadHistoryFromIndexedDB()
  const cloudAvailable = typeof loadHistoryFromCloud !== 'undefined'

  return {
    device_id: getDeviceId(),
    device_name: getDeviceName(),
    local_entries: localHistory.length,
    indexed_db_entries: indexedDBHistory.length,
    cloud_available: cloudAvailable,
    last_cloud_sync: localStorage.getItem('last_cloud_sync') || 'Never',
    timestamp: new Date().toISOString()
  }
}

// ============ UI HELPERS ============
function showSyncPanel() {
  const panel = document.querySelector('.sync-panel') || createSyncPanel()
  panel.style.display = 'block'
}

function hideSyncPanel() {
  const panel = document.querySelector('.sync-panel')
  if (panel) panel.style.display = 'none'
}

function createSyncPanel() {
  const panel = document.createElement('div')
  panel.className = 'sync-panel'
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    max-width: 350px;
    z-index: 9999;
    font-size: 13px;
    color: #fff;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  `

  panel.innerHTML = `
    <div style="margin-bottom: 12px; font-weight: 600;">📱 Sinkronisasi Lintas Perangkat</div>
    <div id="sync-status" style="margin-bottom: 12px; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; line-height: 1.6;"></div>
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      <button id="export-history-btn" class="chip" style="flex: 1; padding: 6px 10px; font-size: 12px;">📥 Export</button>
      <button id="import-history-btn" class="chip" style="flex: 1; padding: 6px 10px; font-size: 12px;">📤 Import</button>
      <button id="close-sync-panel" class="chip" style="flex: 1; padding: 6px 10px; font-size: 12px; background: rgba(100, 100, 100, 0.2);">✕</button>
    </div>
    <input id="history-file-input" type="file" accept=".json" style="display: none;">
  `

  document.body.appendChild(panel)

  // Attach event listeners
  document.getElementById('export-history-btn').addEventListener('click', exportHistoryAsJSON)
  document.getElementById('import-history-btn').addEventListener('click', () => {
    document.getElementById('history-file-input').click()
  })
  document.getElementById('close-sync-panel').addEventListener('click', hideSyncPanel)
  document.getElementById('history-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      importHistoryFromJSON(e.target.files[0])
        .then((count) => {
          showToast(`✅ Imported ${count} entries`, 'success')
          updateSyncStatus()
        })
        .catch((error) => {
          showToast(`❌ Import failed: ${error.message}`, 'warn')
        })
    }
  })

  return panel
}

async function updateSyncStatus() {
  const status = await getSyncStatus()
  const statusEl = document.getElementById('sync-status')
  if (statusEl) {
    statusEl.innerHTML = `
      <div>📱 Device: <strong>${status.device_name}</strong></div>
      <div>📚 Local: <strong>${status.local_entries}</strong> entries</div>
      <div>💾 IndexedDB: <strong>${status.indexed_db_entries}</strong> entries</div>
      <div>☁️ Cloud: <strong>${status.cloud_available ? '✅ Available' : '❌ Unavailable'}</strong></div>
    `
  }
}

// Initialize on load
window.addEventListener('load', async () => {
  await initIndexedDB()
  console.log('✅ History sync module loaded')
})
