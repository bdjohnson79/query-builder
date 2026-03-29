# Tutorial: OEE Data Table Query

This guide walks through building the **OEE Data Table** query template from scratch. It serves as both a learning exercise and a feature verification checklist. Every step maps to a specific UI feature — if a step cannot be completed, the corresponding feature is missing or broken.

**What this query does:** Aggregates OEE (Overall Equipment Effectiveness) metrics from the `agg_event` table in 1-hour time buckets, joined with equipment location data, with all OEE sub-metrics extracted from a JSONB column using the built-in `oee_1h` field structure.

**Required schema tables:**
| Table | Required columns |
|---|---|
| `agg` | `id`, `location_slug`, `slug_agg` |
| `agg_event` | `time`, `agg` (FK to agg.id), `info` (JSONB) |
| `location` | `id`, `slug`, `name` |

**Required JSONB structure:** The `oee_1h` built-in structure must be available in the app (it is pre-loaded in the ST-One seed data).

---

## Phase 1 — Place Tables on the Canvas

**1.1** Drag the **agg** table from the left panel onto the canvas. Double-click its alias and set it to `a`.

**1.2** Drag the **agg_event** table onto the canvas. Double-click its alias and set it to `ae`. Position it to the right of `a`.

**1.3** Drag the **location** table onto the canvas. Double-click its alias and set it to `l`. Position it to the right of `ae`.

**Verification:** Three table nodes should be visible on the canvas with aliases `a`, `ae`, and `l`.

---

## Phase 2 — Create the Joins

**2.1** Draw the first join: drag from the `a.location_slug` column handle (right side of the `a` node) to the `l.slug` handle (left side of the `l` node).

**2.2** Click the join label. In the popover, confirm the join type is **INNER**. No custom ON clause needed.

**2.3** Draw the second join: drag from the `a.id` column handle to the `ae.agg` handle.

**2.4** Click the join label. Confirm **INNER** join type.

**Verification:** SQL preview should contain:
```sql
FROM agg a
INNER JOIN location l ON a.location_slug = l.slug
INNER JOIN agg_event ae ON a.id = ae.agg
```

---

## Phase 3 — Map the JSONB Structure

The `ae.info` column contains a JSONB object with 24 OEE sub-metrics. Before you can work with these fields, you must tell the app which structure they follow.

**3.1** Go to the **Advanced** section in the right panel, then click the **JSONB** tab.

**3.2** Find the row for table `ae`, column `info`. Click the structure assignment dropdown and select **oee_1h (built-in)**.

**3.3** The `ae` node on the canvas now shows a **›** (chevron) expand control next to the `info` column. Click it to expand the JSONB paths. This reveals all 24 OEE fields as selectable sub-rows.

**Verification:** The expanded list should show fields including `shift`, `sku`, `time_total`, `time_run`, `time_stop`, and 19 more `time_*` / `prod_*` fields.

---

## Phase 4 — Apply the CROSS JOIN Expansion

The JSONB paths can be used two ways: as individual `->>'key'` path extractions, or as a typed `CROSS JOIN jsonb_to_record(...)` expansion (faster and produces cleaner SQL). For OEE we want the CROSS JOIN expansion.

**4.1** In the JSONB tab, find the `ae.info` section. You will see two mode tabs: **Path extraction** and **Expand as record**. Click **Expand as record**.

**4.2** The section now shows:
- A **Record alias** input field — set it to `i`
- A list of all 24 fields from the `oee_1h` structure with checkboxes

**4.3** Click **Select all** (if present) or manually check all 24 fields.

**4.4** Click **Apply**.

**Verification:** The `ae.info` row in the JSONB tab shows a blue banner reading *CROSS JOIN active — alias `i`*. The SQL preview should now contain:
```sql
CROSS JOIN jsonb_to_record(ae.info) i(shift text, sku jsonb, time_total float8, ...)
```

---

## Phase 5 — Select Columns

**5.1** Go to the **Columns** tab.

**5.2** Click **Add computed column** (or equivalent button for custom expressions). Enter:
- Expression: `time_bucket('1h', ae.time)`
- Alias: `time`

This is the TimescaleDB time-bucketing expression that groups data into 1-hour intervals.

**5.3** Check the box for `l.name`. Click the alias field for that row and enter `line_name`.

**5.4** Check the box for `l.slug`. No alias needed.

**5.5** From the expansion section (alias `i`), check all 24 OEE fields:
`shift`, `sku`, `time_total`, `time_run`, `time_stop`, `stop_count`, `time_scheduled`, `time_unscheduled`, `time_planned`, `time_planned_maintenance`, `time_planned_sanitation`, `time_planned_changeover`, `time_planned_breaks`, `time_unplanned`, `time_unplanned_logistics`, `time_unplanned_breakdown`, `time_unplanned_process`, `prod_target`, `time_prod_main`, `time_prod_out`, `prod_main`, `prod_out`, `prod_main_machine`, `prod_out_machine`

> Tip: These will all appear in the `ae` node on the canvas as a collapsed/expandable section once the CROSS JOIN expansion is applied. You can also check them directly from the canvas node.

**Verification:** SQL preview should show 27 items in the SELECT list (1 expression + `l.name` + `l.slug` + 24 JSONB fields).

---

## Phase 6 — Add WHERE Filters

**6.1** Go to the **WHERE** tab. The combinator defaults to AND — leave it as AND.

**6.2** Add the first rule:
- Field: `ae.time`
- Operator: `$__timeFilter(col)` (in the Grafana section of the operator list)
- Value: *(leave empty)*

**6.3** Add the second rule:
- Field: `a.slug_agg`
- Operator: `=`
- Value: `oee_1h`

**6.4** Add the third rule:
- Field: `l.id`
- Operator: `in`
- Value: `$area`

> `$area` is a Grafana dashboard variable. Type it directly into the value field. You can use the copy button (if visible) or type `$area` manually.

**Verification:** SQL should contain:
```sql
WHERE $__timeFilter("ae"."time")
  AND a.slug_agg = 'oee_1h'
  AND l.id IN ($area)
```

---

## Phase 7 — Add ORDER BY

**7.1** Go to the **ORDER BY** tab.

**7.2** Click **Add ORDER BY** and set:
- Column: `ae.time` · Direction: `ASC`

**Verification:** SQL should end with `ORDER BY ae.time ASC`.

---

## Phase 8 — Configure Grafana Settings

**8.1** Go to the **Grafana** tab.

**8.2** Set **Panel type** to `Table`.

**8.3** Set **Time column** to `ae.time`.

**Verification:** The Grafana tab orange dot disappears. SQL preview should not change (these are metadata fields for Grafana panel configuration, not SQL modifiers).

---

## Phase 9 — Verify Complete SQL

The final generated SQL should look like this (column list abbreviated):

```sql
WITH ...  -- (no CTEs for this query)
SELECT
  time_bucket('1h', ae.time) AS time,
  l.name AS line_name,
  l.slug,
  i.shift,
  i.sku,
  i.time_total,
  -- ... 21 more i.* fields ...
FROM agg a
INNER JOIN location l ON a.location_slug = l.slug
INNER JOIN agg_event ae ON a.id = ae.agg
CROSS JOIN jsonb_to_record(ae.info) i(
  shift text, sku jsonb, time_total float8, ...
)
WHERE $__timeFilter("ae"."time")
  AND a.slug_agg = 'oee_1h'
  AND l.id IN ($area)
ORDER BY ae.time ASC
```

---

## Feature Coverage Summary

| Step | Feature | Status |
|---|---|---|
| 1.1–1.3 | Drag three tables, set aliases | ✅ |
| 2.1–2.4 | Draw two INNER JOINs | ✅ |
| 3.1–3.2 | Assign built-in JSONB structure to column | ✅ |
| 3.3 | Expand JSONB paths in canvas node | ✅ |
| 4.1–4.2 | Apply CROSS JOIN `jsonb_to_record` expansion with alias | ✅ |
| 5.2 | Add computed column with custom expression + alias | ✅ |
| 5.3 | Select regular column and set alias | ✅ |
| 5.4 | Select regular column without alias | ✅ |
| 5.5 | Select 24 JSONB expansion fields | ✅ |
| 6.2 | WHERE with `$__timeFilter` Grafana macro | ✅ |
| 6.3 | WHERE with string equality filter | ✅ |
| 6.4 | WHERE with `in` operator and Grafana variable | ✅ |
| 7.1–7.2 | Single ORDER BY column | ✅ |
| 8.1–8.3 | Grafana panel type + time column | ✅ |

**All features required for this query are present.** This template can be built entirely from scratch without manual SQL editing.
