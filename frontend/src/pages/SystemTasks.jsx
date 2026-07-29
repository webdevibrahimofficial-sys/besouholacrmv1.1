import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@shared/context/ThemeProvider'
import { useAppState } from '@shared/context/AppStateProvider'
import { api } from '../utils/api'
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Eye,
  Filter,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

const STORAGE_KEY = 'super-admin-platform-tasks'

const STATUS_OPTIONS = ['todo', 'in_progress', 'done']
const PRIORITY_OPTIONS = ['low', 'medium', 'high']
const EMPTY_FORM = {
  title: '',
  description: '',
  category: '',
  assignedTo: '',
  dueDate: '',
  priority: 'medium',
}

const seedTasks = [
  {
    id: 'platform-task-1',
    title: 'Review backup retention policy',
    description: 'Validate landlord and tenant backup windows before the next release cycle.',
    category: 'Operations',
    priority: 'high',
    status: 'todo',
    dueDate: '',
    createdAt: new Date().toISOString(),
    comments: [],
    dueDateRequest: null,
  },
  {
    id: 'platform-task-2',
    title: 'Prepare audit log QA checklist',
    description: 'Document verification steps for export, filters, and pagination.',
    category: 'Compliance',
    priority: 'medium',
    status: 'in_progress',
    dueDate: '',
    createdAt: new Date().toISOString(),
    comments: [],
    dueDateRequest: null,
  },
]

function formatDateLabel(value) {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function priorityTone(priority, isDark) {
  if (priority === 'high') return isDark ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700'
  if (priority === 'low') return isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
  return isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'
}

function statusTone(status, isDark) {
  if (status === 'done') return isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
  if (status === 'in_progress') return isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'
  return isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
}

function labelize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function isDueDateApprover(user) {
  const roles = [
    ...(Array.isArray(user?.roles) ? user.roles.map((role) => role?.name || role) : []),
    user?.role,
    user?.job_title,
  ]
    .filter(Boolean)
    .map((role) => String(role).trim().toLowerCase())

  return roles.some((role) => ['system admin', 'super admin'].includes(role))
}

function TaskModal({ isOpen, mode, initialTask, onClose, onSave, isDark, t, categories, assigneeOptions }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setForm(EMPTY_FORM)
      setError('')
      return
    }

    if (mode === 'edit' && initialTask) {
      setForm({
        title: initialTask.title || '',
        description: initialTask.description || '',
        category: initialTask.category || '',
        assignedTo: initialTask.assignedTo ? String(initialTask.assignedTo) : '',
        dueDate: initialTask.dueDate || '',
        priority: initialTask.priority || 'medium',
      })
      setError('')
      return
    }

    setForm(EMPTY_FORM)
    setError('')
  }, [initialTask, isOpen, mode])

  if (!isOpen) return null

  const inputClass = `h-11 w-full rounded-2xl border px-4 text-sm outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
  }`

  const textAreaClass = `min-h-[120px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
  }`

  const handleSubmit = () => {
    if (!form.title.trim()) {
      setError(t('Task title is required.'))
      return
    }
    if (!form.category.trim()) {
      setError(t('Task category is required.'))
      return
    }

    onSave({
      id: initialTask?.id || `platform-task-${Date.now()}`,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      assignedTo: form.assignedTo,
      assignedToName: assigneeOptions.find((user) => String(user.id) === String(form.assignedTo))?.name || '',
      dueDate: form.dueDate,
      priority: form.priority,
      status: initialTask?.status || 'todo',
      createdAt: initialTask?.createdAt || new Date().toISOString(),
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center px-4 py-5">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />

      <div
        className={`relative z-10 flex w-full max-w-[760px] max-h-[88vh] flex-col overflow-hidden rounded-[28px] border shadow-[0_30px_90px_rgba(0,0,0,0.35)] ${
          isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className={`flex items-start justify-between border-b px-5 py-4 ${
          isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'
        }`}>
          <div>
            <p className={`text-xs uppercase tracking-[0.24em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('Platform Tasks')}
            </p>
            <h2 className="mt-2 text-xl font-bold md:text-2xl">{t(mode === 'edit' ? 'Edit Task' : 'Add Task')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-2xl p-2 transition ${
              isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Task Title')}
              </label>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={t('Example: Review super admin access policy')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Category')}
              </label>
              <select
                value={form.category}
                onChange={(event) => {
                  setForm((current) => ({ ...current, category: event.target.value }))
                  setError('')
                }}
                className={inputClass}
              >
                <option value="">
                  {categories.length ? t('Select category') : t('No categories available')}
                </option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {t(category)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Assigned User')}
              </label>
              <select
                value={form.assignedTo}
                onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value }))}
                className={inputClass}
              >
                <option value="">{t('Unassigned')}</option>
                {assigneeOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Due Date')}
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Priority')}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {PRIORITY_OPTIONS.map((priority) => {
                  const active = form.priority === priority
                  return (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, priority }))}
                      className={`rounded-2xl border px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? isDark
                            ? 'border-blue-500/50 bg-blue-950/40 text-blue-200'
                            : 'border-blue-300 bg-blue-50 text-blue-700'
                          : isDark
                            ? 'border-slate-700 bg-slate-950/80 text-slate-300 hover:border-slate-600'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {t(labelize(priority))}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {t('Description')}
              </label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder={t('Add context, owner notes, or rollout checklist...')}
                className={textAreaClass}
              />
            </div>
          </div>

          {error && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${
              isDark ? 'border-rose-900/50 bg-rose-950/30 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
              {error}
            </div>
          )}
        </div>

        <div className={`flex items-center justify-end gap-3 border-t px-5 py-4 ${
          isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
              isDark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/25 transition-colors hover:bg-blue-700"
          >
            {t(mode === 'edit' ? 'Save Changes' : 'Create Task')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function TaskPreviewModal({
  isOpen,
  task,
  onClose,
  onSaveComment,
  onRequestDueDateChange,
  onResolveDueDateRequest,
  currentUser,
  isDark,
  t,
}) {
  const [comment, setComment] = useState('')
  const [requestedDueDate, setRequestedDueDate] = useState('')
  const [requestReason, setRequestReason] = useState('')
  const [reviewNote, setReviewNote] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setComment('')
      setRequestedDueDate('')
      setRequestReason('')
      setReviewNote('')
    }
  }, [isOpen, task?.id])

  if (!isOpen || !task) return null

  const comments = Array.isArray(task.comments) ? task.comments : []
  const dueDateRequest = task.dueDateRequest || null
  const canApproveRequest = isDueDateApprover(currentUser)
  const isAssignedUserForRequest =
    String(task.assignedTo || '') === String(currentUser?.id || '') ||
    String(task.assignedToName || '').trim().toLowerCase() === String(currentUser?.name || '').trim().toLowerCase()
  const canRequestDueDateChange = !!currentUser && isAssignedUserForRequest

  const handleSubmit = () => {
    const value = comment.trim()
    if (!value) return
    onSaveComment(task.id, {
      id: `task-comment-${Date.now()}`,
      text: value,
      author: currentUser?.name || currentUser?.email || t('Admin User'),
      createdAt: new Date().toISOString(),
    })
    setComment('')
  }

  const requestTone = dueDateRequest?.status === 'approved'
    ? (isDark ? 'bg-emerald-950/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700')
    : dueDateRequest?.status === 'rejected'
      ? (isDark ? 'bg-rose-950/40 text-rose-300' : 'bg-rose-100 text-rose-700')
      : (isDark ? 'bg-amber-950/40 text-amber-300' : 'bg-amber-100 text-amber-700')

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4 py-5">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />

      <div
        className={`relative z-10 flex w-full max-w-[820px] max-h-[88vh] flex-col overflow-hidden rounded-[28px] border shadow-[0_30px_90px_rgba(0,0,0,0.35)] ${
          isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className={`flex items-start justify-between border-b px-5 py-4 ${
          isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'
        }`}>
          <div>
            <p className={`text-xs uppercase tracking-[0.24em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('Task Preview')}
            </p>
            <h2 className="mt-2 text-xl font-bold md:text-2xl">{task.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-2xl p-2 transition ${
              isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={`rounded-3xl border p-4 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50/90'}`}>
                <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Category')}</p>
                <p className="mt-2 text-base font-semibold">{task.category || t('General')}</p>
              </div>
              <div className={`rounded-3xl border p-4 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50/90'}`}>
                <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Assigned User')}</p>
                <p className="mt-2 text-base font-semibold">{task.assignedToName || t('Unassigned')}</p>
              </div>
              <div className={`rounded-3xl border p-4 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50/90'}`}>
                <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Due Date')}</p>
                <p className="mt-2 text-base font-semibold">{formatDateLabel(task.dueDate)}</p>
              </div>
              <div className={`rounded-3xl border p-4 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50/90'}`}>
                <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Status')}</p>
                <p className="mt-2 text-base font-semibold">{t(labelize(task.status))}</p>
              </div>
            </div>

            <div className={`rounded-3xl border p-5 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50/90'}`}>
              <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Description')}</p>
              <p className={`mt-3 whitespace-pre-wrap text-sm leading-7 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {task.description || t('No description provided.')}
              </p>
            </div>

            <div className={`rounded-3xl border p-5 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50/90'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t('Due Date Change')}</p>
                  <p className="mt-2 text-base font-semibold">{formatDateLabel(task.dueDate)}</p>
                </div>
                {dueDateRequest?.status && (
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${requestTone}`}>
                    {t(labelize(dueDateRequest.status))}
                  </span>
                )}
              </div>

              {dueDateRequest && (
                <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-slate-800 bg-slate-900/70 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>
                  <p>
                    <span className="font-semibold">{t('Requested date')}:</span> {formatDateLabel(dueDateRequest.requestedDueDate)}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold">{t('Requested by')}:</span> {dueDateRequest.requestedBy}
                  </p>
                  {dueDateRequest.reason && (
                    <p className="mt-1 whitespace-pre-wrap">
                      <span className="font-semibold">{t('Reason')}:</span> {dueDateRequest.reason}
                    </p>
                  )}
                  {dueDateRequest.reviewNote && (
                    <p className="mt-1 whitespace-pre-wrap">
                      <span className="font-semibold">{t('Review note')}:</span> {dueDateRequest.reviewNote}
                    </p>
                  )}
                </div>
              )}

              {canRequestDueDateChange && dueDateRequest?.status !== 'pending' && (
                <div className="mt-4 space-y-3">
                  <input
                    type="date"
                    value={requestedDueDate}
                    onChange={(event) => setRequestedDueDate(event.target.value)}
                    className={`h-11 w-full rounded-2xl border px-4 text-sm outline-none transition focus:border-blue-400 ${
                      isDark
                        ? 'border-slate-700/60 bg-slate-950/80 text-slate-100'
                        : 'border-slate-200/80 bg-white/90 text-slate-700'
                    }`}
                  />
                  <textarea
                    value={requestReason}
                    onChange={(event) => setRequestReason(event.target.value)}
                    placeholder={t('Why should the due date change?')}
                    className={`min-h-[88px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:border-blue-400 ${
                      isDark
                        ? 'border-slate-700/60 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
                        : 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={!requestedDueDate}
                    onClick={() => {
                      if (!requestedDueDate) return
                      onRequestDueDateChange?.(task.id, {
                        requestedDueDate,
                        reason: requestReason.trim(),
                        requestedBy: currentUser?.name || currentUser?.email || t('Admin User'),
                        requestedById: currentUser?.id || null,
                        requestedAt: new Date().toISOString(),
                        status: 'pending',
                        reviewNote: '',
                        reviewedBy: '',
                        reviewedAt: '',
                      })
                      setRequestedDueDate('')
                      setRequestReason('')
                    }}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/25 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('Request Due Date Change')}
                  </button>
                </div>
              )}

              {canApproveRequest && dueDateRequest?.status === 'pending' && (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder={t('Optional note for approval or rejection')}
                    className={`min-h-[88px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:border-blue-400 ${
                      isDark
                        ? 'border-slate-700/60 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
                        : 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
                    }`}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onResolveDueDateRequest?.(task.id, 'approved', {
                          reviewNote: reviewNote.trim(),
                          reviewedBy: currentUser?.name || currentUser?.email || t('Admin User'),
                          reviewedAt: new Date().toISOString(),
                        })
                      }
                      className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      {t('Approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onResolveDueDateRequest?.(task.id, 'rejected', {
                          reviewNote: reviewNote.trim(),
                          reviewedBy: currentUser?.name || currentUser?.email || t('Admin User'),
                          reviewedAt: new Date().toISOString(),
                        })
                      }
                      className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700"
                    >
                      {t('Reject')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={`flex min-h-0 flex-col border-t px-5 py-5 lg:border-l lg:border-t-0 ${
            isDark ? 'border-slate-800 bg-slate-950/55' : 'border-slate-200 bg-slate-50/70'
          }`}>
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className={isDark ? 'text-slate-300' : 'text-slate-600'} />
              <h3 className="text-base font-semibold">{t('Comments')}</h3>
            </div>

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${
                  isDark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'
                }`}>
                  {t('No comments yet.')}
                </div>
              ) : (
                comments.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl border px-4 py-3 ${
                      isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{item.author}</p>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {formatDateLabel(item.createdAt)}
                      </p>
                    </div>
                    <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {item.text}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 space-y-3">
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t('Write a comment...')}
                className={`min-h-[96px] w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:border-blue-400 ${
                  isDark
                    ? 'border-slate-700/60 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
                    : 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
                }`}
              />
              <div className="flex items-center justify-between gap-3">
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('Commenting as')} {currentUser?.name || currentUser?.email || t('Admin User')}
                </p>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!comment.trim()}
                  className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/25 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('Add Comment')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function SystemTasks() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { user } = useAppState()
  const isDark = resolvedTheme === 'dark'
  const [tasks, setTasks] = useState([])
  const [hydrated, setHydrated] = useState(false)
  const [categories, setCategories] = useState([])
  const [assigneeOptions, setAssigneeOptions] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(6)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)

  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark
      ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
      : 'border-slate-200/75 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
  }`

  const inputClass = `h-11 w-full rounded-2xl border px-4 text-sm outline-none transition focus:border-blue-400 ${
    isDark
      ? 'border-slate-700/60 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-200/80 bg-white/90 text-slate-700 placeholder:text-slate-400'
  }`
  const labelClass = isDark ? 'text-xs font-semibold text-slate-200' : 'text-xs font-semibold text-slate-900'
  const headingClass = isDark ? 'text-white' : 'text-slate-950'
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const filterIconClass = isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-600'
  const filterBtnClass = isDark
    ? 'bg-blue-950/40 text-blue-300 hover:bg-blue-950/60'
    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data } = await api.get('/api/super-admin/task-categories')
        const names = (data?.categories || [])
          .filter((category) => category?.is_active !== false)
          .map((category) => category?.name)
          .filter(Boolean)
        setCategories(names)
      } catch (error) {
        console.error('Failed to load task categories:', error)
        setCategories([])
      }
    }

    loadCategories()
  }, [])

  useEffect(() => {
    const loadAssignees = async () => {
      try {
        const { data } = await api.get('/super-admin/admin-users', {
          params: { per_page: 100 },
        })
        const users = Array.isArray(data?.users?.data) ? data.users.data : []
        setAssigneeOptions(
          users.map((user) => ({
            id: user.id,
            name: user.name || user.email || `User #${user.id}`,
          }))
        )
      } catch (error) {
        console.error('Failed to load task assignees:', error)
        setAssigneeOptions([])
      }
    }

    loadAssignees()
  }, [])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : null
      setTasks(Array.isArray(parsed) && parsed.length ? parsed : seedTasks)
    } catch {
      setTasks(seedTasks)
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [hydrated, tasks])

  useEffect(() => {
    if (!selectedTask) return
    const nextSelectedTask = tasks.find((task) => task.id === selectedTask.id) || null
    setSelectedTask(nextSelectedTask)
  }, [selectedTask?.id, tasks])

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        !search ||
        [task.title, task.description, task.category]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())

      const matchesStatus = statusFilter === 'all' || task.status === statusFilter
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
      const matchesCategory = categoryFilter === 'all' || task.category === categoryFilter
      const matchesAssignee =
        assigneeFilter === 'all' ||
        (assigneeFilter === 'unassigned' && !task.assignedTo) ||
        String(task.assignedTo || '') === String(assigneeFilter)

      const taskDue = task.dueDate ? String(task.dueDate).slice(0, 10) : ''
      const matchesDueFrom = !dueFrom || (taskDue && taskDue >= dueFrom)
      const matchesDueTo = !dueTo || (taskDue && taskDue <= dueTo)

      return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssignee && matchesDueFrom && matchesDueTo
    })
  }, [assigneeFilter, categoryFilter, dueFrom, dueTo, priorityFilter, search, statusFilter, tasks])

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / perPage))
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * perPage
    return filteredTasks.slice(startIndex, startIndex + perPage)
  }, [currentPage, filteredTasks, perPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, priorityFilter, categoryFilter, assigneeFilter, dueFrom, dueTo])

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  const stats = useMemo(() => {
    const todo = tasks.filter((task) => task.status === 'todo').length
    const inProgress = tasks.filter((task) => task.status === 'in_progress').length
    const done = tasks.filter((task) => task.status === 'done').length

    return [
      {
        key: 'total',
        label: 'All Tasks',
        value: tasks.length,
        note: 'Platform work queue',
        icon: ClipboardList,
        tone: 'from-blue-500/20 to-cyan-400/10',
      },
      {
        key: 'todo',
        label: 'To Do',
        value: todo,
        note: 'Pending admin actions',
        icon: Clock3,
        tone: 'from-amber-500/20 to-orange-400/10',
      },
      {
        key: 'done',
        label: 'Completed',
        value: done,
        note: 'Closed platform tasks',
        icon: CheckCircle2,
        tone: 'from-emerald-500/20 to-teal-400/10',
      },
      {
        key: 'security',
        label: 'In Progress',
        value: inProgress,
        note: 'Active execution now',
        icon: ShieldCheck,
        tone: 'from-violet-500/20 to-indigo-400/10',
      },
    ]
  }, [tasks])

  const addTask = (task) => {
    setTasks((current) => [{
      ...task,
      comments: Array.isArray(task.comments) ? task.comments : [],
      dueDateRequest: task.dueDateRequest || null,
    }, ...current])
    setShowCreateModal(false)
    setEditingTask(null)
    setCurrentPage(1)
  }

  const saveTask = (task) => {
    if (editingTask) {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                ...task,
                comments: Array.isArray(item.comments) ? item.comments : [],
                dueDateRequest: item.dueDateRequest || task.dueDateRequest || null,
              }
            : item
        )
      )
      setShowCreateModal(false)
      setEditingTask(null)
      return
    }

    addTask(task)
  }

  const openEditTask = (task) => {
    setEditingTask(task)
    setShowCreateModal(true)
  }

  const openPreviewTask = (task) => {
    setSelectedTask(task)
  }

  const saveTaskComment = (taskId, comment) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              comments: [...(Array.isArray(task.comments) ? task.comments : []), comment],
            }
          : task
      )
    )

    setSelectedTask((current) =>
      current && current.id === taskId
        ? {
            ...current,
            comments: [...(Array.isArray(current.comments) ? current.comments : []), comment],
          }
        : current
    )
  }

  const requestTaskDueDateChange = (taskId, request) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              dueDateRequest: request,
            }
          : task
      )
    )

    setSelectedTask((current) =>
      current && current.id === taskId
        ? {
            ...current,
            dueDateRequest: request,
          }
        : current
    )
  }

  const resolveTaskDueDateRequest = (taskId, status, review) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId || !task.dueDateRequest) return task

        const nextRequest = {
          ...task.dueDateRequest,
          status,
          reviewNote: review.reviewNote || '',
          reviewedBy: review.reviewedBy || '',
          reviewedAt: review.reviewedAt || '',
        }

        return {
          ...task,
          dueDate: status === 'approved' ? task.dueDateRequest.requestedDueDate : task.dueDate,
          dueDateRequest: nextRequest,
        }
      })
    )

    setSelectedTask((current) => {
      if (!current || current.id !== taskId || !current.dueDateRequest) return current

      const nextRequest = {
        ...current.dueDateRequest,
        status,
        reviewNote: review.reviewNote || '',
        reviewedBy: review.reviewedBy || '',
        reviewedAt: review.reviewedAt || '',
      }

      return {
        ...current,
        dueDate: status === 'approved' ? current.dueDateRequest.requestedDueDate : current.dueDate,
        dueDateRequest: nextRequest,
      }
    })
  }

  const updateTaskStatus = (id, status) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, status } : task)))
  }

  const deleteTask = (id) => {
    setTasks((current) => current.filter((task) => task.id !== id))
  }

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setCategoryFilter('all')
    setAssigneeFilter('all')
    setDueFrom('')
    setDueTo('')
    setCurrentPage(1)
  }

  return (
    <>
      <div
        className={`relative mx-auto max-w-screen-2xl overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 ${
          isDark
            ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]'
            : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]'
        }`}
      >
        {isDark && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_28%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_24%)]" />
          </>
        )}

        <div className="relative z-10">
          <header className="mb-8">
            <div className="flex gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div>
                <p className={`mb-2 text-xs uppercase tracking-[0.25em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('Admin Panel')}
                </p>
                <h1 className={`text-2xl font-bold tracking-tight md:text-3xl ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  {t('Platform Tasks')}
                </h1>
                <p className={`mt-3 max-w-2xl text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {t('Manage super admin follow-ups, rollout actions, and platform-wide work from a dedicated queue.')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/25 transition-colors hover:bg-blue-700"
              >
                <Plus size={16} />
                {t('Add Task')}
              </button>
            </div>
          </header>

          <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.key} className={`${glassCard} relative overflow-hidden px-4 py-3`}>
                  <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.tone}`} />
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-xs uppercase tracking-[0.22em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {t(item.label)}
                      </p>
                      <p className={`mt-3 break-words text-2xl font-bold tracking-tight md:text-3xl ${isDark ? 'text-white' : 'text-slate-800'}`}>
                        {item.value}
                      </p>
                      <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {t(item.note)}
                      </p>
                    </div>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      isDark ? 'bg-slate-800/90 text-slate-200' : 'bg-white/80 text-slate-700'
                    }`}>
                      <Icon size={17} />
                    </div>
                  </div>
                </div>
              )
            })}
          </section>

          <section className={`${glassCard} mb-5 p-5 md:p-6`}>
            <div className="mb-5 flex gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${filterIconClass}`}>
                  <Filter size={20} />
                </span>
                <div>
                  <h2 className={`text-xl font-bold ${headingClass}`}>{t('Filters')}</h2>
                  <p className={`mt-1 text-xs ${mutedTextClass}`}>
                    {t('Filters apply automatically as you type or select.')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setShowMoreFilters((prev) => !prev)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold transition-colors ${filterBtnClass}`}
                >
                  <span>{showMoreFilters ? t('Hide filters') : t('More filters')}</span>
                  <ChevronDown size={18} className={`transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className={`px-2 py-2 text-xs font-medium transition-colors ${isDark ? 'text-slate-200 hover:text-white' : 'text-slate-950 hover:text-slate-600'}`}
                >
                  {t('Reset')}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-2">
                  <label className={`flex items-center gap-2 ${labelClass}`}>
                    <Search className="h-4 w-4 text-blue-500" />
                    {t('Search')}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t('Search tasks, notes, category...')}
                      className={`${inputClass} pl-10 pr-3`}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className={`block ${labelClass}`}>{t('Status')}</label>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className={`${inputClass} px-3`}
                  >
                    <option value="all">{t('All statuses')}</option>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {t(labelize(status))}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className={`block ${labelClass}`}>{t('Category')}</label>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className={`${inputClass} px-3`}
                  >
                    <option value="all">{t('All categories')}</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {t(category)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className={`block ${labelClass}`}>{t('Priority')}</label>
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className={`${inputClass} px-3`}
                  >
                    <option value="all">{t('All priorities')}</option>
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>
                        {t(labelize(priority))}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className={`block ${labelClass}`}>{t('Assigned User')}</label>
                  <select
                    value={assigneeFilter}
                    onChange={(event) => setAssigneeFilter(event.target.value)}
                    className={`${inputClass} px-3`}
                  >
                    <option value="all">{t('All assignees')}</option>
                    <option value="unassigned">{t('Unassigned')}</option>
                    {assigneeOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showMoreFilters && (
                <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>{t('Due From')}</label>
                    <input
                      type="date"
                      value={dueFrom}
                      onChange={(event) => setDueFrom(event.target.value)}
                      className={`${inputClass} px-3`}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className={`block ${labelClass}`}>{t('Due To')}</label>
                    <input
                      type="date"
                      value={dueTo}
                      onChange={(event) => setDueTo(event.target.value)}
                      className={`${inputClass} px-3`}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={`${glassCard} overflow-hidden`}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div>
                <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  {t('Task Queue')}
                </h3>
                <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {t('{{count}} tasks visible', { count: filteredTasks.length })}
                </p>
              </div>
            </div>

            <div className="p-5">
              {filteredTasks.length === 0 ? (
                <div className={`rounded-[24px] border border-dashed px-6 py-12 text-center ${
                  isDark ? 'border-slate-700 bg-slate-950/40 text-slate-400' : 'border-slate-300 bg-slate-50/70 text-slate-500'
                }`}>
                  {t('No platform tasks match the current filters.')}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {paginatedTasks.map((task) => {
                    const isAssignedUser = String(task.assignedTo || '') === String(user?.id || '')

                    return (
                      <div
                        key={task.id}
                        className={`rounded-[22px] border p-4 transition ${
                          isDark
                            ? 'border-slate-800 bg-slate-950/55 hover:border-slate-700'
                            : 'border-slate-200 bg-white/80 hover:border-slate-300'
                        }`}
                      >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${priorityTone(task.priority, isDark)}`}>
                              {t(labelize(task.priority))}
                            </span>
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(task.status, isDark)}`}>
                              {t(labelize(task.status))}
                            </span>
                            {task.dueDateRequest?.status === 'pending' && (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                isDark ? 'bg-amber-950/40 text-amber-300' : 'bg-amber-100 text-amber-700'
                              }`}>
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                                {t('Due date request')}
                              </span>
                            )}
                          </div>

                          <h4 className={`mt-2.5 text-base font-semibold leading-6 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                            {task.title}
                          </h4>

                          <div className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {t('Assigned:')} {task.assignedToName || t('Unassigned')}
                          </div>

                          <p className={`mt-2 line-clamp-2 text-[13px] leading-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {task.description || t('No description provided.')}
                          </p>

                          {!!task.comments?.length && (
                            <div className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                            }`}>
                              <MessageSquare size={12} />
                              {t('{{count}} comments', { count: task.comments.length })}
                            </div>
                          )}

                          {task.dueDateRequest?.status && (
                            <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              task.dueDateRequest.status === 'approved'
                                ? (isDark ? 'bg-emerald-950/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700')
                                : task.dueDateRequest.status === 'rejected'
                                  ? (isDark ? 'bg-rose-950/40 text-rose-300' : 'bg-rose-100 text-rose-700')
                                  : (isDark ? 'bg-amber-950/40 text-amber-300' : 'bg-amber-100 text-amber-700')
                            }`}>
                              {t(`Due date ${task.dueDateRequest.status}`)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openPreviewTask(task)}
                            className={`rounded-xl p-2 transition ${
                              isDark ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                            }`}
                            title={t('Preview task')}
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditTask(task)}
                            className={`rounded-xl p-2 transition ${
                              isDark ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                            }`}
                            title={t('Edit task')}
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteTask(task.id)}
                            className={`rounded-xl p-2 transition ${
                              isDark ? 'text-slate-500 hover:bg-rose-950/40 hover:text-rose-300' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                            }`}
                            title={t('Delete task')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {[
                          task.category || t('General'),
                          formatDateLabel(task.dueDate),
                          formatDateLabel(task.createdAt),
                        ].map((item) => (
                          <span
                            key={item}
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              isDark ? 'bg-slate-800/80 text-slate-400' : 'bg-slate-100/90 text-slate-500'
                            }`}
                          >
                            {item}
                          </span>
                        ))}
                      </div>

                      {isAssignedUser && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {task.status !== 'todo' && (
                            <button
                              type="button"
                              onClick={() => updateTaskStatus(task.id, 'todo')}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                                isDark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                              title={t('Move to To Do')}
                            >
                              <Clock3 size={15} />
                            </button>
                          )}
                          {task.status !== 'in_progress' && (
                            <button
                              type="button"
                              onClick={() => updateTaskStatus(task.id, 'in_progress')}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                                isDark ? 'border-blue-900/50 bg-blue-950/30 text-blue-200 hover:bg-blue-950/50' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                              }`}
                              title={t('Start Progress')}
                            >
                              <Play size={15} className="translate-x-[1px]" />
                            </button>
                          )}
                          {task.status !== 'done' && (
                            <button
                              type="button"
                              onClick={() => updateTaskStatus(task.id, 'done')}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                                isDark ? 'border-emerald-900/50 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-950/50' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={t('Mark Done')}
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className={`flex gap-4 border-t px-5 py-4 md:flex-row md:items-center md:justify-between ${
              isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'
            }`}>
              <div className="text-sm">
                {t('Showing {{from}}-{{to}} of {{total}}', {
                  from: filteredTasks.length === 0 ? 0 : ((currentPage - 1) * perPage) + 1,
                  to: filteredTasks.length === 0 ? 0 : Math.min(currentPage * perPage, filteredTasks.length),
                  total: filteredTasks.length,
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm md:justify-end">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                    aria-label={t('Previous')}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className={`min-w-[96px] text-center font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {t('Page {{page}} of {{pages}}', {
                      page: Math.max(1, currentPage),
                      pages: Math.max(1, totalPages),
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages || filteredTasks.length === 0}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                    aria-label={t('Next')}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className={mutedTextClass}>{t('Per page:')}</span>
                  <div className="relative">
                    <select
                      value={perPage}
                      onChange={(e) => {
                        setPerPage(Number(e.target.value))
                        setCurrentPage(1)
                      }}
                      className={`h-11 min-w-[88px] appearance-none rounded-xl border pl-4 pr-9 text-sm font-medium outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${
                        isDark
                          ? 'border-slate-700 bg-slate-900 text-slate-200 focus:ring-blue-500/20'
                          : 'border-slate-200 bg-white text-slate-700 shadow-sm'
                      }`}
                    >
                      {[4, 6, 8, 12].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
                        isDark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <TaskModal
        isOpen={showCreateModal}
        mode={editingTask ? 'edit' : 'create'}
        initialTask={editingTask}
        onClose={() => {
          setShowCreateModal(false)
          setEditingTask(null)
        }}
        onSave={saveTask}
        isDark={isDark}
        t={t}
        categories={categories}
        assigneeOptions={assigneeOptions}
      />

      <TaskPreviewModal
        isOpen={!!selectedTask}
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSaveComment={saveTaskComment}
        onRequestDueDateChange={requestTaskDueDateChange}
        onResolveDueDateRequest={resolveTaskDueDateRequest}
        currentUser={user}
        isDark={isDark}
        t={t}
      />
    </>
  )
}
