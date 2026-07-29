import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'

export const useStages = ({ workflowKey = 'sales', activeOnly = false } = {}) => {
  const [stages, setStages] = useState([])
  const [statuses, setStatuses] = useState([])

  const normalizeData = useCallback((raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return []

    const first = raw[0]
    if (typeof first === 'string') {
      return raw.map((name) => ({
        id: null,
        name,
        nameAr: '',
        color: '#3b82f6',
        icon: 'BarChart2',
        type: '',
        workflowKey: workflowKey || 'sales',
        isActive: true,
        order: 0,
      }))
    }

    return raw.map((stage) => ({
      id: stage?.id ?? null,
      name: stage?.name || String(stage),
      nameAr: stage?.nameAr || stage?.name_ar || '',
      color: stage?.color || '#3b82f6',
      icon: stage?.icon || 'BarChart2',
      type: stage?.type || '',
      workflowKey: stage?.workflow_key || stage?.workflowKey || 'sales',
      isActive: stage?.is_active !== false,
      order: stage?.order ?? 0,
    }))
  }, [workflowKey])

  const loadStages = useCallback(async () => {
    try {
      const params = {}
      if (workflowKey) params.workflow_key = workflowKey
      if (activeOnly) params.active = 1
      const { data } = await api.get('/api/stages', { params })
      const normalized = normalizeData(data)
      setStages(normalized)
      return normalized
    } catch {
    }

    if (workflowKey !== 'sales') {
      setStages([])
      return []
    }

    try {
      const saved = JSON.parse(localStorage.getItem('crmStages') || '[]')
      const normalized = normalizeData(saved)
      setStages(normalized)
      return normalized
    } catch {
      setStages([])
      return []
    }
  }, [activeOnly, normalizeData, workflowKey])

  const loadStatuses = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('crmStatuses') || '[]')
      const normalized = normalizeData(saved)
      setStatuses(normalized)
      return normalized
    } catch {
      setStatuses([])
      return []
    }
  }, [normalizeData])

  useEffect(() => {
    loadStages()
    loadStatuses()

    const handleStorageChange = (event) => {
      if (event.key === 'crmStages') {
        loadStages()
      } else if (event.key === 'crmStatuses') {
        loadStatuses()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [loadStages, loadStatuses])

  return { stages, statuses, loadStages, loadStatuses }
}
