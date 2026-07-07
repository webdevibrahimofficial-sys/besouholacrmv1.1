import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '../../../utils/api'
import SourcesComponent from '../../../components/settings/Sources'

const Modal = ({ open, title, onClose, onSave, saveLabel, saveDisabled, children, t }) => {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className=" card dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className={`font-semibold text-lg ${isLight ? 'text-black' : 'text-white'}`}>{title}</h3>
          <button onClick={onClose} className={`${isLight ? 'text-black' : 'text-white'} hover:text-gray-700 dark:hover:text-gray-300`}>✕</button>
        </div>
        <div className="p-4 space-y-4">
            {children}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">{t('Cancel')}</button>
            <button
                onClick={onSave}
                disabled={saveDisabled}
                className={`px-4 py-2 rounded-xl bg-blue-600 ${isLight ? 'text-black' : 'text-white'} hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed`}
            >{saveLabel || t('Save')}</button>
        </div>
      </div>
    </div>
  )
}

export default function Sources() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentSource, setCurrentSource] = useState(null)
  const [formData, setFormData] = useState({ name: '' })

  // Reassign-then-delete flow: when a source can't be deleted because leads
  // still reference it, we ask the admin which other source to move those
  // leads to, then retry the delete with `reassign_to_source_id`.
  const [reassignState, setReassignState] = useState(null) // { sourceId, sourceName, leadsCount }
  const [reassignTargetId, setReassignTargetId] = useState('')
  const [reassignSaving, setReassignSaving] = useState(false)

  const fetchSources = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/sources')
      setSources(response.data)
    } catch (error) {
      console.error('Error fetching sources:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSources()
  }, [])

  const handleAdd = () => {
    setCurrentSource(null)
    setFormData({ name: '' })
    setIsModalOpen(true)
  }

  const handleEdit = (source) => {
    setCurrentSource(source)
    setFormData({ name: source.name })
    setIsModalOpen(true)
  }

  const deleteSource = async (id, reassignToSourceId) => {
    return api.delete(`/api/sources/${id}`, {
      data: reassignToSourceId ? { reassign_to_source_id: reassignToSourceId } : undefined,
    })
  }

  const handleDelete = async (id) => {
    if (!window.confirm(t('Are you sure you want to delete this source?'))) return

    try {
      await deleteSource(id)
      fetchSources()
    } catch (error) {
      const data = error?.response?.data
      if (error?.response?.status === 422 && data?.requires_reassignment) {
        const source = sources.find(s => s.id === id)
        setReassignTargetId('')
        setReassignState({
          sourceId: id,
          sourceName: source?.name || '',
          leadsCount: data.leads_count,
        })
        return
      }
      console.error('Error deleting source:', error)
      window.alert(data?.message || t('Failed to delete source.'))
    }
  }

  const handleConfirmReassign = async () => {
    if (!reassignState || !reassignTargetId) return

    try {
      setReassignSaving(true)
      await deleteSource(reassignState.sourceId, reassignTargetId)
      setReassignState(null)
      setReassignTargetId('')
      fetchSources()
    } catch (error) {
      console.error('Error reassigning + deleting source:', error)
      window.alert(error?.response?.data?.message || t('Failed to delete source.'))
    } finally {
      setReassignSaving(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name) return

    try {
        if (currentSource) {
            await api.put(`/api/sources/${currentSource.id}`, formData)
        } else {
            await api.post('/api/sources', formData)
        }
        fetchSources()
        setIsModalOpen(false)
    } catch (error) {
        console.error('Error saving source:', error)
    }
  }

  const reassignOptions = sources.filter(s => s.id !== reassignState?.sourceId)

  return (
    <>
      <div className="p-3 sm:p-4 md:p-6 bg-[var(--content-bg)] text-[var(--content-text)] space-y-4 sm:space-y-6">
        <div className=" flex flex-wrap justify-between items-center gap-4 sm:gap-3">
          <div className='flex gap-1'>
            <div className="w-1   h-6 sm:h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
          <h1 className={`text-2xl sm:text-3xl font-bold  dark:from-white dark:to-gray-300 bg-clip-text ${isLight ? 'text-black' : 'text-white'}`}>
            {t('Sources')}
          </h1>
          </div>
          <div className="mt-6 flex justify-end">
                <button 
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span className="font-medium">{t('Add New Source')}</span>
                </button>
          </div>
        </div>
        
        {loading ? (
            <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        ) : (
            <SourcesComponent 
                sources={sources}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />
        )}
      </div>

      <Modal 
        open={isModalOpen} 
        title={currentSource ? t('Edit Source') : t('Add New Source')} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave}
        t={t}
      >
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{t('Name')}</label>
                <input 
                    className={`w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-800 ${isLight ? 'text-black' : 'text-white'} outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all`}
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder={t('Enter source name')}
                />
            </div>
        </div>
      </Modal>

      <Modal
        open={!!reassignState}
        title={t('Reassign Leads Before Deleting')}
        onClose={() => { if (!reassignSaving) { setReassignState(null); setReassignTargetId('') } }}
        onSave={handleConfirmReassign}
        saveLabel={reassignSaving ? t('Moving...') : t('Move Leads & Delete')}
        saveDisabled={!reassignTargetId || reassignSaving}
        t={t}
      >
        <div className="space-y-4">
            <p className={`text-sm ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                {t('This source is linked to {{count}} lead(s). Choose another source to move them to before deleting "{{name}}".', {
                  count: reassignState?.leadsCount ?? 0,
                  name: reassignState?.sourceName || '',
                })}
            </p>
            <div className="space-y-1.5">
                <label className={`text-sm font-semibold ${isLight ? 'text-black' : 'text-white'}`}>{t('Move leads to')}</label>
                <select
                    className={`w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-800 ${isLight ? 'text-black' : 'text-white'} outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all`}
                    value={reassignTargetId}
                    onChange={e => setReassignTargetId(e.target.value)}
                    disabled={reassignSaving}
                >
                    <option value="">{t('Select a source')}</option>
                    {reassignOptions.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                {reassignOptions.length === 0 && (
                    <p className="text-xs text-red-500">{t('No other sources available. Create a new source first.')}</p>
                )}
            </div>
        </div>
      </Modal>
    </>
  )
}
