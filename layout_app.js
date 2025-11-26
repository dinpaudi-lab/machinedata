// Layout mesin app
const $ = id => document.getElementById(id)

const TOTAL_MACHINES = 640

// ============ STORAGE KEYS ============
// Data persisten (tersimpan meskipun logout/ganti user)
const STORAGE_KEY = 'layout_machines_v1'           // Mesin assignments
const HISTORY_KEY = 'layout_history_v1'            // Edit history
const CONSTS_KEY = 'layout_constructions_v1'       // Konstruksi list

// Session keys (dihapus saat logout)
const SESSION_KEY = 'app_session_token'            // Login token
const CURRENT_USER_KEY = 'current_user'            // Current username

// CATATAN: Semua data mesin, history, dan konstruksi tersimpan secara GLOBAL
// per browser, BUKAN per user. Artinya:
// - Jika user A login dan edit, datanya tersimpan
// - User A logout, user B login
// - User B akan lihat data yang sama seperti user A
// - Data tidak hilang sampai "Clear Data" diklik

// Block definition - Blok produksi based on nomor mesin
const BLOCKS = {
  A: [
    {start: 1, end: 160}
  ],
  B: [
    {start: 201, end: 220},
    {start: 261, end: 280},
    {start: 321, end: 340},
    {start: 381, end: 400},
    {start: 441, end: 460},
    {start: 501, end: 520},
    {start: 561, end: 580},
    {start: 621, end: 640}
  ],
  C: [
    {start: 181, end: 200},
    {start: 241, end: 260},
    {start: 301, end: 320},
    {start: 361, end: 380},
    {start: 421, end: 440},
    {start: 481, end: 500},
    {start: 541, end: 560},
    {start: 601, end: 620}
  ],
  D: [
    {start: 161, end: 180},
    {start: 221, end: 240},
    {start: 281, end: 300},
    {start: 341, end: 360},
    {start: 401, end: 420},
    {start: 461, end: 480},
    {start: 521, end: 540},
    {start: 581, end: 600}
  ]
}

// Function to get block for a machine number
function getMachineBlock(machineNum){
  for(const [blockName, ranges] of Object.entries(BLOCKS)){
    for(const range of ranges){
      if(machineNum >= range.start && machineNum <= range.end){
        return blockName
      }
    }
  }
  return '?'
}

// initial constructions - example set (will be overwritten by saved list if present)
let constructions = [
  {id:'R84-56-125', name:'R84 56 125', color:'#ff6ec7'},
  {id:'R84-60-125', name:'R84 60 125', color:'#7c5cff'},
  {id:'R72-38-125', name:'R72 38 125', color:'#00ffe1'},
]

function loadConstructions(){
  try{
    const raw = localStorage.getItem(CONSTS_KEY)
    if(!raw) return constructions
    const parsed = JSON.parse(raw)
    if(Array.isArray(parsed) && parsed.length) return parsed
    return constructions
  }catch(e){ return constructions }
}

function saveConstructions(){ localStorage.setItem(CONSTS_KEY, JSON.stringify(constructions)) }

// load persisted constructions if any
constructions = loadConstructions()

// load or init machines
function loadMachines(){
  const raw = localStorage.getItem(STORAGE_KEY)
  if(raw) return JSON.parse(raw)
  // default assign: distribute constructions across machines
  const arr = []
  for(let i=1;i<=TOTAL_MACHINES;i++){
    const c = constructions[(i-1) % constructions.length]
    arr.push({id:i, constructId:c.id})
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
  return arr
}

let machines = loadMachines()

function saveMachines(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(machines)) }

// ============ CLOUD HISTORY SYNC ============
let cloudHistory = []
let isCloudSyncEnabled = false

async function initializeCloudSync() {
  try {
    // Check if Supabase functions are available
    if (typeof loadHistoryFromCloud !== 'undefined') {
      console.log('📡 Initializing cloud history sync...')
      isCloudSyncEnabled = true
      
      // Load history from cloud on startup
      const remoteHistory = await loadHistoryFromCloud(1000)
      if (remoteHistory && Array.isArray(remoteHistory)) {
        cloudHistory = remoteHistory
        console.log(`✅ Loaded ${cloudHistory.length} history entries from cloud`)
        renderHistory()
      }
    } else {
      console.log('⚠️ Cloud sync not available - using local storage only')
    }
  } catch (e) {
    console.warn('⚠️ Cloud sync failed - falling back to local storage:', e)
  }
}

function getHistory() { 
  try {
    // Return cloud history if available, otherwise local storage
    if (isCloudSyncEnabled && cloudHistory.length > 0) {
      return cloudHistory
    }
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch(e) { 
    return [] 
  } 
}

async function addHistory(entry) { 
  const h = getHistory()
  h.unshift(entry)
  if(h.length > 1000) h.length = 1000
  
  // Save to local storage
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
  
  // Update cloud history
  if (isCloudSyncEnabled) {
    cloudHistory = h
  }
  
  // Save to IndexedDB for cross-device sync
  if (typeof saveHistoryToIndexedDB !== 'undefined') {
    try {
      await saveHistoryToIndexedDB(entry)
    } catch (e) {
      console.warn('IndexedDB save failed:', e)
    }
  }
  
  // Save directly to Supabase cloud
  if (typeof saveHistoryToCloud !== 'undefined' && isCloudAvailable) {
    try {
      await saveHistoryToCloud({
        type: entry.type || 'general',
        action: entry.action || 'update',
        details: entry,
        device_id: entry.device_id,
        device_name: entry.device_name
      })
    } catch (e) {
      console.warn('Cloud history sync failed:', e)
    }
  }
  
  renderHistory() 
}

// UI render
function renderLegend(){ const el = $('legend'); el.innerHTML=''; constructions.forEach(c=>{ const item = document.createElement('div'); item.className='legend-item'; item.innerHTML = `<div class="legend-color" style="background:${c.color}"></div><div>${c.name}</div>`; el.appendChild(item) }) }

function renderConstructList(){
  const el = $('construct-list')
  if(!el) return
  el.innerHTML = ''
  constructions.forEach(c=>{
    const row = document.createElement('div')
    row.className = 'construct-row'
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;'
    row.innerHTML = `<div style="width:14px;height:14px;border-radius:4px;background:${c.color}"></div><div style="flex:1">${c.name}</div><button class="edit-const" data-id="${c.id}" title="Edit warna">✏️</button><button class="delete-const" data-id="${c.id}">Hapus</button>`
    el.appendChild(row)
  })
  // attach edit handlers
  el.querySelectorAll('.edit-const').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-id')
      const c = constructions.find(x=> x.id === id)
      if(c) openConstModal(c)
    })
  })
  // attach delete handlers
  el.querySelectorAll('.delete-const').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-id')
      const constName = constructions.find(x=> x.id === id)?.name || id
      
      // Remove construction
      constructions = constructions.filter(x=> x.id !== id)
      
      // Clear this construction from all machines (optional cleanup)
      machines.forEach(m=>{
        if(m.constructId === id) m.constructId = null
      })
      
      saveConstructions()
      saveMachines()
      renderLegend()
      renderConstructList()
      populateModalConstruct()
      renderGrid()
      updateChart()
      showToast(`Konstruksi "${constName}" dihapus`, 'warn')
    })
  })
}
function attachEventListeners(){
  // Logout button
  const elLogout = $('logout-btn')
  if(elLogout){
    elLogout.addEventListener('click', ()=>{
      if(confirm('Anda yakin ingin logout?')){
        localStorage.removeItem('app_session_token')
        localStorage.removeItem('current_user')
        window.location.href = 'login.html'
      }
    })
  }
  
  const elClose = $('close-modal'); if(elClose) elClose.addEventListener('click', closeModal)
  const elSave = $('save-edit'); if(elSave) elSave.addEventListener('click', async ()=>{
    const id = Number($('modal-machine-id').textContent)
    const newC = $('modal-construct').value
    const editor = $('modal-editor').value || 'Unknown'
    const old = machines[id-1] && machines[id-1].constructId
    if(machines[id-1]) machines[id-1].constructId = newC
    saveMachines()
    
    // Save to Supabase
    const userId = localStorage.getItem('currentUserId') || 'unknown'
    if (typeof saveMachineToCloud !== 'undefined') {
      try {
        await saveMachineToCloud(id, newC, userId, old)
      } catch (e) {
        console.error('Error saving to cloud:', e)
      }
    }
    
    addHistory({machine:id, from:old, to:newC, editor:editor, date:new Date().toISOString()})
    closeModal()
    renderGrid()
    renderLegend()
    updateChart()
    showToast('Mesin diperbarui ☁️', 'success')
  })
  
  // Sync history button
  const elSyncHistory = $('sync-history-btn')
  if(elSyncHistory){
    elSyncHistory.addEventListener('click', async ()=>{
      if(typeof showSyncPanel === 'function'){
        showSyncPanel()
        if(typeof updateSyncStatus === 'function'){
          await updateSyncStatus()
        }
      } else {
        showToast('Fitur sync belum tersedia', 'warn')
      }
    })
  }
  
  // Konstruksi modal handlers
  const elConstClose = $('close-const-modal'); if(elConstClose) elConstClose.addEventListener('click', closeConstModal)
  const elConstSave = $('save-const'); if(elConstSave) elConstSave.addEventListener('click', ()=>{
    const modal = $('const-modal')
    const constructId = modal.dataset.constructId
    const c = constructions.find(x=> x.id === constructId)
    if(c){
      const newName = $('const-modal-name-input').value.trim() || c.name
      let newColor = $('const-modal-color').value
      
      // Normalize color format - ensure it's lowercase and has #
      if(!newColor.startsWith('#')) newColor = '#' + newColor
      newColor = newColor.toLowerCase()
      
      console.log('Saving construct:', {name: newName, color: newColor, element: $('const-modal-color').value})
      
      c.name = newName
      c.color = newColor
      saveConstructions()
      renderLegend()
      renderConstructList()
      renderGrid()
      populateModalConstruct()
      updateChart()
      closeConstModal()
      showToast('Konstruksi diperbarui', 'success')
    }
  })
  
  const elAdd = $('add-const'); if(elAdd) elAdd.addEventListener('click', ()=>{
    const name = $('new-const-name').value.trim()
    if(!name){ alert('Isi nama konstruksi'); return }
    const id = name.replace(/\s+/g,'-') + '-' + Math.floor(Math.random()*9999)
    let color = $('new-const-color').value
    
    // Normalize color format
    if(!color.startsWith('#')) color = '#' + color
    color = color.toLowerCase()
    
    console.log('Adding new construct:', {id, name, color, element: $('new-const-color').value})
    
    constructions.push({id:id, name:name, color:color})
    const nameEl = $('new-const-name'); if(nameEl) nameEl.value=''
    saveConstructions()
    renderLegend()
    renderConstructList()
    populateModalConstruct()
    updateChart()
  })
  const searchEl = $('search'); if(searchEl) searchEl.addEventListener('input', ()=> renderGrid())
  
  // Clear search button
  const clearBtn = $('clear-search')
  if(clearBtn){
    clearBtn.addEventListener('click', ()=>{
      const searchEl = $('search')
      if(searchEl) searchEl.value = ''
      renderGrid()
      showToast('Pencarian direset', 'success')
    })
  }
  
  // Clear storage button (for debugging color issues)
  const clearStorageBtn = $('clear-storage')
  if(clearStorageBtn){
    clearStorageBtn.addEventListener('click', ()=>{
      if(confirm('Yakin ingin menghapus semua data tersimpan? Ini akan reset ke default.')){
        try{
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(CONSTS_KEY)
          localStorage.removeItem(HISTORY_KEY)
          console.log('Storage cleared')
          location.reload()
        }catch(e){
          console.error('Clear storage error:', e)
          showToast('Gagal hapus data', 'warn')
        }
      }
    })
  }
}

function randomColor(){ const colors=['#ff6ec7','#7c5cff','#00ffe1','#ffd166','#34d399','#f97316','#60a5fa']; return colors[Math.floor(Math.random()*colors.length)] }

function populateModalConstruct(){ const sel = $('modal-construct'); sel.innerHTML=''; constructions.forEach(c=>{ const opt=document.createElement('option'); opt.value=c.id; opt.textContent=c.name; sel.appendChild(opt) }) }

// history render
function renderHistory(){ 
  const list = window.cloudHistory || getHistory()
  const el = $('history-list')
  if(!el) return
  el.innerHTML=''
  if(list.length===0){ 
    el.innerHTML='<div>Tidak ada riwayat.</div>'
    return 
  }
  list.forEach(h=>{ 
    const div=document.createElement('div')
    div.className='history-row'
    const machineId = h.machine || h.machine_id
    div.innerHTML = `<div><strong>Mesin ${machineId}</strong> : ${h.from} → ${h.to}</div><div>${h.editor} — ${new Date(h.date).toLocaleString()}</div>`
    el.appendChild(div) 
  })
}

function getConstructById(id){ if(!id) return null; return constructions.find(c=> c.id === id) || null }

function renderGrid(){ 
  const grid = $('machine-grid')
  if(!grid) return
  const q = $('search')
  const filter = q ? q.value.trim() : ''
  const counter = $('search-counter')
  
  let matchCount = 0
  grid.innerHTML = ''
  
  // Helper function to render block with proper layout
  function renderBlock(blockName, ranges) {
    // Add block title
    const blockLabel = document.createElement('div')
    blockLabel.style.cssText = 'grid-column:1/-1;padding:12px 0 6px 0;font-weight:700;color:#ff6ec7;font-size:13px;text-transform:uppercase;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px'
    blockLabel.textContent = `🏭 Blok ${blockName}`
    grid.appendChild(blockLabel)
    
    // Collect all machines in this block
    const allMachines = []
    for(const range of ranges){
      for(let i = range.start; i <= range.end; i++){
        allMachines.push(i)
      }
    }
    allMachines.sort((a,b) => a - b)
    
    // Group machines into sections of 20 (10 kolom x 2 baris)
    for(let sectionIdx = 0; sectionIdx < allMachines.length; sectionIdx += 20) {
      const section = allMachines.slice(sectionIdx, sectionIdx + 20)
      
      if(section.length === 0) continue
      
      // Create section container (10 columns)
      const sectionDiv = document.createElement('div')
      sectionDiv.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:4px;grid-column:1/-1;margin-bottom:8px'
      
      // Render 20 machines in 10x2 format (odd in top, even in bottom)
      for(let i = 0; i < 10; i++) {
        const topMachine = section[i * 2]
        const bottomMachine = section[i * 2 + 1]
        
        // Create sub-column for odd/even pair
        const subCol = document.createElement('div')
        subCol.style.cssText = 'display:grid;grid-template-rows:1fr 1fr;gap:2px'
        
        // Render top machine (odd)
        if(topMachine) {
          const box = createMachineBox(topMachine, blockName, filter)
          if(box.matches) matchCount++
          subCol.appendChild(box.element)
        }
        
        // Render bottom machine (even)
        if(bottomMachine) {
          const box = createMachineBox(bottomMachine, blockName, filter)
          if(box.matches) matchCount++
          subCol.appendChild(box.element)
        }
        
        sectionDiv.appendChild(subCol)
      }
      
      grid.appendChild(sectionDiv)
    }
  }
  
  // Helper to create a machine box
  function createMachineBox(machineNum, blockName, filter) {
    const m = machines[machineNum-1] || {id:machineNum, constructId:null}
    const box = document.createElement('div')
    box.className = 'machine-box'
    box.style.fontSize = '11px'
    box.style.padding = '4px'
    box.style.minHeight = '24px'
    box.style.display = 'flex'
    box.style.alignItems = 'center'
    box.style.justifyContent = 'center'
    box.title = `Mesin ${machineNum} - Blok ${blockName}`
    box.textContent = machineNum
    
    const c = constructions.find(x=> x.id === m.constructId)
    box.style.background = c ? c.color : '#262626'
    
    const isMachine = String(machineNum)
    const matches = !filter || isMachine === filter
    
    if(!matches){
      box.style.opacity = '0.15'
      box.style.pointerEvents = 'none'
      box.style.cursor = 'default'
    } else {
      box.style.opacity = '1'
      box.style.pointerEvents = 'auto'
      box.style.cursor = 'pointer'
      box.style.border = filter ? '2px solid #ffd166' : '1px solid rgba(255,255,255,0.04)'
      const constructName = c ? c.name : 'Belum ditugaskan'
      box.title = `Mesin ${machineNum} - Blok ${blockName}\nKonstruksi: ${constructName}`
      box.addEventListener('click', ()=>{ openModal(machineNum) })
    }
    
    return { element: box, matches: matches }
  }
  
  // Render all blocks
  renderBlock('A', BLOCKS.A)
  renderBlock('B', BLOCKS.B)
  renderBlock('C', BLOCKS.C)
  renderBlock('D', BLOCKS.D)
  
  // Update counter
  if(counter){
    if(filter){
      counter.textContent = `${matchCount} hasil`
      counter.style.color = matchCount > 0 ? '#34d399' : '#f97316'
    } else {
      counter.textContent = ''
    }
  }
  
  // Show search result info
  const searchResultDiv = $('search-result')
  const searchResultText = $('search-result-text')
  if(filter && matchCount > 0){
    const machineNum = parseInt(filter)
    const m = machines[machineNum-1]
    const c = constructions.find(x=> x.id === m?.constructId)
    const block = getMachineBlock(machineNum)
    const constructName = c ? c.name : 'Belum ditugaskan'
    
    searchResultText.innerHTML = `
      <div style="display:grid;gap:8px">
        <div>🔍 <strong>Mesin ${machineNum}</strong></div>
        <div>📍 Blok: <strong>${block}</strong></div>
        <div>🏗️ Konstruksi: <strong style="color:${c?.color || '#999'}">${constructName}</strong></div>
      </div>
    `
    searchResultDiv.style.display = 'block'
  } else {
    searchResultDiv.style.display = 'none'
  }
}

function openModal(id){ 
  const modal = $('modal')
  if(!modal) return
  const mid = $('modal-machine-id')
  if(mid){
    const block = getMachineBlock(id)
    mid.textContent = id
    mid.title = `Blok ${block}`
  }
  populateModalConstruct()
  const sel = $('modal-construct')
  const m = machines[id-1] || {constructId:''}
  if(sel) sel.value = m.constructId || ''
  const editor = $('modal-editor')
  if(editor) editor.value=''
  modal.classList.remove('hidden')
}

function closeModal(){ const modal = $('modal'); if(modal) modal.classList.add('hidden') }

function openConstModal(construct){ 
  const modal = $('const-modal')
  if(!modal) return
  const nameSpan = $('const-modal-name')
  const nameInput = $('const-modal-name-input')
  const colorInput = $('const-modal-color')
  
  if(nameSpan) nameSpan.textContent = construct.name
  if(nameInput) nameInput.value = construct.name
  
  // Normalize color to ensure it's proper hex format
  let displayColor = construct.color
  if(!displayColor.startsWith('#')) displayColor = '#' + displayColor
  displayColor = displayColor.toLowerCase()
  
  if(colorInput) {
    colorInput.value = displayColor
    console.log('Opening const modal with color:', {stored: construct.color, normalized: displayColor, input: colorInput.value})
  }
  
  // Store current construct id for save handler
  modal.dataset.constructId = construct.id
  modal.classList.remove('hidden')
}

function closeConstModal(){ const modal = $('const-modal'); if(modal) modal.classList.add('hidden') }

// chart
let barChart = null
function updateChart(){ 
  const canvasEl = $('barChart')
  if(!canvasEl) return
  
  const ctx = canvasEl.getContext('2d')
  
  // Build map only from constructions that still exist
  const map = {}
  constructions.forEach(c=> map[c.id] = 0)
  
  // Count machines for each construction
  machines.forEach(m=>{
    if(map[m.constructId] !== undefined){
      map[m.constructId]++
    }
  })
  
  // Build labels and data from map (only constructions that exist)
  const constructIds = Object.keys(map)
  const labels = constructIds.map(k=> {
    const c = getConstructById(k)
    return c ? c.name : k
  })
  const data = constructIds.map(k=> map[k])
  const colors = constructIds.map(k=> {
    const c = getConstructById(k)
    return c ? c.color : '#999999'
  })
  
  console.log('Updating chart:', {labels, data, colors, constructIds})
  
  if(barChart){
    // Destroy old chart completely
    barChart.destroy()
    barChart = null
  }
  
  // Create new chart
  barChart = new Chart(ctx, {
    type:'bar',
    data:{
      labels: labels,
      datasets:[{
        label:'Jumlah Mesin',
        data: data,
        backgroundColor: colors
      }]
    },
    options:{
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#cbd5e1'}},
        y:{beginAtZero:true, ticks:{color:'#cbd5e1'}}
      }
    }
  })
}

// greeting
function updateGreeting(){ const h = new Date().getHours(); const g = $('greeting'); if(h<12) g.textContent='Selamat Pagi'; else if(h<17) g.textContent='Selamat Sore'; else g.textContent='Selamat Malam' }

// realtime clock
function updateClock(){
  const el = $('clock');
  const de = $('date');
  if(!el) return
  const now = new Date()
  const hh = String(now.getHours()).padStart(2,'0')
  const mm = String(now.getMinutes()).padStart(2,'0')
  const ss = String(now.getSeconds()).padStart(2,'0')
  el.textContent = `${hh}:${mm}:${ss}`
  if(de) {
    // Indonesian long date: weekday, day month year
    try{
      de.textContent = now.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    }catch(e){
      de.textContent = now.toLocaleDateString()
    }
  }
  try{ el.title = now.toLocaleString('id-ID') }catch(e){ el.title = now.toLocaleString() }
}

// init on DOMContentLoaded
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp)
} else {
  initializeApp()
}

async function initializeApp() {
  try {
    // Initialize Supabase
    if (typeof supabaseInit !== 'undefined') {
      const cloudReady = await supabaseInit()
      console.log('Cloud availability:', cloudReady)
      
      if (cloudReady && typeof setupRealtimeListeners !== 'undefined') {
        // Load from cloud first
        const cloudMachines = await loadMachinesFromCloud()
        if (cloudMachines && cloudMachines.length > 0) {
          machines = cloudMachines
          console.log('✅ Loaded machines from cloud')
        }
        
        const cloudConstructs = await loadConstructionsFromCloud()
        if (cloudConstructs && cloudConstructs.length > 0) {
          constructions = cloudConstructs
          console.log('✅ Loaded constructions from cloud')
        }
        
        const cloudHistory = await loadHistoryFromCloud()
        if (cloudHistory && cloudHistory.length > 0) {
          // Store in cloudHistory for display
          window.cloudHistory = cloudHistory
          console.log('✅ Loaded history from cloud')
        }
        
        // Setup real-time listeners
        setupRealtimeListeners(
          (newMachines) => {
            machines = newMachines
            renderGrid()
            updateChart()
            console.log('🔄 Machines synced from cloud')
          },
          (newConstructs) => {
            constructions = newConstructs
            renderLegend()
            renderConstructList()
            populateModalConstruct()
            renderGrid()
            updateChart()
            console.log('🔄 Constructions synced from cloud')
          },
          (newHistory) => {
            window.cloudHistory = newHistory
            renderHistory()
            console.log('🔄 History synced from cloud')
          }
        )
        
        showToast('✅ Terhubung ke Cloud - Real-time Sync Aktif!', 'success')
      }
    }
  } catch (e) {
    console.error('Init error:', e)
  }
  
  // Render UI
  console.log('📊 Data Status:', {
    machines: machines.length,
    constructions: constructions.length,
    history: getHistory().length,
    storageUsed: (JSON.stringify(localStorage).length / 1024).toFixed(2) + ' KB'
  })
  
  renderLegend()
  renderGrid()
  renderConstructList()
  populateModalConstruct()
  renderHistory()
  updateChart()
  updateGreeting()
  updateClock()
  attachEventListeners()
  
  // Initialize cloud sync
  initializeCloudSync().catch(e => console.warn('Cloud sync initialization failed:', e))
}

// keep clock ticking
setInterval(()=>{ try{ updateClock() }catch(e){} }, 1000)

// export helpers
function exportLayoutCSV(){ const rows=[['machine','constructId']]; machines.forEach(m=> rows.push([m.id,m.constructId])); const csv = rows.map(r=> r.join(',')).join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='layout_machines.csv'; a.click(); URL.revokeObjectURL(url) }

// Export to Excel (.xlsx) using SheetJS
async function exportExcel(){
  const pad = n=> String(n).padStart(2,'0')
  const now = new Date()
  const fname = `layout_export_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`

  // Prefer ExcelJS (supports embedding images and richer styling)
  if(window.ExcelJS){
    try{
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Didin'
      wb.created = now

      // Machines sheet
      const ws1 = wb.addWorksheet('Machines')
      ws1.columns = [
        {header:'Machine', key:'machine', width:10},
        {header:'Construct ID', key:'cid', width:22},
        {header:'Construct Name', key:'cname', width:40},
        {header:'Assigned', key:'assigned', width:12}
      ]
      ws1.getRow(1).font = {bold:true}
      machines.forEach(m=>{
        const c = getConstructById(m.constructId) || {name:'UNASSIGNED'}
        ws1.addRow({machine:m.id, cid: m.constructId||'', cname: c.name, assigned: m.constructId? 'Yes':'No'})
      })

      // Constructions sheet
      const ws2 = wb.addWorksheet('Constructions')
      ws2.columns = [ {header:'Construct ID', key:'id', width:26}, {header:'Name', key:'name', width:40}, {header:'Color', key:'color', width:14}, {header:'Machines Using', key:'count', width:16} ]
      ws2.getRow(1).font = {bold:true}
      const counts = {}
      machines.forEach(m=>{ counts[m.constructId] = (counts[m.constructId]||0)+1 })
      constructions.forEach(c=> ws2.addRow({id:c.id, name:c.name, color:c.color, count: counts[c.id]||0}))

      // History sheet
      const ws3 = wb.addWorksheet('History')
      ws3.columns = [ {header:'Action',key:'action',width:18},{header:'Machine',key:'machine',width:10},{header:'From',key:'from',width:18},{header:'To',key:'to',width:18},{header:'Editor',key:'editor',width:24},{header:'Date',key:'date',width:22} ]
      ws3.getRow(1).font = {bold:true}
      getHistory().forEach(h=>{
        const d = h.date ? new Date(h.date) : null
        const row = ws3.addRow({ action:h.action||'', machine:h.machine||'', from:h.from||'', to:h.to||'', editor:h.editor||'', date: d || '' })
        if(d && !isNaN(d)) row.getCell('date').numFmt = 'dd/mm/yyyy hh:mm:ss'
      })

      // Add chart image sheet if chart exists
      if(window.barChart && typeof window.barChart.toBase64Image === 'function'){
        try{
          const dataUrl = window.barChart.toBase64Image()
          // ExcelJS expects base64 without data: prefix
          const base64 = dataUrl.split(',')[1]
          const imageId = wb.addImage({ base64: base64, extension:'png' })
          const wsChart = wb.addWorksheet('Chart')
          // place the image to cover a large area
          wsChart.addImage(imageId, {tl:{col:0,row:0}, br:{col:8,row:20}})
        }catch(e){ console.warn('embed chart failed', e) }
      }

      // write workbook to buffer and download
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fname
      a.click()
      URL.revokeObjectURL(url)
      showToast(`Excel diexport: ${fname}`, 'success')
      return
    }catch(err){ console.error('ExcelJS export failed', err); showToast('Gagal export via ExcelJS, mencoba fallback', 'warn') }
  }

  // Fallback to SheetJS (existing behavior)
  if(typeof XLSX === 'undefined'){ showToast('Library XLSX tidak tersedia', 'warn'); return }
  const wb = XLSX.utils.book_new()

  // Machines sheet (with tidy headers)
  const machinesData = [['Machine','Construct ID','Construct Name','Assigned']]
  machines.forEach(m=>{
    const c = getConstructById(m.constructId) || {name:'UNASSIGNED'}
    machinesData.push([m.id, m.constructId || '', c.name, m.constructId? 'Yes' : 'No'])
  })
  const ws1 = XLSX.utils.aoa_to_sheet(machinesData)
  ws1['!cols'] = [{wpx:80},{wpx:160},{wpx:260},{wpx:80}]
  XLSX.utils.book_append_sheet(wb, ws1, 'Machines')

  // Constructions sheet (with counts)
  const counts = {}
  machines.forEach(m=>{ counts[m.constructId] = (counts[m.constructId]||0)+1 })
  const consData = [['Construct ID','Name','Color','Machines Using']]
  constructions.forEach(c=> consData.push([c.id, c.name, c.color, counts[c.id]||0]))
  const ws2 = XLSX.utils.aoa_to_sheet(consData)
  ws2['!cols'] = [{wpx:180},{wpx:260},{wpx:120},{wpx:120}]
  XLSX.utils.book_append_sheet(wb, ws2, 'Constructions')

  // History sheet: provide ISO date in cells so Excel recognizes dates
  const history = getHistory()
  const histData = [['Action','Machine','From','To','Editor','Date']]
  history.forEach(h=> histData.push([h.action||'', h.machine||'', h.from||'', h.to||'', h.editor||'', h.date || '']))
  const ws3 = XLSX.utils.aoa_to_sheet(histData)
  ws3['!cols'] = [{wpx:120},{wpx:80},{wpx:120},{wpx:120},{wpx:180},{wpx:180}]
  // convert Date strings in column F to real Excel dates where possible
  for(let r=1;r<histData.length;r++){
    const raw = histData[r][5]
    if(raw){
      const d = new Date(raw)
      if(!isNaN(d)){
        const cellRef = XLSX.utils.encode_cell({c:5,r:r})
        ws3[cellRef].t = 'd'
        ws3[cellRef].v = d
        ws3[cellRef].z = XLSX.SSF._table[22] || 'yyyy-mm-dd hh:mm:ss'
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, ws3, 'History')

  try{
    XLSX.writeFile(wb, fname)
    showToast(`Excel diexport: ${fname}`, 'success')
  }catch(e){ console.error(e); showToast('Gagal export Excel', 'warn') }

  // Export chart as PNG alongside workbook if available
  try{
    if(window.barChart && typeof window.barChart.toBase64Image === 'function'){
      const dataUrl = window.barChart.toBase64Image()
      const parts = dataUrl.split(',')
      const bstr = atob(parts[1])
      const u8 = new Uint8Array(bstr.length)
      for(let i=0;i<bstr.length;i++) u8[i]=bstr.charCodeAt(i)
      const blob = new Blob([u8],{type:'image/png'})
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `layout_chart_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast('Chart diexport sebagai PNG', 'success')
    }
  }catch(e){ console.warn('chart export failed', e) }
}

// optional: expose to console
window._layout = {
  machines, 
  constructions, 
  updateChart, 
  exportLayoutCSV,
  debugColors: ()=>{
    console.log('=== DEBUG: Warna Konstruksi ===')
    constructions.forEach((c, i)=>{
      console.log(`[${i}] ${c.name}: ${c.color} (type: ${typeof c.color})`)
    })
    console.log('=== localStorage ===')
    console.log('Stored:', localStorage.getItem(CONSTS_KEY))
  }
}

// wire export button
const _xlsBtn = $('export-excel')
if(_xlsBtn) _xlsBtn.addEventListener('click', exportExcel)

// --- Microinteractions: toast + confetti helpers ---
function ensureToastRoot(){ let r = document.querySelector('.toast-root'); if(!r){ r = document.createElement('div'); r.className = 'toast-root'; document.body.appendChild(r) } return r }
function showToast(text, type=''){
  const root = ensureToastRoot()
  const t = document.createElement('div')
  t.className = 'toast' + (type? ' '+type : '')
  t.textContent = text
  root.appendChild(t)
  setTimeout(()=>{ t.style.transition='opacity .3s, transform .3s'; t.style.opacity='0'; t.style.transform='translateY(-8px)'; setTimeout(()=> t.remove(),350) }, 3500)
  return t
}

function fireConfetti(){ try{ if(typeof confetti === 'function'){ confetti({particleCount:40, spread:60, origin:{y:0.6}}) } }catch(e){ /* ignore if confetti not available */ } }

// Hook microinteractions into key actions

// When adding a construction
const _addBtn = $('add-const')
if(_addBtn){ _addBtn.addEventListener('click', ()=>{ setTimeout(()=>{ showToast('Konstruksi ditambahkan', 'success'); fireConfetti() }, 120) }) }

// When saving machine edit
const _saveBtn = $('save-edit')
if(_saveBtn){ _saveBtn.addEventListener('click', ()=>{ setTimeout(()=>{ showToast('Perubahan mesin tersimpan', 'success'); }, 120) }) }

// When deleting a construct (renderConstructList already calls addHistory) — attach via delegation
function attachDeleteToast(){ const el = $('construct-list'); if(!el) return; el.addEventListener('click', (e)=>{ if(e.target && e.target.classList.contains('delete-const')){ setTimeout(()=>{ showToast('Konstruksi dihapus', 'warn') }, 120) } }) }
attachDeleteToast()
