import axios from 'axios'

const client = axios.create({ baseURL: (import.meta.env.VITE_API_URL ?? '') + '/api' })

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 404 && err.config.url?.includes('/sessions/')) {
      const e = new Error('SESSION_EXPIRED')
      e.sessionExpired = true
      return Promise.reject(e)
    }
    return Promise.reject(err)
  }
)

export async function uploadFromSheetUrl(sheetUrl, onProgress) {
  onProgress?.(10)
  // Route through the backend proxy to avoid CORS/redirect issues
  const res = await fetch('/api/tickets', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('Apps Script did not return a JSON array.')
  onProgress?.(50)
  const { data } = await client.post('/upload-json', { rows, source_label: 'Google Sheet' }, {
    onUploadProgress: (e) => onProgress?.(50 + Math.round((e.loaded * 100) / (e.total || 1)) / 2),
  })
  return data
}

export async function uploadFile(file, onProgress) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post('/upload', form, {
    onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
  })
  return data
}

export async function getOverview(sid) {
  const { data } = await client.get(`/sessions/${sid}/overview`)
  return data
}

export async function getMonthlyCreated(sid) {
  const { data } = await client.get(`/sessions/${sid}/monthly-created`)
  return data
}

export async function getWeeklyComparison(sid) {
  const { data } = await client.get(`/sessions/${sid}/weekly-comparison`)
  return data
}

export async function getWeeklyByAssignee(sid, assignees = []) {
  const params = assignees.length ? { assignees: assignees.join(',') } : {}
  const { data } = await client.get(`/sessions/${sid}/weekly-by-assignee`, { params })
  return data
}

export async function getByArea(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/by-area`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getByTeam(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/by-team`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getByCreator(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/by-creator`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getInflowOutflow(sid, dateFrom, dateTo, groupBy = 'week', dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/inflow-outflow`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, group_by: groupBy, ...dimFilters }),
  })
  return data
}

export async function getSlaPerformance(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/sla-performance`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getResolutionTime(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/resolution-time`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

function _clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''))
}

export async function getPriority(sid, filters = {}) {
  const { data } = await client.get(`/sessions/${sid}/priority`, { params: filters })
  return data
}

export function getExportUrl(sid, format = 'csv', filters = {}) {
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  const params = new URLSearchParams({ format, ...clean })
  return `/api/sessions/${sid}/export?${params}`
}

export async function getTeamPerformance(sid, dateFrom, dateTo) {
  const { data } = await client.get(`/sessions/${sid}/team-performance`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo }),
  })
  return data
}

export async function getBacklogAge(sid) {
  const { data } = await client.get(`/sessions/${sid}/backlog-age`)
  return data
}

export async function getHubHealth(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/hub-health`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getStackedByArea(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/stacked-by-area`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getStackedByTeam(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/stacked-by-team`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getStackedByCreator(sid, dateFrom, dateTo, dimFilters = {}, topN = 20) {
  const { data } = await client.get(`/sessions/${sid}/stacked-by-creator`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, top_n: topN, ...dimFilters }),
  })
  return data
}

export async function getResolvedBySpecialist(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/resolved-by-specialist`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getMonthlyStacked(sid, dateFrom, dateTo, dimFilters = {}) {
  const { data } = await client.get(`/sessions/${sid}/monthly-stacked`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo, ...dimFilters }),
  })
  return data
}

export async function getWeeklyStacked(sid, dateCol = 'created_date', dateFrom, dateTo, dimFilters = {}, limit = 26) {
  const { data } = await client.get(`/sessions/${sid}/weekly-stacked`, {
    params: _clean({ date_col: dateCol, date_from: dateFrom, date_to: dateTo, limit, ...dimFilters }),
  })
  return data
}

export async function getUserActivity(sid) {
  const { data } = await client.get(`/sessions/${sid}/user-activity`)
  return data
}

export async function getBandwidth(sid) {
  const { data } = await client.get(`/sessions/${sid}/bandwidth`)
  return data
}

export async function getBandwidthRates() {
  const { data } = await client.get('/bandwidth-rates')
  return data
}

export async function updateBandwidthRates(rates) {
  const { data } = await client.put('/bandwidth-rates', rates)
  return data
}

export async function getSlaRules() {
  const { data } = await client.get('/sla-rules')
  return data
}

export async function updateSlaRules(rules) {
  const { data } = await client.put('/sla-rules', rules)
  return data
}

export async function getInsights(sid, dateFrom, dateTo) {
  const { data } = await client.get(`/sessions/${sid}/insights`, {
    params: _clean({ date_from: dateFrom, date_to: dateTo }),
    timeout: 90000,
  })
  return data
}
