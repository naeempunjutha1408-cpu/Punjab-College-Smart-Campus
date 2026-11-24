
import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Auth({ mode = 'login' }) {
  const [isLogin, setIsLogin] = useState(true)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [recoveryComplete, setRecoveryComplete] = useState(false)

  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })

  const clearMessages = () => {
    setError('')
    setMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    const email = form.email.trim().toLowerCase()

    try {
      // Password Recovery: Set New Password
      if (mode === 'recovery') {
        if (form.password.length < 6) {
          throw new Error('Password must be at least 6 characters long.')
        }

        if (form.password !== form.confirmPassword) {
          throw new Error('Passwords do not match.')
        }

        const { error } = await supabase.auth.updateUser({
          password: form.password,
        })

        if (error) throw error

        setRecoveryComplete(true)
        setMessage('Your password has been updated successfully.')
        return
      }

      // Forgot Password: Send Reset Email
      if (isForgotPassword) {
        if (!email) {
          throw new Error('Please enter your registered email address.')
        }

        const { error } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: window.location.origin,
          }
        )

        if (error) throw error

        setMessage(
          'If an account exists with this email, a password reset link has been sent. Please check your inbox.'
        )
        return
      }

      // Normal Login
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        })

        if (error) throw error

        setMessage('Login successful! Opening your dashboard...')
      }

      // Signup
      else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: form.password,
        })

        if (error) throw error

        if (data.session) {
          setMessage(
            'Account created successfully! You can now access your college portal.'
          )
        } else {
          setMessage(
            'Account request submitted. Please check your Supabase email confirmation settings.'
          )
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Return to Login after Password Update
  const handleBackToLogin = async () => {
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signOut()

    if (error) {
      setError(
        'Password updated, but logout failed. Please try again.'
      )
      setLoading(false)
      return
    }

    setLoading(false)
  }

  const isRecovery = mode === 'recovery'

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat px-4 py-10"
      style={{
        backgroundImage: "url('/dashboard-background.png')",
      }}
    >
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-slate-950/45"></div>

      {/* Authentication Card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/40 bg-white/95 p-8 shadow-2xl backdrop-blur-md">

        {/* College Branding */}
        <div className="mb-7 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-white p-2 shadow-md ring-1 ring-slate-100">
            <img
              src="/college-logo.png"
              alt="Punjab College Logo"
              className="h-full w-full object-contain"
            />
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-800">
            Punjab College
          </h1>

          <p className="mt-1 text-sm font-medium text-slate-500">
            Smart Campus Management System
          </p>
        </div>

        {/* Password Updated Successfully */}
        {isRecovery && recoveryComplete ? (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
              ✓
            </div>

            <h2 className="mt-5 text-xl font-bold text-slate-800">
              Password Updated!
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Your password has been changed successfully.
              You can now log in using your new password.
            </p>

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleBackToLogin}
              disabled={loading}
              className="mt-7 w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Please wait...' : 'Back to Login'}
            </button>
          </div>
        ) : (
          <>
            {/* Login / Signup Tabs */}
            {!isRecovery && !isForgotPassword && (
              <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(true)
                    clearMessages()
                  }}
                  className={`rounded-md py-2 text-sm font-semibold ${
                    isLogin
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-slate-500'
                  }`}
                >
                  Login
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(false)
                    clearMessages()
                  }}
                  className={`rounded-md py-2 text-sm font-semibold ${
                    !isLogin
                      ? 'bg-white text-blue-600 shadow'
                      : 'text-slate-500'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Heading */}
            <h2 className="mb-1 text-xl font-bold text-slate-800">
              {isRecovery
                ? 'Create New Password'
                : isForgotPassword
                  ? 'Forgot Password?'
                  : isLogin
                    ? 'Welcome Back!'
                    : 'Create Your Account'}
            </h2>

            <p className="mb-6 text-sm text-slate-500">
              {isRecovery
                ? 'Enter and confirm your new password below.'
                : isForgotPassword
                  ? 'Enter your registered email address to receive a password reset link.'
                  : isLogin
                    ? 'Login to access your college portal.'
                    : 'Only Admin-enrolled Teachers and Students can create an account.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email */}
              {!isRecovery && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Email Address
                  </label>

                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="Enter your enrolled email"
                    autoComplete="email"
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}

              {/* New Password / Login Password */}
              {!isForgotPassword && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {isRecovery ? 'New Password' : 'Password'}
                  </label>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                      placeholder={
                        isRecovery
                          ? 'Enter your new password'
                          : 'Enter your password'
                      }
                      autoComplete={
                        isLogin && !isRecovery
                          ? 'current-password'
                          : 'new-password'
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-20 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-600"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm New Password */}
              {isRecovery && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Confirm New Password
                  </label>

                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={form.confirmPassword}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          confirmPassword: e.target.value,
                        })
                      }
                      placeholder="Re-enter your new password"
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-20 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-600"
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              )}

              {/* Forgot Password Link */}
              {!isRecovery && isLogin && !isForgotPassword && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true)
                      clearMessages()
                    }}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              {/* Success Message */}
              {message && (
                <p className="rounded-lg bg-green-50 p-3 text-sm leading-6 text-green-700">
                  {message}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? 'Please wait...'
                  : isRecovery
                    ? 'Update Password'
                    : isForgotPassword
                      ? 'Send Reset Link'
                      : isLogin
                        ? 'Login'
                        : 'Create Account'}
              </button>
            </form>

            {/* Back to Login */}
            {(isForgotPassword || isRecovery) && (
              <button
                type="button"
                onClick={() => {
                  if (isForgotPassword) {
                    setIsForgotPassword(false)
                    clearMessages()
                  }
                }}
                className="mt-5 w-full text-center text-sm font-semibold text-blue-600 hover:text-blue-800"
              >
                {isForgotPassword ? '← Back to Login' : ''}
              </button>
            )}

            {/* Footer */}
            {!isForgotPassword && !isRecovery && (
              <p className="mt-5 text-center text-xs text-slate-500">
                {isLogin
                  ? 'Admin, Teacher and Student Login'
                  : 'Your account role will be assigned automatically.'}
              </p>
            )}

            <p className="mt-3 text-center text-xs text-slate-400">
              Punjab College Smart Campus Management System
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default Auth
