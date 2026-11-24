
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function getStatus(totalFee, paidAmount) {
  if (paidAmount >= totalFee) return 'Paid'
  if (paidAmount > 0) return 'Partial'
  return 'Unpaid'
}

function Fees() {
  const [role, setRole] = useState('')
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [fees, setFees] = useState([])

  const [selectedClass, setSelectedClass] = useState(null)
  const [selectedStudent, setSelectedStudent] = useState(null)

  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    totalFee: '',
    paidAmount: '0',
    paymentDate: '',
  })

  useEffect(() => {
    initializeFees()
  }, [])

  async function initializeFees(showLoading = true) {
    if (showLoading) setLoading(true)
    setError('')

    try {
      const { data: { user }, error: userError } =
        await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('Unable to identify logged-in user.')
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      setRole(profile.role)

      if (profile.role !== 'admin') {
        setLoading(false)
        return
      }

      const [classesResult, studentsResult, feesResult] =
        await Promise.all([
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
            .from('fees')
            .select(`
              id,
              student_id,
              total_fee,
              paid_amount,
              payment_date,
              created_at,
              students (
                full_name,
                admission_no,
                department
              )
            `)
            .order('created_at', { ascending: false }),
        ])

      if (classesResult.error) throw classesResult.error
      if (studentsResult.error) throw studentsResult.error
      if (feesResult.error) throw feesResult.error

      setClasses(classesResult.data || [])
      setStudents(studentsResult.data || [])
      setFees(feesResult.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const remainingBalance = Math.max(
    0,
    Number(form.totalFee || 0) - Number(form.paidAmount || 0)
  )

  const totalCollection = fees.reduce(
    (sum, fee) => sum + Number(fee.paid_amount),
    0
  )

  const totalOutstanding = fees.reduce(
    (sum, fee) =>
      sum + Math.max(0, Number(fee.total_fee) - Number(fee.paid_amount)),
    0
  )

  const getClassStudents = (classId) =>
    students.filter((student) => student.class_id === classId)

  const filteredStudents = selectedClass
    ? getClassStudents(selectedClass.id).filter((student) =>
        `${student.full_name} ${student.admission_no} ${student.email || ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : []

  const studentFees = selectedStudent
    ? fees.filter((fee) => fee.student_id === selectedStudent.id)
    : []

  function resetForm() {
    setForm({
      totalFee: '',
      paidAmount: '0',
      paymentDate: '',
    })
    setEditingId(null)
    setError('')
  }

  function openStudent(student) {
    setSelectedStudent(student)
    setSearch('')
    setError('')
    setMessage('')
    resetForm()
  }

  function backToClasses() {
    setSelectedClass(null)
    setSelectedStudent(null)
    setSearch('')
    setMessage('')
    resetForm()
  }

  function backToStudents() {
    setSelectedStudent(null)
    setMessage('')
    resetForm()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    const total = Number(form.totalFee)
    const paid = Number(form.paidAmount)

    if (
      !selectedStudent ||
      !Number.isFinite(total) ||
      total <= 0 ||
      !Number.isFinite(paid) ||
      paid < 0 ||
      paid > total
    ) {
      setError(
        'Please enter valid fee details. Paid amount cannot exceed total fee.'
      )
      return
    }

    setSaving(true)

    const feeData = {
      student_id: selectedStudent.id,
      total_fee: total,
      paid_amount: paid,
      payment_date: form.paymentDate || null,
    }

    const result = editingId
      ? await supabase
          .from('fees')
          .update(feeData)
          .eq('id', editingId)
      : await supabase
          .from('fees')
          .insert([feeData])

    if (result.error) {
      setError(
        result.error.code === '23505'
          ? 'This student already has a fee record. Please edit the existing record.'
          : result.error.message
      )
      setSaving(false)
      return
    }

    setMessage(
      editingId
        ? 'Fee record updated successfully.'
        : 'Fee record added successfully.'
    )

    resetForm()
    await initializeFees(false)
    setSaving(false)
  }

  function handleEdit(fee) {
    setForm({
      totalFee: String(fee.total_fee),
      paidAmount: String(fee.paid_amount),
      paymentDate: fee.payment_date || '',
    })

    setEditingId(fee.id)
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (
      !window.confirm('Are you sure you want to delete this fee record?')
    ) {
      return
    }

    setError('')
    setMessage('')

    const { error } = await supabase
      .from('fees')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage('Fee record deleted successfully.')
    await initializeFees(false)
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading fee management...
      </div>
    )
  }

  if (role === 'student') {
    return (
      <div className="space-y-4 p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-800">
          My Fee Details
        </h1>
        <p className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-800">
          Student login and account linking are not implemented yet.
          Your personal fee details will appear here after your account
          is connected to your student record.
        </p>
      </div>
    )
  }

  if (role !== 'admin') {
    return (
      <div className="rounded-xl bg-slate-50 p-8 text-center text-slate-600">
        Fee Management is available to Admin only.
      </div>
    )
  }

  if (error && classes.length === 0 && students.length === 0) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-700">
        <p className="font-semibold">Unable to load Fee Management</p>
        <p className="mt-1 text-sm">{error}</p>
        <button
          onClick={() => initializeFees()}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-white"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-7 p-5 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Fee Management
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage student fees, payments and outstanding balances.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            Students with Fee Records
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-800">
            {fees.length}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Collection</p>
          <h2 className="mt-2 text-2xl font-bold text-green-600">
            Rs. {totalCollection.toLocaleString()}
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Outstanding Balance</p>
          <h2 className="mt-2 text-2xl font-bold text-red-600">
            Rs. {totalOutstanding.toLocaleString()}
          </h2>
        </div>
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

      {!selectedClass ? (
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

                  <span className="rounded-lg bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                    Part {classItem.part}
                  </span>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="text-2xl font-bold text-slate-800">
                    {count}
                  </p>
                  <p className="text-sm text-slate-500">
                    Active Students
                  </p>
                </div>

                <p className="mt-4 text-sm font-medium text-blue-600">
                  View Students →
                </p>
              </button>
            )
          })}

          {classes.length === 0 && (
            <p className="rounded-xl bg-white p-6 text-center text-slate-500">
              No classes found.
            </p>
          )}
        </div>
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

              <h2 className="text-xl font-bold text-slate-800">
                {selectedClass.class_name}
              </h2>

              <p className="text-sm text-slate-500">
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

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, admission number or email..."
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-4">Admission No.</th>
                  <th className="px-5 py-4">Student Name</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Phone</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-700">
                      {student.admission_no}
                    </td>
                    <td className="px-5 py-4 text-slate-800">
                      {student.full_name}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {student.email || '—'}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {student.phone || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => openStudent(student)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Manage Fees →
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-5 py-10 text-center text-slate-500">
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
        <div className="space-y-6">
          <div>
            <button
              onClick={backToStudents}
              className="mb-3 text-sm font-medium text-blue-600 hover:underline"
            >
              ← Back to Students
            </button>

            <h2 className="text-xl font-bold text-slate-800">
              {selectedStudent.full_name}
            </h2>

            <p className="text-sm text-slate-500">
              {selectedStudent.admission_no} · {selectedClass.class_name}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-5 text-lg font-bold text-slate-800">
              {editingId ? 'Edit Fee Record' : 'Add Fee Record'}
            </h2>

            {studentFees.length === 0 && !editingId ? (
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Total Fee (Rs.)
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={form.totalFee}
                    onChange={(e) =>
                      setForm({ ...form, totalFee: e.target.value })
                    }
                    placeholder="Enter total fee"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Paid Amount (Rs.)
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    max={form.totalFee || undefined}
                    value={form.paidAmount}
                    onChange={(e) =>
                      setForm({ ...form, paidAmount: e.target.value })
                    }
                    placeholder="Enter paid amount"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) =>
                      setForm({ ...form, paymentDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>

                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm text-slate-500">Remaining Balance</p>
                  <p className="text-xl font-bold text-blue-700">
                    Rs. {remainingBalance.toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">Payment Status</p>
                  <p className="font-bold text-blue-700">
                    {Number(form.totalFee) > 0
                      ? getStatus(Number(form.totalFee), Number(form.paidAmount))
                      : 'Not Set'}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Fee'}
                  </button>
                </div>
              </form>
            ) : editingId ? (
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Total Fee (Rs.)
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={form.totalFee}
                    onChange={(e) =>
                      setForm({ ...form, totalFee: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Paid Amount (Rs.)
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    max={form.totalFee || undefined}
                    value={form.paidAmount}
                    onChange={(e) =>
                      setForm({ ...form, paidAmount: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) =>
                      setForm({ ...form, paymentDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>

                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm text-slate-500">Remaining Balance</p>
                  <p className="text-xl font-bold text-blue-700">
                    Rs. {remainingBalance.toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">Payment Status</p>
                  <p className="font-bold text-blue-700">
                    {Number(form.totalFee) > 0
                      ? getStatus(Number(form.totalFee), Number(form.paidAmount))
                      : 'Not Set'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Update Fee'}
                  </button>

                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {studentFees.length > 0 && !editingId && (
              <p className="text-sm text-slate-500">
                This student already has a fee record. Use Edit below to update it.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-5 text-lg font-bold text-slate-800">
              Student Fee Details
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-600">
                    <th className="p-3">Total Fee</th>
                    <th className="p-3">Paid</th>
                    <th className="p-3">Remaining</th>
                    <th className="p-3">Payment Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {studentFees.map((fee) => {
                    const total = Number(fee.total_fee)
                    const paid = Number(fee.paid_amount)
                    const remaining = Math.max(0, total - paid)
                    const status = getStatus(total, paid)

                    return (
                      <tr key={fee.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">Rs. {total.toLocaleString()}</td>
                        <td className="p-3">Rs. {paid.toLocaleString()}</td>
                        <td className="p-3">Rs. {remaining.toLocaleString()}</td>
                        <td className="p-3">{fee.payment_date || '—'}</td>
                        <td className="p-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            status === 'Paid'
                              ? 'bg-green-100 text-green-700'
                              : status === 'Partial'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {status}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(fee)}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(fee.id)}
                              className="font-medium text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}

                  {studentFees.length === 0 && (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-500">
                        No fee record found for this student.
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

export default Fees
