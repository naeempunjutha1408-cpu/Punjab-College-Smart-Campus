
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const emptyForm = {
  day: 'Monday',
  classId: '',
  classSubjectId: '',
  room: '',
  startTime: '09:00',
  endTime: '10:00',
}

function Timetable() {
  const [classes, setClasses] = useState([])
  const [classSubjects, setClassSubjects] = useState([])
  const [schedule, setSchedule] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [selectedClass, setSelectedClass] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    initializeTimetable()
  }, [])

  async function initializeTimetable() {
    setLoading(true)
    setError('')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

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

    let classData = []
    let subjectData = []

    if (profile.role === 'admin') {
      const [classesResult, subjectsResult] = await Promise.all([
        supabase
          .from('classes')
          .select('id, program, part, class_name')
          .order('program')
          .order('part'),

        supabase
          .from('class_subjects')
          .select('id, class_id, subject_name, teacher_id'),
      ])

      if (classesResult.error || subjectsResult.error) {
        setError(
          classesResult.error?.message ||
          subjectsResult.error?.message
        )
        setLoading(false)
        return
      }

      classData = classesResult.data || []
      subjectData = subjectsResult.data || []
    } else if (profile.role === 'teacher') {
      const { data: teacherId, error: teacherError } =
        await supabase.rpc('current_teacher_id')

      if (teacherError || !teacherId) {
        setError(
          teacherError?.message ||
          'Unable to identify teacher account.'
        )
        setLoading(false)
        return
      }

      const { data: assignedSubjects, error: subjectsError } =
        await supabase
          .from('class_subjects')
          .select('id, class_id, subject_name, teacher_id')
          .eq('teacher_id', teacherId)

      if (subjectsError) {
        setError(subjectsError.message)
        setLoading(false)
        return
      }

      subjectData = assignedSubjects || []

      const classIds = [
        ...new Set(subjectData.map((item) => item.class_id)),
      ]

      if (classIds.length > 0) {
        const { data, error: classesError } = await supabase
          .from('classes')
          .select('id, program, part, class_name')
          .in('id', classIds)
          .order('program')

        if (classesError) {
          setError(classesError.message)
          setLoading(false)
          return
        }

        classData = data || []
      }
    } else if (profile.role === 'student') {
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('class_id')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (studentError || !student?.class_id) {
        setError(
          studentError?.message ||
          'Your student account is not linked to a college class yet.'
        )
        setLoading(false)
        return
      }

      const { data, error: classError } = await supabase
        .from('classes')
        .select('id, program, part, class_name')
        .eq('id', student.class_id)
        .single()

      if (classError) {
        setError(classError.message)
        setLoading(false)
        return
      }

      classData = data ? [data] : []
    }

    const { data: scheduleData, error: scheduleError } =
      await supabase
        .from('timetable')
        .select(`
          id,
          day,
          class_id,
          class_subject_id,
          semester,
          subject,
          teacher_id,
          room,
          start_time,
          end_time,
          teachers (
            full_name,
            teacher_id
          )
        `)

    if (scheduleError) {
      setError(scheduleError.message)
      setLoading(false)
      return
    }

    setClasses(classData)
    setClassSubjects(subjectData)
    setSchedule(scheduleData || [])
    setLoading(false)
  }

  const availableSubjects = classSubjects.filter(
    (item) => item.class_id === form.classId
  )

  const selectedSubject = classSubjects.find(
    (item) => item.id === form.classSubjectId
  )

  function resetForm() {
    setForm({
      ...emptyForm,
      classId: selectedClass?.id || '',
    })
    setEditingId(null)
  }

  function getClassSchedule(classId) {
    return schedule.filter((item) => item.class_id === classId)
  }

  function getPeriods(classId) {
    const periods = getClassSchedule(classId).map((item) => ({
      start: item.start_time.slice(0, 5),
      end: item.end_time.slice(0, 5),
    }))

    const uniquePeriods = [
      ...new Map(
        periods.map((period) => [
          `${period.start}-${period.end}`,
          period,
        ])
      ).values(),
    ]

    return uniquePeriods.sort((a, b) =>
      a.start.localeCompare(b.start)
    )
  }

  function getPeriodEntry(classId, day, period) {
    return schedule.find(
      (item) =>
        item.class_id === classId &&
        item.day === day &&
        item.start_time.slice(0, 5) === period.start &&
        item.end_time.slice(0, 5) === period.end
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (
      !form.classId ||
      !form.classSubjectId ||
      !form.room.trim() ||
      !form.startTime ||
      !form.endTime ||
      form.endTime <= form.startTime
    ) {
      setError('Please enter valid timetable details.')
      return
    }

    if (!selectedSubject?.teacher_id) {
      setError('This subject does not have an assigned teacher.')
      return
    }

    const teacher = await supabase
      .from('teachers')
      .select('id')
      .eq('teacher_id', selectedSubject.teacher_id)
      .single()

    if (teacher.error || !teacher.data) {
      setError(
        teacher.error?.message ||
        'Unable to find the assigned teacher.'
      )
      return
    }

    const hasConflict = schedule.some((item) => {
      if (item.id === editingId) return false

      const sameDay = item.day === form.day

      const overlaps =
        form.startTime < item.end_time &&
        form.endTime > item.start_time

      const sameClass =
        item.class_id === form.classId

      const sameRoom =
        item.room.trim().toLowerCase() ===
        form.room.trim().toLowerCase()

      const sameTeacher =
        item.teacher_id === teacher.data.id

      return (
        sameDay &&
        overlaps &&
        (sameClass || sameRoom || sameTeacher)
      )
    })

    if (hasConflict) {
      setError(
        'Schedule conflict! The class, room or teacher already has a booking at this time.'
      )
      return
    }

    setSaving(true)

    const timetableData = {
      day: form.day,
      class_id: form.classId,
      class_subject_id: form.classSubjectId,
      room: form.room.trim(),
      start_time: form.startTime,
      end_time: form.endTime,
    }

    const result = editingId
      ? await supabase
          .from('timetable')
          .update(timetableData)
          .eq('id', editingId)
      : await supabase
          .from('timetable')
          .insert([timetableData])

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setMessage(
      editingId
        ? 'Timetable period updated successfully.'
        : 'Timetable period added successfully.'
    )

    resetForm()
    await initializeTimetable()
    setSaving(false)
  }

  function handleEdit(item) {
    setForm({
      day: item.day,
      classId: item.class_id,
      classSubjectId: item.class_subject_id,
      room: item.room,
      startTime: item.start_time.slice(0, 5),
      endTime: item.end_time.slice(0, 5),
    })

    setEditingId(item.id)
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (
      !window.confirm(
        'Are you sure you want to delete this timetable period?'
      )
    ) {
      return
    }

    setError('')
    setMessage('')

    const { error: deleteError } = await supabase
      .from('timetable')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setMessage('Timetable period deleted successfully.')
    await initializeTimetable()
  }

  function openClass(classItem) {
    setSelectedClass(classItem)
    setForm({
      ...emptyForm,
      classId: classItem.id,
    })
    setEditingId(null)
    setError('')
    setMessage('')
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading timetable...
      </div>
    )
  }

  if (error && classes.length === 0) {
    return (
      <div className="space-y-4 p-6">
        <div className="rounded-xl bg-red-50 p-5 text-red-700">
          <p className="font-semibold">Unable to load timetable</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>

        <button
          onClick={initializeTimetable}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-white"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Weekly Timetable
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          View and manage weekly class schedules.
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {classes.map((classItem) => {
            const count = getClassSchedule(classItem.id).length

            return (
              <button
                key={classItem.id}
                onClick={() => openClass(classItem)}
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
                    Scheduled Periods
                  </p>
                </div>

                <p className="mt-4 text-sm font-medium text-blue-600">
                  View Weekly Timetable →
                </p>
              </button>
            )
          })}

          {classes.length === 0 && (
            <p className="rounded-xl bg-white p-6 text-center text-slate-500">
              No assigned classes found.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button
                onClick={() => {
                  setSelectedClass(null)
                  setEditingId(null)
                  setError('')
                  setMessage('')
                }}
                className="mb-3 text-sm font-medium text-blue-600 hover:underline"
              >
                ← Back to Classes
              </button>

              <h2 className="text-xl font-bold text-slate-800">
                {selectedClass.class_name}
              </h2>

              <p className="text-sm text-slate-500">
                {selectedClass.program} · Part {selectedClass.part}
              </p>
            </div>

            <button
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Print Timetable
            </button>
          </div>

          {role === 'admin' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-5 text-lg font-bold text-slate-800">
                {editingId ? 'Edit Period' : 'Add New Period'}
              </h3>

              <form
                onSubmit={handleSubmit}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Day
                  </label>
                  <select
                    value={form.day}
                    onChange={(e) =>
                      setForm({ ...form, day: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {days.map((day) => (
                      <option key={day}>{day}</option>
                    ))}
                  </select>
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
                    Assigned Teacher
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {selectedSubject
                      ? selectedSubject.teacher_id
                        ? 'Teacher assigned'
                        : 'No teacher assigned'
                      : 'Select a subject first'}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Classroom / Lab
                  </label>
                  <input
                    required
                    value={form.room}
                    onChange={(e) =>
                      setForm({ ...form, room: e.target.value })
                    }
                    placeholder="e.g. Room 101"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Start Time
                  </label>
                  <input
                    required
                    type="time"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm({ ...form, startTime: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    End Time
                  </label>
                  <input
                    required
                    type="time"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm({ ...form, endTime: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving
                      ? 'Saving...'
                      : editingId
                        ? 'Update Period'
                        : 'Add Period'}
                  </button>

                  {editingId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <p className="mt-3 text-xs text-slate-500">
                Subject and teacher are taken from the existing teacher assignment.
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="font-bold text-slate-800">
                Weekly Class Timetable
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Monday to Saturday
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-center text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-700 px-3 py-4">
                      Time
                    </th>
                    {days.map((day) => (
                      <th
                        key={day}
                        className="border border-slate-700 px-3 py-4"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {getPeriods(selectedClass.id).map((period) => (
                    <tr key={`${period.start}-${period.end}`}>
                      <td className="border border-slate-200 bg-slate-50 px-3 py-4 font-semibold text-slate-700">
                        <div>{period.start}</div>
                        <div className="text-xs font-normal text-slate-500">
                          to {period.end}
                        </div>
                      </td>

                      {days.map((day) => {
                        const item = getPeriodEntry(
                          selectedClass.id,
                          day,
                          period
                        )

                        return (
                          <td
                            key={day}
                            className="border border-slate-200 p-2 align-middle"
                          >
                            {item ? (
                              <div className="min-h-[95px] rounded-lg bg-blue-50 p-3 text-left">
                                <p className="font-bold text-blue-800">
                                  {item.subject}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  {item.teachers?.full_name || 'Teacher'}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {item.room}
                                </p>

                                {role === 'admin' && (
                                  <div className="mt-3 flex gap-3 text-xs">
                                    <button
                                      onClick={() => handleEdit(item)}
                                      className="font-medium text-blue-600 hover:underline"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDelete(item.id)}
                                      className="font-medium text-red-600 hover:underline"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="min-h-[95px] flex items-center justify-center text-slate-300">
                                —
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  {getPeriods(selectedClass.id).length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12 text-center text-slate-500"
                      >
                        No periods have been added to this class timetable yet.
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

export default Timetable
