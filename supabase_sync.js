// ============ SUPABASE SYNC LAYER ============
// Real-time sync dengan Supabase database

const SUPABASE_URL = 'https://omkqvtlvabwblgijodxhe.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ta292dGx2YWJ3YmxnaWpvZHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3OTA2MzgsImV4cCI6MjA3OTM2NjYzOH0._9CRzqxKd450pX5ZgVAaocCUfWh5vV2GJXIFK3XAGKc'

let supabase = null
let isCloudAvailable = false
let currentUserId = null

// ============ INITIALIZATION ============

async function supabaseInit() {
  try {
    // Lazy load Supabase SDK
    if (!window.supabase) {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
      await new Promise((resolve, reject) => {
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
      })
    }

    const { createClient } = window.supabase
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    
    isCloudAvailable = true
    console.log('✅ Supabase initialized')
    return true
  } catch (e) {
    console.error('❌ Supabase init error:', e)
    isCloudAvailable = false
    return false
  }
}

// ============ AUTHENTICATION ============

async function supabaseSignIn(email, password) {
  const LOCAL_USERS = {
    'didin@company.com': '86532',
    'indra@company.com': '86086',
    'nur@company.com': '80229',
    'desi@company.com': '82847'
  }

  // Validate locally (no auth backend needed)
  if (LOCAL_USERS[email] && LOCAL_USERS[email] === password) {
    currentUserId = email.replace(/[^a-z0-9]/g, '_')
    const user = {
      email: email,
      uid: currentUserId,
      name: email.split('@')[0]
    }
    console.log('✅ Login successful:', email)
    return user
  }

  throw new Error('Email atau password salah')
}

async function supabaseSignOut() {
  currentUserId = null
  console.log('✅ Signed out')
  return true
}

function getCurrentUserId() {
  return currentUserId
}

// ============ MACHINES - LOAD ============

async function loadMachinesFromCloud() {
  if (!isCloudAvailable || !supabase) return null

  try {
    const { data, error } = await supabase
      .from('machines')
      .select('*')
      .order('id', { ascending: true })

    if (error) throw error

    if (data && data.length > 0) {
      console.log('✅ Loaded', data.length, 'machines from Supabase')
      return data.map(m => ({
        id: m.id,
        constructId: m.construct_id,
        lastEditedBy: m.last_edited_by,
        lastEditedAt: m.last_edited_at
      }))
    }

    return null
  } catch (e) {
    console.error('❌ Load machines error:', e)
    return null
  }
}

// ============ MACHINES - SAVE ============

async function saveMachineToCloud(machineId, constructId, userId, oldConstructId) {
  if (!isCloudAvailable || !supabase) return false

  try {
    const timestamp = new Date().toISOString()

    // Upsert machine
    const { error: machineError } = await supabase
      .from('machines')
      .upsert({
        id: machineId,
        construct_id: constructId || null,
        last_edited_by: userId || 'unknown',
        last_edited_at: timestamp
      }, { onConflict: 'id' })

    if (machineError) throw machineError

    // Add to history
    const { error: historyError } = await supabase
      .from('history')
      .insert([{
        timestamp: timestamp,
        user: userId || 'unknown',
        action: 'UPDATE_MACHINE',
        machine_id: machineId,
        from: oldConstructId,
        to: constructId,
        editor: userId || 'unknown'
      }])

    if (historyError) throw historyError

    console.log(`✅ Saved machine ${machineId} to Supabase`)
    return true
  } catch (e) {
    console.error('❌ Save machine error:', e)
    return false
  }
}

// ============ CONSTRUCTIONS - LOAD ============

async function loadConstructionsFromCloud() {
  if (!isCloudAvailable || !supabase) return null

  try {
    const { data, error } = await supabase
      .from('constructions')
      .select('*')

    if (error) throw error

    if (data && data.length > 0) {
      console.log('✅ Loaded', data.length, 'constructions from Supabase')
      return data.map(c => ({
        id: c.id,
        name: c.name,
        color: c.color,
        createdBy: c.created_by,
        createdAt: c.created_at
      }))
    }

    return null
  } catch (e) {
    console.error('❌ Load constructions error:', e)
    return null
  }
}

// ============ CONSTRUCTIONS - SAVE ============

async function saveConstructionToCloud(construction, userId, isNew = false) {
  if (!isCloudAvailable || !supabase) return false

  try {
    const { error } = await supabase
      .from('constructions')
      .upsert({
        id: construction.id,
        name: construction.name,
        color: construction.color,
        created_by: isNew ? userId : construction.createdBy,
        created_at: construction.createdAt || new Date().toISOString()
      }, { onConflict: 'id' })

    if (error) throw error

    console.log(`✅ Saved construction ${construction.id} to Supabase`)
    return true
  } catch (e) {
    console.error('❌ Save construction error:', e)
    return false
  }
}

// ============ CONSTRUCTIONS - DELETE ============

async function deleteConstructionFromCloud(constructionId, userId) {
  if (!isCloudAvailable || !supabase) return false

  try {
    const { error } = await supabase
      .from('constructions')
      .delete()
      .eq('id', constructionId)

    if (error) throw error

    console.log(`✅ Deleted construction ${constructionId} from Supabase`)
    return true
  } catch (e) {
    console.error('❌ Delete construction error:', e)
    return false
  }
}

// ============ HISTORY - LOAD ============

async function loadHistoryFromCloud(limit = 1000) {
  if (!isCloudAvailable || !supabase) return null

  try {
    const { data, error } = await supabase
      .from('history')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error) throw error

    if (data && data.length > 0) {
      console.log('✅ Loaded', data.length, 'history entries from Supabase')
      return data.map(h => ({
        machine: h.machine_id,
        from: h.from,
        to: h.to,
        editor: h.editor,
        date: h.timestamp,
        user: h.user,
        action: h.action
      }))
    }

    return null
  } catch (e) {
    console.error('❌ Load history error:', e)
    return null
  }
}

// ============ REAL-TIME LISTENERS ============

let unsubscribeMachines = null
let unsubscribeConstructions = null
let unsubscribeHistory = null

async function setupRealtimeListeners(onMachinesChange, onConstructionsChange, onHistoryChange) {
  if (!isCloudAvailable || !supabase) {
    console.log('⚠️ Supabase not available, skipping listeners')
    return
  }

  try {
    console.log('Setting up real-time listeners...')

    // Listen to machines
    if (unsubscribeMachines) unsubscribeMachines()
    unsubscribeMachines = supabase
      .channel('machines-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'machines' },
        async (payload) => {
          console.log('🔄 Machines changed:', payload.eventType)
          const machines = await loadMachinesFromCloud()
          if (machines && onMachinesChange) onMachinesChange(machines)
        }
      )
      .subscribe()

    // Listen to constructions
    if (unsubscribeConstructions) unsubscribeConstructions()
    unsubscribeConstructions = supabase
      .channel('constructions-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'constructions' },
        async (payload) => {
          console.log('🔄 Constructions changed:', payload.eventType)
          const constructions = await loadConstructionsFromCloud()
          if (constructions && onConstructionsChange) onConstructionsChange(constructions)
        }
      )
      .subscribe()

    // Listen to history
    if (unsubscribeHistory) unsubscribeHistory()
    unsubscribeHistory = supabase
      .channel('history-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'history' },
        async (payload) => {
          console.log('🔄 History changed:', payload.eventType)
          const history = await loadHistoryFromCloud()
          if (history && onHistoryChange) onHistoryChange(history)
        }
      )
      .subscribe()

    console.log('✅ Real-time listeners activated')
  } catch (e) {
    console.error('❌ Setup listeners error:', e)
  }
}

function cleanupListeners() {
  if (unsubscribeMachines) {
    supabase.removeChannel(unsubscribeMachines)
    unsubscribeMachines = null
  }
  if (unsubscribeConstructions) {
    supabase.removeChannel(unsubscribeConstructions)
    unsubscribeConstructions = null
  }
  if (unsubscribeHistory) {
    supabase.removeChannel(unsubscribeHistory)
    unsubscribeHistory = null
  }
  console.log('✅ Listeners cleaned up')
}

// ============ STUB FUNCTIONS (untuk compatibility) ============

async function firebaseInit(config) {
  return await supabaseInit()
}

async function firebaseSignIn(email, password) {
  return await supabaseSignIn(email, password)
}

async function firebaseSignOut() {
  return await supabaseSignOut()
}

function getMachineBlockFromNumber(machineNum) {
  const BLOCKS = {
    A: [{ start: 1, end: 160 }],
    B: [
      { start: 201, end: 220 }, { start: 261, end: 280 }, { start: 321, end: 340 },
      { start: 381, end: 400 }, { start: 441, end: 460 }, { start: 501, end: 520 },
      { start: 561, end: 580 }, { start: 621, end: 640 }
    ],
    C: [
      { start: 181, end: 200 }, { start: 241, end: 260 }, { start: 301, end: 320 },
      { start: 361, end: 380 }, { start: 421, end: 440 }, { start: 481, end: 500 },
      { start: 541, end: 560 }, { start: 601, end: 620 }
    ],
    D: [
      { start: 161, end: 180 }, { start: 221, end: 240 }, { start: 281, end: 300 },
      { start: 341, end: 360 }, { start: 401, end: 420 }, { start: 461, end: 480 },
      { start: 521, end: 540 }, { start: 581, end: 600 }
    ]
  }

  for (const [blockName, ranges] of Object.entries(BLOCKS)) {
    for (const range of ranges) {
      if (machineNum >= range.start && machineNum <= range.end) {
        return blockName
      }
    }
  }
  return '?'
}
