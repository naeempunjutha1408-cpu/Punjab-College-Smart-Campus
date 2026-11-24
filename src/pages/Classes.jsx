
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Classes() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchClasses()
  }, [])

  async function fetchClasses() {
    setLoading(true)
    setError('')

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        throw new Error('Please login first.')
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      let classQuery = supabase
        .from('classes')
        .select('id, program, part, class_name')
        .order('program')
        .order('part')

      // Admin sees all classes
      if (profile.role === 'admin') {
        // No additional filtering
      }

      // Teacher sees only assigned classes
      else if (profile.role === 'teacher') {
        const { data: teacher, error: teacherError } = await supabase
          .from('teachers')
          .select('teacher_id')
          .eq('profile_id', user.id)
          .eq('status', 'Active')
          .maybeSingle()

        if (teacherError) throw teacherError

        if (!teacher) {
          throw new Error('Your Teacher profile is not properly linked.')
        }

        const { data: assignmentData, error: assignmentError } =
          await supabase
            .from('class_subjects')
            .select('class_id')
            .eq('teacher_id', teacher.teacher_id)

        if (assignmentError) throw assignmentError

        const assignedClassIds = [
          ...new Set((assignmentData || []).map((item) => item.class_id)),
        ]

        if (assignedClassIds.length === 0) {
          setClasses([])
          setStudents([])
          setSelectedClass(null)
          return
        }

        classQuery = classQuery.in('id', assignedClassIds)
      }

      // Student sees only their own enrolled class
      else if (profile.role === 'student') {
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('class_id')
          .eq('profile_id', user.id)
          .eq('status', 'Active')
          .maybeSingle()

        if (studentError) throw studentError

        if (!student || !student.class_id) {
          throw new Error(
            'Your class is not assigned yet. Please contact the Admin.'
          )
        }

        classQuery = classQuery.eq('id', student.class_id)
      } else {
        throw new Error('You are not authorized to access Classes.')
      }

      const { data: classData, error: classError } = await classQuery

      if (classError) throw classError

      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select(
          'id, admission_no, full_name, email, phone, department, semester, status, class_id'
        )
        .eq('status', 'Active')
        .order('full_name')

      if (studentError) throw studentError

      setClasses(classData || [])
      setStudents(studentData || [])
      setSelectedClass(null)
      setSearch('')
    } catch (err) {
      console.error('Classes loading error:', err.message)
      setError(err.message || 'Unable to load classes.')
    } finally {
      setLoading(false)
    }
  }

  const getClassStudents = (classId) =>
    students.filter((student) => student.class_id === classId)

  const filteredStudents = selectedClass
    ? getClassStudents(selectedClass.id).filter((student) =>
        `${student.full_name} ${student.admission_no} ${student.email || ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : []

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading classes...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-700">
        <p className="font-semibold">Unable to load classes</p>
        <p className="mt-1 text-sm">{error}</p>
        <button
          onClick={fetchClasses}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-white"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Classes</h1>
        <p className="mt-1 text-sm text-gray-500">
          View your class and enrolled students.
        </p>
      </div>

      {!selectedClass ? (
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
              No classes assigned to you yet.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button
                onClick={() => {
                  setSelectedClass(null)
                  setSearch('')
                }}
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
              <p className="text-xs text-blue-600">
                Active Students
              </p>
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
                  </tr>
                ))}

                {filteredStudents.length === 0 && (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-5 py-10 text-center text-gray-500"
                    >
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
      )}
    </div>
  )
}
