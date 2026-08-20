/**
 * Upload one or more files to a document attachments endpoint.
 * Uses files[0], files[1], ... so Laravel receives a proper `files` array
 * (appending only `files[]` can be flaky across proxies/parsers).
 */
export async function uploadDocumentAttachments(apiClient, url, fileOrFiles) {
  const list = (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]).filter(
    (f) => typeof File !== 'undefined' && f instanceof File
  )
  if (!list.length) return null

  const fd = new FormData()
  list.forEach((file, index) => {
    fd.append(`files[${index}]`, file)
  })

  // Do not set Content-Type manually — browser must include multipart boundary.
  const res = await apiClient.post(url, fd)
  const data = res?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.attachments)) return data.attachments
  return data ?? null
}

export function pickAttachmentFile(value) {
  if (typeof File !== 'undefined' && value instanceof File) return value
  return null
}
