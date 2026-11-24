
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const emptyForm = {
  name: '',
  classId: '',
  classSubjectId: '',
  type: 'Mid Term',
  date: '',
  totalMarks: '',
  passingMarks: '',
}

function Examinations() {
  const [exams, setExams] = useState([])
  const [classes, setClasses] = useState([])
  const [classSubjects, setClassSubjects] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [role, setRole] = useState('')

  useEffect(() => {
    initializeExaminations()
  }, [])

  const initializeExaminations = async () => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Please login first.')
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

    if (profile.role === 'admin') {
      const [classesResult, subjectsResult] = await Promise.all([
        supabase
          .from('classes')
          .select('id, class_name')
          .order('class_name'),

        supabase
          .from('class_subjects')
          .select('id, class_id, subject_name')
          .order('subject_name'),
      ])

      if (classesResult.error) {
        setError(classesResult.error.message)
        setLoading(false)
        return
      }

      if (subjectsResult.error) {
        setError(subjectsResult.error.message)
        setLoading(false)
        return
      }

      setClasses(classesResult.data || [])
      setClassSubjects(subjectsResult.data || [])
    }

    await fetchExams()
  }

  const fetchExams = async () => {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('examinations')
      .select('*')
      .order('exam_date', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setExams(
      (data || []).map((exam) => ({
        id: exam.id,
        examCode: exam.exam_code,
        name: exam.name,
        program: exam.program,
        subject: exam.subject,
        classSubjectId: exam.class_subject_id,
        type: exam.type,
        date: exam.exam_date,
        totalMarks: exam.total_marks,
        passingMarks: exam.passing_marks,
      }))
    )

    setLoading(false)
  }

  const selectedSubjects = classSubjects.filter(
    (subject) => subject.class_id === form.classId
  )

  const filteredExams = exams.filter((exam) =>
    `${exam.name} ${exam.examCode} ${exam.program} ${exam.subject} ${exam.type}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  const getClassSubject = (subjectId) =>
    classSubjects.find((subject) => subject.id === subjectId)

  const getClassName = (subjectId) => {
    const subject = getClassSubject(subjectId)
    const selectedClass = classes.find(
      (item) => item.id === subject?.class_id
    )

    return selectedClass?.class_name || ''
  }

  const handleChange = (e) => {
    const { name, value } = e.target

    if (name === 'classId') {
      setForm((previous) => ({
        ...previous,
        classId: value,
        classSubjectId: '',
      }))
    } else {
      setForm((previous) => ({
        ...previous,
        [name]: value,
      }))
    }

    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    const total = Number(form.totalMarks)
    const passing = Number(form.passingMarks)

    if (total <= 0 || passing < 0 || passing > total) {
      setError('Passing marks must be between 0 and total marks.')
      return
    }

    const selectedClass = classes.find(
      (item) => item.id === form.classId
    )

    const selectedSubject = classSubjects.find(
      (item) =>
        item.id === form.classSubjectId &&
        item.class_id === form.classId
    )

    if (!selectedClass || !selectedSubject) {
      setError('Please select a valid class and subject.')
      return
    }

    if (!form.date) {
      setError('Please select examination date.')
      return
    }

    setSaving(true)

    const examData = {
      name: form.name.trim(),
      program: selectedClass.class_name,
      subject: selectedSubject.subject_name,
      class_subject_id: selectedSubject.id,
      type: form.type,
      exam_date: form.date,
      total_marks: total,
      passing_marks: passing,
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('examinations')
          .update(examData)
          .eq('id', editingId)

        if (error) throw error

        setMessage('Examination updated successfully!')
      } else {
        const examCode = `EXM-${Date.now()}`

        const { error } = await supabase
          .from('examinations')
          .insert({
            ...examData,
            exam_code: examCode,
          })

        if (error) throw error

        setMessage('Examination created successfully!')
      }

      setForm(emptyForm)
      setEditingId(null)
      setShowForm(false)
      await fetchExams()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (exam) => {
    const linkedSubject = getClassSubject(exam.classSubjectId)

    setForm({
      name: exam.name,
      classId: linkedSubject?.class_id || '',
      classSubjectId: linkedSubject?.id || '',
      type: exam.type,
      date: exam.date || '',
      totalMarks: String(exam.totalMarks),
      passingMarks: String(exam.passingMarks),
    })

    setEditingId(exam.id)
    setShowForm(true)
    setError('')
    setMessage('')
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this examination?')) {
      return
    }

    setError('')
    setMessage('')

    const { error } = await supabase
      .from('examinations')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage('Examination deleted successfully!')
    await fetchExams()
  }

  const closeForm = () => {
    setShowForm(false)
    setForm(emptyForm)
    setEditingId(null)
    setError('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Examinations Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create and manage college examinations.
          </p>
        </div>

        {role === 'admin' && (
          <button
            onClick={() => {
              setForm(emptyForm)
              setEditingId(null)
              setError('')
              setMessage('')
              setShowForm(true)
            }}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Create Examination
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Examinations</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {exams.length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Mid Term Exams</p>
          <h2 className="mt-2 text-2xl font-bold text-blue-600">
            {exams.filter((exam) => exam.type === 'Mid Term').length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Final Term Exams</p>
          <h2 className="mt-2 text-2xl font-bold text-purple-600">
            {exams.filter((exam) => exam.type === 'Final Term').length}
          </h2>
        </div>
      </div>

      {message && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}

      {error && !showForm && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <input
          type="text"
          placeholder="Search exam, class, subject or exam ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-4">Examination</th>
              <th className="px-5 py-4">Class</th>
              <th className="px-5 py-4">Subject</th>
              <th className="px-5 py-4">Date</th>
              <th className="px-5 py-4">Marks</th>
              {role === 'admin' && (
                <th className="px-5 py-4">Actions</th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td
                  colSpan={role === 'admin' ? 6 : 5}
                  className="px-5 py-10 text-center text-slate-500"
                >
                  Loading examinations...
                </td>
              </tr>
            ) : filteredExams.map((exam) => (
              <tr key={exam.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-800">
                    {exam.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {exam.examCode} · {exam.type}
                  </p>
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {exam.classSubjectId
                    ? getClassName(exam.classSubjectId) || exam.program
                    : exam.program || 'Not assigned'}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {exam.subject}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {exam.date}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  <p>Total: {exam.totalMarks}</p>
                  <p className="text-xs text-slate-500">
                    Passing: {exam.passingMarks}
                  </p>
                </td>

                {role === 'admin' && (
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleEdit(exam)}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDelete(exam.id)}
                        className="font-medium text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}

            {!loading && filteredExams.length === 0 && (
              <tr>
                <td
                  colSpan={role === 'admin' ? 6 : 5}
                  className="px-5 py-10 text-center text-slate-500"
                >
                  No examinations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && role === 'admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-6 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-5 text-xl font-bold text-slate-800">
              {editingId ? 'Edit Examination' : 'Create New Examination'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Examination Name"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />

              <select
                name="classId"
                value={form.classId}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              >
                <option value="">Select Class</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.class_name}
                  </option>
                ))}
              </select>

              <select
                name="classSubjectId"
                value={form.classSubjectId}
                onChange={handleChange}
                required
                disabled={!form.classId}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm disabled:bg-slate-100"
              >
                <option value="">Select Subject</option>
                {selectedSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subject_name}
                  </option>
                ))}
              </select>

              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              >
                <option value="Mid Term">Mid Term</option>
                <option value="Final Term">Final Term</option>
                <option value="Quiz">Quiz</option>
                <option value="Assignment">Assignment</option>
                <option value="Practical">Practical</option>
              </select>

              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  name="totalMarks"
                  value={form.totalMarks}
                  onChange={handleChange}
                  placeholder="Total Marks"
                  min="1"
                  required
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
                />

                <input
                  type="number"
                  name="passingMarks"
                  value={form.passingMarks}
                  onChange={handleChange}
                  placeholder="Passing Marks"
                  min="0"
                  required
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
                />
              </div>

              {error && (
                <p className="text-sm font-medium text-red-600">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={closeForm}
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
                      ? 'Update Examination'
                      : 'Save Examination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Examinations
