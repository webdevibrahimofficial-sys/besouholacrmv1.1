/**
 * useTenants — shared data hook for all Super Admin tenant pages.
 * SystemSubscriptions / SystemModules / TenantSetup all share this
 * so API logic lives in one place.
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { api } from '../utils/api'

export const PLANS = [
  { id: 'core',         name: 'Core System',  modules: ['dashboard', 'reports', 'users', 'settings'] },
  { id: 'basic',        name: 'Basic',         modules: ['leads', 'inventory', 'campaigns', 'users'] },
  { id: 'professional', name: 'Professional',  modules: ['leads', 'inventory', 'campaigns', 'customers', 'users'] },
  { id: 'enterprise',   name: 'Enterprise',    modules: ['leads', 'inventory', 'campaigns', 'customers', 'users'] },
  { id: 'custom',       name: 'Custom Plan',   modules: [] },
]

export const AVAILABLE_MODULES = [
  { id: 'dashboard',            name: 'Dashboard' },
  { id: 'leads',                name: 'Leads Management' },
  { id: 'telesales',            name: 'Telesales' },
  { id: 'inventory',            name: 'Inventory' },
  { id: 'campaigns',            name: 'Marketing Campaigns' },
  { id: 'customers',            name: 'Customers' },
  { id: 'contract_collections', name: 'Contracts and Collections' },
  { id: 'users',                name: 'User Management' },
  { id: 'reports',              name: 'Reports' },
  { id: 'settings',             name: 'Settings' },
]

export const AVAILABLE_TENANT_FEATURES = [
  {
    key: 'besouhola_copilot',
    name: 'Besouhola Copilot',
    description: 'Enable Besouhola Copilot for reports, filters, delayed leads, and tasks.',
  },
]

export const PLAN_COLOR = {
  core:         'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  basic:        'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  professional: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  enterprise:   'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  custom:       'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
}

export const STATUS_COLOR = {
  active:    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  expired:   'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

const DEFAULT_FILTERS = {
  search:       '',
  plan:         'all',
  status:       'all',
  company_type: 'all',
}

function useDebouncedValue(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [value, delay])

  return debouncedValue
}

export function useTenants(initialFilters = {}) {
  const [tenants,    setTenants]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [filters,    setFilters]    = useState({ ...DEFAULT_FILTERS, ...initialFilters })
  const debouncedSearch = useDebouncedValue(filters.search)

  const fetch = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = { page }
      Object.entries({ ...filters, search: debouncedSearch }).forEach(([k, v]) => {
        if (v && v !== 'all') params[k] = v
      })
      const { data } = await api.get('/super-admin/tenants', { params })
      setTenants(data.tenants.data)
      setPagination({
        current_page: data.tenants.current_page,
        last_page:    data.tenants.last_page,
        total:        data.tenants.total,
      })
    } catch {
      toast.error('Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, filters])

  useEffect(() => { fetch(1) }, [fetch])

  const updateTenant = useCallback(async (id, payload) => {
    await api.put(`/super-admin/tenants/${id}`, payload)
    await fetch(pagination.current_page)
  }, [fetch, pagination.current_page])

  const updateModules = useCallback(async (tenantId, modules) => {
    await api.put(`/super-admin/tenants/${tenantId}/modules`, { modules })
    await fetch(pagination.current_page)
  }, [fetch, pagination.current_page])

  return {
    tenants, loading, pagination,
    filters, setFilters,
    refetch: fetch,
    updateTenant,
    updateModules,
  }
}
