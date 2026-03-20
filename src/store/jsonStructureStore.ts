import { create } from 'zustand'
import { api } from '@/lib/api/client'
import type { JsonStructure } from '@/types/json-structure'
import { ST_ONE_BUILTIN_STRUCTURES } from '@/lib/jsonb-presets/st-one-presets'

interface JsonStructureStore {
  builtinStructures: JsonStructure[]
  structures: JsonStructure[]
  loading: boolean
  loadStructures: () => Promise<void>
  getById: (id: number) => JsonStructure | undefined
  getAllStructures: () => JsonStructure[]
}

export const useJsonStructureStore = create<JsonStructureStore>()((set, get) => ({
  builtinStructures: ST_ONE_BUILTIN_STRUCTURES,
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

  getById: (id) => {
    if (id < 0) return get().builtinStructures.find((s) => s.id === id)
    return get().structures.find((s) => s.id === id)
  },

  getAllStructures: () => [...get().builtinStructures, ...get().structures],
}))
