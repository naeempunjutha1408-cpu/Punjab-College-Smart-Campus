
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const emptyForm = {
  name: '',
  email: '',
  subject: '',
  phone: '',
  status: 'Active',
}

function Teachers() {
  const [teachers, setTeachers] = useState([])
  const [classes, setClasses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [showAssignments, setShowAssignments] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [role, setRole] = useState('')

  useEffect(() => {
    initializeTeachers()
  }, [])

  async function initializeTeachers() {
    setLoading(true)
    setError('')

    const { data: { user }, error: authError } =
      await supabase.auth.getUser()

    if (authError || !user) {
      setError(authError?.message || 'Please login first.')
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
    await fetchData(profile.role)
  }

  async function fetchData(userRole = role) {
    const { data: teacherData, error: teacherError } = await supabase
      .from('teachers')
      .select('*')
      .order('created_at', { ascending: false })

    if (teacherError) {
      setError(teacherError.message)
      setLoading(false)
      return
    }

    setTeachers(
      (teacherData || []).map((teacher) => ({
        id: teacher.teacher_id,
        name: teacher.full_name,
        email: teacher.email || '',
        subject: teacher.subject || '',
        phone: teacher.phone || '',
        status: teacher.status,
      }))
    )

    if (userRole === 'admin') {
      const [
        { data: classData, error: classError },
        { data: assignmentData, error: assignmentError },
      ] = await Promise.all([
        supabase
          .from('classes')
          .select('id, program, part, class_name')
          .order('program')
          .order('part'),

        supabase
          .from('class_subjects')
          .select('*')
          .order('subject_name'),
      ])

      if (classError || assignmentError) {
        setError(classError?.message || assignmentError?.message)
        setLoading(false)
        return
      }

      setClasses(classData || [])
      setAssignments(assignmentData || [])
    }

    setLoading(false)
  }

  const isAdmin = role === 'admin'

  const filteredTeachers = teachers.filter((teacher) =>
    `${teacher.name} ${teacher.id} ${teacher.email} ${teacher.subject}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!isAdmin) return

    setError('')
    setSaving(true)

    if (editingId) {
      const existingAssignments = assignments.filter(
        (item) => item.teacher_id === editingId
      )

      if (
        existingAssignments.length > 0 &&
        form.subject.trim() !==
          (teachers.find((teacher) => teacher.id === editingId)?.subject || '')
      ) {
        setError(
          'Remove this teacher’s assigned classes before changing their subject.'
        )
        setSaving(false)
        return
      }
    }

    const teacherData = {
      full_name: form.name,
      email: form.email,
      subject: form.subject,
      phone: form.phone,
      status: form.status,
    }

    let result

    if (editingId) {
      result = await supabase
        .from('teachers')
        .update(teacherData)
        .eq('teacher_id', editingId)
    } else {
      result = await supabase
        .from('teachers')
        .insert([{
          ...teacherData,
          teacher_id: `TCH-${Date.now()}`,
        }])
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    await fetchData('admin')

    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
    setSaving(false)
  }

  function handleEdit(teacher) {
    if (!isAdmin) return

    setForm({
      name: teacher.name,
      email: teacher.email,
      subject: teacher.subject,
      phone: teacher.phone,
      status: teacher.status,
    })

    setEditingId(teacher.id)
    setShowForm(true)
    setError('')
  }

  async function handleDelete(id) {
    if (!isAdmin) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this teacher?'
    )

    if (!confirmed) return

    setError('')

    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('teacher_id', id)

    if (error) {
      setError(error.message)
      return
    }

    await fetchData('admin')
  }

  function getTeacherAssignments(teacherId) {
    return assignments.filter(
      (assignment) => assignment.teacher_id === teacherId
    )
  }

  function getClassName(classId) {
    return classes.find((item) => item.id === classId)?.class_name
      || 'Unknown Class'
  }

  function openAssignments(teacher) {
    setSelectedTeacher(teacher)
    setSelectedClassId('')
    setShowAssignments(true)
    setError('')
  }

  async function handleAssignmentSubmit(e) {
    e.preventDefault()

    if (!isAdmin || !selectedTeacher) return

    if (!selectedTeacher.subject.trim()) {
      setError('Please add a subject to this teacher profile first.')
      return
    }

    setError('')
    setSaving(true)

    const { error } = await supabase
      .from('class_subjects')
      .insert([{
        class_id: selectedClassId,
        subject_name: selectedTeacher.subject.trim(),
        teacher_id: selectedTeacher.id,
      }])

    if (error) {
      setError(
        error.code === '23505'
          ? 'This subject is already assigned in this class.'
          : error.message
      )
      setSaving(false)
      return
    }

    await fetchData('admin')
    setSelectedClassId('')
    setSaving(false)
  }

  async function removeAssignment(id) {
    if (!isAdmin) return

    const confirmed = window.confirm(
      'Remove this class from the teacher?'
    )

    if (!confirmed) return

    setError('')

    const { error } = await supabase
      .from('class_subjects')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    await fetchData('admin')
  }

  const activeCount = teachers.filter(
    (teacher) => teacher.status === 'Active'
  ).length

  const inactiveCount = teachers.filter(
    (teacher) => teacher.status === 'Inactive'
  ).length

  return (
    <div className="space-y-6">

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Teachers Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage teachers and their Assign Classes.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setForm(emptyForm)
              setEditingId(null)
              setShowForm(true)
              setError('')
            }}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Add Teacher
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
          Loading teachers from database...
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            {isAdmin ? 'Total Teachers' : 'Your Profile'}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {isAdmin ? teachers.length : (teachers.length ? '1' : '0')}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Active Teachers</p>
          <h2 className="mt-2 text-2xl font-bold text-green-600">
            {activeCount}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Inactive Teachers</p>
          <h2 className="mt-2 text-2xl font-bold text-red-500">
            {inactiveCount}
          </h2>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <input
          type="text"
          placeholder="Search by name, ID, email or subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-4">Teacher</th>
              <th className="px-5 py-4">Teacher ID</th>
              <th className="px-5 py-4">Subject</th>
              <th className="px-5 py-4">Assigned Classes</th>
              <th className="px-5 py-4">Phone</th>
              <th className="px-5 py-4">Status</th>
              {isAdmin && <th className="px-5 py-4">Actions</th>}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredTeachers.map((teacher) => (
              <tr key={teacher.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-800">
                    {teacher.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {teacher.email}
                  </p>
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {teacher.id}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {teacher.subject || '—'}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {isAdmin
                    ? getTeacherAssignments(teacher.id).length
                    : '—'}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {teacher.phone}
                </td>

                <td className="px-5 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    teacher.status === 'Active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {teacher.status}
                  </span>
                </td>

                {isAdmin && (
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => openAssignments(teacher)}
                        className="font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Assigned Classes
                      </button>

                      <button
                        onClick={() => handleEdit(teacher)}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDelete(teacher.id)}
                        className="font-medium text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}

            {!loading && filteredTeachers.length === 0 && (
              <tr>
                <td
                  colSpan={isAdmin ? 7 : 6}
                  className="px-5 py-10 text-center text-slate-500"
                >
                  {isAdmin
                    ? 'No teachers found.'
                    : 'Your teacher profile is not linked yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-5 text-xl font-bold text-slate-800">
              {editingId ? 'Edit Teacher' : 'Add New Teacher'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Teacher Name"
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
                name="subject"
                value={form.subject}
                onChange={handleChange}
                placeholder="Teacher's Subject"
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

              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setForm(emptyForm)
                    setEditingId(null)
                  }}
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingId
                      ? 'Update Teacher'
                      : 'Save Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignments && isAdmin && selectedTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Assigned Classes
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedTeacher.name}
                </p>
                <p className="text-sm font-medium text-blue-600">
                  Subject: {selectedTeacher.subject || 'Not specified'}
                </p>
              </div>

              <button
                onClick={() => {
                  setShowAssignments(false)
                  setSelectedTeacher(null)
                  setError('')
                }}
                className="text-xl text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleAssignmentSubmit}
              className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <h3 className="font-semibold text-slate-800">
                Assign a Class
              </h3>

              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                <option value="">Select Class</option>
                {classes
                  .filter((classItem) =>
                    !assignments.some(
                      (assignment) =>
                        assignment.class_id === classItem.id &&
                        assignment.subject_name.toLowerCase() ===
                          selectedTeacher.subject.trim().toLowerCase()
                    )
                  )
                  .map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.class_name}
                    </option>
                  ))}
              </select>

              <button
                type="submit"
                disabled={saving || !selectedTeacher.subject.trim()}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : '+ Assign Class'}
              </button>
            </form>

            <div className="mt-6">
              <h3 className="mb-3 font-semibold text-slate-800">
                Current Classes
              </h3>

              <div className="space-y-3">
                {getTeacherAssignments(selectedTeacher.id).map(
                  (assignment) => (
                    <div
                      key={assignment.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {getClassName(assignment.class_id)}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {assignment.subject_name}
                        </p>
                      </div>

                      <button
                        onClick={() => removeAssignment(assignment.id)}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  )
                )}

                {getTeacherAssignments(selectedTeacher.id).length === 0 && (
                  <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">
                    No classes assigned yet.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowAssignments(false)
                  setSelectedTeacher(null)
                  setError('')
                }}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default Teachers
