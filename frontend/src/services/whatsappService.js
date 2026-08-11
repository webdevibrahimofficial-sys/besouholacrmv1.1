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

export const getWhatsappChannels = async () => {
  const res = await api.get('/api/whatsapp-channels')
  return res?.data?.channels || []
}

export const setWhatsappChannelPrimary = async (channelId) => {
  const res = await api.post(`/api/whatsapp-channels/${channelId}/set-primary`)
  return res?.data
}

export const startWhatsappChannelMigration = async (mirrorChannelId, cloudChannelId) => {
  const res = await api.post(`/api/whatsapp-channels/${mirrorChannelId}/start-migration`, {
    cloud_channel_id: cloudChannelId,
  })
  return res?.data
}

export const completeWhatsappChannelMigration = async (mirrorChannelId, cloudChannelId) => {
  const res = await api.post(`/api/whatsapp-channels/${mirrorChannelId}/complete-migration`, {
    cloud_channel_id: cloudChannelId,
  })
  return res?.data
}

export const sendWhatsappMigrationVerification = async (channelId, to) => {
  const res = await api.post(`/api/whatsapp-channels/${channelId}/send-migration-verification`, { to })
  return res?.data
}

export const getWhatsappOAuthStatus = async () => {
  const res = await api.get('/api/auth/whatsapp/status')
  return res?.data
}

export const connectWhatsappViaMeta = async () => {
  const res = await api.get('/api/auth/whatsapp/redirect')
  return res?.data
}

export const completeWhatsappEmbeddedSignup = async (payload) => {
  const res = await api.post('/api/auth/whatsapp/embedded-signup', payload)
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

export const sendWhatsappTemplate = async ({ recipient_number, template_name, variables, language = 'en_US', channel_id, lead_id } = {}) => {
  const res = await api.post('/api/v1/whatsapp/send-template', {
    recipient_number,
    template_name,
    variables,
    language,
    ...(channel_id != null ? { channel_id } : {}),
    ...(lead_id != null ? { lead_id } : {}),
  })
  return res?.data
}

export const sendWhatsappText = async ({ recipient_number, message_body, channel_id, lead_id } = {}) => {
  const res = await api.post('/api/v1/whatsapp/send-text', {
    recipient_number,
    message_body,
    ...(channel_id != null ? { channel_id } : {}),
    ...(lead_id != null ? { lead_id } : {}),
  })
  return res?.data
}

export const sendWhatsappMedia = async ({ recipient_number, attachment, caption = '', channel_id, lead_id } = {}) => {
  const formData = new FormData()
  formData.append('recipient_number', recipient_number)
  formData.append('attachment', attachment)
  formData.append('caption', caption)
  if (channel_id != null) formData.append('channel_id', String(channel_id))
  if (lead_id != null) formData.append('lead_id', String(lead_id))

  const res = await api.post('/api/v1/whatsapp/send-media', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return res?.data
}

export const getWhatsappCapabilities = async () => {
  const res = await api.get('/api/v1/whatsapp/capabilities')
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
  getWhatsappCapabilities,
}

// WhatsApp Mirror microservice API helpers
export const pairWhatsappMirror = async ({ force = false } = {}) => {
  const res = await api.post('/api/whatsapp-mirror/pair', { force })
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

export const getWhatsappMirrorGroupContacts = async ({ status = 'pending', search = '', group_id = '', page = 1, per_page = 20 } = {}) => {
  const res = await api.get('/api/whatsapp-mirror/group-contacts', {
    params: { status, search, group_id, page, per_page },
  })
  return res?.data
}

export const getWhatsappMirrorStoredGroupContactsGroups = async ({ status = 'pending' } = {}) => {
  const res = await api.get('/api/whatsapp-mirror/group-contacts/groups', {
    params: { status },
  })
  return res?.data
}

export const getWhatsappMirrorAdminGroups = async () => {
  const res = await api.get('/api/whatsapp-mirror/admin-groups')
  return res?.data
}

export const addWhatsappMirrorContactToGroup = async (contactId, groupId, groupName = '') => {
  const res = await api.post(`/api/whatsapp-mirror/group-contacts/${contactId}/add-to-group`, {
    group_id: groupId,
    group_name: groupName,
  })
  return res?.data
}

export const sendWhatsappMirrorContactInviteToGroup = async (contactId, groupId, groupName = '') => {
  const res = await api.post(`/api/whatsapp-mirror/group-contacts/${contactId}/send-invite`, {
    group_id: groupId,
    group_name: groupName,
  })
  return res?.data
}

export const bulkAddWhatsappMirrorContactsToGroup = async (contactIds, groupId) => {
  const res = await api.post('/api/whatsapp-mirror/group-contacts/bulk-add-to-group', {
    contact_ids: Array.isArray(contactIds) ? contactIds : [],
    group_id: groupId,
  })
  return res?.data
}

export const syncWhatsappMirrorGroupContacts = async (groupIds = []) => {
  const res = await api.post('/api/whatsapp-mirror/group-contacts/sync', {
    group_ids: Array.isArray(groupIds) ? groupIds : [],
  })
  return res?.data
}

export const deleteWhatsappMirrorGroupContact = async (contactId) => {
  const res = await api.delete(`/api/whatsapp-mirror/group-contacts/${contactId}`)
  return res?.data
}

export const getWhatsappMirrorGroups = async () => {
  const res = await api.get('/api/whatsapp-mirror/groups')
  return res?.data
}

export const getWhatsappMirrorConversations = async ({ search = '', page = 1, per_page = 20 } = {}) => {
  const res = await api.get('/api/whatsapp-mirror/conversations', {
    params: { search, page, per_page },
  })
  return res?.data
}

export const getWhatsappMirrorConversationMessages = async ({ phone, page = 1, per_page = 50 } = {}) => {
  const res = await api.get('/api/whatsapp-mirror/conversation-messages', {
    params: { phone, page, per_page },
  })
  return res?.data
}

export const resolveWhatsappMirrorConversationPhones = async ({ lids } = {}) => {
  const payload = Array.isArray(lids) && lids.length ? { lids } : {}
  const res = await api.post('/api/whatsapp-mirror/conversations/resolve-phones', payload)
  return res?.data
}

export const markWhatsappMirrorConversationRead = async ({ phone, lid, display_phone } = {}) => {
  const res = await api.post('/api/whatsapp-mirror/conversations/mark-read', {
    phone,
    ...(lid ? { lid } : {}),
    ...(display_phone ? { display_phone } : {}),
  })
  return res?.data
}

export const createWhatsappMirrorConversationLead = async (payload) => {
  const res = await api.post('/api/whatsapp-mirror/conversations/create-lead', payload)
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
  getStoredGroupContactGroups: getWhatsappMirrorStoredGroupContactsGroups,
  syncGroupContacts: syncWhatsappMirrorGroupContacts,
  deleteGroupContact: deleteWhatsappMirrorGroupContact,
  getGroups: getWhatsappMirrorGroups,
  convertGroupContactToLead: convertWhatsappMirrorGroupContactToLead,
  getAdminGroups: getWhatsappMirrorAdminGroups,
  addContactToGroup: addWhatsappMirrorContactToGroup,
  sendContactInviteToGroup: sendWhatsappMirrorContactInviteToGroup,
  bulkAddContactsToGroup: bulkAddWhatsappMirrorContactsToGroup,
  getConversations: getWhatsappMirrorConversations,
  getConversationMessages: getWhatsappMirrorConversationMessages,
  resolveConversationPhones: resolveWhatsappMirrorConversationPhones,
  markConversationRead: markWhatsappMirrorConversationRead,
  createConversationLead: createWhatsappMirrorConversationLead,
}
