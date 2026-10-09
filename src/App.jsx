import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase.js'

const pages = ['Home', 'Courses', 'Events', 'Settings', 'Support']
const blankSignup = { first: '', surname: '', email: '', password: '', field: '', minors: '', situation: '', kind: 'student' }
const message = (error) => error?.message || 'Something went wrong. Please try again.'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [applications, setApplications] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [bookings, setBookings] = useState([])
  const [page, setPage] = useState('Home')
  const [authMode, setAuthMode] = useState(null)
  const [signup, setSignup] = useState(blankSignup)
  const [login, setLogin] = useState({ email: '', password: '' })
  const [courses, setCourses] = useState([])
  const [events, setEvents] = useState([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [course, setCourse] = useState({ title: '', description: '', technology_field: '' })
  const [event, setEvent] = useState({ title: '', description: '', starts_at: '', capacity: '' })

  const loadAccount = useCallback(async (user) => {
    if (!user) { setProfile(null); setApplications([]); setEnrollments([]); setBookings([]); return }
    const [profileResult, applicationResult, enrollmentResult, bookingResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('mentor_applications').select('id,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('course_enrollments').select('id,progress,courses(id,title)').eq('user_id', user.id),
      supabase.from('event_bookings').select('id,events(id,title,starts_at)').eq('user_id', user.id),
    ])
    if (profileResult.error) setError(message(profileResult.error))
    setProfile(profileResult.data)
    setApplications(applicationResult.data || [])
    setEnrollments(enrollmentResult.data || [])
    setBookings(bookingResult.data || [])
  }, [])

  const loadCatalog = useCallback(async () => {
    const [courseResult, eventResult] = await Promise.all([
      supabase.from('courses').select('id,title,description,technology_field,created_at').eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('events').select('id,title,description,starts_at,capacity,created_at').eq('status', 'published').order('starts_at', { ascending: true }),
    ])
    if (courseResult.error) setError(message(courseResult.error)); else setCourses(courseResult.data || [])
    if (eventResult.error) setError(message(eventResult.error)); else setEvents(eventResult.data || [])
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); loadAccount(data.session?.user) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setTimeout(() => loadAccount(next?.user), 0)
    })
    loadCatalog()
    return () => listener.subscription.unsubscribe()
  }, [loadAccount, loadCatalog])

  async function run(action) {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (caught) { setError(message(caught)) } finally { setBusy(false) }
  }

  async function signUp(e) {
    e.preventDefault()
    await run(async () => {
      const { data, error: authError } = await supabase.auth.signUp({
        email: signup.email, password: signup.password,
        options: { data: {
          first_name: signup.first, surname: signup.surname, primary_field: signup.field,
          minor_fields: signup.minors.split(',').map((x) => x.trim()).filter(Boolean),
          current_situation: signup.situation, requested_mentor: signup.kind === 'mentor',
        } },
      })
      if (authError) throw authError
      setAuthMode(null)
      setNotice(data.session ? 'Account created.' : 'Check your email to confirm your account, then sign in.')
    })
  }

  async function signIn(e) {
    e.preventDefault()
    await run(async () => {
      const { error: authError } = await supabase.auth.signInWithPassword(login)
      if (authError) throw authError
      setAuthMode(null)
    })
  }

  async function microsoftSignIn() {
    await run(async () => {
      const { error: authError } = await supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email profile', redirectTo: window.location.origin } })
      if (authError) throw authError
    })
  }

  async function signOut() {
    await run(async () => { const { error: authError } = await supabase.auth.signOut(); if (authError) throw authError })
  }

  async function requestMentor() {
    await run(async () => {
      const { error: requestError } = await supabase.rpc('request_mentor_access')
      if (requestError) throw requestError
      await loadAccount(session.user)
      setNotice('Mentor access requested. You will have student permissions until approval.')
    })
  }

  async function saveProfile(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const changes = {
      first_name: form.get('first_name'), surname: form.get('surname'), primary_field: form.get('primary_field'),
      minor_fields: String(form.get('minor_fields') || '').split(',').map((x) => x.trim()).filter(Boolean),
      current_situation: form.get('current_situation'),
    }
    await run(async () => {
      const { error: saveError } = await supabase.from('profiles').update(changes).eq('id', session.user.id)
      if (saveError) throw saveError
      await loadAccount(session.user); setNotice('Profile saved.')
    })
  }

  async function publishCourse(e) {
    e.preventDefault()
    await run(async () => {
      const { error: saveError } = await supabase.from('courses').insert({ ...course, status: 'published', created_by: session.user.id })
      if (saveError) throw saveError
      setCourse({ title: '', description: '', technology_field: '' }); await loadCatalog(); setNotice('Course published.')
    })
  }

  async function publishEvent(e) {
    e.preventDefault()
    await run(async () => {
      const { error: saveError } = await supabase.from('events').insert({
        ...event, capacity: event.capacity ? Number(event.capacity) : null,
        starts_at: new Date(event.starts_at).toISOString(), status: 'published', created_by: session.user.id,
      })
      if (saveError) throw saveError
      setEvent({ title: '', description: '', starts_at: '', capacity: '' }); await loadCatalog(); setNotice('Event published.')
    })
  }

  async function joinCourse(id) {
    await run(async () => { const { error: joinError } = await supabase.rpc('join_course', { target_course_id: id }); if (joinError) throw joinError; setNotice('You joined the course.') })
  }

  async function bookEvent(id) {
    await run(async () => { const { error: bookingError } = await supabase.rpc('book_event', { target_event_id: id }); if (bookingError) throw bookingError; setNotice('Your event place is booked.') })
  }

  async function updateProgress(enrollmentId, progress) {
    await run(async () => {
      const { error: progressError } = await supabase.from('course_enrollments').update({ progress: Number(progress) }).eq('id', enrollmentId)
      if (progressError) throw progressError
      await loadAccount(session.user); setNotice('Course progress saved.')
    })
  }

  if (!isSupabaseConfigured) return <main className="shell">
    <h1>Banquet</h1><p>Backend configuration is needed before the app can connect.</p>
    <p>Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase project URL and publishable key, then apply the SQL migration in <code>supabase/migrations</code>.</p>
  </main>

  const accountType = profile?.account_type || 'student'
  const mentorPending = applications.some((application) => application.status === 'pending')
  const updateSignup = (key) => (e) => setSignup((value) => ({ ...value, [key]: e.target.value }))

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#home" onClick={() => setPage('Home')}>Banquet</a>
      <nav aria-label="Main menu">{pages.map((item) => <button className="link-button" key={item} onClick={() => { setPage(item); setAuthMode(null) }}>{item}</button>)}</nav>
      <div className="account-actions">{session ? <><span>{profile?.first_name || session.user.email}</span><button onClick={signOut}>Sign out</button></> : <><button onClick={() => setAuthMode('signin')}>Sign in</button><button onClick={() => setAuthMode('signup')}>Sign up</button></>}</div>
    </header>
    {error && <p className="message error" role="alert">{error}</p>}{notice && <p className="message" role="status">{notice}</p>}

    {authMode === 'signup' && <section><h1>Create an account</h1><form className="form-grid" onSubmit={signUp}>
      <label>First name<input required value={signup.first} onChange={updateSignup('first')} /></label>
      <label>Surname<input required value={signup.surname} onChange={updateSignup('surname')} /></label>
      <label>Email<input type="email" required value={signup.email} onChange={updateSignup('email')} /></label>
      <label>Password<input type="password" minLength="8" required value={signup.password} onChange={updateSignup('password')} /></label>
      <label>Main technology field<input required value={signup.field} onChange={updateSignup('field')} /></label>
      <label>Minor areas (comma separated)<input value={signup.minors} onChange={updateSignup('minors')} /></label>
      <label className="wide">What are you currently doing?<textarea required value={signup.situation} onChange={updateSignup('situation')} placeholder="Where you study or work, or your current situation" /></label>
      <label className="wide">Account type<select value={signup.kind} onChange={updateSignup('kind')}><option value="student">Student</option><option value="mentor">Request mentor access</option></select></label>
      <p className="wide">Mentor requests remain pending until approved. A work email alone does not grant mentor access.</p>
      <button disabled={busy}>Create account</button>
    </form></section>}

    {authMode === 'signin' && <section><h1>Sign in</h1><form className="form-grid" onSubmit={signIn}>
      <label>Email<input type="email" required value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label>
      <label>Password<input type="password" required value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>
      <button disabled={busy}>Sign in</button><button type="button" disabled={busy} onClick={microsoftSignIn}>Continue with Microsoft</button>
    </form></section>}

    {!authMode && <>
      {page === 'Home' && <section><h1>Welcome to Banquet</h1><p>Explore technology courses and events, and keep your learning activity with your account.</p>{session ? <><p>Signed in as {session.user.email}. Account type: <strong>{accountType}</strong>.</p>{mentorPending && <p>Your mentor access request is awaiting approval.</p>}{accountType === 'student' && !mentorPending && <button disabled={busy} onClick={requestMentor}>Request mentor access</button>}<h2>Your course progress</h2>{enrollments.length ? <ul className="records">{enrollments.map((item) => <li key={item.id}><strong>{item.courses?.title || 'Course'}</strong><label>Progress: {Number(item.progress)}%<input type="range" min="0" max="100" step="5" value={item.progress} disabled={busy} onChange={(e) => updateProgress(item.id, e.target.value)} /></label></li>)}</ul> : <p>You have not joined any courses yet.</p>}<h2>Your event bookings</h2>{bookings.length ? <ul>{bookings.map((item) => <li key={item.id}>{item.events?.title || 'Event'}{item.events?.starts_at ? ` · ${new Date(item.events.starts_at).toLocaleString()}` : ''}</li>)}</ul> : <p>You have not booked any events yet.</p>}</> : <p>Sign in or create an account to join courses and book events.</p>}</section>}

      {page === 'Courses' && <section><h1>Courses</h1>{courses.length ? <ul className="records">{courses.map((item) => <li key={item.id}><h2>{item.title}</h2><p>{item.description}</p>{item.technology_field && <p>Field: {item.technology_field}</p>}{session && <button disabled={busy} onClick={() => joinCourse(item.id)}>Join course</button>}</li>)}</ul> : <p>No published courses yet.</p>}{accountType === 'mentor' && <form className="form-grid creator" onSubmit={publishCourse}><h2 className="wide">Publish a course</h2><label>Title<input required value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} /></label><label>Technology field<input value={course.technology_field} onChange={(e) => setCourse({ ...course, technology_field: e.target.value })} /></label><label className="wide">Description<textarea value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })} /></label><button disabled={busy}>Publish course</button></form>}</section>}

      {page === 'Events' && <section><h1>Events</h1>{events.length ? <ul className="records">{events.map((item) => <li key={item.id}><h2>{item.title}</h2><p>{item.description}</p><p>{new Date(item.starts_at).toLocaleString()}</p>{session && <button disabled={busy} onClick={() => bookEvent(item.id)}>Book place</button>}</li>)}</ul> : <p>No published events yet.</p>}{accountType === 'mentor' && <form className="form-grid creator" onSubmit={publishEvent}><h2 className="wide">Publish an event</h2><label>Title<input required value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} /></label><label>Starts at<input type="datetime-local" required value={event.starts_at} onChange={(e) => setEvent({ ...event, starts_at: e.target.value })} /></label><label>Capacity (optional)<input type="number" min="1" value={event.capacity} onChange={(e) => setEvent({ ...event, capacity: e.target.value })} /></label><label className="wide">Description<textarea value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} /></label><button disabled={busy}>Publish event</button></form>}</section>}

      {page === 'Settings' && <section><h1>Settings</h1>{session && profile ? <form className="form-grid" onSubmit={saveProfile}><label>First name<input name="first_name" defaultValue={profile.first_name} /></label><label>Surname<input name="surname" defaultValue={profile.surname} /></label><label>Main technology field<input name="primary_field" defaultValue={profile.primary_field} /></label><label>Minor areas<input name="minor_fields" defaultValue={(profile.minor_fields || []).join(', ')} /></label><label className="wide">Current situation<textarea name="current_situation" defaultValue={profile.current_situation} /></label><p className="wide">Account type: {accountType}{mentorPending ? ' · mentor request pending' : ''}</p><button disabled={busy}>Save profile</button></form> : <p>Sign in to manage profile settings.</p>}</section>}

      {page === 'Support' && <section><h1>Support</h1><p>For help with Banquet, contact your Banquet administrator.</p><p>Account, course, and event access is controlled by the signed-in account.</p></section>}
    </>}
  </main>
}
