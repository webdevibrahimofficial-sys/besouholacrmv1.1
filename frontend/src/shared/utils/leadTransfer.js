export const buildLeadTransferPayload = (assignData) => {
  const stage =
    assignData?.options?.sameStage
      ? 'same_stage'
      : (assignData?.method === 'cold_call' ? 'cold_calls' : 'new_lead')
  const history_option = assignData?.options?.clearHistory ? 'assign_as_new' : 'keep_history'
  return { stage, history_option }
}

