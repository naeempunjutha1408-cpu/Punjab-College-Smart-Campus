
import { useEffect, useState } from 'react'

import Classes from './pages/Classes'
import Teachers from './pages/Teachers'
import Admissions from './pages/Admissions'
import Attendance from './pages/Attendance'
import Examinations from './pages/Examinations'
import Results from './pages/Results'
import Fees from './pages/Fees'
import Timetable from './pages/Timetable'
import StudyMaterials from './pages/StudyMaterials'
import Notices from './pages/Notices'
import Auth from './pages/Auth'

import { supabase } from './supabaseClient'

const menuItems = [
  { name: 'Dashboard', icon: '▦', roles: ['admin', 'teacher', 'student'] },
  { name: 'Classes', icon: '▤', roles: ['admin', 'teacher', 'student'] },
  { name: 'Teachers', icon: '♟', roles: ['admin'] },
  { name: 'Admissions', icon: '＋', roles: ['admin'] },
  { name: 'Attendance', icon: '✓', roles: ['admin', 'teacher', 'student'] },
  { name: 'Examinations', icon: '▤', roles: ['admin', 'teacher', 'student'] },
  { name: 'Results', icon: '▧', roles: ['admin', 'teacher', 'student'] },
  { name: 'Fee Management', icon: '＄', roles: ['admin', 'student'] },
  { name: 'Timetable', icon: '◷', roles: ['admin', 'teacher', 'student'] },
  { name: 'Study Materials', icon: '▣', roles: ['admin', 'teacher', 'student'] },
  { name: 'Notices', icon: '♧', roles: ['admin', 'teacher', 'student'] },
]

const formatNumber = (value) =>
  Number(value || 0).toLocaleString('en-PK')

const formatCurrency = (value) =>
  `Rs. ${Number(value || 0).toLocaleString('en-PK', {
    maximumFractionDigits: 2,
  })}`

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Password Recovery
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')

  const [activePage, setActivePage] = useState('Dashboard')

  const [dashboardData, setDashboardData] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')

  const allowedMenuItems = menuItems.filter((item) =>
    item.roles.includes(profile?.role)
  )

  // Authentication
  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) return

      if (error) {
        console.error('Session error:', error.message)
      }

      setSession(data?.session ?? null)
      setAuthLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }

      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false)
      }

      setSession(newSession)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Secure Profile and Role Verification
  useEffect(() => {
    let ignore = false

    const loadProfile = async () => {
      setProfile(null)
      setProfileError('')
      setDashboardData(null)

      if (!session?.user?.id) {
        setProfileLoading(false)
        return
      }

      setProfileLoading(true)

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, role, email')
          .eq('id', session.user.id)
          .maybeSingle()

        if (error) {
          throw new Error('Unable to verify your account profile.')
        }

        if (!data) {
          throw new Error(
            'Your account profile was not found. Please contact the Admin.'
          )
        }

        if (!['admin', 'teacher', 'student'].includes(data.role)) {
          throw new Error(
            'Your account has an invalid role. Please contact the Admin.'
          )
        }

        const roleFunctions = {
          admin: 'is_admin',
          teacher: 'is_teacher',
          student: 'is_student',
        }

        const { data: roleAllowed, error: roleError } =
          await supabase.rpc(roleFunctions[data.role])

        if (roleError) {
          throw new Error(
            'Account verification failed. Please try again or contact the Admin.'
          )
        }

        if (roleAllowed !== true) {
          if (data.role === 'teacher') {
            throw new Error(
              'Your Teacher account is inactive or not properly linked. Contact the Admin.'
            )
          }

          if (data.role === 'student') {
            throw new Error(
              'Your Student account is inactive or not properly linked. Contact the Admin.'
            )
          }

          throw new Error(
            'You are not authorized to access the Admin dashboard.'
          )
        }

        if (!ignore) {
          setProfile(data)
          setProfileError('')
        }
      } catch (error) {
        console.error('Profile verification error:', error.message)

        if (!ignore) {
          setProfile(null)
          setProfileError(error.message)
        }
      } finally {
        if (!ignore) {
          setProfileLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      ignore = true
    }
  }, [session])

  // Prevent access to pages outside the user's role
  useEffect(() => {
    if (!profile) return

    const pageAllowed = menuItems.some(
      (item) =>
        item.name === activePage &&
        item.roles.includes(profile.role)
    )

    if (!pageAllowed) {
      setActivePage('Dashboard')
    }
  }, [profile, activePage])

  // Admin Dashboard Data
  useEffect(() => {
    let ignore = false

    const loadDashboard = async () => {
      if (
        !session?.user?.id ||
        profile?.role !== 'admin' ||
        activePage !== 'Dashboard'
      ) {
        setDashboardLoading(false)
        return
      }

      setDashboardLoading(true)
      setDashboardError('')

      const { data, error } = await supabase.rpc(
        'get_admin_dashboard_stats'
      )

      if (ignore) return

      if (error) {
        console.error('Dashboard error:', error.message)
        setDashboardError(error.message)
        setDashboardLoading(false)
        return
      }

      setDashboardData(data)
      setDashboardLoading(false)
    }

    loadDashboard()

    return () => {
      ignore = true
    }
  }, [session, profile, activePage])

  // Logout
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Logout error:', error.message)
      setProfileError('Logout failed. Please try again.')
    }
  }

  // Initial Authentication Loading
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-lg font-medium text-slate-600">
          Loading...
        </p>
      </div>
    )
  }

  // Password Recovery Screen
  if (isPasswordRecovery) {
    return <Auth mode="recovery" />
  }

  // Show Login / Signup
  if (!session) {
    return <Auth />
  }

  // Profile Verification Loading
  if (profileLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>

        <p className="font-medium text-slate-600">
          Verifying your account...
        </p>
      </div>
    )
  }

  // Block Unauthorized Accounts
  if (!profile || profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-slate-900">
            Access Restricted
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            {profileError ||
              'Your account could not be verified. Please contact the Admin.'}
          </p>

          <button
            onClick={handleLogout}
            className="mt-7 w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Logout
          </button>

          <p className="mt-5 text-xs text-slate-400">
            Punjab College Smart Campus Management System
          </p>
        </div>
      </div>
    )
  }

  // Dashboard Statistics
  const totalStudents = Number(dashboardData?.total_students || 0)
  const totalTeachers = Number(dashboardData?.total_teachers || 0)
  const totalClasses = Number(dashboardData?.total_classes || 0)
  const totalFee = Number(dashboardData?.total_fee || 0)
  const paidFee = Number(dashboardData?.paid_fee || 0)
  const remainingFee = Math.max(totalFee - paidFee, 0)

  const collectionPercentage =
    totalFee > 0
      ? Math.min((paidFee / totalFee) * 100, 100)
      : 0

  const chartData = dashboardData?.monthly_enrollment || []
  const recentStudents = dashboardData?.recent_students || []

  const maximumEnrollment = Math.max(
    ...chartData.map((item) => Number(item.value || 0)),
    1
  )

  const stats = [
    {
      title: 'Total Students',
      value: formatNumber(totalStudents),
      icon: '♙',
      color: 'bg-blue-50 text-blue-700',
    },
    {
      title: 'Total Teachers',
      value: formatNumber(totalTeachers),
      icon: '♟',
      color: 'bg-purple-50 text-purple-700',
    },
    {
      title: 'Total Classes',
      value: formatNumber(totalClasses),
      icon: '▤',
      color: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'Fee Collection',
      value: formatCurrency(paidFee),
      icon: '＄',
      color: 'bg-emerald-50 text-emerald-700',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-64 flex-col overflow-hidden bg-slate-950 text-white lg:flex">

        {/* College Logo */}
        <div className="flex h-24 items-center justify-center gap-3 border-b border-white/10 px-5">
          <img
            src="/college-logo.png"
            alt="Punjab College Logo"
            className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1"
          />

          <div>
            <h1 className="text-sm font-bold tracking-wide text-white">
              PUNJAB COLLEGE
            </h1>
            <p className="text-xs text-slate-400">
              Smart Campus System
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Main Menu
          </p>

          <nav className="space-y-1">
            {allowedMenuItems.map((item) => (
              <button
                key={item.name}
                onClick={() => setActivePage(item.name)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                  activePage === item.name
                    ? 'bg-blue-600 font-semibold text-white shadow-lg shadow-blue-900/30'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="w-6 text-center text-lg">
                  {item.icon}
                </span>
                {item.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto shrink-0 border-t border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold">
              {(profile.full_name || session.user.email || 'U')
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('')}
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {profile.full_name || session.user.email || 'User'}
              </p>

              <p className="text-xs capitalize text-slate-400">
                {profile.role}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="mt-5 w-full rounded-lg border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content with Campus Background */}
      <main
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat lg:ml-64"
        style={{
          backgroundImage:
            "linear-gradient(rgba(248,250,252,0.30), rgba(248,250,252,0.35)), url('/dashboard-background.png')",
        }}
      >

        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur-md sm:px-8">

          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {activePage}
            </h2>

            <p className="hidden text-xs text-slate-500 sm:block">
              Punjab College / {activePage}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setActivePage('Notices')}
              className="relative rounded-full bg-slate-100 p-3 text-slate-600 hover:bg-slate-200"
              title="View Notices"
            >
              ♧
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"></span>
            </button>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">
                {profile.full_name || session.user.email}
              </p>

              <p className="text-xs capitalize text-slate-500">
                {profile.role}
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
              {(profile.full_name || session.user.email || 'U')
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('')}
            </div>
          </div>
        </header>

        {/* Page Content */}
        {activePage === 'Classes' ? (
          <Classes />
        ) : activePage === 'Teachers' ? (
          <Teachers />
        ) : activePage === 'Admissions' ? (
          <Admissions />
        ) : activePage === 'Attendance' ? (
          <Attendance />
        ) : activePage === 'Examinations' ? (
          <Examinations />
        ) : activePage === 'Results' ? (
          <Results />
        ) : activePage === 'Fee Management' ? (
          <Fees />
        ) : activePage === 'Timetable' ? (
          <Timetable />
        ) : activePage === 'Study Materials' ? (
          <StudyMaterials />
        ) : activePage === 'Notices' ? (
          <Notices />
        ) : profile.role !== 'admin' ? (

          /* Teacher and Student Dashboard */
          <div className="space-y-7 p-5 sm:p-8">
            <section className="rounded-2xl border border-slate-100 bg-white/95 p-7 shadow-sm backdrop-blur-sm">
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome back, {profile.full_name || profile.role}!
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Welcome to your {profile.role} portal at Punjab College.
              </p>

              <div className="mt-6 inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold capitalize text-blue-700">
                {profile.role} Account
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-lg font-bold text-slate-900">
                Available Modules
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {allowedMenuItems
                  .filter((item) => item.name !== 'Dashboard')
                  .map((item) => (
                    <button
                      key={item.name}
                      onClick={() => setActivePage(item.name)}
                      className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white/95 p-5 text-left shadow-sm backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-md"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl text-blue-700">
                        {item.icon}
                      </span>

                      <span className="font-semibold text-slate-800">
                        {item.name}
                      </span>
                    </button>
                  ))}
              </div>
            </section>

            <footer className="pb-3 text-center text-xs text-slate-500">
              © 2026 Punjab College Smart Campus Management System.
              All rights reserved.
            </footer>
          </div>

        ) : (

          /* Admin Dashboard */
          <div className="space-y-7 p-5 sm:p-8">

            {/* Welcome */}
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Welcome back, {profile.full_name || 'Admin'}!
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Here's what's happening at your college today.
                </p>
              </div>

              <button
                onClick={() => setActivePage('Classes')}
                className="w-fit rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700"
              >
                View Classes
              </button>
            </section>

            {/* Dashboard Error */}
            {dashboardError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Dashboard data could not be loaded: {dashboardError}

                <button
                  onClick={() => setActivePage('Classes')}
                  className="ml-2 font-semibold underline"
                >
                  Open Classes
                </button>
              </div>
            )}

            {/* Statistics */}
            <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.title}
                  className="rounded-xl border border-slate-100 bg-white/95 p-5 shadow-sm backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">
                      {stat.title}
                    </p>

                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${stat.color}`}>
                      {stat.icon}
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="break-words text-2xl font-bold text-slate-900">
                      {dashboardLoading ? '...' : stat.value}
                    </h3>
                  </div>

                  <p className="mt-2 text-xs text-slate-400">
                    Live database data
                  </p>
                </div>
              ))}
            </section>

            {/* Enrollment and Fee Collection */}
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">

              {/* Enrollment Chart */}
              <div className="rounded-xl border border-slate-100 bg-white/95 p-6 shadow-sm backdrop-blur-sm xl:col-span-2">

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Student Enrollment
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Monthly new student registrations — last 12 months
                    </p>
                  </div>

                  <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                    Live Data
                  </span>
                </div>

                {dashboardLoading ? (
                  <p className="py-20 text-center text-sm text-slate-400">
                    Loading enrollment data...
                  </p>
                ) : chartData.length > 0 ? (
                  <div className="mt-8 flex h-56 items-end justify-between gap-2 border-b border-slate-200 px-1">
                    {chartData.map((item, index) => {
                      const value = Number(item.value || 0)

                      const height =
                        value > 0
                          ? Math.max((value / maximumEnrollment) * 100, 5)
                          : 0

                      return (
                        <div
                          key={`${item.month}-${index}`}
                          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                        >
                          <span className="text-[10px] font-semibold text-slate-500">
                            {value}
                          </span>

                          <div
                            className="w-full max-w-8 rounded-t-md bg-blue-500 transition hover:bg-blue-700"
                            style={{ height: `${height}%` }}
                            title={`${item.month}: ${value} students`}
                          ></div>

                          <span className="text-[10px] text-slate-400">
                            {item.month}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="py-20 text-center text-sm text-slate-400">
                    No enrollment records available yet.
                  </p>
                )}
              </div>

              {/* Fee Collection */}
              <div className="rounded-xl border border-slate-100 bg-white/95 p-6 shadow-sm backdrop-blur-sm">

                <h3 className="font-bold text-slate-900">
                  Fee Collection
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  Total recorded fees
                </p>

                {dashboardLoading ? (
                  <p className="py-16 text-center text-sm text-slate-400">
                    Loading fee data...
                  </p>
                ) : (
                  <>
                    <div className="my-8 flex justify-center">
                      <div
                        className="flex h-36 w-36 items-center justify-center rounded-full shadow-inner"
                        style={{
                          background: `conic-gradient(#10b981 ${collectionPercentage}%, #e2e8f0 ${collectionPercentage}% 100%)`,
                        }}
                      >
                        <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
                          <p className="text-2xl font-bold text-slate-900">
                            {collectionPercentage.toFixed(1)}%
                          </p>

                          <p className="text-xs text-slate-400">
                            Collected
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 text-slate-500">
                          <span className="h-3 w-3 rounded-full bg-emerald-500"></span>
                          Collected
                        </span>

                        <span className="text-right font-semibold">
                          {formatCurrency(paidFee)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 text-slate-500">
                          <span className="h-3 w-3 rounded-full bg-slate-200"></span>
                          Remaining
                        </span>

                        <span className="text-right font-semibold">
                          {formatCurrency(remainingFee)}
                        </span>
                      </div>

                      <div className="border-t border-slate-100 pt-3">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-slate-500">
                            Total Fees
                          </span>

                          <span className="font-bold text-slate-900">
                            {formatCurrency(totalFee)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Recent Students */}
            <section className="overflow-hidden rounded-xl border border-slate-100 bg-white/95 shadow-sm backdrop-blur-sm">

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Recent Students
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Latest student records from the database
                  </p>
                </div>

                <button
                  onClick={() => setActivePage('Classes')}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                >
                  View Classes
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">
                        Student Name
                      </th>

                      <th className="px-6 py-4 font-semibold">
                        Student ID
                      </th>

                      <th className="px-6 py-4 font-semibold">
                        Class / Program
                      </th>

                      <th className="px-6 py-4 font-semibold">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {dashboardLoading ? (
                      <tr>
                        <td
                          colSpan="4"
                          className="px-6 py-10 text-center text-slate-400"
                        >
                          Loading student records...
                        </td>
                      </tr>
                    ) : recentStudents.length > 0 ? (
                      recentStudents.map((student) => (
                        <tr
                          key={student.id}
                          className="hover:bg-slate-50"
                        >
                          <td className="px-6 py-4 font-semibold text-slate-800">
                            {student.name}
                          </td>

                          <td className="px-6 py-4 text-slate-500">
                            {student.admissionNo}
                          </td>

                          <td className="px-6 py-4 text-slate-500">
                            {student.program || 'Not assigned'}
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                student.status === 'Active'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : student.status === 'Pending'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {student.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="4"
                          className="px-6 py-10 text-center text-slate-400"
                        >
                          No student records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="pb-3 text-center text-xs text-slate-500">
              © 2026 Punjab College Smart Campus Management System.
              All rights reserved.
            </footer>

          </div>
        )}
      </main>
    </div>
  )
}

export default App
