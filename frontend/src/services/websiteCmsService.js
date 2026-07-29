import { api } from '@utils/api'

export const websiteCmsService = {
  async getSettings() {
    const res = await api.get('/api/website-cms/settings')
    return res.data
  },

  async updateSettings(payload) {
    const res = await api.put('/api/website-cms/settings', payload)
    return res.data
  },

  async getHomepageSections() {
    const res = await api.get('/api/website-cms/homepage-sections')
    return res.data
  },

  async updateHomepageSection(id, payload) {
    const res = await api.put(`/api/website-cms/homepage-sections/${id}`, payload)
    return res.data
  },

  async getServices() {
    const res = await api.get('/api/website-cms/services')
    return res.data
  },

  async createService(payload) {
    const res = await api.post('/api/website-cms/services', payload)
    return res.data
  },

  async updateService(id, payload) {
    const res = await api.put(`/api/website-cms/services/${id}`, payload)
    return res.data
  },

  async deleteService(id) {
    await api.delete(`/api/website-cms/services/${id}`)
  },
}
