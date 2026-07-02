import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  Filter,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useTheme } from '@shared/context/ThemeProvider'
import { api } from '../utils/api'

const DEFAULT_FILTERS = {
  search: '',
  tenant_id: '',
  type: '',
  status: '',
  currency: '',
  source: '',
  date_from: '',
  date_to: '',
}

const DEFAULT_FORM = {
  tenant_id: '',
  type: 'renewal',
  status: 'paid',
  currency: '',
  total_amount: '',
  payment_method: '',
  billing_cycle: 'monthly',
  period_start: '',
  period_end: '',
  notes: '',
  items: [],
}

const TYPE_OPTIONS = ['creation', 'renewal', 'upgrade', 'downgrade', 'cancellation', 'refund', 'manual_adjustment']
const STATUS_OPTIONS = ['pending', 'paid', 'failed', 'refunded', 'void']
const SOURCE_OPTIONS = ['manual', 'auto_system', 'gateway']
const PAYMENT_METHODS = ['bank_transfer', 'instapay', 'cash', 'card', 'gateway']

const getFeatureNotReadyMessage = (meta, fallback) => {
  if (meta?.message) return meta.message
  if (meta?.migration_hint) return meta.migration_hint
  return fallback
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const collectPaginatedItems = async (requestPage, key) => {
  const items = []
  let page = 1
  let lastPage = 1

  do {
    const response = await requestPage(page)
    const payload = response?.data?.[key]
    const pageItems = payload?.data || []
    items.push(...pageItems)
    lastPage = payload?.last_page || 1
    page += 1
  } while (page <= lastPage)

  return items
}

const emptyItem = () => ({
  item_type: 'plan',
  item_code: '',
  label: '',
  quantity: 1,
  unit_price: '',
  amount: '',
})

function ManualTransactionModal({ open, tenants, initialData = null, onClose, onSave, loading }) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [form, setForm] = useState(DEFAULT_FORM)
  const [tenantContracts, setTenantContracts] = useState([])

  useEffect(() => {
    if (open) {
      setForm(initialData ? {
        tenant_id: initialData.tenant_id ? String(initialData.tenant_id) : '',
        type: initialData.type || 'renewal',
        status: initialData.status || 'paid',
        currency: initialData.currency || 'EGP',
        total_amount: initialData.total_amount ?? '',
        payment_method: initialData.payment_method || '',
        billing_cycle: initialData.billing_cycle || 'monthly',
        period_start: initialData.period_start || '',
        period_end: initialData.period_end || '',
        notes: initialData.notes || '',
        items: Array.isArray(initialData.items)
          ? initialData.items.map((item) => ({
              item_type: item.item_type || 'plan',
              item_code: item.item_code || '',
              label: item.label || '',
              quantity: item.quantity ?? 1,
              unit_price: item.unit_price ?? '',
              amount: item.amount ?? '',
            }))
          : [],
      } : DEFAULT_FORM)
      setTenantContracts([])
    }
  }, [open, initialData])

  useEffect(() => {
    const loadContracts = async () => {
      if (!form.tenant_id) {
        setTenantContracts([])
        return
      }

      try {
        const response = await api.get(`/super-admin/tenants/${form.tenant_id}/contracts`)
        const contracts = Array.isArray(response.data?.contracts) ? response.data.contracts : []
        setTenantContracts(contracts)
        const currentContract = contracts.find((contract) => !contract.effective_to) || contracts[0]

        if (!currentContract) return

        setForm((prev) => ({
          ...prev,
          currency: prev.currency || currentContract.currency || 'EGP',
          billing_cycle: prev.billing_cycle || currentContract.billing_cycle || 'monthly',
          total_amount: prev.total_amount || String(currentContract.agreed_amount || ''),
        }))
      } catch (error) {
        console.error('Failed to load tenant contracts:', error)
      }
    }

    loadContracts()
  }, [form.tenant_id])

  if (!open || typeof document === 'undefined') return null

  const currentContract = tenantContracts.find((contract) => !contract.effective_to) || tenantContracts[0]

  const inputClass = `h-10 w-full rounded-xl border px-3 text-sm outline-none transition ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'
  }`

  const handleItemChange = (index, key, value) => {
    setForm((prev) => {
      const nextItems = [...prev.items]
      nextItems[index] = { ...nextItems[index], [key]: value }
      if (key === 'quantity' || key === 'unit_price') {
        const quantity = Number(key === 'quantity' ? value : nextItems[index].quantity || 0)
        const unitPrice = Number(key === 'unit_price' ? value : nextItems[index].unit_price || 0)
        nextItems[index].amount = String(quantity * unitPrice || '')
      }
      return { ...prev, items: nextItems }
    })
  }

  const submit = async (event) => {
    event.preventDefault()

    if (!form.tenant_id || !form.total_amount || !form.currency) {
      toast.error(t('Please complete tenant, amount, and currency'))
      return
    }

    const payload = {
      tenant_id: Number(form.tenant_id),
      type: form.type,
      status: form.status,
      currency: form.currency,
      total_amount: Number(form.total_amount),
      payment_method: form.payment_method || undefined,
      period_start: form.period_start || undefined,
      period_end: form.period_end || undefined,
      notes: form.notes || undefined,
    }

    if (currentContract?.id) {
      payload.contract_id = currentContract.id
    }

    if (form.items.length > 0) {
      payload.items = form.items
        .filter((item) => item.label && item.amount !== '')
        .map((item) => ({
          item_type: item.item_type,
          item_code: item.item_code || undefined,
          label: item.label,
          quantity: Number(item.quantity || 1),
          unit_price: Number(item.unit_price || 0),
          amount: Number(item.amount || 0),
        }))
    }

    await onSave(payload)
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm">
      <div className={`w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border ${
        isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
      }`}>
        <div className={`sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4 ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}>
          <h2 className="text-lg font-bold">{initialData?.id ? t('Edit Transaction') : t('Record Manual Transaction')}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('Tenant')}</label>
              <select className={inputClass} disabled={!!initialData?.id} value={form.tenant_id} onChange={(e) => setForm((prev) => ({ ...prev, tenant_id: e.target.value }))}>
                <option value="">{t('Select tenant')}</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                ))}
              </select>
              {currentContract && (
                <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {t('Current contract')}: {currentContract.plan_code} • {currentContract.agreed_amount} {currentContract.currency}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('Type')}</label>
              <select className={inputClass} value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
                {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('Status')}</label>
              <select className={inputClass} value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('Payment Method')}</label>
              <select className={inputClass} value={form.payment_method} onChange={(e) => setForm((prev) => ({ ...prev, payment_method: e.target.value }))}>
                <option value="">{t('Select')}</option>
                {PAYMENT_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('Amount')}</label>
              <input className={inputClass} type="number" step="0.01" value={form.total_amount} onChange={(e) => setForm((prev) => ({ ...prev, total_amount: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('Currency')}</label>
              <input className={inputClass} maxLength={3} value={form.currency} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('Period Start')}</label>
              <input className={inputClass} type="date" value={form.period_start} onChange={(e) => setForm((prev) => ({ ...prev, period_start: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('Period End')}</label>
              <input className={inputClass} type="date" value={form.period_end} onChange={(e) => setForm((prev) => ({ ...prev, period_end: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium">{t('Line Items')}</label>
              <button type="button" onClick={() => setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }))} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white">
                {t('Add Item')}
              </button>
            </div>
            <div className="space-y-3">
              {form.items.length === 0 && (
                <div className={`rounded-xl border border-dashed p-4 text-sm ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                  {t('Leave empty to auto-create one subscription line item from total amount.')}
                </div>
              )}
              {form.items.map((item, index) => (
                <div key={`item-${index}`} className={`rounded-xl border p-3 ${isDark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50/80'}`}>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <select className={inputClass} value={item.item_type} onChange={(e) => handleItemChange(index, 'item_type', e.target.value)}>
                      {['plan', 'addon', 'discount', 'tax', 'adjustment'].map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <input className={inputClass} placeholder={t('Code')} value={item.item_code} onChange={(e) => handleItemChange(index, 'item_code', e.target.value)} />
                    <input className={inputClass} placeholder={t('Label')} value={item.label} onChange={(e) => handleItemChange(index, 'label', e.target.value)} />
                    <input className={inputClass} type="number" min="1" placeholder={t('Qty')} value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} />
                    <input className={inputClass} type="number" step="0.01" placeholder={t('Unit Price')} value={item.unit_price} onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)} />
                    <div className="flex gap-2">
                      <input className={inputClass} type="number" step="0.01" placeholder={t('Amount')} value={item.amount} onChange={(e) => handleItemChange(index, 'amount', e.target.value)} />
                      <button type="button" onClick={() => setForm((prev) => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-xl border px-3">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('Notes')}</label>
            <textarea className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`} rows={4} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={`rounded-xl px-4 py-2 text-sm ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
              {t('Cancel')}
            </button>
            <button type="submit" disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60">
              {loading ? t('Saving...') : initialData?.id ? t('Save Changes') : t('Record Transaction')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default function SystemTransactions() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({ totals_by_currency: [], pending_count: 0, last_24h_count: 0, total_results: 0 })
  const [tenants, setTenants] = useState([])
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0, from: 0, to: 0 })
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [savingRecord, setSavingRecord] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [transactionsMeta, setTransactionsMeta] = useState({ ready: true })

  const glassCard = `rounded-[26px] border backdrop-blur-xl transition-all duration-200 ${
    isDark ? 'border-slate-800 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)]' : 'border-slate-200/75 bg-white/72 shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
  }`
  const inputClass = `h-10 w-full rounded-xl border px-3 text-sm outline-none transition ${
    isDark ? 'border-slate-700/60 bg-slate-900/80 text-slate-100' : 'border-slate-200/80 bg-white/80 text-slate-700'
  }`
  const transactionsReady = transactionsMeta?.ready !== false
  const transactionsBlockedMessage = getFeatureNotReadyMessage(
    transactionsMeta,
    t('Transactions are temporarily unavailable until the new billing tables are migrated.'),
  )
  const headingClass = isDark ? 'text-white' : 'text-slate-900'
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-500'

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [filters.search])

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const allTenants = await collectPaginatedItems(
          (pageNumber) => api.get('/super-admin/tenants', { params: { page: pageNumber, per_page: 100, view: 'current' } }),
          'tenants'
        )
        setTenants(allTenants)
      } catch (error) {
        console.error('Failed to load tenants:', error)
      }
    }

    loadTenants()
  }, [])

  useEffect(() => {
    const loadTransactions = async () => {
      setLoading(true)
      try {
        const params = {
          ...Object.fromEntries(Object.entries({ ...filters, search: debouncedSearch }).filter(([, value]) => value !== '' && value != null)),
          page,
          per_page: pagination.per_page,
        }

        const { data } = await api.get('/super-admin/transactions', { params })
        setTransactions(data?.transactions?.data || [])
        setSummary(data?.summary || { totals_by_currency: [], pending_count: 0, last_24h_count: 0, total_results: 0 })
        setTransactionsMeta(data?.meta || { ready: true })
        setPagination((prev) => ({
          ...prev,
          current_page: data?.transactions?.current_page || 1,
          last_page: data?.transactions?.last_page || 1,
          per_page: data?.transactions?.per_page || prev.per_page,
          total: data?.transactions?.total || 0,
          from: data?.transactions?.from || 0,
          to: data?.transactions?.to || 0,
        }))
      } catch (error) {
        console.error('Failed to load transactions:', error)
        const meta = error?.response?.data?.meta || null
        setTransactionsMeta(meta || { ready: false })
        toast.error(getFeatureNotReadyMessage(meta, t('Failed to load transactions')))
      } finally {
        setLoading(false)
      }
    }

    loadTransactions()
  }, [debouncedSearch, filters.tenant_id, filters.type, filters.status, filters.currency, filters.source, filters.date_from, filters.date_to, page, pagination.per_page, refreshKey, t])

  const statCards = useMemo(() => {
    const amountCards = summary.totals_by_currency.map((item) => ({
      key: `currency-${item.currency}`,
      label: `${item.currency} Total`,
      value: `${item.total_amount.toLocaleString()} ${item.currency}`,
      icon: Wallet,
    }))

    return [
      ...amountCards,
      { key: 'pending', label: 'Pending', value: summary.pending_count, icon: Receipt },
      { key: 'last24h', label: 'Last 24h', value: summary.last_24h_count, icon: ArrowLeftRight },
    ]
  }, [summary])

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setDebouncedSearch('')
    setPage(1)
  }

  const handleExport = async () => {
    if (!transactionsReady) {
      toast.error(transactionsBlockedMessage)
      return
    }

    setExporting(true)
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, search: debouncedSearch }).filter(([, value]) => value !== '' && value != null))
      const response = await api.get('/super-admin/transactions/export', { params, responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'subscription_transactions.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export transactions:', error)
      toast.error(t('Failed to export transactions'))
    } finally {
      setExporting(false)
    }
  }

  const handleCreateTransaction = async (payload) => {
    if (!transactionsReady) {
      toast.error(transactionsBlockedMessage)
      return
    }

    setSavingRecord(true)
    try {
      await api.post('/super-admin/transactions', payload)
      toast.success(t('Transaction recorded successfully'))
      setShowRecordModal(false)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to record transaction:', error)
      const message = error?.response?.data?.message || Object.values(error?.response?.data?.errors || {}).flat()[0]
      toast.error(message || t('Failed to record transaction'))
    } finally {
      setSavingRecord(false)
    }
  }

  const handleUpdateTransaction = async (payload) => {
    if (!editingTransaction?.id) return
    if (!transactionsReady) {
      toast.error(transactionsBlockedMessage)
      return
    }

    setSavingRecord(true)
    try {
      await api.put(`/super-admin/transactions/${editingTransaction.id}`, payload)
      toast.success(t('Transaction updated successfully'))
      setEditingTransaction(null)
      setShowRecordModal(false)
      setSelectedTransaction(null)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to update transaction:', error)
      const message = error?.response?.data?.message || Object.values(error?.response?.data?.errors || {}).flat()[0]
      toast.error(message || t('Failed to update transaction'))
    } finally {
      setSavingRecord(false)
    }
  }

  const handleOpenDetails = async (transactionId) => {
    if (!transactionsReady) {
      toast.error(transactionsBlockedMessage)
      return
    }

    try {
      const { data } = await api.get(`/super-admin/transactions/${transactionId}`)
      setSelectedTransaction(data?.transaction || null)
    } catch (error) {
      console.error('Failed to load transaction details:', error)
      toast.error(t('Failed to load transaction details'))
    }
  }

  const handleStartEdit = async (transactionId) => {
    if (!transactionsReady) {
      toast.error(transactionsBlockedMessage)
      return
    }

    try {
      const { data } = await api.get(`/super-admin/transactions/${transactionId}`)
      setEditingTransaction(data?.transaction || null)
      setShowRecordModal(true)
    } catch (error) {
      console.error('Failed to load transaction for edit:', error)
      toast.error(t('Failed to load transaction details'))
    }
  }

  const handleVoid = async (transactionId) => {
    if (!transactionsReady) {
      toast.error(transactionsBlockedMessage)
      return
    }

    const reason = window.prompt(t('Optional void reason'))
    try {
      await api.post(`/super-admin/transactions/${transactionId}/void`, {
        reason: reason || undefined,
      })
      toast.success(t('Transaction voided successfully'))
      setSelectedTransaction(null)
      setRefreshKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to void transaction:', error)
      toast.error(error?.response?.data?.message || t('Failed to void transaction'))
    }
  }

  const detailsDrawer = selectedTransaction && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm">
          <button type="button" className="absolute inset-0" onClick={() => setSelectedTransaction(null)} aria-label={t('Close')} />
          <div className={`relative z-10 w-full max-w-4xl max-h-[84vh] overflow-y-auto rounded-2xl border ${
            isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-5 py-4 ${
              isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
            }`}>
              <div>
                <p className={`text-xs uppercase tracking-[0.25em] ${mutedTextClass}`}>{t('Transaction Details')}</p>
                <h2 className="mt-2 text-xl font-bold">#{selectedTransaction.id} {selectedTransaction.tenant_name}</h2>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>{selectedTransaction.type} | {selectedTransaction.status} | {formatDateTime(selectedTransaction.created_at)}</p>
              </div>
              <div className="flex gap-2">
                {selectedTransaction.status !== 'void' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(selectedTransaction.id)}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-sm text-white"
                    >
                      {t('Edit')}
                    </button>
                    <button type="button" onClick={() => handleVoid(selectedTransaction.id)} className="rounded-xl bg-rose-600 px-3 py-2 text-sm text-white">
                      {t('Void')}
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setSelectedTransaction(null)} className="rounded-xl border px-3 py-2 text-sm">
                  {t('Close')}
                </button>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <div className={`${glassCard} p-4`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Amount', `${selectedTransaction.total_amount} ${selectedTransaction.currency}`],
                    ['Payment Method', selectedTransaction.payment_method || '-'],
                    ['Source', selectedTransaction.source || '-'],
                    ['Gateway Ref', selectedTransaction.gateway_reference || '-'],
                    ['Plan Code', selectedTransaction.plan_code || '-'],
                    ['Period Start', selectedTransaction.period_start || '-'],
                    ['Period End', selectedTransaction.period_end || '-'],
                    ['Created By', selectedTransaction.created_by_name || '-'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className={`text-xs uppercase tracking-[0.2em] ${mutedTextClass}`}>{t(label)}</p>
                      <p className="mt-2 text-sm font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`${glassCard} p-4`}>
                <h3 className="text-sm font-semibold">{t('Line Items')}</h3>
                <div className="mt-3 space-y-3">
                  {(selectedTransaction.items || []).length === 0 && <p className={`text-sm ${mutedTextClass}`}>{t('No items')}</p>}
                  {(selectedTransaction.items || []).map((item) => (
                    <div key={item.id} className={`rounded-2xl border p-3 ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50/80'}`}>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                        <div><span className={`text-xs ${mutedTextClass}`}>{t('Type')}</span><p className="text-sm font-semibold">{item.item_type}</p></div>
                        <div><span className={`text-xs ${mutedTextClass}`}>{t('Label')}</span><p className="text-sm font-semibold">{item.label}</p></div>
                        <div><span className={`text-xs ${mutedTextClass}`}>{t('Quantity')}</span><p className="text-sm font-semibold">{item.quantity}</p></div>
                        <div><span className={`text-xs ${mutedTextClass}`}>{t('Unit Price')}</span><p className="text-sm font-semibold">{item.unit_price}</p></div>
                        <div><span className={`text-xs ${mutedTextClass}`}>{t('Amount')}</span><p className="text-sm font-semibold">{item.amount}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`${glassCard} p-4`}>
                <h3 className="text-sm font-semibold">{t('Notes')}</h3>
                <p className={`mt-3 text-sm leading-6 ${selectedTransaction.notes ? '' : mutedTextClass}`}>{selectedTransaction.notes || t('No notes')}</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <div className={`relative mx-auto max-w-screen-2xl overflow-hidden rounded-[32px] px-4 py-6 md:px-6 lg:px-8 ${
      isDark ? 'border border-slate-800 bg-[#0f172a] shadow-[0_24px_70px_rgba(0,0,0,0.45)]' : 'border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_rgba(15,23,42,0.08)]'
    }`}>
      <div className="relative z-10">
        <header className="mb-10">
          <div className="flex gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div>
              <p className={`mb-2 text-xs uppercase tracking-[0.25em] ${mutedTextClass}`}>{t('Admin Panel')}</p>
              <h1 className={`text-2xl font-bold tracking-tight md:text-3xl ${headingClass}`}>{t('System Transactions')}</h1>
              <p className={`mt-3 max-w-2xl text-sm ${mutedTextClass}`}>{t('Track subscription payments, manual adjustments, renewals, and contract-linked billing activity.')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setRefreshKey((prev) => prev + 1)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {t('Refresh')}
              </button>
              <button type="button" onClick={handleExport} disabled={exporting || !transactionsReady} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Download size={14} />
                {exporting ? t('Exporting...') : t('Export CSV')}
              </button>
              <button type="button" onClick={() => setShowRecordModal(true)} disabled={!transactionsReady} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Plus size={14} />
                {t('Record Manual Transaction')}
              </button>
            </div>
          </div>
        </header>

        {!transactionsReady ? (
          <section className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
            isDark
              ? 'border-amber-900/50 bg-amber-950/30 text-amber-100'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <p className="font-semibold">{t('Transaction ledger is not ready yet')}</p>
            <p className="mt-1 opacity-90">{transactionsBlockedMessage}</p>
          </section>
        ) : null}

        <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.key} className={`${glassCard} px-4 py-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs uppercase tracking-[0.22em] ${mutedTextClass}`}>{t(card.label)}</p>
                    <p className={`mt-3 text-2xl font-bold tracking-tight ${headingClass}`}>{card.value}</p>
                  </div>
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                    <Icon size={18} />
                  </span>
                </div>
              </div>
            )
          })}
        </section>

        <section className={`${glassCard} mb-5 p-5 md:p-6`}>
          <div className="mb-5 flex gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                <Filter size={20} />
              </span>
              <div>
                <h2 className={`text-xl font-bold ${headingClass}`}>{t('Filters')}</h2>
                <p className={`mt-1 text-xs ${mutedTextClass}`}>{t('Use tenant, transaction, or date filters to narrow the ledger.')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShowMoreFilters((prev) => !prev)} className={`inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold ${isDark ? 'bg-blue-950/40 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                <span>{showMoreFilters ? t('Hide filters') : t('More filters')}</span>
                <ChevronDown size={18} className={`transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
              </button>
              <button type="button" onClick={clearFilters} className={`px-2 py-2 text-xs font-medium ${headingClass}`}>{t('Reset')}</button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold"><Search className="h-4 w-4 text-blue-500" />{t('Search')}</label>
              <input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder={t('Search notes, gateway reference, or tenant...')} className={inputClass} />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold">{t('Tenant')}</label>
              <select value={filters.tenant_id} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, tenant_id: e.target.value })) }} className={inputClass}>
                <option value="">{t('All tenants')}</option>
                {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold">{t('Type')}</label>
              <select value={filters.type} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, type: e.target.value })) }} className={inputClass}>
                <option value="">{t('All types')}</option>
                {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold">{t('Status')}</label>
              <select value={filters.status} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, status: e.target.value })) }} className={inputClass}>
                <option value="">{t('All statuses')}</option>
                {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>

          {showMoreFilters && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block text-xs font-semibold">{t('Currency')}</label>
                <input value={filters.currency} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, currency: e.target.value.toUpperCase() })) }} placeholder="EGP" className={inputClass} />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold">{t('Source')}</label>
                <select value={filters.source} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, source: e.target.value })) }} className={inputClass}>
                  <option value="">{t('All sources')}</option>
                  {SOURCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold">{t('Start Date')}</label>
                <input type="date" value={filters.date_from} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, date_from: e.target.value })) }} className={inputClass} />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold">{t('End Date')}</label>
                <input type="date" value={filters.date_to} onChange={(e) => { setPage(1); setFilters((prev) => ({ ...prev, date_to: e.target.value })) }} className={inputClass} />
              </div>
            </div>
          )}
        </section>

        <section className={`${glassCard} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className={isDark ? 'bg-slate-950/70' : 'bg-slate-50/90'}>
                <tr>
                  {['Tenant', 'Type', 'Status', 'Amount', 'Source', 'Payment', 'Created', 'Actions'].map((label) => (
                    <th key={label} className="px-4 py-3 text-left font-medium text-theme">{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800 bg-slate-900/60' : 'divide-slate-200 bg-white/85'}`}>
                {loading ? (
                  <tr><td colSpan="8" className="px-4 py-10 text-center">{t('Loading...')}</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan="8" className="px-4 py-10 text-center">{t('No transactions found.')}</td></tr>
                ) : transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{transaction.tenant_name || `#${transaction.tenant_id}`}</div>
                      <div className={`text-xs ${mutedTextClass}`}>#{transaction.id}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{transaction.type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                        transaction.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                        transaction.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        transaction.status === 'void' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{transaction.total_amount} {transaction.currency}</td>
                    <td className="px-4 py-3">{transaction.source}</td>
                    <td className="px-4 py-3">{transaction.payment_method || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(transaction.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => handleOpenDetails(transaction.id)} className={`text-sm font-medium ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
                          {t('View details')}
                        </button>
                        {transaction.status !== 'void' && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(transaction.id)}
                            className={`inline-flex items-center gap-1 text-sm font-medium ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}
                          >
                            <Edit size={14} />
                            {t('Edit')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`flex gap-4 border-t px-5 py-4 md:flex-row md:items-center md:justify-between ${isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'}`}>
            <div className="text-sm">
              {t('Showing {{from}}-{{to}} of {{total}}', {
                from: pagination.total === 0 ? 0 : pagination.from,
                to: pagination.total === 0 ? 0 : pagination.to,
                total: pagination.total,
              })}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button type="button" disabled={loading || pagination.current_page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40">
                  <ChevronLeft size={18} />
                </button>
                <span className="min-w-[96px] text-center font-medium">
                  {t('Page {{page}} of {{pages}}', { page: Math.max(1, pagination.current_page), pages: Math.max(1, pagination.last_page) })}
                </span>
                <button type="button" disabled={loading || pagination.current_page === pagination.last_page || pagination.total === 0} onClick={() => setPage((current) => Math.min(pagination.last_page, current + 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40">
                  <ChevronRight size={18} />
                </button>
              </div>
              <select value={pagination.per_page} onChange={(e) => { setPage(1); setPagination((prev) => ({ ...prev, per_page: Number(e.target.value) })) }} className={inputClass}>
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
          </div>
        </section>
      </div>

      <ManualTransactionModal
        open={showRecordModal}
        tenants={tenants}
        initialData={editingTransaction}
        onClose={() => {
          setShowRecordModal(false)
          setEditingTransaction(null)
        }}
        onSave={editingTransaction ? handleUpdateTransaction : handleCreateTransaction}
        loading={savingRecord}
      />
      {detailsDrawer}
    </div>
  )
}
