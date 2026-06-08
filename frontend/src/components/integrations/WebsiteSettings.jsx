import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, CheckCircle, Code2, Globe, KeyRound, Link2, PlusCircle, Settings2, XCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { websiteIntegrationService } from '../../services/websiteIntegrationService'
import WebsiteConnectionsList from './website/WebsiteConnectionsList'
import WebsiteConnectionForm from './website/WebsiteConnectionForm'
import WebsiteSnippet from './website/WebsiteSnippet'
import WebsiteStatsPanel from './website/WebsiteStatsPanel'

const defaultForm = {
  name: '',
  url: '',
  default_campaign_id: null,
  default_source_id: null,
  allowed_origins: '',
  allow_all_origins_for_testing: false,
  is_active: true,
}

const NavButton = ({ active, icon: Icon, label, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center w-full px-4 py-3 text-sm font-medium transition-colors duration-200 border-l-4 ${
      active
        ? 'bg-cyan-50 border-cyan-600 text-cyan-700 dark:bg-cyan-900/10 dark:text-cyan-400 dark:border-cyan-500'
        : 'border-transparent text-theme hover:bg-white/80 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-200'
    }`}
  >
    <Icon className={`w-5 h-5 mr-3 ${active ? 'text-cyan-600 dark:text-cyan-400' : 'text-theme'}`} />
    {label}
  </button>
)

const StatusBadge = ({ connected }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
    connected
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-white text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'
  }`}>
    {connected ? (
      <>
        <CheckCircle className="w-3 h-3 mr-1" />
        Connected
      </>
    ) : (
      <>
        <XCircle className="w-3 h-3 mr-1" />
        Not Connected
      </>
    )}
  </span>
)

export default function WebsiteSettings({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connections, setConnections] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [sources, setSources] = useState([])
  const [mode, setMode] = useState('list')
  const [formMode, setFormMode] = useState('create')
  const [form, setForm] = useState(defaultForm)
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [revealedKey, setRevealedKey] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [connectionsData, campaignsData, sourcesData] = await Promise.all([
        websiteIntegrationService.listConnections(),
        websiteIntegrationService.getCampaigns(),
        websiteIntegrationService.getSources(),
      ])

      setConnections(connectionsData)
      setCampaigns(campaignsData)
      setSources(sourcesData)
    } catch (error) {
      const status = error?.response?.status
      const message =
        status === 401
          ? 'Your session has expired. Please log in again.'
          : error?.response?.data?.message || 'Failed to load website integrations.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const resetFormState = () => {
    setSelectedConnection(null)
    setForm(defaultForm)
    setFormMode('create')
  }

  const openCreate = () => {
    resetFormState()
    setMode('form')
  }

  const openEdit = (connection) => {
    setSelectedConnection(connection)
    setFormMode('edit')
    setForm({
      name: connection.name || '',
      url: connection.url || '',
      default_campaign_id: connection.default_campaign_id ?? null,
      default_source_id: connection.default_source_id ?? null,
      allowed_origins: Array.isArray(connection.allowed_origins) ? connection.allowed_origins.join('\n') : '',
      allow_all_origins_for_testing: !!connection.allow_all_origins_for_testing,
      is_active: connection.is_active !== false,
    })
    setMode('form')
  }

  const openStats = async (connection) => {
    setSelectedConnection(connection)
    setMode('stats')
    setStats(null)
    setStatsLoading(true)
    try {
      const result = await websiteIntegrationService.getStats(connection.id)
      setStats(result)
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load website stats.')
    } finally {
      setStatsLoading(false)
    }
  }

  const openSnippet = (connection) => {
    setSelectedConnection(connection)
    setMode('snippet')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      if (formMode === 'edit' && selectedConnection) {
        const updated = await websiteIntegrationService.updateConnection(selectedConnection.id, form)
        setConnections((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        setSelectedConnection(updated)
        setMode('list')
        toast.success('Website connection updated successfully.')
      } else {
        const created = await websiteIntegrationService.createConnection(form)
        setConnections((prev) => [created.connection, ...prev])
        setRevealedKey({
          connection: created.connection,
          apiKey: created.api_key,
        })
        setSelectedConnection(created.connection)
        setMode('snippet')
        toast.success('Website connection created successfully.')
      }
    } catch (error) {
      const responseData = error?.response?.data
      const firstValidationError = responseData?.errors ? Object.values(responseData.errors)?.[0]?.[0] : null
      toast.error(firstValidationError || responseData?.message || 'Failed to save website connection.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (connection) => {
    const confirmed = window.confirm(`Delete website connection "${connection.name}"? Existing leads will remain, but the connection link will be removed.`)
    if (!confirmed) return

    try {
      await websiteIntegrationService.deleteConnection(connection.id)
      setConnections((prev) => prev.filter((item) => item.id !== connection.id))
      if (selectedConnection?.id === connection.id) {
        setMode('list')
        setSelectedConnection(null)
        setStats(null)
      }
      toast.success('Website connection deleted successfully.')
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete website connection.')
    }
  }

  const handleRegenerate = async (connection) => {
    const confirmed = window.confirm(`Regenerate API key for "${connection.name}"? The old key will stop working immediately.`)
    if (!confirmed) return

    try {
      const result = await websiteIntegrationService.regenerateKey(connection.id)
      setConnections((prev) => prev.map((item) => (
        item.id === connection.id
          ? { ...item, key_prefix: result.key_prefix, masked_key: result.masked_key }
          : item
      )))

      const refreshed = {
        ...connection,
        key_prefix: result.key_prefix,
        masked_key: result.masked_key,
      }
      setSelectedConnection(refreshed)
      setRevealedKey({
        connection: refreshed,
        apiKey: result.api_key,
      })
      setMode('snippet')
      toast.success('New API key generated successfully.')
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to regenerate API key.')
    }
  }

  const handleCopy = async (value, successMessage = 'Copied to clipboard.') => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(successMessage)
    } catch {
      toast.error('Failed to copy to clipboard.')
    }
  }

  const snippetText = useMemo(() => {
    if (!selectedConnection) return ''
    const apiKey = revealedKey?.connection?.id === selectedConnection.id ? revealedKey.apiKey : null
    return websiteIntegrationService.buildSnippet({ apiKey })
  }, [revealedKey, selectedConnection])

  const activeTitle = useMemo(() => {
    if (mode === 'form') return formMode === 'edit' ? 'Edit Website Connection' : 'Create Website Connection'
    if (mode === 'snippet') return 'Installation Snippet'
    if (mode === 'stats') return 'Connection Statistics'
    return 'Website Connections Overview'
  }, [formMode, mode])

  const connected = connections.length > 0

  return (
    <div className="card rounded-2xl shadow-2xl w-full h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] grid grid-cols-1 overflow-hidden border border-gray-200 dark:border-gray-800 sm:grid-cols-[16rem_1fr]">
      <div className="w-full flex-shrink-0 bg-transparent border-b border-gray-200 dark:border-gray-800 flex flex-col min-h-0 sm:border-b-0 sm:border-r">
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold text-theme flex items-center">
              <span className="bg-cyan-600 text-white p-1.5 rounded mr-2">
                <Globe className="w-4 h-4" />
              </span>
              Website Leads
            </h2>
            <button
              onClick={onClose}
              className="sm:hidden shrink-0 p-2 text-gray-900 dark:text-gray-100 hover:text-gray-500 hover:bg-white/80 dark:hover:bg-gray-800 rounded-full transition-colors bg-white/90 shadow-md backdrop-blur dark:bg-gray-900/90"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6 text-gray-900 dark:text-gray-100" />
            </button>
          </div>
          <p className="text-xs text-theme mt-2">v1.0.0 • Secure Website Intake</p>
          <div className="mt-3">
            <StatusBadge connected={connected} />
          </div>
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          <NavButton active={mode === 'list'} icon={Link2} label="Connections" onClick={() => setMode('list')} />
          <NavButton active={mode === 'form' && formMode === 'create'} icon={PlusCircle} label="New Connection" onClick={openCreate} />
          <NavButton
            active={mode === 'snippet'}
            icon={Code2}
            label="Snippet"
            onClick={() => {
              if (selectedConnection) setMode('snippet')
            }}
          />
          <NavButton
            active={mode === 'stats'}
            icon={BarChart3}
            label="Statistics"
            onClick={() => {
              if (selectedConnection) setMode('stats')
            }}
          />
          <NavButton
            active={mode === 'form' && formMode === 'edit'}
            icon={Settings2}
            label="Connection Settings"
            onClick={() => {
              if (selectedConnection) {
                openEdit(selectedConnection)
              }
            }}
          />
        </nav>
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent">
        <div className="flex-1 overflow-auto p-4 sm:p-8 custom-scrollbar space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-theme">{activeTitle}</h1>
              <p className="text-sm text-theme/70 mt-1">
                Create secure website connections, generate intake keys, enforce origin policies, and review submission activity.
              </p>
            </div>
            <button
              onClick={onClose}
              className="hidden sm:inline-flex shrink-0 p-2 text-gray-900 dark:text-gray-100 hover:text-gray-500 hover:bg-white/80 dark:hover:bg-gray-800 rounded-full transition-colors bg-white/90 shadow-md backdrop-blur dark:bg-gray-900/90"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6 text-gray-900 dark:text-gray-100" />
            </button>
          </div>
          {revealedKey ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-amber-600 dark:text-amber-300 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">Full API key visible once</div>
                <div className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                  Save this key securely now. It will not be shown again after refresh. You can still see the masked key and regenerate later.
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="px-3 py-2 rounded-lg bg-white dark:bg-gray-950 text-theme border border-amber-200 dark:border-amber-800 text-xs break-all">
                    {revealedKey.apiKey}
                  </code>
                  <button
                    onClick={() => handleCopy(revealedKey.apiKey, 'Full API key copied.')}
                    className="px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/20"
                  >
                    Copy Key
                  </button>
                  <button
                    onClick={() => setRevealedKey(null)}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-theme"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-full min-h-72 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
              <p className="text-theme animate-pulse">Loading website integrations...</p>
            </div>
          ) : (
            <>
              {mode === 'list' ? (
                <WebsiteConnectionsList
                  connections={connections}
                  loading={loading}
                  onCreate={openCreate}
                  onEdit={openEdit}
                  onStats={openStats}
                  onRegenerate={handleRegenerate}
                  onDelete={handleDelete}
                  onSnippet={openSnippet}
                  onCopyMasked={(connection) => handleCopy(connection.key_prefix || '', 'Key prefix copied.')}
                />
              ) : null}

              {mode === 'form' ? (
                <WebsiteConnectionForm
                  mode={formMode}
                  form={form}
                  campaigns={campaigns}
                  sources={sources}
                  saving={saving}
                  onChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
                  onSubmit={handleSubmit}
                  onCancel={() => {
                    resetFormState()
                    setMode('list')
                  }}
                />
              ) : null}

              {mode === 'snippet' ? (
                <WebsiteSnippet
                  connection={selectedConnection}
                  apiKey={revealedKey?.connection?.id === selectedConnection?.id ? revealedKey.apiKey : null}
                  snippet={snippetText}
                  onClose={() => setMode('list')}
                  onCopy={(value) => handleCopy(value, 'Snippet copied.')}
                />
              ) : null}

              {mode === 'stats' ? (
                <WebsiteStatsPanel
                  connection={selectedConnection}
                  stats={stats}
                  loading={statsLoading}
                  onClose={() => setMode('list')}
                />
              ) : null}
            </>
          )}

          <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-300 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-200">
              <div className="font-semibold mb-1">Implementation notes</div>
              <ul className="list-disc pl-5 space-y-1">
                <li>Use a dedicated allowed origins list in production for stronger protection.</li>
                <li>Regenerating a key invalidates the previous key immediately.</li>
                <li>Website leads inherit campaign/source defaults from the selected connection.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
