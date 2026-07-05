import { api } from '@utils/api'

export const getWhatsappSettings = async () => {
  const res = await api.get('/api/whatsapp-settings')
  return res?.data
}

export const updateWhatsappSettings = async (settings) => {
  const res = await api.put('/api/whatsapp-settings', settings)
  return res?.data
}

export const getWhatsappTemplates = async () => {
  const res = await api.get('/api/whatsapp-templates')
  return res?.data
}

export const createWhatsappTemplate = async (template) => {
  const res = await api.post('/api/whatsapp-templates', template)
  return res?.data
}

export const updateWhatsappTemplate = async (id, template) => {
  const res = await api.put(`/api/whatsapp-templates/${id}`, template)
  return res?.data
}

export const deleteWhatsappTemplate = async (id) => {
  const res = await api.delete(`/api/whatsapp-templates/${id}`)
  return res?.data
}

export const sendWhatsappTest = async ({ api_key, phone_number_id }) => {
  const res = await api.post('/api/whatsapp/send-test', { api_key, phone_number_id })
  return res?.data
}

export const getWhatsappMessages = async () => {
  const res = await api.get('/api/whatsapp/messages')
  return res?.data || []
}

export const getLeadWhatsappMessages = async (leadId) => {
  const res = await api.get(`/api/v1/leads/${leadId}/whatsapp-messages`)
  return res?.data || []
}

export const sendWhatsappTemplate = async ({ recipient_number, template_name, variables, language = 'en_US' }) => {
  const res = await api.post('/api/v1/whatsapp/send-template', { recipient_number, template_name, variables, language })
  return res?.data
}

export const sendWhatsappText = async ({ recipient_number, message_body }) => {
  const res = await api.post('/api/v1/whatsapp/send-text', { recipient_number, message_body })
  return res?.data
}

export const sendWhatsappMedia = async ({ recipient_number, attachment, caption = '' }) => {
  const formData = new FormData()
  formData.append('recipient_number', recipient_number)
  formData.append('attachment', attachment)
  formData.append('caption', caption)

  const res = await api.post('/api/v1/whatsapp/send-media', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return res?.data
}

export const whatsappService = {
  loadSettings: getWhatsappSettings,
  saveSettings: updateWhatsappSettings,
  resetSettings: async () => {}, // No-op or api call if needed
  simulateMessage: (settings) => {
    return {
      messaging_product: 'whatsapp',
      to: settings.testPhone || '+201000000000',
      type: 'template',
      template: {
        name: 'hello_world',
        language: { code: 'en_US' }
      }
    }
  },
  sendTestMessage: async (payload) => {
    const j = await sendWhatsappTest({
      api_key: payload?.api_key,
      phone_number_id: payload?.phone_number_id,
    })
    return j
  },
  getLeadWhatsappMessages,
  sendWhatsappTemplate,
  sendWhatsappText,
  sendWhatsappMedia,
}

// WhatsApp Mirror microservice API helpers
export const pairWhatsappMirror = async () => {
  const res = await api.post('/api/whatsapp-mirror/pair')
  return res?.data
}

export const getWhatsappMirrorStatus = async () => {
  const res = await api.get('/api/whatsapp-mirror/status')
  return res?.data
}

export const disconnectWhatsappMirror = async () => {
  const res = await api.post('/api/whatsapp-mirror/disconnect')
  return res?.data
}

export const getWhatsappMirrorUnassignedContacts = async ({ status = 'pending', search = '', page = 1, per_page = 20 } = {}) => {
  const res = await api.get('/api/whatsapp-mirror/unassigned-contacts', {
    params: { status, search, page, per_page },
  })
  return res?.data
}

export const convertWhatsappMirrorContactToLead = async (contactId, payload) => {
  const res = await api.post(`/api/whatsapp-mirror/unassigned-contacts/${contactId}/convert-to-lead`, payload)
  return res?.data
}

export const getWhatsappMirrorGroupContacts = async ({ status = 'pending', search = '', page = 1, per_page = 20 } = {}) => {
  const res = await api.get('/api/whatsapp-mirror/group-contacts', {
    params: { status, search, page, per_page },
  })
  return res?.data
}

export const getWhatsappMirrorAdminGroups = async () => {
  const res = await api.get('/api/whatsapp-mirror/admin-groups')
  return res?.data
}

export const addWhatsappMirrorContactToGroup = async (contactId, groupId) => {
  const res = await api.post(`/api/whatsapp-mirror/group-contacts/${contactId}/add-to-group`, { group_id: groupId })
  return res?.data
}

export const syncWhatsappMirrorGroupContacts = async () => {
  const res = await api.post('/api/whatsapp-mirror/group-contacts/sync')
  return res?.data
}

export const convertWhatsappMirrorGroupContactToLead = async (contactId, payload) => {
  const res = await api.post(`/api/whatsapp-mirror/group-contacts/${contactId}/convert-to-lead`, payload)
  return res?.data
}

export const whatsappMirrorService = {
  pair: pairWhatsappMirror,
  getStatus: getWhatsappMirrorStatus,
  disconnect: disconnectWhatsappMirror,
  getUnassignedContacts: getWhatsappMirrorUnassignedContacts,
  convertToLead: convertWhatsappMirrorContactToLead,
  getGroupContacts: getWhatsappMirrorGroupContacts,
  syncGroupContacts: syncWhatsappMirrorGroupContacts,
  convertGroupContactToLead: convertWhatsappMirrorGroupContactToLead,
  getAdminGroups: getWhatsappMirrorAdminGroups,
  addContactToGroup: addWhatsappMirrorContactToGroup,
}
