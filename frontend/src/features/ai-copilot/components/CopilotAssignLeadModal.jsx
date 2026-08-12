import { useState } from 'react'
import ReAssignLeadModal from '@shared/components/ReAssignLeadModal'
import { buildLeadTransferPayload } from '@shared/utils/leadTransfer'
import { api } from '@utils/api'

export default function CopilotAssignLeadModal({
  isOpen,
  onClose,
  leadId,
  leadName = '',
  suggestedUserId = null,
  initialDuplicate = false,
  mode = 'assign',
  isArabic = false,
  currentUser = null,
  onAssigned,
}) {
  const [errorMessage, setErrorMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isCloneMode = mode === 'clone' || initialDuplicate

  const handleAssign = async (assignData) => {
    if (!leadId) return false

    setSubmitting(true)
    setErrorMessage('')

    try {
      const shouldDuplicate = Boolean(assignData.options?.duplicate || isCloneMode)

      if (shouldDuplicate) {
        const { history_option } = buildLeadTransferPayload(assignData)
        const response = await api.post(`/api/leads/${leadId}/duplicate-as-fresh`, {
          assigned_to: assignData.userId,
          history_option,
        })

        const clonedLead = response?.data?.cloned_lead || null
        const clonedLeadId = Number(clonedLead?.id || 0) || null

        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: {
            type: 'success',
            message: isArabic ? 'تم نسخ الليد وتعيينه كجديد' : 'Lead cloned and assigned as fresh',
          },
        }))

        onAssigned?.({
          leadId: clonedLeadId || leadId,
          originalLeadId: leadId,
          assigneeId: assignData.userId,
          assigneeName: assignData.userName,
          cloned: true,
        })

        return true
      }

      const { stage, history_option } = buildLeadTransferPayload(assignData)

      await api.post(`/api/leads/${leadId}/transfer`, {
        assigned_to: assignData.userId,
        stage,
        history_option,
      })

      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          type: 'success',
          message: isArabic ? 'تم إسناد الليد بنجاح' : 'Lead assigned successfully',
        },
      }))

      onAssigned?.({
        leadId,
        assigneeId: assignData.userId,
        assigneeName: assignData.userName,
        cloned: false,
      })

      return true
    } catch (error) {
      const message = error?.response?.data?.message
        || (isCloneMode || assignData.options?.duplicate
          ? (isArabic ? 'فشل نسخ الليد' : 'Failed to clone lead')
          : (isArabic ? 'فشل إسناد الليد' : 'Failed to assign lead'))
      setErrorMessage(message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ReAssignLeadModal
      isOpen={isOpen}
      onClose={onClose}
      lead={{ id: leadId, name: leadName }}
      onAssign={handleAssign}
      isArabic={isArabic}
      currentUser={currentUser}
      initialUserId={suggestedUserId}
      initialDuplicate={isCloneMode}
      title={isCloneMode
        ? (isArabic ? 'نسخ الليد وإسناده كجديد' : 'Clone lead and assign as fresh')
        : undefined}
      assignButtonLabel={isCloneMode
        ? (isArabic ? 'نسخ وتعيين' : 'Clone & assign')
        : undefined}
      errorMessage={errorMessage}
      submitting={submitting}
      onClearError={() => setErrorMessage('')}
    />
  )
}
