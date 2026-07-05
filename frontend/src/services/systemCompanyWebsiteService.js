import { api } from '@utils/api'

const basePath = '/api/system/company-website'

const buildAnalyticsParams = (from, to, filters = {}) => ({
  from,
  to,
  utm_source: filters.utm_source || undefined,
  utm_medium: filters.utm_medium || undefined,
  utm_campaign: filters.utm_campaign || undefined,
  device: filters.device || undefined,
})

export const systemCompanyWebsiteService = {
  async getSettings() {
    const res = await api.get(`${basePath}/settings`)
    return res.data
  },

  async updateSettings(payload) {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData

    if (isFormData) {
      payload.append('_method', 'PUT')
      const res = await api.post(`${basePath}/settings`, payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return res.data
    }

    const res = await api.put(`${basePath}/settings`, payload)
    return res.data
  },

  async getHomepageSections() {
    const res = await api.get(`${basePath}/homepage-sections`)
    return res.data
  },

  async updateHomepageSection(id, payload) {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData

    if (isFormData) {
      payload.append('_method', 'PUT')
      const res = await api.post(`${basePath}/homepage-sections/${id}`, payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return res.data
    }

    const res = await api.put(`${basePath}/homepage-sections/${id}`, payload)
    return res.data
  },

  async getServices() {
    const res = await api.get(`${basePath}/services`)
    return res.data
  },

  async createService(payload) {
    const res = await api.post(`${basePath}/services`, payload)
    return res.data
  },

  async updateService(id, payload) {
    const res = await api.put(`${basePath}/services/${id}`, payload)
    return res.data
  },

  async deleteService(id) {
    await api.delete(`${basePath}/services/${id}`)
  },

  async getCareerPage() {
    const res = await api.get(`${basePath}/careers/page`)
    return res.data
  },

  async updateCareerPage(payload) {
    const res = await api.put(`${basePath}/careers/page`, payload)
    return res.data
  },

  async getCareerRoles() {
    const res = await api.get(`${basePath}/careers/roles`)
    return res.data
  },

  async getCareerApplications() {
    const res = await api.get(`${basePath}/careers/applications`)
    return res.data
  },

  async createCareerRole(payload) {
    const res = await api.post(`${basePath}/careers/roles`, payload)
    return res.data
  },

  async updateCareerRole(id, payload) {
    const res = await api.put(`${basePath}/careers/roles/${id}`, payload)
    return res.data
  },

  async deleteCareerRole(id) {
    await api.delete(`${basePath}/careers/roles/${id}`)
  },

  async getAnalyticsOverview(from, to, filters = {}) {
    const res = await api.get(`${basePath}/analytics/overview`, {
      params: buildAnalyticsParams(from, to, filters),
    })
    return res.data
  },

  async getAnalyticsPages(from, to, filters = {}) {
    const res = await api.get(`${basePath}/analytics/pages`, {
      params: buildAnalyticsParams(from, to, filters),
    })
    return res.data
  },

  async getAnalyticsForms(from, to, filters = {}) {
    const res = await api.get(`${basePath}/analytics/forms`, {
      params: buildAnalyticsParams(from, to, filters),
    })
    return res.data
  },

  async getAnalyticsCampaigns(from, to, filters = {}) {
    const res = await api.get(`${basePath}/analytics/campaigns`, {
      params: buildAnalyticsParams(from, to, filters),
    })
    return res.data
  },

  async getAnalyticsFilterOptions(from, to) {
    const res = await api.get(`${basePath}/analytics/filter-options`, {
      params: { from, to },
    })
    return res.data
  },
}
