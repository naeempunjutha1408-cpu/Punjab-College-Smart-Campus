
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  program: '',
  part: '',
  date: new Date().toISOString().split('T')[0],
  status: 'Pending',
}

function Admissions() {
  const [admissions, setAdmissions] = useState([])
  const [classes, setClasses] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const isAdmin = role === 'admin'

  useEffect(() => {
    initializeAdmissions()
  }, [])

  async function initializeAdmissions() {
    setLoading(true)
    setError('')

    const { data: { user }, error: userError } =
      await supabase.auth.getUser()

    if (userError || !user) {
      setError(userError?.message || 'Unable to identify logged-in user.')
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

    if (profile.role !== 'admin') {
      setError('You do not have permission to access admissions.')
      setLoading(false)
      return
    }

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, program, part, class_name')
      .order('program')
      .order('part')

    if (classError) {
      setError(classError.message)
      setLoading(false)
      return
    }

    setClasses(classData || [])
    await fetchAdmissions(classData || [])
  }

  async function fetchAdmissions(classRows = classes) {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('admissions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      setAdmissions([])
    } else {
      setAdmissions(
        (data || []).map((item) => {
          const selectedClass = classRows.find(
            (cls) => cls.id === item.class_id
          )

          return {
            id: item.id,
            applicationNo: item.application_no,
            name: item.full_name,
            email: item.email,
            phone: item.phone || '',
            program: item.program,
            classId: item.class_id || '',
            className: selectedClass?.class_name || 'Not selected',
            date: item.application_date,
            status: item.status,
          }
        })
      )
    }

    setLoading(false)
  }

  const programs = [...new Set(classes.map((cls) => cls.program))]

  const availableParts = classes.filter(
    (cls) => cls.program === form.program
  )

  const selectedClass = classes.find(
    (cls) =>
      cls.program === form.program &&
      String(cls.part) === String(form.part)
  )

  const filteredAdmissions = admissions.filter((item) => {
    const matchesSearch =
      `${item.name} ${item.applicationNo} ${item.email} ${item.program} ${item.className}`
        .toLowerCase()
        .includes(search.toLowerCase())

    const matchesStatus =
      statusFilter === 'All' || item.status === statusFilter

    return matchesSearch && matchesStatus
  })

  function handleChange(e) {
    const { name, value } = e.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === 'program' ? { part: '' } : {}),
    }))
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!isAdmin) return

    if (!selectedClass) {
      setError('Please select a program and class part.')
      return
    }

    setError('')
    setMessage('')
    setSaving(true)

    const admissionData = {
      full_name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      program: form.program,
      class_id: selectedClass.id,
      application_date: form.date,
      status: form.status,
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('admissions')
          .update(admissionData)
          .eq('id', editingId)

        if (error) throw error

        setMessage('Application updated successfully!')
      } else {
        const { error } = await supabase
          .from('admissions')
          .insert({
            ...admissionData,
            application_no: `ADM-${Date.now()}`,
          })

        if (error) throw error

        setMessage('New application added successfully!')
      }

      resetForm()
      await fetchAdmissions()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(item) {
    if (!isAdmin) return

    const selected = classes.find(
      (cls) => cls.id === item.classId
    )

    setForm({
      name: item.name,
      email: item.email,
      phone: item.phone,
      program: selected?.program || item.program,
      part: selected ? String(selected.part) : '',
      date: item.date,
      status: item.status,
    })

    setEditingId(item.id)
    setShowForm(true)
    setError('')
    setMessage('')
  }

  async function handleDelete(id) {
    if (!isAdmin) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this application?'
    )

    if (!confirmed) return

    setError('')
    setMessage('')

    const { error } = await supabase
      .from('admissions')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage('Application deleted successfully!')
    await fetchAdmissions()
  }

  function statusStyle(status) {
    if (status === 'Approved') return 'bg-green-100 text-green-700'
    if (status === 'Rejected') return 'bg-red-100 text-red-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  return (
    <div className="space-y-6">

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Admissions Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage student applications and class admissions.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setForm(emptyForm)
              setEditingId(null)
              setShowForm(true)
              setError('')
              setMessage('')
            }}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + New Application
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
          Loading applications...
        </div>
      ) : isAdmin ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Total Applications</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-800">
                {admissions.length}
              </h2>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Pending Applications</p>
              <h2 className="mt-2 text-2xl font-bold text-yellow-600">
                {admissions.filter((a) => a.status === 'Pending').length}
              </h2>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Approved Applications</p>
              <h2 className="mt-2 text-2xl font-bold text-green-600">
                {admissions.filter((a) => a.status === 'Approved').length}
              </h2>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row">
            <input
              type="text"
              placeholder="Search name, application ID, email or program..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Applicant</th>
                  <th className="px-5 py-4">Application ID</th>
                  <th className="px-5 py-4">Program</th>
                  <th className="px-5 py-4">Class</th>
                  <th className="px-5 py-4">Apply Date</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredAdmissions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-500">{item.email}</p>
                      <p className="text-xs text-slate-500">{item.phone}</p>
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {item.applicationNo}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {item.program}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {item.className}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {item.date}
                    </td>

                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(item.status)}`}>
                        {item.status}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleEdit(item)}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDelete(item.id)}
                          className="font-medium text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredAdmissions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                      No applications found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          You do not have permission to access admissions.
        </div>
      )}

      {showForm && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-5 text-xl font-bold text-slate-800">
              {editingId ? 'Edit Application' : 'New Admission Application'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Applicant Name"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />

              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Email Address"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />

              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="Phone Number"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Select Program
                </label>
                <select
                  name="program"
                  value={form.program}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
                >
                  <option value="">Select Program</option>
                  {programs.map((program) => (
                    <option key={program} value={program}>
                      {program}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Select Part
                </label>
                <select
                  name="part"
                  value={form.part}
                  onChange={handleChange}
                  required
                  disabled={!form.program}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm disabled:bg-slate-100"
                >
                  <option value="">Select Part</option>
                  {availableParts.map((cls) => (
                    <option key={cls.id} value={cls.part}>
                      Part {cls.part} ({cls.part === 1 ? '1st Year' : '2nd Year'})
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />

              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              >
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>

              {form.status === 'Approved' && (
                <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                  Approving this application will automatically register the student in the selected class.
                </p>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving || !selectedClass}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingId
                      ? 'Update Application'
                      : 'Save Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

export default Admissions
