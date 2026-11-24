
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const emptyForm = {
  title: '',
  category: 'General',
  date: new Date().toLocaleDateString('en-CA'),
  description: '',
}

function Notices() {
  const [notices, setNotices] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadNotices()
  }, [])

  async function loadNotices() {
    setLoading(true)
    setError('')

    const { data: { user }, error: authError } =
      await supabase.auth.getUser()

    if (authError || !user) {
      setError('Unable to identify logged-in user.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    setRole(profile.role)

    const { data, error: noticesError } = await supabase
      .from('notices')
      .select('*')
      .order('publish_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (noticesError) {
      setError(noticesError.message)
    } else {
      setNotices(
        (data || []).map((notice) => ({
          ...notice,
          date: notice.publish_date,
        }))
      )
    }

    setLoading(false)
  }

  const canManage = role === 'admin'

  const filteredNotices = notices.filter((notice) => {
    const matchesSearch =
      `${notice.title} ${notice.description}`
        .toLowerCase()
        .includes(search.toLowerCase())

    const matchesCategory =
      filter === 'All' || notice.category === filter

    return matchesSearch && matchesCategory
  })

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!canManage) return

    setSaving(true)
    setError('')
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const payload = {
      title: form.title.trim(),
      category: form.category,
      publish_date: form.date,
      description: form.description.trim(),
      created_by: user.id,
    }

    let result

    if (editingId) {
      result = await supabase
        .from('notices')
        .update(payload)
        .eq('id', editingId)
    } else {
      result = await supabase
        .from('notices')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setMessage(
      editingId
        ? 'Notice updated successfully!'
        : 'Notice published successfully!'
    )

    resetForm()
    await loadNotices()
    setSaving(false)
  }

  function handleEdit(notice) {
    setForm({
      title: notice.title,
      category: notice.category,
      date: notice.date,
      description: notice.description,
    })

    setEditingId(notice.id)
    setShowForm(true)
    setError('')
    setMessage('')

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (!canManage) return

    if (!window.confirm('Are you sure you want to delete this notice?')) {
      return
    }

    setError('')
    setMessage('')

    const { error: deleteError } = await supabase
      .from('notices')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setMessage('Notice deleted successfully!')
    await loadNotices()
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading notices...
      </div>
    )
  }

  return (
    <div className="space-y-6 p-5 sm:p-8">

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Notices & Announcements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Publish and manage college announcements.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => {
              if (showForm) {
                resetForm()
              } else {
                setForm(emptyForm)
                setEditingId(null)
                setShowForm(true)
                setError('')
                setMessage('')
              }
            }}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            {showForm ? 'Close Form' : '+ Add Notice'}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Notices', value: notices.length },
          {
            label: 'General',
            value: notices.filter(n => n.category === 'General').length,
          },
          {
            label: 'Exams',
            value: notices.filter(n => n.category === 'Exam').length,
          },
          {
            label: 'Events',
            value: notices.filter(n => n.category === 'Event').length,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{item.label}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-800">
              {item.value}
            </h2>
          </div>
        ))}
      </div>

      {canManage && showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-bold text-slate-800">
            {editingId ? 'Edit Notice' : 'Create New Notice'}
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Notice Title
              </label>
              <input
                required
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
                placeholder="Enter notice title"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:border-blue-500"
              >
                <option>General</option>
                <option>Exam</option>
                <option>Event</option>
                <option>Holiday</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Publish Date
              </label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) =>
                  setForm({ ...form, date: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              required
              rows="4"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Write notice details..."
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : editingId
                  ? 'Update Notice'
                  : 'Publish Notice'}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notices..."
          className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-blue-500"
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none"
        >
          <option>All</option>
          <option>General</option>
          <option>Exam</option>
          <option>Event</option>
          <option>Holiday</option>
        </select>
      </div>

      <div className="space-y-4">
        {filteredNotices.length > 0 ? (
          filteredNotices.map((notice) => (
            <div
              key={notice.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      {notice.category}
                    </span>
                    <span className="text-xs text-slate-500">
                      {notice.date}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-800">
                    {notice.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {notice.description}
                  </p>
                </div>

                {canManage && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(notice)}
                      className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => handleDelete(notice.id)}
                      className="rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            No notices found.
          </div>
        )}
      </div>

    </div>
  )
}

export default Notices
