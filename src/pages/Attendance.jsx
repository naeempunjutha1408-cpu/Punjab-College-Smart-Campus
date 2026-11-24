
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const getToday = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function Attendance() {
  const [role, setRole] = useState('')
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedDate, setSelectedDate] = useState(getToday())

  const [attendance, setAttendance] = useState({})
  const [savedRecords, setSavedRecords] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const canManage = role === 'admin' || role === 'teacher'

  const classStudents = useMemo(
    () => students.filter((student) => student.class_id === selectedClass),
    [students, selectedClass]
  )

  const presentCount = classStudents.filter(
    (student) => attendance[student.id] === 'Present'
  ).length

  const absentCount = classStudents.filter(
    (student) => attendance[student.id] === 'Absent'
  ).length

  const unmarkedCount = classStudents.length - presentCount - absentCount

  const percentage = classStudents.length
    ? Math.round((presentCount / classStudents.length) * 100)
    : 0

  useEffect(() => {
    initializeAttendance()
  }, [])

  useEffect(() => {
    if (selectedClass && selectedSubject && classStudents.length > 0) {
      loadAttendance()
    } else {
      setAttendance({})
      setSavedRecords([])
    }
  }, [selectedClass, selectedSubject, selectedDate, students])

  const initializeAttendance = async () => {
    setLoading(true)
    setError('')

    const { data: { user }, error: userError } =
      await supabase.auth.getUser()

    if (userError || !user) {
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

    let availableClasses = []
    let availableSubjects = []
    let studentData = []

    // ADMIN
    if (profile.role === 'admin') {
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, class_name')
        .order('class_name')

      if (classError) {
        setError(classError.message)
        setLoading(false)
        return
      }

      const { data: subjectData, error: subjectError } = await supabase
        .from('class_subjects')
        .select('id, class_id, subject_name, teacher_id')
        .order('subject_name')

      if (subjectError) {
        setError(subjectError.message)
        setLoading(false)
        return
      }

      const { data: allStudents, error: studentError } = await supabase
        .from('students')
        .select('id, admission_no, full_name, class_id, status')
        .eq('status', 'Active')
        .order('full_name')

      if (studentError) {
        setError(studentError.message)
        setLoading(false)
        return
      }

      availableClasses = classData || []
      availableSubjects = subjectData || []
      studentData = allStudents || []
    }

    // TEACHER
    else if (profile.role === 'teacher') {
      const { data: teacher, error: teacherError } = await supabase
        .from('teachers')
        .select('teacher_id, subject')
        .eq('email', user.email)
        .maybeSingle()

      if (teacherError || !teacher) {
        setError(teacherError?.message || 'Teacher account not found.')
        setLoading(false)
        return
      }

      const { data: subjectData, error: subjectError } = await supabase
        .from('class_subjects')
        .select('id, class_id, subject_name, teacher_id')
        .eq('teacher_id', teacher.teacher_id)

      if (subjectError) {
        setError(subjectError.message)
        setLoading(false)
        return
      }

      availableSubjects = subjectData || []

      const classIds = [
        ...new Set(availableSubjects.map((item) => item.class_id)),
      ]

      if (classIds.length > 0) {
        const { data: classData, error: classError } = await supabase
          .from('classes')
          .select('id, class_name')
          .in('id', classIds)
          .order('class_name')

        if (classError) {
          setError(classError.message)
          setLoading(false)
          return
        }

        availableClasses = classData || []

        const { data: allStudents, error: studentError } = await supabase
          .from('students')
          .select('id, admission_no, full_name, class_id, status')
          .in('class_id', classIds)
          .eq('status', 'Active')
          .order('full_name')

        if (studentError) {
          setError(studentError.message)
          setLoading(false)
          return
        }

        studentData = allStudents || []
      }
    }

    // STUDENT
    else if (profile.role === 'student') {
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id, admission_no, full_name, class_id, status')
        .eq('email', user.email)
        .maybeSingle()

      if (studentError || !student) {
        setError(studentError?.message || 'Student account not found.')
        setLoading(false)
        return
      }

      studentData = [student]

      if (student.class_id) {
        const { data: classData, error: classError } = await supabase
          .from('classes')
          .select('id, class_name')
          .eq('id', student.class_id)

        if (classError) {
          setError(classError.message)
          setLoading(false)
          return
        }

        availableClasses = classData || []

        const { data: subjectData, error: subjectError } = await supabase
          .from('class_subjects')
          .select('id, class_id, subject_name, teacher_id')
          .eq('class_id', student.class_id)
          .order('subject_name')

        if (subjectError) {
          setError(subjectError.message)
          setLoading(false)
          return
        }

        availableSubjects = subjectData || []
      }
    }

    else {
      setError('Your account role is not authorized for attendance.')
      setLoading(false)
      return
    }

    setClasses(availableClasses)
    setSubjects(availableSubjects)
    setStudents(studentData)

    if (availableClasses.length > 0) {
      setSelectedClass(availableClasses[0].id)
    }

    if (availableSubjects.length > 0) {
      setSelectedSubject(availableSubjects[0].id)
    }

    setLoading(false)
  }

  const classSubjects = subjects.filter(
    (subject) => subject.class_id === selectedClass
  )

  const loadAttendance = async () => {
    if (!selectedClass || !selectedSubject || classStudents.length === 0) {
      setAttendance({})
      setSavedRecords([])
      return
    }

    const studentIds = classStudents.map((student) => student.id)

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, attendance_date, status')
      .in('student_id', studentIds)
      .eq('class_subject_id', selectedSubject)
      .eq('attendance_date', selectedDate)

    if (error) {
      setError(error.message)
      return
    }

    const attendanceMap = {}

    ;(data || []).forEach((record) => {
      attendanceMap[record.student_id] = record.status
    })

    setAttendance(attendanceMap)

    const { data: recentData, error: recentError } = await supabase
      .from('attendance')
      .select('student_id, attendance_date, status')
      .in('student_id', studentIds)
      .eq('class_subject_id', selectedSubject)
      .order('attendance_date', { ascending: false })
      .limit(200)

    if (recentError) {
      setError(recentError.message)
      return
    }

    const grouped = {}

    ;(recentData || []).forEach((record) => {
      const key = record.attendance_date

      if (!grouped[key]) {
        grouped[key] = {
          date: key,
          present: 0,
          absent: 0,
          total: 0,
        }
      }

      grouped[key].total += 1

      if (record.status === 'Present') {
        grouped[key].present += 1
      } else {
        grouped[key].absent += 1
      }
    })

    setSavedRecords(
      Object.values(grouped).map((record) => ({
        ...record,
        percentage: record.total
          ? Math.round((record.present / record.total) * 100)
          : 0,
      }))
    )
  }

  const markAttendance = (studentId, status) => {
    if (!canManage) return

    setAttendance((previous) => ({
      ...previous,
      [studentId]: status,
    }))

    setMessage('')
    setError('')
  }

  const markAllPresent = () => {
    if (!canManage) return

    const updated = {}

    classStudents.forEach((student) => {
      updated[student.id] = 'Present'
    })

    setAttendance(updated)
    setMessage('')
    setError('')
  }

  const saveAttendance = async () => {
    if (!canManage) return

    if (!selectedClass || !selectedSubject) {
      setMessage('Please select a class and subject.')
      return
    }

    if (unmarkedCount > 0) {
      setMessage('Please mark attendance for all students before saving.')
      return
    }

    if (classStudents.length === 0) {
      setMessage('No active students found in this class.')
      return
    }

    setSaving(true)
    setMessage('')
    setError('')

    const { data: { user } } = await supabase.auth.getUser()

    const records = classStudents.map((student) => ({
      student_id: student.id,
      class_subject_id: selectedSubject,
      attendance_date: selectedDate,
      status: attendance[student.id],
      marked_by: user?.id || null,
    }))

    const { error } = await supabase
      .from('attendance')
      .upsert(records, {
        onConflict: 'student_id,attendance_date,class_subject_id',
      })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setMessage('Attendance saved successfully!')
    await loadAttendance()
    setSaving(false)
  }

  const loadSavedAttendance = async () => {
    setMessage('')
    setError('')

    await loadAttendance()

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, status')
      .in('student_id', classStudents.map((student) => student.id))
      .eq('class_subject_id', selectedSubject)
      .eq('attendance_date', selectedDate)

    if (error) {
      setError(error.message)
      return
    }

    if (data && data.length > 0) {
      const present = data.filter((item) => item.status === 'Present').length
      const absent = data.filter((item) => item.status === 'Absent').length

      setMessage(`Saved record: ${present} Present, ${absent} Absent.`)
    } else {
      setMessage('No saved attendance record found for this subject and date.')
    }
  }

  const selectedClassName =
    classes.find((item) => item.id === selectedClass)?.class_name || ''

  const selectedSubjectName =
    subjects.find((item) => item.id === selectedSubject)?.subject_name || ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Attendance Management
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage student attendance by class and subject.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Students</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {classStudents.length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Present Students</p>
          <h2 className="mt-2 text-2xl font-bold text-green-600">
            {presentCount}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Absent Students</p>
          <h2 className="mt-2 text-2xl font-bold text-red-600">
            {absentCount}
          </h2>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-800">
          Select Class, Subject and Date
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">
              Select Class
            </label>

            <select
              value={selectedClass}
              onChange={(e) => {
                const value = e.target.value
                setSelectedClass(value)

                const firstSubject = subjects.find(
                  (item) => item.class_id === value
                )

                setSelectedSubject(firstSubject?.id || '')
                setMessage('')
                setError('')
              }}
              disabled={loading || role === 'student'}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50"
            >
              <option value="">Select Class</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.class_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">
              Select Subject
            </label>

            <select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value)
                setMessage('')
                setError('')
              }}
              disabled={loading || classSubjects.length === 0}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50"
            >
              <option value="">Select Subject</option>
              {classSubjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">
              Attendance Date
            </label>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                setMessage('')
                setError('')
              }}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-800">
              Student Attendance
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {selectedClassName && selectedSubjectName
                ? `${selectedClassName} — ${selectedSubjectName}`
                : 'Select a class and subject to continue.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {canManage
                ? 'Mark each student as Present or Absent.'
                : 'View your attendance record.'}
            </p>
          </div>

          {canManage && (
            <button
              onClick={markAllPresent}
              disabled={loading || classStudents.length === 0}
              className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              Mark All Present
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-4">Student ID</th>
                <th className="px-4 py-4">Student Name</th>
                <th className="px-4 py-4">Attendance Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="3" className="px-4 py-8 text-center text-slate-500">
                    Loading attendance...
                  </td>
                </tr>
              ) : classStudents.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 text-slate-600">
                    {student.admission_no}
                  </td>

                  <td className="px-4 py-4 font-medium text-slate-800">
                    {student.full_name}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {canManage ? (
                        <>
                          <button
                            onClick={() => markAttendance(student.id, 'Present')}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                              attendance[student.id] === 'Present'
                                ? 'bg-green-600 text-white'
                                : 'bg-green-50 text-green-700 hover:bg-green-100'
                            }`}
                          >
                            Present
                          </button>

                          <button
                            onClick={() => markAttendance(student.id, 'Absent')}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                              attendance[student.id] === 'Absent'
                                ? 'bg-red-600 text-white'
                                : 'bg-red-50 text-red-700 hover:bg-red-100'
                            }`}
                          >
                            Absent
                          </button>
                        </>
                      ) : (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          attendance[student.id] === 'Present'
                            ? 'bg-green-100 text-green-700'
                            : attendance[student.id] === 'Absent'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {attendance[student.id] || 'Not Marked'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && classStudents.length === 0 && (
                <tr>
                  <td colSpan="3" className="px-4 py-8 text-center text-slate-500">
                    {!selectedClass || !selectedSubject
                      ? 'Select a class and subject first.'
                      : 'No active students found in this class.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium text-slate-600">
              Present Attendance
            </span>
            <span className="font-bold text-slate-800">{percentage}%</span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span>Present: {presentCount}</span>
            <span>Absent: {absentCount}</span>
            <span>Not Marked: {unmarkedCount}</span>
          </div>
        </div>

        {canManage && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={saveAttendance}
              disabled={saving || loading || !selectedSubject}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Attendance'}
            </button>

            <button
              onClick={loadSavedAttendance}
              disabled={loading || !selectedSubject}
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Check Saved Record
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-800">
          Recent Attendance Records
        </h2>

        {savedRecords.length === 0 ? (
          <p className="text-sm text-slate-500">
            No attendance records saved yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Present</th>
                  <th className="px-4 py-3">Absent</th>
                  <th className="px-4 py-3">Percentage</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {savedRecords.map((record) => (
                  <tr key={record.date}>
                    <td className="px-4 py-3">{record.date}</td>
                    <td className="px-4 py-3 text-green-600">
                      {record.present}
                    </td>
                    <td className="px-4 py-3 text-red-600">
                      {record.absent}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {record.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default Attendance
