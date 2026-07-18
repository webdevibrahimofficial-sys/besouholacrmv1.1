import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { api } from '../utils/api'

export const AVAILABLE_PLAN_MODULES = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'leads', name: 'Leads Management' },
  { id: 'telesales', name: 'Telesales' },
  { id: 'inventory', name: 'Inventory' },
  { id: 'campaigns', name: 'Marketing Campaigns' },
  { id: 'customers', name: 'Customers' },
  { id: 'contract_collections', name: 'Contracts and Collections' },
  { id: 'users', name: 'User Management' },
  { id: 'reports', name: 'Reports' },
  { id: 'settings', name: 'Settings' },
]

export const PLAN_COLOR = {
  basic: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  professional: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  enterprise: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  custom: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
}

export function getPlanModulesForCompany(plan, companyType = 'General') {
  if (!plan) return []

  const overrides = plan.company_type_overrides || {}
  if (Array.isArray(overrides?.[companyType]) && overrides[companyType].length > 0) {
    return overrides[companyType]
  }

  return Array.isArray(plan.modules) ? plan.modules : []
}

export function useSubscriptionPlans(options = {}) {
  const includeInactive = options.includeInactive ?? false
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/super-admin/subscription-plans', {
        params: includeInactive ? { include_inactive: 1 } : undefined,
      })
      const apiPlans = Array.isArray(data?.plans) ? data.plans : []
      setPlans(apiPlans)
    } catch (err) {
      console.error('Failed to load subscription plans:', err)
      setPlans([])
      setError(err?.response?.data?.message || 'Failed to load subscription plans')
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  const createPlan = useCallback(async (payload) => {
    await api.post('/super-admin/subscription-plans', payload)
    toast.success('Plan created successfully')
    await fetchPlans()
  }, [fetchPlans])

  const updatePlan = useCallback(async (id, payload) => {
    await api.put(`/super-admin/subscription-plans/${id}`, payload)
    toast.success('Plan updated successfully')
    await fetchPlans()
  }, [fetchPlans])

  const deletePlan = useCallback(async (id) => {
    await api.delete(`/super-admin/subscription-plans/${id}`)
    toast.success('Plan deleted successfully')
    await fetchPlans()
  }, [fetchPlans])

  const planMap = useMemo(() => {
    return plans.reduce((acc, plan) => {
      acc[plan.code] = plan
      return acc
    }, {})
  }, [plans])

  return {
    plans,
    loading,
    error,
    planMap,
    refetchPlans: fetchPlans,
    createPlan,
    updatePlan,
    deletePlan,
  }
}
