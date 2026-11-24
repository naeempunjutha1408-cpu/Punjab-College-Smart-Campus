
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  program: '',
  status: 'Active',
}

function Students() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [role, setRole] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const isAdmin = role === 'admin'

  async function fetchStudents() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      setStudents([])
    } else {
      setStudents(
        data.map((student) => ({
          id: student.admission_no,
          name: student.full_name,
          email: student.email || '',
          phone: student.phone || '',
          program: student.department || '',
          status: student.status,
        }))
      )
    }

    setLoading(false)
  }

  useEffect(() => {
    async function loadUserRole() {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        setError('Unable to identify logged-in user.')
        return
      }

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError) {
        setError('Unable to load user permissions.')
        return
      }

      setRole(data.role)
    }

    loadUserRole()
    fetchStudents()
  }, [])

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.name.toLowerCase().includes(search.toLowerCase()) ||
      student.id.toLowerCase().includes(search.toLowerCase()) ||
      student.email.toLowerCase().includes(search.toLowerCase())

    const matchesFilter =
      filter === 'All' || student.status === filter

    return matchesSearch && matchesFilter
  })

  function openAddForm() {
    if (!isAdmin) return

    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function openEditForm(student) {
    if (!isAdmin) return

    setForm({
      name: student.name,
      email: student.email,
      phone: student.phone,
      program: student.program,
      status: student.status,
    })

    setEditingId(student.id)
    setShowForm(true)
  }

  function handleChange(event) {
    const { name, value } = event.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!isAdmin) return

    setError('')

    const studentData = {
      full_name: form.name,
      email: form.email,
      phone: form.phone,
      department: form.program,
      status: form.status,
    }

    let result

    if (editingId) {
      result = await supabase
        .from('students')
        .update(studentData)
        .eq('admission_no', editingId)
    } else {
      result = await supabase
        .from('students')
        .insert([{
          ...studentData,
          admission_no: `STU-${Date.now()}`,
        }])
    }

    if (result.error) {
      setError(result.error.message)
      return
    }

    await fetchStudents()

    setShowForm(false)
    setForm(emptyForm)
    setEditingId(null)
  }

  async function deleteStudent(id) {
    if (!isAdmin) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this student?'
    )

    if (!confirmed) return

    setError('')

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('admission_no', id)

    if (error) {
      setError(error.message)
      return
    }

    await fetchStudents()
  }

  const activeCount = students.filter(
    (student) => student.status === 'Active'
  ).length

  const pendingCount = students.filter(
    (student) => student.status === 'Pending'
  ).length

  return (
    <div className="space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Student Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage student records, information and enrollment.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={openAddForm}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700"
          >
            + Add New Student
          </button>
        )}
      </div>

      {role === null && !error && (
        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
          Checking user permissions...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
          Loading students from database...
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Students</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">
            {students.length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active Students</p>
          <h2 className="mt-2 text-3xl font-bold text-emerald-600">
            {activeCount}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending Students</p>
          <h2 className="mt-2 text-3xl font-bold text-amber-600">
            {pendingCount}
          </h2>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm sm:flex-row">
        <input
          type="text"
          placeholder="Search by name, ID or email..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
        />

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
        >
          <option value="All">All Students</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold text-slate-900">
            All Students
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Showing {filteredStudents.length} of {students.length} students
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Student</th>
                <th className="px-5 py-4">Student ID</th>
                <th className="px-5 py-4">Phone</th>
                <th className="px-5 py-4">Program</th>
                <th className="px-5 py-4">Status</th>
                {isAdmin && (
                  <th className="px-5 py-4">Actions</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-800">
                      {student.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {student.email}
                    </p>
                  </td>

                  <td className="px-5 py-4 text-slate-500">
                    {student.id}
                  </td>

                  <td className="px-5 py-4 text-slate-500">
                    {student.phone}
                  </td>

                  <td className="px-5 py-4 text-slate-500">
                    {student.program}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        student.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {student.status}
                    </span>
                  </td>

                  {isAdmin && (
                    <td className="px-5 py-4">
                      <div className="flex gap-3">
                        <button
                          onClick={() => openEditForm(student)}
                          className="font-semibold text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteStudent(student.id)}
                          className="font-semibold text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {filteredStudents.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="px-5 py-10 text-center text-slate-400"
                  >
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <div className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">

            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingId ? 'Edit Student' : 'Add New Student'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Enter the student information below.
                </p>
              </div>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg px-3 py-2 text-xl text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Full Name
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="Enter student name"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="student@example.com"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Phone Number
                </label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  required
                  placeholder="03XXXXXXXXX"
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Program / Class
                </label>
                <select
                  name="program"
                  value={form.program}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="">Select Program</option>
                  <option>BS Software Engineering</option>
                  <option>BS Computer Science</option>
                  <option>BS Information Technology</option>
                  <option>Intermediate Part-I</option>
                  <option>Intermediate Part-II</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Status
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {editingId ? 'Update Student' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Students
