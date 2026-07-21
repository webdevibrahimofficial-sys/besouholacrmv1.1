import { useEffect, useState } from 'react'
import {
  GripVertical, ChevronDown, BarChart2, List, Link as LinkIcon, AlertTriangle, X, Pencil, Trash2
} from 'lucide-react'
import { motion } from 'framer-motion'

import { useTranslation } from 'react-i18next'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '../../utils/api'
import IconSelector, { ICON_MAP } from './IconSelector'

function sortByOrder(list) {
  return [...list].sort((a, b) => Number(a.order) - Number(b.order))
}

const SALES_TYPE_OPTIONS = ['cold_calls', 'follow_up', 'meeting', 'proposal', 'reservation', 'rent', 'closing_deals', 'cancel']
const TELESALES_TYPE_OPTIONS = ['fresh', 'cold_calls', 'follow_up', 'convert', 'not_interested']

function getTypeOptions(workflowKey, currentType = '') {
  const baseOptions = workflowKey === 'telesales' ? TELESALES_TYPE_OPTIONS : SALES_TYPE_OPTIONS
  if (currentType && !baseOptions.includes(currentType)) {
    return [currentType, ...baseOptions]
  }
  return baseOptions
}

function normalizeStages(list) {
  const arr = Array.isArray(list) ? list : []
  return arr.map(s => ({
    id: s?.id,
    name: s?.name || '',
    nameAr: s?.name_ar || s?.nameAr || '',
    type: s?.type || 'follow_up',
    notifyTime: s?.notify_time || s?.notifyTime || '',
    delayTime: Number(s?.delay_time ?? s?.delayTime ?? 0),
    workflowKey: s?.workflow_key || s?.workflowKey || 'sales',
    isActive: s?.is_active !== false,
    order: s?.order ?? 0,
    color: s?.color || '#3B82F6',
    icon: s?.icon || 'BarChart2',
    iconUrl: s?.iconUrl || '',
    isLocked: Boolean(s?.meta_data?.locked || s?.metaData?.locked),
    isDisplayOnly: Boolean(s?.meta_data?.display_only || s?.metaData?.display_only),
  }))
}

function StageTableRow({ s, idx, editingIndex, setEditingIndex, onUpdate, onDelete, t, onHandleDragStart, onHandleDragEnd }) {
  const isEditing = editingIndex === idx
  const [editState, setEditState] = useState({ ...s })
  const typeOptions = getTypeOptions(s.workflowKey || 'sales', editState.type || s.type)

  useEffect(() => {
    if (isEditing) {
      setEditState({ ...s })
    }
  }, [isEditing, s])

  const handleSave = () => {
    onUpdate(s.id, editState)
    setEditingIndex(null)
  }

  return (
    <>
      <td className="p-2 w-8 text-center">
        <div
          className={`drag-handle inline-flex items-center justify-center p-1 ${s.isLocked ? 'cursor-not-allowed text-gray-300' : 'cursor-move text-gray-400 hover:text-gray-600'}`}
          draggable={!s.isLocked}
          onDragStart={s.isLocked ? undefined : onHandleDragStart}
          onDragEnd={s.isLocked ? undefined : onHandleDragEnd}
        >
           <GripVertical size={16} />
        </div>
      </td>
      <td className="p-2">
        {isEditing ? (
          <input
            className="w-full border rounded p-1"
            value={editState.name}
            onChange={e => setEditState({ ...editState, name: e.target.value })}
          />
        ) : (
          s.name
        )}
      </td>
      <td className="p-2">
        {isEditing ? (
          <input
            className="w-full border rounded p-1"
            value={editState.nameAr}
            onChange={e => setEditState({ ...editState, nameAr: e.target.value })}
          />
        ) : (
          s.nameAr || ''
        )}
      </td>
      <td className="p-2">
        {isEditing ? (
          <select
            className="w-full border rounded p-1"
            value={editState.type}
            onChange={e => setEditState({ ...editState, type: e.target.value })}
          >
            {typeOptions.map(k => (
              <option key={k} value={k}>{t(k)}</option>
            ))}
          </select>
        ) : (
          t(s.type)
        )}
      </td>
      <td className="p-2">
        {isEditing ? (
          <input
            className="w-full border rounded p-1"
            value={editState.notifyTime || ''}
            onChange={e => setEditState({ ...editState, notifyTime: e.target.value })}
            placeholder="00:15:00"
          />
        ) : (
          s.notifyTime || ''
        )}
      </td>
      <td className="p-2">
        {isEditing ? (
          <input
            className="w-full border rounded p-1"
            type="number"
            min={0}
            value={Number(editState.delayTime || 0)}
            onChange={e => setEditState({ ...editState, delayTime: Number(e.target.value || 0) })}
          />
        ) : (
          String(Number(s.delayTime || 0))
        )}
      </td>
      <td className="p-2">
        {isEditing ? (
          <input
            className="border rounded p-0 h-8 w-12"
            type="color"
            value={editState.color || '#3B82F6'}
            onChange={e => setEditState({ ...editState, color: e.target.value })}
          />
        ) : (
          <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: s.color || '#3B82F6' }}></span>
        )}
      </td>
      <td className="p-2">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <IconSelector
              value={editState.icon || 'BarChart2'}
              onChange={val => setEditState({ ...editState, icon: val, iconUrl: '' })}
            />
          </div>
        ) : (
          s.iconUrl ? (
            <img src={s.iconUrl} alt="icon" className="w-6 h-6 inline-block rounded" />
          ) : (
            <span className="text-lg inline-block">
              {(() => {
                const Icon = ICON_MAP[s.icon] || BarChart2
                return <Icon className="w-5 h-5" />
              })()}
            </span>
          )
        )}
      </td>
      <td className="p-2">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded bg-green-600 text-white"
              onClick={handleSave}
            >{t('Save')}</button>
            <button
              className="px-2 py-1 rounded bg-gray-300 dark:bg-gray-700"
              onClick={() => setEditingIndex(null)}
            >{t('Cancel')}</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded bg-blue-600 text-white"
              disabled={s.isLocked}
              onClick={() => setEditingIndex(idx)}
            >{s.isLocked ? t('Fixed') : t('Edit')}</button>
            <button
              className={`px-2 py-1 rounded text-white ${s.isLocked ? 'bg-gray-500 cursor-not-allowed' : 'bg-red-600'}`}
              disabled={s.isLocked}
              onClick={() => onDelete(s)}
            >{s.isLocked ? t('Protected') : t('Delete')}</button>
          </div>
        )}
      </td>
    </>
  )
}

export function PipelineStagesManager({ workflowKey = 'sales', title = 'Pipeline Setup Stages' }) {
  const { t, i18n } = useTranslation()
  const { theme, resolvedTheme } = useTheme()
  const isLight = resolvedTheme !== 'dark'
  const isRtl = String(i18n.language || '').startsWith('ar')

  const [pipelineStages, setPipelineStages] = useState([])
  const [newStage, setNewStage] = useState({ name: '', nameAr: '', type: 'follow_up', notifyTime: '', delayTime: 0, order: '', color: '#3B82F6', icon: 'BarChart2', iconUrl: '' })
  const [iconInputMode, setIconInputMode] = useState('select') // 'select' | 'url'
  const [editingIndex, setEditingIndex] = useState(null)
  const [showNewStage, setShowNewStage] = useState(false)
  const [deleteNotice, setDeleteNotice] = useState(null)
  const [transferDialog, setTransferDialog] = useState({
    open: false,
    stageId: null,
    stageName: '',
    linkedCount: 0,
    targetStageId: '',
    message: '',
  })

  const fetchStages = async () => {
    try {
      const { data } = await api.get('/api/stages', { params: { workflow_key: workflowKey } })
      const normalized = normalizeStages(sortByOrder(data))
      if (normalized.length > 0) {
        setPipelineStages(normalized)
        return
      }
    } catch (err) {
      console.error('Failed to fetch stages', err)
    }

    // Backward compatibility: only Sales should fallback to legacy localStorage stages.
    if (workflowKey === 'sales') {
      try {
        const saved = JSON.parse(localStorage.getItem('crmStages') || '[]')
        const normalized = normalizeStages(sortByOrder(saved))
        setPipelineStages(normalized)
        return
      } catch {
      }
    }

    setPipelineStages([])
  }

  const [draggedId, setDraggedId] = useState(null)
  const typeOptions = getTypeOptions(workflowKey, newStage.type)

  const moveStage = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return

    setPipelineStages((prev) => {
      const fromIndex = prev.findIndex(s => s.id === fromId)
      const toIndex = prev.findIndex(s => s.id === toId)
      if (fromIndex === -1 || toIndex === -1) return prev

      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next.map((s, idx) => ({ ...s, order: idx + 1 }))
    })
  }

  const persistOrder = async (stages) => {
    const stagesToUpdate = (Array.isArray(stages) ? stages : []).map((s, idx) => ({
      id: s.id,
      order: idx + 1
    }))

    try {
      await api.post('/api/stages/reorder', { stages: stagesToUpdate })
    } catch (err) {
      console.error('Failed to reorder stages', err)
      await fetchStages()
    }
  }

  const handleHandleDragStart = (e, stageId) => {
    setDraggedId(stageId)
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(stageId))
    } catch {}
  }

  const handleHandleDragEnd = async () => {
    setDraggedId(null)
    await persistOrder(pipelineStages)
  }

  useEffect(() => {
    fetchStages()
  }, [workflowKey])

  useEffect(() => {
    if (!deleteNotice) return undefined
    const timer = window.setTimeout(() => setDeleteNotice(null), 8000)
    return () => window.clearTimeout(timer)
  }, [deleteNotice])

  const closeTransferDialog = () => {
    setTransferDialog({
      open: false,
      stageId: null,
      stageName: '',
      linkedCount: 0,
      targetStageId: '',
      message: '',
    })
  }

  const headerClass = resolvedTheme === 'dark' ? 'bg-[#0b2b4f]' : 'bg-gray-100'
  const thBase = 'text-left p-2 border-b'
  const thTone = resolvedTheme === 'dark' ? ' border-gray-700 text-white/80' : ''

  const addStage = async () => {
    if (!newStage.name.trim()) return
    
    try {
      const payload = {
        name: newStage.name.trim(),
        name_ar: String(newStage.nameAr || '').trim(),
        type: newStage.type,
        notify_time: String(newStage.notifyTime || '').trim() || null,
        delay_time: Number(newStage.delayTime || 0),
        order: pipelineStages.length + 1,
        color: newStage.color,
        icon: newStage.icon,
        workflow_key: workflowKey,
        is_active: true,
        // iconUrl is not supported in backend yet
      }
      
      await api.post('/api/stages', payload)
      
      await fetchStages() // Reload from DB
      
      setNewStage({ name: '', nameAr: '', type: 'follow_up', notifyTime: '', delayTime: 0, order: '', color: '#3B82F6', icon: 'BarChart2', iconUrl: '' })
      setIconInputMode('select')
      setShowNewStage(false)
    } catch (err) {
      console.error('Failed to create stage', err)
      alert(t('Failed to create stage'))
    }
  }

  const handleUpdateStage = async (id, updatedData) => {
    try {
      const payload = {
        name: updatedData.name,
        name_ar: updatedData.nameAr,
        type: updatedData.type,
        notify_time: String(updatedData.notifyTime || '').trim() || null,
        delay_time: Number(updatedData.delayTime || 0),
        order: updatedData.order,
        color: updatedData.color,
        icon: updatedData.icon,
        workflow_key: workflowKey,
        is_active: updatedData.isActive !== false,
      }
      await api.put(`/api/stages/${id}`, payload)
      await fetchStages()
    } catch (err) {
      console.error('Failed to update stage', err)
      alert(t('Failed to update stage'))
    }
  }

  const handleDeleteStage = async (stage) => {
    const id = stage?.id
    const stageName = stage?.name || stage?.nameAr || ''
    if (!id) return
    if (stage?.isLocked) {
      setDeleteNotice({
        count: null,
        message: t('This telesales stage is fixed and cannot be deleted.')
      })
      return
    }
    if (!window.confirm(t('Are you sure you want to delete this stage?'))) return
    try {
      setDeleteNotice(null)
      await api.delete(`/api/stages/${id}`)
      await fetchStages()
    } catch (err) {
      console.error('Failed to delete stage', err)
      const status = err?.response?.status
      const linkedLeadsCount = Number(
        err?.response?.data?.linked_leads_count
        ?? err?.response?.data?.leads_count
        ?? err?.response?.data?.count
        ?? 0
      )

      if (status === 409 || linkedLeadsCount > 0) {
        setTransferDialog({
          open: true,
          stageId: id,
          stageName,
          linkedCount: linkedLeadsCount,
          targetStageId: '',
          message: err?.response?.data?.message || t('Cannot delete this stage because {{count}} leads are linked to it. Please move these leads to another stage first.', { count: linkedLeadsCount }),
        })
        return
      }

      setDeleteNotice({
        count: null,
        message: t('Cannot delete this stage now. Please move any linked leads to another stage first.')
      })
    }
  }

  const confirmTransferAndDelete = async () => {
    if (!transferDialog.stageId || !transferDialog.targetStageId) {
      setDeleteNotice({
        count: transferDialog.linkedCount || null,
        message: t('Please choose a target stage first.'),
      })
      return
    }

    try {
      await api.delete(`/api/stages/${transferDialog.stageId}`, {
        data: { target_stage_id: transferDialog.targetStageId }
      })
      closeTransferDialog()
      setDeleteNotice(null)
      await fetchStages()
    } catch (err) {
      console.error('Failed to transfer leads and delete stage', err)
      setDeleteNotice({
        count: transferDialog.linkedCount || null,
        message: err?.response?.data?.message || t('Failed to move leads and delete this stage.'),
      })
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-4">
      {deleteNotice && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm ${
            isLight
              ? 'border-amber-200 bg-amber-50 text-amber-950'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
          }`}
          role="alert"
        >
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-400/15 text-amber-200'
            }`}>
              <AlertTriangle size={20} />
            </span>
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                <span>{t('Stage cannot be deleted')}</span>
                {Number(deleteNotice.count) > 0 ? (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    isLight ? 'bg-white text-amber-700 ring-1 ring-amber-200' : 'bg-white/10 text-amber-100 ring-1 ring-white/10'
                  }`}>
                    {t('{{count}} linked leads', { count: deleteNotice.count })}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-6 opacity-90">{deleteNotice.message}</p>
            </div>
          </div>
          <button
            type="button"
            className={`rounded-full p-1 transition ${
              isLight ? 'text-amber-700 hover:bg-amber-100' : 'text-amber-100 hover:bg-white/10'
            }`}
            aria-label={t('Close')}
            onClick={() => setDeleteNotice(null)}
          >
            <X size={18} />
          </button>
        </motion.div>
      )}

      {transferDialog.open && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 px-4">
          <div className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${
            isLight ? 'border-gray-200 bg-white text-black' : 'border-gray-700 bg-[#0f172a] text-white'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{t('Transfer Leads Before Delete')}</h3>
                <p className="mt-1 text-sm opacity-80">
                  {t('This stage has {{count}} linked leads. Move them to another stage before deleting "{{stage}}".', {
                    count: transferDialog.linkedCount || 0,
                    stage: transferDialog.stageName || t('Stage'),
                  })}
                </p>
              </div>
              <button
                type="button"
                className={`rounded-full p-1 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
                onClick={closeTransferDialog}
                aria-label={t('Close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium">{t('Target Stage')}</label>
              <select
                className={`w-full rounded-lg border px-3 py-2 ${
                  isLight ? 'border-gray-300 bg-white text-black' : 'border-gray-600 bg-slate-900 text-white'
                }`}
                value={transferDialog.targetStageId}
                onChange={(e) => setTransferDialog((prev) => ({ ...prev, targetStageId: e.target.value }))}
              >
                <option value="">{t('Select Stage')}</option>
                {pipelineStages
                  .filter((stage) => String(stage.id) !== String(transferDialog.stageId))
                  .filter((stage) => !stage?.isDisplayOnly && String(stage?.type || '').trim().toLowerCase() !== 'display')
                  .map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {isRtl ? (stage.nameAr || stage.name) : (stage.name || stage.nameAr)}
                    </option>
                  ))}
              </select>
              {transferDialog.message ? (
                <p className={`text-xs ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>{transferDialog.message}</p>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm ${isLight ? 'bg-gray-100 text-black hover:bg-gray-200' : 'bg-white/10 text-white hover:bg-white/15'}`}
                onClick={closeTransferDialog}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
                onClick={confirmTransferAndDelete}
              >
                {t('Transfer and Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className={`inline-flex items-center gap-2 font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
          <span>{t(title)}</span>
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
            {pipelineStages.length}
          </span>
        </div>
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={() => setShowNewStage(v => !v)}>
          {t('New Stage')}
        </button>
      </div>

      {showNewStage && (
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid grid-cols-12 gap-3 items-center">
          <div className="col-span-12 md:col-span-4 flex flex-col gap-1">
            <span className="text-xs font-medium opacity-70">{t('Stage Name')}</span>
            <input
              className={`w-full border rounded p-2 dark:bg-gray-800 ${isLight ? 'text-black' : 'text-white'}`}
              placeholder={t('Stage Name')}
              value={newStage.name}
              onChange={e => setNewStage(s => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div className="col-span-12 md:col-span-4 flex flex-col gap-1">
            <span className="text-xs font-medium opacity-70">{t('Stage Name (Arabic)')}</span>
            <input
              className={`w-full border rounded p-2 dark:bg-gray-800 ${isLight ? 'text-black' : 'text-white'}`}
              placeholder={t('Stage Name (Arabic)')}
              value={newStage.nameAr}
              onChange={e => setNewStage(s => ({ ...s, nameAr: e.target.value }))}
            />
          </div>
          <div className="col-span-12 md:col-span-4 flex flex-col gap-1">
            <span className="text-xs font-medium opacity-70">{t('Stage Type')}</span>
            <div className="relative">
              <select
                className={`w-full border rounded p-2 pr-10 dark:bg-gray-800 ${isLight ? 'text-black' : 'text-white'}`}
                value={newStage.type}
                onChange={e => setNewStage(s => ({ ...s, type: e.target.value }))}
              >
                {typeOptions.map(k => (
                  <option key={k} value={k}>{t(k)}</option>
                ))}
              </select>
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                onMouseDown={e => {
                  const el = e.currentTarget.previousElementSibling
                  if (el && typeof el.focus === 'function') el.focus()
                }}
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="col-span-12 grid grid-cols-12 gap-3 items-center">
          <div className="col-span-12 md:col-span-6 flex flex-col gap-1">
            <span className="text-xs font-medium opacity-70">{t('Notify Time')}</span>
            <input
              className={`w-full border rounded p-2 dark:bg-gray-800 ${isLight ? 'text-black' : 'text-white'}`}
              placeholder="00:15:00"
              value={newStage.notifyTime || ''}
              onChange={e => setNewStage(s => ({ ...s, notifyTime: e.target.value }))}
            />
          </div>
          <div className="col-span-12 md:col-span-6 flex flex-col gap-1">
            <span className="text-xs font-medium opacity-70">{t('Delay Time')}</span>
            <input
              type="number"
              min={0}
              className={`w-full border rounded p-2 dark:bg-gray-800 ${isLight ? 'text-black' : 'text-white'}`}
              value={Number(newStage.delayTime || 0)}
              onChange={e => setNewStage(s => ({ ...s, delayTime: Number(e.target.value || 0) }))}
            />
          </div>
        </div>
        <div className="col-span-12 grid grid-cols-12 gap-3 items-center">
          <div className="col-span-12 sm:col-span-6 md:col-span-3 flex flex-col gap-1">
            <span className="text-xs font-medium opacity-70">{t('Stage Color')}</span>
            <div className="flex items-center gap-2">
              <input
                className="border rounded p-0 h-10 w-16"
                type="color"
                value={newStage.color}
                onChange={e => setNewStage(s => ({ ...s, color: e.target.value }))}
              />
              <span className="text-xs opacity-70">{newStage.color}</span>
            </div>
          </div>
          <div className="col-span-12 md:col-span-6 flex flex-col gap-1">
            <span className="text-xs font-medium opacity-70">{t('Stage Icon')}</span>
            <div className="flex items-center border rounded p-1 dark:bg-gray-800 dark:border-gray-700 bg-white">
              {iconInputMode === 'url' ? (
                <input 
                  type="text" 
                  placeholder={t('Paste')} 
                  className={`flex-1 min-w-0 bg-transparent border-none focus:ring-0 p-2 text-sm ${isLight ? 'text-black' : 'text-white'}`}
                  value={newStage.iconUrl || ''}
                  onChange={(e) => setNewStage(s => ({ ...s, iconUrl: e.target.value }))}
                />
              ) : (
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <IconSelector
                    value={newStage.icon || 'BarChart2'}
                    onChange={val => setNewStage(s => ({ ...s, icon: val, iconUrl: '' }))}
                  />
                </div>
              )}

              <div className="flex items-center gap-1 border-l pl-1 dark:border-gray-700">
                {/* Preview */}
                <div className="w-8 h-8 flex items-center justify-center rounded bg-gray-50 dark:bg-gray-700 overflow-hidden">
                  {newStage.iconUrl ? (
                    <img src={newStage.iconUrl} alt="icon" className="w-full h-full object-contain" />
                  ) : (
                    <span className={`${isLight ? 'text-gray-600' : 'text-gray-300'}`}>
                      {(() => {
                        const Icon = ICON_MAP[newStage.icon] || BarChart2
                        return <Icon className="w-5 h-5" />
                      })()}
                    </span>
                  )}
                </div>

                {/* Toggle Mode */}
                <button 
                  type="button"
                  title={iconInputMode === 'url' ? t('Select from list') : t('Paste')}
                  className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isLight ? 'text-gray-600' : 'text-gray-300'}`}
                  onClick={() => {
                    const nextMode = iconInputMode === 'url' ? 'select' : 'url'
                    setIconInputMode(nextMode)
                    // If switching to select mode, clear URL
                    if (nextMode === 'select') {
                      setNewStage(s => ({ ...s, iconUrl: '' }))
                    }
                  }}
                >
                  {iconInputMode === 'url' ? <List size={16} /> : <LinkIcon size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="col-span-12 flex items-center justify-end gap-2">
          <button className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white" onClick={addStage}>{t('Save')}</button>
        </div>
      </div>
      )}

      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded">
          <thead className={headerClass}>
            <tr>
              <th className={`${thBase}${thTone} w-8`}>
                <GripVertical className="mx-auto text-gray-400" size={16} />
              </th>
              <th className={`${thBase}${thTone}`}>{t('Stage Name')}</th>
              <th className={`${thBase}${thTone}`}>{t('Stage Name (Arabic)')}</th>
              <th className={`${thBase}${thTone}`}>{t('Stage Type')}</th>
              <th className={`${thBase}${thTone}`}>{t('Notify Time')}</th>
              <th className={`${thBase}${thTone}`}>{t('Delay Time')}</th>
              <th className={`${thBase}${thTone}`}>{t('Stage Color')}</th>
              <th className={`${thBase}${thTone}`}>{t('Stage Icon')}</th>
              <th className={`${thBase}${thTone}`}>{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pipelineStages.map((s, idx) => (
              <motion.tr
                key={`stage-${s.id || idx}-${s.name}`}
                className={`border-t ${draggedId === s.id ? 'opacity-50' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => {
                  if (draggedId && !s.isLocked) moveStage(draggedId, s.id)
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <StageTableRow
                  s={s}
                  idx={idx}
                  editingIndex={editingIndex}
                  setEditingIndex={setEditingIndex}
                  onUpdate={handleUpdateStage}
                  onDelete={handleDeleteStage}
                  t={t}
                  onHandleDragStart={(e) => handleHandleDragStart(e, s.id)}
                  onHandleDragEnd={handleHandleDragEnd}
                />
              </motion.tr>
            ))}
            {pipelineStages.length === 0 && (
              <tr>
                <td className="p-2 text-[var(--muted-text)]" colSpan={9}>{t('No data')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {pipelineStages.length === 0 ? (
          <div className="p-4 text-sm text-[var(--muted-text)] border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
            {t('No data')}
          </div>
        ) : (
          pipelineStages.map((s, idx) => (
            <div
              key={`stage-card-${s.id || idx}-${s.name}`}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                    {s.name || t('Stage Name')}
                  </div>
                  {s.nameAr ? (
                    <div className="text-xs text-[var(--muted-text)] mt-0.5">
                      {s.nameAr}
                    </div>
                  ) : null}
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {t(s.type)}
                </span>
              </div>
              {s.isLocked ? (
                <div className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                  {t('Fixed telesales stage')}
                </div>
              ) : null}

              <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${isLight ? 'text-black' : 'text-white'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{t('Stage Color')}</span>
                  <span
                    className="inline-block w-4 h-4 rounded"
                    style={{ backgroundColor: s.color || '#3B82F6' }}
                  ></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{t('Notify Time')}</span>
                  <span className="text-[var(--muted-text)]">{s.notifyTime || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{t('Delay Time')}</span>
                  <span className="text-[var(--muted-text)]">{String(Number(s.delayTime || 0))}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition ${s.isLocked ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                  disabled={s.isLocked}
                  onClick={() => setEditingIndex(idx)}
                >
                  <Pencil size={16} />
                  <span>{s.isLocked ? t('Fixed') : t('Edit')}</span>
                </button>
                <button
                  type="button"
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition ${s.isLocked ? 'bg-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
                  disabled={s.isLocked}
                  onClick={() => handleDeleteStage(s)}
                >
                  <Trash2 size={16} />
                  <span>{s.isLocked ? t('Protected') : t('Delete')}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ConfigurationManager({ workflowKey = 'sales', title = 'Pipeline Stages Setup' }) {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme !== 'dark'
  const isRtl = String(i18n.language || '').startsWith('ar')

  return (
    <div className={`px-2 max-[480px]:px-1 py-4 md:px-6 md:py-6 min-h-screen ${isLight ? 'text-black' : 'text-white'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className={`p-4 flex justify-between items-center gap-4 mb-6`} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className={`relative inline-flex items-center ${isRtl ? 'flex-row-reverse' : ''} gap-2`}>
          <h1 className={`page-title text-2xl md:text-3xl font-bold ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2 ${isRtl ? 'text-right' : 'text-left'}`} style={{ textAlign: isRtl ? 'right' : 'left' }}>
            {t(title)}
          </h1>
          <span aria-hidden className="absolute block h-[1px] rounded bg-gradient-to-r from-blue-500 via-purple-500 to-transparent" style={{ width: 'calc(100% + 8px)', left: isRtl ? 'auto' : '-4px', right: isRtl ? '-4px' : 'auto', bottom: '-4px' }}></span>
        </div>
      </div>

      <div className="animate-fadeIn">
        <PipelineStagesManager workflowKey={workflowKey} title={title} />
      </div>
    </div>
  )
}

export default ConfigurationManager
