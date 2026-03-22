// Typed API client for all routes

import type {
  CreateSchemaBody, SchemasResponse, SchemaResponse,
  CreateTableBody, UpdateTableBody, TablesResponse, TableResponse,
  CreateColumnBody, UpdateColumnBody, ColumnResponse,
  CreateForeignKeyBody, ForeignKeysResponse, ForeignKeyResponse,
  CreateQueryBody, UpdateQueryBody, QueriesResponse, QueryResponse,
  CreateFolderBody, FoldersResponse, FolderResponse,
  LlmSuggestBody, LlmSuggestResponse,
  CreateJsonStructureBody, UpdateJsonStructureBody, JsonStructuresResponse, JsonStructureResponse,
} from '@/types/api'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// Schemas
export const api = {
  schemas: {
    list: () => apiFetch<SchemasResponse>('/api/schemas'),
    create: (body: CreateSchemaBody) =>
      apiFetch<SchemaResponse>('/api/schemas', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: number) =>
      apiFetch<void>(`/api/schemas/${id}`, { method: 'DELETE' }),
  },

  tables: {
    list: (schemaId?: number) =>
      apiFetch<TablesResponse>(`/api/tables${schemaId != null ? `?schemaId=${schemaId}` : ''}`),
    get: (id: number) => apiFetch<TableResponse>(`/api/tables/${id}`),
    create: (body: CreateTableBody) =>
      apiFetch<TableResponse>('/api/tables', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: UpdateTableBody) =>
      apiFetch<TableResponse>(`/api/tables/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: number) =>
      apiFetch<void>(`/api/tables/${id}`, { method: 'DELETE' }),
  },

  columns: {
    list: (tableId: number) => apiFetch<ColumnResponse[]>(`/api/tables/${tableId}/columns`),
    create: (tableId: number, body: CreateColumnBody) =>
      apiFetch<ColumnResponse>(`/api/tables/${tableId}/columns`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (tableId: number, colId: number, body: UpdateColumnBody) =>
      apiFetch<ColumnResponse>(`/api/tables/${tableId}/columns/${colId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    delete: (tableId: number, colId: number) =>
      apiFetch<void>(`/api/tables/${tableId}/columns/${colId}`, { method: 'DELETE' }),
  },

  foreignKeys: {
    list: (schemaId?: number) =>
      apiFetch<ForeignKeysResponse>(
        `/api/foreign-keys${schemaId != null ? `?schemaId=${schemaId}` : ''}`
      ),
    create: (body: CreateForeignKeyBody) =>
      apiFetch<ForeignKeyResponse>('/api/foreign-keys', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    delete: (id: number) =>
      apiFetch<void>(`/api/foreign-keys/${id}`, { method: 'DELETE' }),
  },

  folders: {
    list: () => apiFetch<FoldersResponse>('/api/folders'),
    create: (body: CreateFolderBody) =>
      apiFetch<FolderResponse>('/api/folders', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: number) =>
      apiFetch<void>(`/api/folders/${id}`, { method: 'DELETE' }),
  },

  queries: {
    list: (params?: { search?: string; folderId?: number | 'none'; tags?: string[] }) => {
      const qs = new URLSearchParams()
      if (params?.search) qs.set('search', params.search)
      if (params?.folderId != null) qs.set('folderId', String(params.folderId))
      if (params?.tags?.length) qs.set('tags', params.tags.join(','))
      const query = qs.toString()
      return apiFetch<QueriesResponse>(`/api/queries${query ? `?${query}` : ''}`)
    },
    get: (id: number) => apiFetch<QueryResponse>(`/api/queries/${id}`),
    create: (body: CreateQueryBody) =>
      apiFetch<QueryResponse>('/api/queries', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: UpdateQueryBody) =>
      apiFetch<QueryResponse>(`/api/queries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    delete: (id: number) =>
      apiFetch<void>(`/api/queries/${id}`, { method: 'DELETE' }),
  },

  llm: {
    suggest: (body: LlmSuggestBody) =>
      apiFetch<LlmSuggestResponse>('/api/llm/suggest', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  schemaImport: {
    apply: (body: {
      tables: unknown[]
      selectedKeys: string[]
    }) =>
      apiFetch<{ added: number; updated: number; unchanged: number }>('/api/schema-import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  jsonStructures: {
    list: () => apiFetch<JsonStructuresResponse>('/api/json-structures'),
    get: (id: number) => apiFetch<JsonStructureResponse>(`/api/json-structures/${id}`),
    create: (body: CreateJsonStructureBody) =>
      apiFetch<JsonStructureResponse>('/api/json-structures', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: number, body: UpdateJsonStructureBody) =>
      apiFetch<JsonStructureResponse>(`/api/json-structures/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    delete: (id: number) =>
      apiFetch<void>(`/api/json-structures/${id}`, { method: 'DELETE' }),
  },
}
