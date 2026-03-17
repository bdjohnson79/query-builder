import { create } from 'zustand'
import { api } from '@/lib/api/client'
import type { JsonStructure } from '@/types/json-structure'

interface JsonStructureStore {
  structures: JsonStructure[]
  loading: boolean
  loadStructures: () => Promise<void>
  getById: (id: number) => JsonStructure | undefined
}

export const useJsonStructureStore = create<JsonStructureStore>()((set, get) => ({
  structures: [],
  loading: false,

  loadStructures: async () => {
    set({ loading: true })
    try {
      const rows = await api.jsonStructures.list()
      set({ structures: rows as JsonStructure[] })
    } finally {
      set({ loading: false })
    }
  },

  getById: (id) => get().structures.find((s) => s.id === id),
}))
