import { api } from '@utils/api'

const basePath = '/api/system/company-website'

export const systemCompanyWebsiteService = {
  async getSettings() {
    const res = await api.get(`${basePath}/settings`)
    return res.data
  },

  async updateSettings(payload) {
    const res = await api.put(`${basePath}/settings`, payload)
    return res.data
  },

  async getHomepageSections() {
    const res = await api.get(`${basePath}/homepage-sections`)
    return res.data
  },

  async updateHomepageSection(id, payload) {
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

  async getAnalyticsOverview(from, to) {
    const res = await api.get(`${basePath}/analytics/overview`, { params: { from, to } })
    return res.data
  },

  async getAnalyticsPages(from, to) {
    const res = await api.get(`${basePath}/analytics/pages`, { params: { from, to } })
    return res.data
  },

  async getAnalyticsForms(from, to) {
    const res = await api.get(`${basePath}/analytics/forms`, { params: { from, to } })
    return res.data
  },

  async getAnalyticsCampaigns(from, to) {
    const res = await api.get(`${basePath}/analytics/campaigns`, { params: { from, to } })
    return res.data
  },
}
