
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function getGrade(percentage) {
  if (percentage >= 90) return 'A+'
  if (percentage >= 80) return 'A'
  if (percentage >= 70) return 'B'
  if (percentage >= 60) return 'C'
  if (percentage >= 50) return 'D'
  return 'F'
}

export default function Results() {
  const [role, setRole] = useState('')
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [classSubjects, setClassSubjects] = useState([])
  const [exams, setExams] = useState([])
  const [results, setResults] = useState([])

  const [selectedClass, setSelectedClass] = useState(null)
  const [selectedStudent, setSelectedStudent] = useState(null)

  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    examinationId: '',
    obtainedMarks: '',
  })

  const selectedExam = exams.find(
    (exam) => exam.id === form.examinationId
  )

  const totalMarks = Number(selectedExam?.total_marks || 0)
  const obtainedMarks = Number(form.obtainedMarks || 0)

  const percentage = totalMarks > 0
    ? (obtainedMarks / totalMarks) * 100
    : 0

  const isPassed = selectedExam
    ? obtainedMarks >= Number(selectedExam.passing_marks)
    : false

  useEffect(() => {
    initializeResults()
  }, [])

  async function initializeResults() {
    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error('Please login first.')

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      setRole(profile.role)

      if (profile.role === 'admin') {
        await fetchAdminData()
      } else if (profile.role === 'teacher') {
        await fetchTeacherData()
      } else if (profile.role === 'student') {
        await fetchResults()
      } else {
        throw new Error('Your account role is not recognized.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAdminData() {
    const [
      classesResponse,
      studentsResponse,
      subjectsResponse,
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('id, program, part, class_name')
        .order('program')
        .order('part'),

      supabase
        .from('students')
        .select('id, admission_no, full_name, email, phone, department, status, class_id')
        .eq('status', 'Active')
        .order('full_name'),

      supabase
        .from('class_subjects')
        .select('id, class_id, subject_name, teacher_id'),
    ])

    if (classesResponse.error) throw classesResponse.error
    if (studentsResponse.error) throw studentsResponse.error
    if (subjectsResponse.error) throw subjectsResponse.error

    setClasses(classesResponse.data || [])
    setStudents(studentsResponse.data || [])
    setClassSubjects(subjectsResponse.data || [])
  }

  async function fetchTeacherData() {
    const { data: teacherId, error: teacherError } = await supabase
      .rpc('current_teacher_id')

    if (teacherError) throw teacherError

    if (!teacherId) {
      throw new Error('Teacher account is not linked to a teacher record.')
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from('class_subjects')
      .select('id, class_id, subject_name, teacher_id')
      .eq('teacher_id', teacherId)

    if (assignmentError) throw assignmentError

    const assignedSubjects = assignments || []
    const classIds = [
      ...new Set(assignedSubjects.map((item) => item.class_id)),
    ]

    setClassSubjects(assignedSubjects)

    if (classIds.length === 0) {
      setClasses([])
      setStudents([])
      return
    }

    const [classesResponse, studentsResponse] = await Promise.all([
      supabase
        .from('classes')
        .select('id, program, part, class_name')
        .in('id', classIds)
        .order('program')
        .order('part'),

      supabase
        .from('students')
        .select('id, admission_no, full_name, email, phone, department, status, class_id')
        .in('class_id', classIds)
        .eq('status', 'Active')
        .order('full_name'),
    ])

    if (classesResponse.error) throw classesResponse.error
    if (studentsResponse.error) throw studentsResponse.error

    setClasses(classesResponse.data || [])
    setStudents(studentsResponse.data || [])
  }

  async function fetchResults(studentId = null) {
    let query = supabase
      .from('results')
      .select(`
        id,
        student_id,
        examination_id,
        obtained_marks,
        created_at,
        students (
          full_name,
          admission_no,
          department
        ),
        examinations (
          name,
          exam_code,
          subject,
          type,
          total_marks,
          passing_marks,
          class_subject_id
        )
      `)
      .order('created_at', { ascending: false })

    if (studentId) {
      query = query.eq('student_id', studentId)
    }

    const { data, error } = await query

    if (error) throw error

    setResults(data || [])
  }

  async function openStudent(student) {
    setSelectedStudent(student)
    setExams([])
    setResults([])
    setSearch('')
    setError('')
    setMessage('')
    resetForm()

    setLoading(true)

    try {
      const subjectIds = classSubjects
        .filter((item) => item.class_id === student.class_id)
        .map((item) => item.id)

      if (subjectIds.length > 0) {
        const { data: examData, error: examError } = await supabase
          .from('examinations')
          .select('*')
          .in('class_subject_id', subjectIds)
          .order('exam_date', { ascending: true })

        if (examError) throw examError

        setExams(examData || [])
      }

      await fetchResults(student.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function getClassStudents(classId) {
    return students.filter(
      (student) => student.class_id === classId
    )
  }

  const filteredStudents = selectedClass
    ? getClassStudents(selectedClass.id).filter((student) =>
        `${student.full_name} ${student.admission_no} ${student.email || ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : []

  function resetForm() {
    setForm({
      examinationId: '',
      obtainedMarks: '',
    })
    setEditingId(null)
  }

  function backToClasses() {
    setSelectedClass(null)
    setSelectedStudent(null)
    setResults([])
    setExams([])
    setSearch('')
    setError('')
    setMessage('')
    resetForm()
  }

  function backToStudents() {
    setSelectedStudent(null)
    setResults([])
    setExams([])
    setError('')
    setMessage('')
    resetForm()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!selectedStudent || !selectedExam) {
      setError('Please select an examination.')
      return
    }

    if (
      form.obtainedMarks === '' ||
      !Number.isFinite(obtainedMarks) ||
      obtainedMarks < 0 ||
      obtainedMarks > totalMarks
    ) {
      setError('Obtained marks must be between 0 and total marks.')
      return
    }

    setSaving(true)

    try {
      const resultData = {
        student_id: selectedStudent.id,
        examination_id: form.examinationId,
        obtained_marks: obtainedMarks,
      }

      if (editingId) {
        const { error } = await supabase
          .from('results')
          .update(resultData)
          .eq('id', editingId)

        if (error) throw error

        setMessage('Result updated successfully!')
      } else {
        const { error } = await supabase
          .from('results')
          .insert(resultData)

        if (error) throw error

        setMessage('Result saved successfully!')
      }

      resetForm()
      await fetchResults(selectedStudent.id)
    } catch (err) {
      setError(
        err.code === '23505'
          ? 'A result for this student and examination already exists.'
          : err.message
      )
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(result) {
    setForm({
      examinationId: result.examination_id,
      obtainedMarks: String(result.obtained_marks),
    })

    setEditingId(result.id)
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (role !== 'admin') return

    if (!window.confirm('Are you sure you want to delete this result?')) {
      return
    }

    setError('')
    setMessage('')

    const { error } = await supabase
      .from('results')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage('Result deleted successfully!')
    await fetchResults(selectedStudent?.id || null)
  }

  const passedCount = results.filter((result) => {
    const exam = result.examinations
    return exam &&
      Number(result.obtained_marks) >= Number(exam.passing_marks)
  }).length

  const failedCount = results.length - passedCount

  if (loading && !selectedClass && !selectedStudent) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading results...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Results & Marks
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          View classes, students and their examination results.
        </p>
      </div>

      {message && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {role === 'student' ? (
        <StudentResults
          results={results}
          loading={loading}
        />
      ) : !selectedClass ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {classes.map((classItem) => {
              const count = getClassStudents(classItem.id).length

              return (
                <button
                  key={classItem.id}
                  onClick={() => {
                    setSelectedClass(classItem)
                    setSearch('')
                    setError('')
                    setMessage('')
                  }}
                  className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-gray-800">
                        {classItem.class_name}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        {classItem.program}
                      </p>
                    </div>

                    <span className="rounded-lg bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                      Part {classItem.part}
                    </span>
                  </div>

                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <p className="text-2xl font-bold text-gray-800">
                      {count}
                    </p>
                    <p className="text-sm text-gray-500">
                      Active Students
                    </p>
                  </div>

                  <p className="mt-4 text-sm font-medium text-blue-600">
                    View Students →
                  </p>
                </button>
              )
            })}
          </div>

          {classes.length === 0 && (
            <p className="rounded-xl bg-white p-6 text-center text-gray-500">
              No assigned classes found.
            </p>
          )}
        </>
      ) : !selectedStudent ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button
                onClick={backToClasses}
                className="mb-3 text-sm font-medium text-blue-600 hover:underline"
              >
                ← Back to Classes
              </button>

              <h2 className="text-xl font-bold text-gray-800">
                {selectedClass.class_name}
              </h2>

              <p className="text-sm text-gray-500">
                {selectedClass.program} · Part {selectedClass.part}
              </p>
            </div>

            <div className="rounded-xl bg-blue-50 px-5 py-3">
              <p className="text-2xl font-bold text-blue-700">
                {getClassStudents(selectedClass.id).length}
              </p>
              <p className="text-xs text-blue-600">Active Students</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, admission number or email..."
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-5 py-4">Admission No.</th>
                  <th className="px-5 py-4">Student Name</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Phone</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium text-gray-700">
                      {student.admission_no}
                    </td>
                    <td className="px-5 py-4 text-gray-800">
                      {student.full_name}
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {student.email || '—'}
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {student.phone || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                        Active
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => openStudent(student)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        View Results →
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-5 py-10 text-center text-gray-500">
                      {search
                        ? 'No matching students found.'
                        : 'No active students enrolled in this class yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <button
              onClick={backToStudents}
              className="mb-3 text-sm font-medium text-blue-600 hover:underline"
            >
              ← Back to Students
            </button>

            <h2 className="text-xl font-bold text-gray-800">
              {selectedStudent.full_name}
            </h2>

            <p className="text-sm text-gray-500">
              {selectedStudent.admission_no} · {selectedClass.class_name}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Total Results</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-800">
                {results.length}
              </h2>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Passed</p>
              <h2 className="mt-2 text-2xl font-bold text-green-600">
                {passedCount}
              </h2>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Failed</p>
              <h2 className="mt-2 text-2xl font-bold text-red-600">
                {failedCount}
              </h2>
            </div>
          </div>

          {role !== 'student' && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-5 text-lg font-bold text-gray-800">
                {editingId ? 'Edit Result' : 'Add Student Marks'}
              </h2>

              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">
                    Examination / Subject
                  </label>

                  <select
                    required
                    value={form.examinationId}
                    disabled={Boolean(editingId)}
                    onChange={(e) =>
                      setForm({ ...form, examinationId: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none disabled:bg-gray-100"
                  >
                    <option value="">Select Examination</option>
                    {exams.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.name} - {exam.subject}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedExam && (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    <p><strong>Subject:</strong> {selectedExam.subject}</p>
                    <p><strong>Total Marks:</strong> {selectedExam.total_marks}</p>
                    <p><strong>Passing Marks:</strong> {selectedExam.passing_marks}</p>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-600">
                    Obtained Marks
                  </label>

                  <input
                    required
                    type="number"
                    min="0"
                    max={selectedExam?.total_marks || undefined}
                    step="0.01"
                    value={form.obtainedMarks}
                    onChange={(e) =>
                      setForm({ ...form, obtainedMarks: e.target.value })
                    }
                    placeholder="Enter obtained marks"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="rounded-lg bg-blue-50 p-4 sm:col-span-2">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-500">Percentage</p>
                      <p className="text-xl font-bold text-blue-700">
                        {percentage.toFixed(2)}%
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Grade</p>
                      <p className="text-xl font-bold text-blue-700">
                        {getGrade(percentage)}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <p className={`text-xl font-bold ${
                        isPassed ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {isPassed ? 'Pass' : 'Fail'}
                      </p>
                    </div>
                  </div>
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
                        ? 'Update Result'
                        : 'Save Result'}
                  </button>

                  {editingId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {exams.length === 0 && (
                <p className="mt-4 text-sm text-gray-500">
                  No examinations have been created for this class yet.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-800">
                Examination Results
              </h2>

              <span className="text-sm text-gray-500">
                {selectedStudent.full_name}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="p-3">Examination</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Marks</th>
                    <th className="p-3">Percentage</th>
                    <th className="p-3">Grade</th>
                    <th className="p-3">Status</th>
                    {role !== 'student' && <th className="p-3">Actions</th>}
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={role === 'admin' ? 7 : 7} className="p-6 text-center text-gray-500">
                        Loading results...
                      </td>
                    </tr>
                  ) : results.map((result) => {
                    const exam = result.examinations
                    if (!exam) return null

                    const total = Number(exam.total_marks)
                    const obtained = Number(result.obtained_marks)
                    const percent = total > 0 ? (obtained / total) * 100 : 0
                    const passed = obtained >= Number(exam.passing_marks)

                    return (
                      <tr key={result.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-800">
                          {exam.name}
                        </td>
                        <td className="p-3">{exam.subject}</td>
                        <td className="p-3">{obtained}/{total}</td>
                        <td className="p-3">{percent.toFixed(2)}%</td>
                        <td className="p-3 font-semibold">
                          {getGrade(percent)}
                        </td>
                        <td className="p-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            passed
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {passed ? 'Pass' : 'Fail'}
                          </span>
                        </td>

                        {role !== 'student' && (
                          <td className="p-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(result)}
                                className="font-medium text-blue-600 hover:underline"
                              >
                                Edit
                              </button>

                              {role === 'admin' && (
                                <button
                                  onClick={() => handleDelete(result.id)}
                                  className="font-medium text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}

                  {!loading && results.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-6 text-center text-gray-500">
                        No results entered for this student yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StudentResults({ results, loading }) {
  const passedCount = results.filter((result) => {
    const exam = result.examinations
    return exam &&
      Number(result.obtained_marks) >= Number(exam.passing_marks)
  }).length

  const failedCount = results.length - passedCount

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Results</p>
          <h2 className="mt-2 text-2xl font-bold text-gray-800">
            {results.length}
          </h2>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Passed</p>
          <h2 className="mt-2 text-2xl font-bold text-green-600">
            {passedCount}
          </h2>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Failed</p>
          <h2 className="mt-2 text-2xl font-bold text-red-600">
            {failedCount}
          </h2>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-5 text-lg font-bold text-gray-800">
          My Examination Results
        </h2>

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-3">Examination</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Marks</th>
              <th className="p-3">Percentage</th>
              <th className="p-3">Grade</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="p-6 text-center text-gray-500">
                  Loading results...
                </td>
              </tr>
            ) : results.map((result) => {
              const exam = result.examinations
              if (!exam) return null

              const total = Number(exam.total_marks)
              const obtained = Number(result.obtained_marks)
              const percent = total > 0 ? (obtained / total) * 100 : 0
              const passed = obtained >= Number(exam.passing_marks)

              return (
                <tr key={result.id} className="border-b">
                  <td className="p-3 font-medium">{exam.name}</td>
                  <td className="p-3">{exam.subject}</td>
                  <td className="p-3">{obtained}/{total}</td>
                  <td className="p-3">{percent.toFixed(2)}%</td>
                  <td className="p-3 font-semibold">{getGrade(percent)}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      passed
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {passed ? 'Pass' : 'Fail'}
                    </span>
                  </td>
                </tr>
              )
            })}

            {!loading && results.length === 0 && (
              <tr>
                <td colSpan="6" className="p-6 text-center text-gray-500">
                  No results available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
