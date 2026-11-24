
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const emptyForm = {
  title: '',
  classSubjectId: '',
  type: 'PDF',
  description: '',
  url: '',
}

export default function StudyMaterials() {
  const [classes, setClasses] = useState([])
  const [classSubjects, setClassSubjects] = useState([])
  const [materials, setMaterials] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)

  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)

  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('All')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        throw new Error('Unable to identify logged-in user.')
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      const userRole = profile.role
      setRole(userRole)

      let classData = []
      let subjectData = []

      // ADMIN: All classes and all assigned class subjects
      if (userRole === 'admin') {
        const { data, error: classError } = await supabase
          .from('classes')
          .select('id, program, part, class_name')
          .order('program')
          .order('part')

        if (classError) throw classError
        classData = data || []

        const { data: subjects, error: subjectError } = await supabase
          .from('class_subjects')
          .select('id, class_id, subject_name, teacher_id')
          .order('subject_name')

        if (subjectError) throw subjectError
        subjectData = subjects || []
      }

      // TEACHER: Only assigned classes and subjects
      else if (userRole === 'teacher') {
        const { data: teacherCode, error: teacherError } =
          await supabase.rpc('current_teacher_id')

        if (teacherError) throw teacherError

        if (!teacherCode) {
          throw new Error('Your teacher account could not be identified.')
        }

        const { data: subjects, error: subjectError } = await supabase
          .from('class_subjects')
          .select('id, class_id, subject_name, teacher_id')
          .eq('teacher_id', teacherCode)
          .order('subject_name')

        if (subjectError) throw subjectError
        subjectData = subjects || []

        const classIds = [
          ...new Set(subjectData.map((subject) => subject.class_id)),
        ]

        if (classIds.length > 0) {
          const { data, error: classError } = await supabase
            .from('classes')
            .select('id, program, part, class_name')
            .in('id', classIds)
            .order('program')
            .order('part')

          if (classError) throw classError
          classData = data || []
        }
      }

      // STUDENT: Only own class
      else if (userRole === 'student') {
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('class_id')
          .eq('profile_id', user.id)
          .maybeSingle()

        if (studentError) throw studentError

        if (student?.class_id) {
          const { data, error: classError } = await supabase
            .from('classes')
            .select('id, program, part, class_name')
            .eq('id', student.class_id)
            .single()

          if (classError) throw classError
          classData = data ? [data] : []
        }
      } else {
        throw new Error('Your account does not have a valid role.')
      }

      const { data: materialData, error: materialError } =
        await supabase
          .from('study_materials')
          .select(`
            id,
            title,
            subject,
            semester,
            class_id,
            class_subject_id,
            teacher_id,
            type,
            description,
            resource_url,
            created_at,
            teachers (
              full_name,
              teacher_id
            )
          `)
          .order('created_at', { ascending: false })

      if (materialError) throw materialError

      setClasses(classData)
      setClassSubjects(subjectData)
      setMaterials(
        (materialData || []).map((item) => ({
          ...item,
          teacher: item.teachers?.full_name || 'Unknown Teacher',
          url: item.resource_url,
        }))
      )
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    }

    setLoading(false)
  }

  const canManage = role === 'admin' || role === 'teacher'

  const availableSubjects = selectedClass
    ? classSubjects.filter(
        (subject) => subject.class_id === selectedClass.id
      )
    : []

  const classMaterials = selectedClass
    ? materials.filter((item) => item.class_id === selectedClass.id)
    : []

  const filteredMaterials = classMaterials.filter((item) => {
    const matchesSearch =
      `${item.title} ${item.subject} ${item.teacher} ${item.description || ''}`
        .toLowerCase()
        .includes(search.toLowerCase())

    const matchesType =
      selectedType === 'All' || item.type === selectedType

    return matchesSearch && matchesType
  })

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function goBack() {
    setSelectedClass(null)
    setSearch('')
    setSelectedType('All')
    resetForm()
    setError('')
    setMessage('')
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!selectedClass) return

    if (!form.classSubjectId) {
      setError('Please select a subject.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    const trimmedUrl = form.url.trim()

    try {
      const parsedUrl = new URL(trimmedUrl)

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Please enter a valid HTTP or HTTPS URL.')
      }
    } catch {
      setError('Please enter a valid resource URL.')
      setSaving(false)
      return
    }

    const payload = {
      title: form.title.trim(),
      class_subject_id: form.classSubjectId,
      type: form.type,
      description: form.description.trim(),
      resource_url: trimmedUrl,
    }

    const result = editingId
      ? await supabase
          .from('study_materials')
          .update(payload)
          .eq('id', editingId)
      : await supabase
          .from('study_materials')
          .insert([payload])

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setMessage(
      editingId
        ? 'Study material updated successfully!'
        : 'Study material added successfully!'
    )

    resetForm()
    await loadData()
    setSaving(false)
  }

  function handleEdit(item) {
    setForm({
      title: item.title,
      classSubjectId: item.class_subject_id,
      type: item.type,
      description: item.description || '',
      url: item.url,
    })

    setEditingId(item.id)
    setError('')
    setMessage('')

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this material?')) {
      return
    }

    setError('')
    setMessage('')

    const { error: deleteError } = await supabase
      .from('study_materials')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setMessage('Study material deleted successfully!')
    await loadData()
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading study materials...
      </div>
    )
  }

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Study Materials
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Access educational resources, notes and learning materials.
        </p>
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

      {!selectedClass ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {classes.map((classItem) => {
              const count = materials.filter(
                (item) => item.class_id === classItem.id
              ).length

              return (
                <button
                  key={classItem.id}
                  onClick={() => {
                    setSelectedClass(classItem)
                    setSearch('')
                    setSelectedType('All')
                    setMessage('')
                    setError('')
                  }}
                  className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-800">
                        {classItem.class_name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {classItem.program}
                      </p>
                    </div>

                    <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      Part {classItem.part}
                    </span>
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="text-2xl font-bold text-slate-800">
                      {count}
                    </p>
                    <p className="text-sm text-slate-500">
                      Study Materials
                    </p>
                  </div>

                  <p className="mt-4 text-sm font-semibold text-blue-600">
                    View Materials →
                  </p>
                </button>
              )
            })}
          </div>

          {classes.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              {role === 'student'
                ? 'Your student account is not linked to a class yet.'
                : 'No assigned classes found.'}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-5">
          <div>
            <button
              onClick={goBack}
              className="mb-3 text-sm font-semibold text-blue-600 hover:underline"
            >
              ← Back to Classes
            </button>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {selectedClass.class_name}
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedClass.program} · Part {selectedClass.part}
                </p>
              </div>

              <div className="rounded-xl bg-blue-50 px-5 py-3">
                <p className="text-2xl font-bold text-blue-700">
                  {classMaterials.length}
                </p>
                <p className="text-xs text-blue-600">
                  Total Materials
                </p>
              </div>
            </div>
          </div>

          {canManage && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-5 text-lg font-bold text-slate-800">
                {editingId ? 'Edit Study Material' : 'Add Study Material'}
              </h2>

              {availableSubjects.length === 0 ? (
                <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-700">
                  No subjects with assigned teachers are available for this
                  class. Assign a teacher to a subject first.
                </p>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">
                      Material Title
                    </label>
                    <input
                      required
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      placeholder="Enter material title"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">
                      Subject
                    </label>
                    <select
                      required
                      value={form.classSubjectId}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          classSubjectId: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    >
                      <option value="">Select Subject</option>
                      {availableSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.subject_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">
                      Resource Type
                    </label>
                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm({ ...form, type: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                    >
                      <option>PDF</option>
                      <option>Notes</option>
                      <option>Video</option>
                      <option>Link</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">
                      Resource URL
                    </label>
                    <input
                      required
                      type="url"
                      value={form.url}
                      onChange={(e) =>
                        setForm({ ...form, url: e.target.value })
                      }
                      placeholder="https://example.com/resource"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-600">
                      Description
                    </label>
                    <textarea
                      rows="3"
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      placeholder="Write a short description..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving
                        ? 'Saving...'
                        : editingId
                          ? 'Update Material'
                          : 'Save Material'}
                    </button>

                    {editingId && (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-600"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-800">
                Educational Resources
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Materials available for {selectedClass.class_name}.
              </p>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials..."
                className="rounded-lg border border-slate-300 px-3 py-2"
              />

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="All">All Resource Types</option>
                <option value="PDF">PDF</option>
                <option value="Notes">Notes</option>
                <option value="Video">Video</option>
                <option value="Link">Link</option>
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredMaterials.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 p-5 transition hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {item.type}
                    </span>
                    <span className="text-xs text-slate-500">
                      {item.subject}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-800">
                    {item.title}
                  </h3>

                  <p className="mt-3 text-sm text-slate-500">
                    {item.description || 'No description provided.'}
                  </p>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">
                      Uploaded by: {item.teacher}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-blue-600 hover:underline"
                      >
                        Open Resource ↗
                      </a>

                      {canManage && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-sm font-medium text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {filteredMaterials.length === 0 && (
                <div className="rounded-lg bg-slate-50 p-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                  No study materials found for this class.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
