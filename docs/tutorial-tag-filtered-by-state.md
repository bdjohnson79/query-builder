# Tutorial: Tag Filtered by State Query

This guide walks through building the **Tag Filtered by State** query template from scratch. It serves as both a learning exercise and a feature verification checklist. Each step maps to a specific UI feature — if a step cannot be completed, the corresponding feature is missing or broken.

**What this query does:** Returns data tag values filtered to time periods when a state tag's value matches a target state (e.g. "show sensor readings only while the machine is running"). Five CTEs are chained: two filter the `tag` table down to the specific data and state tags of interest; two pull event data for each tag set with 30-day lookback; one converts the state events into `tsrange` intervals. The main query then inner-joins the data events to the state ranges.

**Required schema tables:**
| Table | Required columns |
|---|---|
| `event` | `time`, `tag`, `value` |
| `tag` | `name`, `description` |

---

## Phase 1 — Create the `data_tags` CTE

This CTE filters the tag table to only the data tag(s) you want to plot.

**1.1** In the right panel, expand the **Advanced** section and click the **CTEs** tab.

**1.2** Click **Add CTE**. The canvas immediately switches to CTE editing mode with the blue banner: *Editing CTE: cte_1*.

**1.3** In the CTE Edit Form, rename the CTE from `cte_1` to `data_tags`.

**1.4** Confirm the mode badge shows **Visual builder**. Do not switch to Raw SQL.

**1.5** Drag the **tag** table from the left panel onto the canvas. Set its alias to `tag`.

**1.6** In the **Columns** tab, check:
- `tag.name`
- `tag.description`
- `tag.location`
- `tag.info`
- `tag.labels`

**1.7** Go to the **WHERE** tab. Add one rule:
- Field: `tag.name` · Operator: `=` · Value: `your_data_tag_here`

> This is a placeholder. Replace it with your actual data tag name (e.g. a sensor metric) before running the query.

**1.8** Click **← Main query** in the blue banner to return to the main canvas.

**Verification:** The CTEs tab should list `data_tags` with a green **Visual** badge.

---

## Phase 2 — Create the `state_tags` CTE

Identical structure to `data_tags` but filters to the state tag (e.g. machine mode, run/idle).

**2.1** In the CTEs tab, click **Add CTE**.

**2.2** Rename it to `state_tags`.

**2.3** Drag the **tag** table onto the canvas. Set alias to `tag`.

**2.4** In **Columns**, check the same five columns as Phase 1: `name`, `description`, `location`, `info`, `labels`.

**2.5** In **WHERE**, add:
- Field: `tag.name` · Operator: `=` · Value: `your_state_tag_here`

> Replace with your actual state tag name (e.g. a machine mode indicator).

**2.6** Click **← Main query**.

**Verification:** The CTEs tab should now list both `data_tags` and `state_tags` with green **Visual** badges.

---

## Phase 3 — Create the `data_events` CTE

This CTE retrieves event data for the data tag, using a UNION ALL pattern: Part 1 covers the selected time range, Part 2 backfills a single point 30 days before the range start so charts never show a left-edge gap.

### Part 1 — Main time range

**3.1** In the CTEs tab, click **Add CTE**. Rename it to `data_events`.

**3.2** The canvas is in CTE editing mode. Drag the **event** table from the left panel onto the canvas. Set its alias to `e`.

**3.3** Find **data_tags** in the **Virtual Tables (CTEs)** section of the left panel. Drag it onto the canvas. Set its alias to `dt`.

**3.4** Draw a join from `e.tag` to `dt.name`. Click the join label and confirm the type is **INNER**.

**3.5** In **Columns**, check:
- `e.time`
- `e.tag` — then click the alias field that appears and type `metric`

**3.6** Check `e.value`.

> The alias `metric` renames `tag` to `metric` in the output so the column name is descriptive.

**3.7** In **WHERE**, add:
- Field: `e.time` · Operator: `$__timeFilter(col)` · Value: *(leave empty)*

### Part 2 — 30-day lookback branch

**3.8** Click **+ Add UNION** in the Part Switcher bar above the canvas. Part 2 is automatically selected. The canvas shows a green ring.

**3.9** Drag **data_tags** from Virtual Tables onto the Part 2 canvas. Set alias to `dt2`.

**3.10** In the **Columns** tab for Part 2, click **Add computed column**:
- Expression: `$__timeFrom()::timestamp`
- Alias: `time`

**3.11** Check `dt2.name` — then click the alias field and type `metric`.

**3.12** In the left panel, click **Add LATERAL subquery**. Set alias to `e2` and click **Add**.

**3.13** Click **Edit Subquery →** on the `e2` LATERAL node.

The canvas enters LATERAL editing mode (cyan banner). The `dt2` node appears as a dimmed ghost on the canvas — its columns are available as outer-scope references.

**3.14** Drag the **event** table onto the LATERAL canvas.

**3.15** In **Columns**, check:
- `event.time`
- `dt2.name` (outer scope column — visible in the ghost node)
- `event.value`

**3.16** In **WHERE**, add two rules:
- Field: `event.time` · Operator: `time lookback BETWEEN (col, interval)` · Value: `30d`
- Field: `event.tag` · Operator: `=` · Value: `dt2.name`

  > `dt2.name` in the value field is a column reference (no quotes). The builder detects the `table.column` pattern and emits it unquoted, creating a correlated condition.

**3.17** In **ORDER BY**, add: `event.time DESC`.

**3.18** In **Limit**, set **Limit** to `1`.

**3.19** Click **← Main query** in the cyan banner to return to Part 2.

**3.20** In Part 2's **WHERE**, add:
- Field: `e2.value` · Operator: `is not null`

**3.21** Click **Part 1** in the Part Switcher to return to Part 1 view, then click **← Main query**.

**Verification:** The `data_events` CTE should show a **Visual** badge. The Part Switcher inside the CTE should show "Part 1 · UNION ALL · Part 2".

---

## Phase 4 — Create the `state_events` CTE

Identical structure to `data_events` but scoped to the state tag and without the `AS metric` alias (the output column name is `tag`).

**4.1** Add a new CTE named `state_events`.

**4.2** Drag **event** onto the canvas, alias `e`. Drag **state_tags** onto the canvas, alias `st`.

**4.3** Draw INNER JOIN from `e.tag` to `st.name`.

**4.4** In **Columns**, check `e.time`, `e.tag` *(no alias this time)*, `e.value`.

**4.5** In **WHERE**: `e.time` · `$__timeFilter(col)`.

**4.6** Click **+ Add UNION**.

**4.7** On Part 2 canvas: drag **state_tags** → alias `st2`.

**4.8** Add computed column: Expression `$__timeFrom()::timestamp`, Alias `time`.

**4.9** Check `st2.name` and add alias `tag`.

**4.10** Add LATERAL subquery, alias `e3`. Click **Edit Subquery →**.

**4.11** Drag **event** onto LATERAL canvas.

**4.12** In **Columns** check: `event.time`, `st2.name` (outer scope), `event.value`.

**4.13** In **WHERE**:
- `event.time` · `time lookback BETWEEN` · `30d`
- `event.tag` · `=` · `st2.name`

**4.14** **ORDER BY**: `event.time DESC`. **Limit**: `1`.

**4.15** ← Main query → Part 2 **WHERE**: `e3.value is not null`.

**4.16** Return to main query via **← Main query**.

---

## Phase 5 — Create the `state_ranges` CTE

This CTE converts discrete state event rows into time ranges using a `lead()` window function wrapped in `tsrange()`. Each row represents an interval during which the state held a particular value.

**5.1** Add a new CTE named `state_ranges`.

**5.2** Find **state_events** in the Virtual Tables section. Drag it onto the canvas. Set alias to `se`.

**5.3** In **Columns**, click **Add computed column**:
- Expression:
  ```
  tsrange("se"."time", lead("se"."time", 1, $__timeTo()) OVER (ORDER BY "se"."time"))
  ```
- Alias: `tsrange`

> `lead("se"."time", 1, $__timeTo()) OVER (ORDER BY "se"."time")` finds the next event's timestamp (defaulting to the Grafana time range end when there is no next row). Wrapping it in `tsrange()` produces a half-open interval `[start, end)`.

**5.4** Check `se.tag` and `se.value`.

**5.5** Click **← Main query**.

**Verification:** Five CTEs should now be listed: `data_tags`, `state_tags`, `data_events`, `state_events`, `state_ranges` — all with **Visual** badges.

---

## Phase 6 — Build the Main Query

The main query joins `data_events` to `state_ranges` using a range containment operator — keeping only data events that fall within a state range that matches a target state value.

**6.1** From Virtual Tables, drag **data_events** onto the main canvas. Set alias to `de`.

**6.2** Drag **state_ranges** onto the canvas. Set alias to `sr`.

**6.3** Draw a join from `de.time` to `sr.tsrange`. Click the join label.

**6.4** In the join popover, confirm type is **INNER**. In the **Custom ON clause** field, enter:
```
de.time <@ sr.tsrange AND sr.value = 2
```

> `<@` is the PostgreSQL range containment operator — `de.time <@ sr.tsrange` is true when the timestamp falls inside the range. Change `2` to whatever numeric state value represents your "active" state.

**6.5** In **Columns**, check:
- `de.time`
- `de.metric`
- `de.value`

**6.6** In **ORDER BY**, add:
- `de.time ASC`
- `de.metric ASC`

### Add dependency arrows (optional but recommended)

The three upstream CTEs (`data_tags`, `state_tags`, `state_events`) don't join to anything in the main query — their relationships are defined inside the CTE editors. You can add visual **REFERENCE** arrows to make the dependency flow visible on the canvas without affecting the SQL.

**6.7** Drag **data_tags** onto the canvas from Virtual Tables. Set alias to `dt`. It will be an orphan node (no SQL join).

**6.8** Drag **state_events** onto the canvas. Set alias to `se`.

**6.9** Drag **state_tags** onto the canvas. Set alias to `st`.

**6.10** Draw a join from `de.metric` to `dt.name`. Click the label and change the join type to **REFERENCE**. The arrow turns gray and dashed with a *uses* label. No SQL is generated for this edge.

**6.11** Draw a join from `se.tag` to `st.name`. Change to **REFERENCE**.

**6.12** Draw a join from `sr.tag` to `se.tag`. Change to **REFERENCE**.

The canvas now shows the full dependency chain:
```
data_tags (dt) ←uses── data_events (de) ──INNER JOIN── state_ranges (sr)
                                                              ↑ uses
state_tags (st) ←uses── state_events (se) ─────────────────────┘
```

---

## Phase 7 — Configure Grafana Settings

**7.1** Go to the **Grafana** tab.

**7.2** Set **Panel type** to `Time series`.

**7.3** Set **Time column** to `de.time`.

**Verification:** The Grafana tab orange dot should disappear.

---

## Feature Coverage Summary

| Step | Feature | Status |
|---|---|---|
| 1.2 | Add CTE, auto-enter visual editor | ✅ |
| 1.3 | Rename CTE | ✅ |
| 1.5–1.6 | Drag table into CTE canvas, select columns | ✅ |
| 1.7 | WHERE with single AND rule | ✅ |
| 3.1–3.7 | CTE with real table + CTE virtual table + INNER JOIN + aliased column + timeFilter | ✅ |
| 3.8 | Add UNION ALL branch inside CTE editor | ✅ |
| 3.9–3.11 | Part 2 canvas inside CTE: drag virtual table + computed column + aliased column | ✅ |
| 3.12–3.13 | Add LATERAL subquery inside CTE's Part 2, enter LATERAL editing mode | ✅ |
| 3.14–3.15 | Drag table into LATERAL, select outer-scope column from ghost node | ✅ |
| 3.16 | WHERE `time lookback BETWEEN` operator (bounded BETWEEN) | ✅ |
| 3.16 | WHERE correlated column reference (unquoted `table.column` value) | ✅ |
| 3.17–3.18 | ORDER BY + LIMIT inside nested LATERAL | ✅ |
| 3.20 | Part 2 WHERE `is not null` after returning from LATERAL | ✅ |
| 5.3 | Computed column with embedded window function expression | ✅ |
| 6.3–6.4 | Main query join with custom ON clause using PostgreSQL range operator | ✅ |
| 6.10–6.12 | REFERENCE join type — visual-only dependency arrows, no SQL emitted | ✅ |
| 7.1–7.3 | Grafana panel type + time column | ✅ |

**All features required for this query can be built visually without manual SQL editing.**
