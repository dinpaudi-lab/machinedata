// Login authentication script - Supabase version
const SESSION_KEY = 'app_session_token'

document.addEventListener('DOMContentLoaded', async function(){
  const form = document.getElementById('login-form')
  const usernameInput = document.getElementById('username')
  const passwordInput = document.getElementById('password')
  const errorMessage = document.getElementById('error-message')
  const loginBtn = document.getElementById('login-btn')
  
  // Initialize Supabase
  try {
    await supabaseInit()
    console.log('✅ Supabase ready')
  } catch (e) {
    console.error('Supabase init error:', e)
  }
  
  form.addEventListener('submit', async function(e){
    e.preventDefault()
    
    const email = usernameInput.value.trim()
    const password = passwordInput.value
    
    console.log('Login attempt:', email)
    
    // Validate
    if(!email || !password){
      showError('Email dan sandi harus diisi')
      return
    }
    
    // Show loading
    if(loginBtn) {
      loginBtn.disabled = true
      loginBtn.textContent = 'Proses...'
    }
    
    try {
      // Authenticate
      const user = await supabaseSignIn(email, password)
      
      if(user){
        console.log('✅ Login successful:', email)
        
        // Save session
        localStorage.setItem(SESSION_KEY, btoa(email + ':' + Date.now()))
        localStorage.setItem('current_user', email)
        localStorage.setItem('currentUserId', user.uid)
        localStorage.setItem('currentUserEmail', email)
        
        // Redirect
        setTimeout(() => {
          window.location.href = 'layout.html'
        }, 500)
      }
    } catch (error) {
      console.error('Login error:', error.message)
      showError('Email atau sandi salah')
      passwordInput.value = ''
      passwordInput.focus()
    } finally {
      if(loginBtn) {
        loginBtn.disabled = false
        loginBtn.textContent = 'Masuk'
      }
    }
  })
  
  function showError(message){
    errorMessage.textContent = message
    errorMessage.classList.add('show')
    setTimeout(() => {
      errorMessage.classList.remove('show')
    }, 4000)
  }
})
