import type { JsonField, JsonStructure } from '@/types/json-structure'

// ---------------------------------------------------------------------------
// Shared sub-field definitions
// ---------------------------------------------------------------------------

const SKU_FIELD: JsonField = {
  key: 'sku',
  type: 'object',
  children: [
    { key: 'sku', type: 'string' },
    { key: 'label', type: 'string' },
    { key: 'description', type: 'string' },
  ],
}

const PLACEHOLDER_DATE = new Date(0)

// IDs -1 through -8 are agg_event.info presets (have SKU field)
export const ST_ONE_AGG_INFO_IDS = new Set([-1, -2, -3, -4, -5, -6, -7, -8])

// ---------------------------------------------------------------------------
// ST-One built-in JsonStructure definitions
// IDs are negative to distinguish from DB-persisted structures (positive IDs)
// ---------------------------------------------------------------------------

export const ST_ONE_BUILTIN_STRUCTURES: JsonStructure[] = [
  // -------------------------------------------------------------------------
  // agg_event.info presets (8) — filter by agg.slug_agg
  // -------------------------------------------------------------------------

  {
    id: -1,
    name: 'agg_event.info — oee_1h',
    description: "OEE 1-hour aggregation. Filter by agg.slug_agg = 'oee_1h'.",
    definition: {
      fields: [
        { key: 'shift', type: 'string' },
        { key: 'time_run', type: 'number', pgCast: 'numeric' },
        { key: 'time_stop', type: 'number', pgCast: 'numeric' },
        { key: 'time_total', type: 'number', pgCast: 'numeric' },
        { key: 'time_scheduled', type: 'number', pgCast: 'numeric' },
        { key: 'time_unscheduled', type: 'number', pgCast: 'numeric' },
        { key: 'time_planned_stop', type: 'number', pgCast: 'numeric' },
        { key: 'time_unplanned_stop', type: 'number', pgCast: 'numeric' },
        { key: 'prod_target', type: 'number', pgCast: 'numeric' },
        { key: 'prod_main', type: 'number', pgCast: 'numeric' },
        { key: 'prod_out', type: 'number', pgCast: 'numeric' },
        { key: 'stop_count', type: 'number', pgCast: 'numeric' },
        SKU_FIELD,
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -2,
    name: 'agg_event.info — oee_slots',
    description: "OEE slot aggregation with production buckets. Filter by agg.slug_agg = 'oee_slots'.",
    definition: {
      fields: [
        { key: 'shift', type: 'string' },
        { key: 'line_capacity', type: 'number', pgCast: 'numeric' },
        { key: 'mask_category', type: 'string' },
        {
          key: 'data',
          type: 'object',
          children: [
            { key: 'target_oee', type: 'number', pgCast: 'numeric' },
            { key: 'baseline_oee', type: 'number', pgCast: 'numeric' },
          ],
        },
        { key: 'out_eq', type: 'array' },
        { key: 'main_eq', type: 'array' },
        SKU_FIELD,
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -3,
    name: 'agg_event.info — oee_downtime_1h',
    description: "OEE downtime 1-hour aggregation. Filter by agg.slug_agg = 'oee_downtime_1h'.",
    definition: {
      fields: [
        { key: 'shift', type: 'string' },
        { key: 'mask_category', type: 'string' },
        {
          key: 'downtime',
          type: 'array',
          itemSchema: [
            { key: 'slug', type: 'string' },
            { key: 'duration', type: 'number', pgCast: 'numeric' },
            { key: 'count', type: 'number', pgCast: 'numeric' },
          ],
        },
        SKU_FIELD,
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -4,
    name: 'agg_event.info — machine_state_1h',
    description: "Machine state 1-hour aggregation. Filter by agg.slug_agg = 'machine_state_1h'.",
    definition: {
      fields: [
        { key: 'shift', type: 'string' },
        {
          key: 'state',
          type: 'array',
          itemSchema: [
            { key: 'value', type: 'string' },
            { key: 'count', type: 'number', pgCast: 'numeric' },
            { key: 'duration', type: 'number', pgCast: 'numeric' },
            { key: 'reason', type: 'string' },
            { key: 'fault_tag', type: 'string' },
            { key: 'fault_code', type: 'string' },
          ],
        },
        SKU_FIELD,
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -5,
    name: 'agg_event.info — machine_prod_1h',
    description: "Machine production 1-hour aggregation. Filter by agg.slug_agg = 'machine_prod_1h'.",
    definition: {
      fields: [
        { key: 'shift', type: 'string' },
        { key: 'capacity', type: 'number', pgCast: 'numeric' },
        { key: 'unitsize', type: 'number', pgCast: 'numeric' },
        { key: 'prod_machine', type: 'number', pgCast: 'numeric' },
        { key: 'standardcapacity', type: 'number', pgCast: 'numeric' },
        SKU_FIELD,
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -6,
    name: 'agg_event.info — machine_prod_state_1h',
    description: "Machine production + state 1-hour aggregation. Filter by agg.slug_agg = 'machine_prod_state_1h'.",
    definition: {
      fields: [
        { key: 'shift', type: 'string' },
        { key: 'prod', type: 'number', pgCast: 'numeric' },
        { key: 'capacity', type: 'number', pgCast: 'numeric' },
        { key: 'prod_machine', type: 'number', pgCast: 'numeric' },
        { key: 'standardcapacity', type: 'number', pgCast: 'numeric' },
        {
          key: 'state',
          type: 'array',
          itemSchema: [
            { key: 'value', type: 'string' },
            { key: 'count', type: 'number', pgCast: 'numeric' },
            { key: 'duration', type: 'number', pgCast: 'numeric' },
          ],
        },
        SKU_FIELD,
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -7,
    name: 'agg_event.info — machine_fault_1h',
    description: "Machine fault 1-hour aggregation. Filter by agg.slug_agg = 'machine_fault_1h'.",
    definition: {
      fields: [
        { key: 'shift', type: 'string' },
        {
          key: 'faults',
          type: 'array',
          itemSchema: [
            { key: 'tag', type: 'string' },
            { key: 'count', type: 'number', pgCast: 'numeric' },
            { key: 'value', type: 'number', pgCast: 'numeric' },
            { key: 'duration', type: 'number', pgCast: 'numeric' },
            { key: 'events', type: 'number', pgCast: 'numeric' },
          ],
        },
        SKU_FIELD,
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -8,
    name: 'agg_event.info — downtime_machine_1h',
    description: "Downtime per machine 1-hour aggregation. Filter by agg.slug_agg = 'downtime_machine_1h'.",
    definition: {
      fields: [
        { key: 'shift', type: 'string' },
        {
          key: 'downtime',
          type: 'array',
          itemSchema: [
            { key: 'slug', type: 'string' },
            { key: 'time_macro', type: 'number', pgCast: 'numeric' },
            { key: 'time_micro', type: 'number', pgCast: 'numeric' },
            { key: 'count_macro', type: 'number', pgCast: 'numeric' },
            { key: 'count_micro', type: 'number', pgCast: 'numeric' },
          ],
        },
        SKU_FIELD,
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  // -------------------------------------------------------------------------
  // form_data.value presets (3) — filter by form.builder_slug
  // -------------------------------------------------------------------------

  {
    id: -9,
    name: 'form_data.value — line_config',
    description: "Line configuration form. Filter by form.builder_slug = 'line_config'.",
    definition: {
      fields: [
        {
          key: 'data',
          type: 'object',
          children: [
            {
              key: 'line',
              type: 'object',
              children: [
                { key: 'slug', type: 'string' },
                { key: 'name', type: 'string' },
              ],
            },
            { key: 'target_oee', type: 'number', pgCast: 'numeric' },
            { key: 'baseline_oee', type: 'number', pgCast: 'numeric' },
            { key: 'shifts', type: 'array' },
            { key: 'skuMapping', type: 'array' },
            { key: 'main_equipments', type: 'array' },
            { key: 'output_equipments', type: 'array' },
          ],
        },
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -10,
    name: 'form_data.value — machine_config',
    description: "Machine configuration form. Filter by form.builder_slug = 'machine_config'.",
    definition: {
      fields: [
        {
          key: 'data',
          type: 'object',
          children: [
            {
              key: 'machine',
              type: 'object',
              children: [
                { key: 'slug', type: 'string' },
                { key: 'name', type: 'string' },
              ],
            },
            { key: 'productionUnit', type: 'string' },
            { key: 'skus', type: 'array' },
          ],
        },
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -11,
    name: 'form_data.value — sku_config',
    description: "SKU configuration form. Filter by form.builder_slug = 'sku_config'.",
    definition: {
      fields: [
        {
          key: 'data',
          type: 'object',
          children: [
            { key: 'sku', type: 'string' },
            { key: 'label', type: 'string' },
            { key: 'description', type: 'string' },
          ],
        },
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  // -------------------------------------------------------------------------
  // form_event.value presets (5) — filter by form.builder_slug
  // -------------------------------------------------------------------------

  {
    id: -12,
    name: 'form_event.value — production_slot',
    description: "Production slot form event. Filter by form.builder_slug = 'production_slot'.",
    definition: {
      fields: [
        {
          key: 'data',
          type: 'object',
          children: [
            SKU_FIELD,
            { key: 'shift', type: 'string' },
            { key: 'prod_out', type: 'number', pgCast: 'numeric' },
            { key: 'prod_main', type: 'number', pgCast: 'numeric' },
            { key: 'prod_out_machine', type: 'array' },
            { key: 'prod_main_machine', type: 'array' },
          ],
        },
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -13,
    name: 'form_event.value — downtime',
    description: "Downtime form event. Filter by form.builder_slug = 'downtime'.",
    definition: {
      fields: [
        {
          key: 'data',
          type: 'object',
          children: [
            {
              key: 'bucket',
              type: 'object',
              children: [
                { key: 'label', type: 'string' },
                { key: 'value', type: 'string' },
              ],
            },
            {
              key: 'category',
              type: 'object',
              children: [
                { key: 'label', type: 'string' },
                { key: 'value', type: 'string' },
              ],
            },
            { key: 'duration', type: 'number', pgCast: 'numeric' },
            {
              key: 'cause',
              type: 'object',
              children: [{ key: 'value', type: 'string' }],
            },
            {
              key: 'reason',
              type: 'object',
              children: [{ key: 'description', type: 'string' }],
            },
          ],
        },
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -14,
    name: 'form_event.value — shifts',
    description: "Shift form event. Filter by form.builder_slug = 'shifts'.",
    definition: {
      fields: [
        {
          key: 'data',
          type: 'object',
          children: [{ key: 'shift', type: 'string' }],
        },
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -15,
    name: 'form_event.value — line_mask',
    description: "Line mask form event. Filter by form.builder_slug = 'line_mask'.",
    definition: {
      fields: [
        {
          key: 'data',
          type: 'object',
          children: [
            { key: 'time', type: 'string' },
            { key: 'timeend', type: 'string' },
            { key: 'duration', type: 'number', pgCast: 'numeric' },
            {
              key: 'category',
              type: 'object',
              children: [
                { key: 'label', type: 'string' },
                { key: 'value', type: 'string' },
              ],
            },
            { key: 'notes', type: 'string' },
          ],
        },
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },

  {
    id: -16,
    name: 'form_event.value — sku',
    description: "SKU form event. Filter by form.builder_slug = 'sku'.",
    definition: {
      fields: [
        {
          key: 'data',
          type: 'object',
          children: [
            {
              key: 'sku',
              type: 'object',
              children: [
                { key: 'sku', type: 'string' },
                { key: 'label', type: 'string' },
              ],
            },
            { key: 'target_production', type: 'number', pgCast: 'numeric' },
          ],
        },
      ],
    },
    createdAt: PLACEHOLDER_DATE,
    updatedAt: PLACEHOLDER_DATE,
  },
]
