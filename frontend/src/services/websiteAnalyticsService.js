import { api } from '@utils/api'

const withRange = (params = {}) => ({
  params,
})

export const websiteAnalyticsService = {
  async getOverview(from, to) {
    const res = await api.get('/api/website-analytics/overview', withRange({ from, to }))
    return res.data
  },

  async getPages(from, to) {
    const res = await api.get('/api/website-analytics/pages', withRange({ from, to }))
    return res.data
  },

  async getForms(from, to) {
    const res = await api.get('/api/website-analytics/forms', withRange({ from, to }))
    return res.data
  },

  async getCampaigns(from, to) {
    const res = await api.get('/api/website-analytics/campaigns', withRange({ from, to }))
    return res.data
  },
}
