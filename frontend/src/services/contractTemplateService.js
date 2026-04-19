import { api } from '@utils/api'

export const getContractTemplates = async () => {
  const res = await api.get('/api/contract-templates')
  return res?.data || []
}

export const getContractTemplate = async (id) => {
  const res = await api.get(`/api/contract-templates/${id}`)
  return res?.data
}

export const createContractTemplate = async (tpl) => {
  const res = await api.post('/api/contract-templates', tpl)
  return res?.data
}

export const updateContractTemplate = async (id, tpl) => {
  const isFormData = typeof FormData !== 'undefined' && tpl instanceof FormData
  if (isFormData) {
    if (!tpl.has('_method')) tpl.append('_method', 'PUT')
    const res = await api.post(`/api/contract-templates/${id}`, tpl)
    return res?.data
  }
  const res = await api.put(`/api/contract-templates/${id}`, tpl)
  return res?.data
}

export const deleteContractTemplate = async (id) => {
  const res = await api.delete(`/api/contract-templates/${id}`)
  return res?.data
}

export const contractTemplateService = {
  getContractTemplates,
  getContractTemplate,
  createContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
}
