# Tutorial: Standard Time Series Query

This guide walks through building the **Standard Time Series** query template from scratch. It serves as both a learning exercise and a feature verification checklist. Each step maps to a specific UI feature — if a step cannot be completed, the corresponding feature is missing or broken.

**What this query does:** Retrieves time-series tag values joined with tag metadata, filtered to a Grafana time range, sorted for panel display, and extended with a 30-day lookback branch so charts don't show gaps at the left edge.

**Required schema tables:**
| Table | Required columns |
|---|---|
| `event` | `time`, `tag`, `value` |
| `tag` | `name`, `description`, `location` |

---

## Phase 1 — Create the `tags` CTE

The tags CTE filters the tag table down to only the tag names you care about. By putting this in a CTE, the main query stays clean.

**1.1** In the right panel, click the **Advanced** section to expand it, then click the **CTEs** tab.

**1.2** Click **Add CTE**. A new CTE named `cte_1` is created and the canvas immediately switches to CTE editing mode. You will see the blue banner: *Editing CTE: cte_1*.

**1.3** The right panel now shows a **CTE Edit Form** with the CTE name and mode options. Change the name from `cte_1` to `tags`.

**1.4** Confirm the mode is set to **Visual builder** (green badge). Leave it there — do not switch to Raw SQL.

**1.5** Drag the **tag** table from the left panel onto the canvas. When it lands, double-click the alias and rename it to `tag` (it may already default to this).

**1.6** In the **Columns** tab, check the boxes for:
- `tag.name`
- `tag.description`
- `tag.location`

**1.7** Go to the **WHERE** tab. The combinator defaults to AND — change it to **OR** using the dropdown next to the rule group.

**1.8** Add three filter rules:
- Field: `tag.name` · Operator: `=` · Value: `your_tag_name_here`
- Field: `tag.name` · Operator: `=` · Value: `your_other_tag_here`
- Field: `tag.name` · Operator: `=` · Value: `your_tag_here`

> These are placeholder values. Replace them with your actual tag names before using the query.

**1.9** Click **← Main query** in the blue banner to return to the main canvas. The `tags` CTE now appears in the Virtual Tables section of the left panel.

**Verification:** In the CTEs tab you should see `WITH tags` with a green **Visual** badge and the hint "Click Edit to open visual builder for this CTE."

---

## Phase 2 — Build the Main Canvas

**2.1** Drag the **event** table from the left panel onto the canvas. Double-click its alias and set it to `e`.

**2.2** Find **tags** in the **Virtual Tables (CTEs)** section of the left panel and drag it onto the canvas. Double-click its alias and set it to `t`.

**2.3** Draw a join: hover over the `e.tag` column handle on the right side of the `event` node until the cursor becomes a crosshair, then drag to the `t.name` handle on the left side of the `tags` node.

**2.4** Click the join label that appears on the connector. In the popover, confirm the join type is **INNER**. No custom ON clause is needed — the generated `ON e.tag = t.name` is correct.

**Verification:** The SQL preview should now contain `INNER JOIN tags t ON e.tag = t.name`.

---

## Phase 3 — Select Columns

**3.1** Go to the **Columns** tab.

**3.2** Check the boxes for:
- `e.time`
- `t.description`
- `e.value`

The column order in the SELECT will match the order you check them. If needed, reorder by dragging the rows in the Columns panel.

**Verification:** SQL preview should show `SELECT e.time, t.description, e.value`.

---

## Phase 4 — Add WHERE Filter

**4.1** Go to the **WHERE** tab.

**4.2** Add a rule:
- Field: `e.time`
- Operator: `$__timeFilter(col)` (in the Grafana section of the operator dropdown)
- Value: *(leave empty)*

**Verification:** SQL should contain `WHERE $__timeFilter("e"."time")`.

---

## Phase 5 — Add ORDER BY

**5.1** Go to the **ORDER BY** tab.

**5.2** Click **Add ORDER BY** and set:
- Column: `e.time` · Direction: `ASC`

**5.3** Click **Add ORDER BY** again and set:
- Column: `t.description` · Direction: `ASC`

**Verification:** SQL should end with `ORDER BY e.time ASC, t.description ASC`.

---

## Phase 6 — Configure Grafana Settings

**6.1** Go to the **Grafana** tab (first tab in the essential row — look for the orange dot if it has pending configuration).

**6.2** Set **Panel type** to `Time series`.

**6.3** Set **Time column** to `e.time`.

**6.4** Leave **Grafana variable mode** off.

**Verification:** The Grafana tab orange dot should disappear.

---

## Phase 7 — Add UNION ALL Lookback Branch

The lookback branch adds one data point at the very start of each time range so Grafana charts don't show a gap at the left edge. It looks 30 days back for the most recent value before the window start.

**7.1** The **UNION Part Switcher** bar sits just above the three-column layout. It currently shows *Single query* with a small **+ Add UNION** button. Click **+ Add UNION**.

**7.2** The switcher now shows **Part 1 · UNION ALL · Part 2**. Part 2 is automatically selected. The canvas shows a green ring indicating you are editing the UNION branch.

**7.3** Drag the **tags** CTE from the Virtual Tables section of the left panel onto the canvas. Double-click its alias and set it to `t2`.

**7.4** In the **Columns** tab for Part 2, click **Add computed column**. Enter:
- Expression: `$__timeFrom()::timestamp`
- Alias: `time`

**7.5** Check the box for `t2.description`.

**7.6** In the left panel, click **Add LATERAL subquery**. Set the alias to `e2` and click **Add**.

**7.7** Click **Edit Subquery →** on the `e2` LATERAL node that appears on the canvas.

The canvas enters LATERAL editing mode (cyan banner + cyan ring). The outer-scope `t2` node is shown as a dimmed ghost node on the left, indicating its columns are available for correlated references.

**7.8** Drag the **event** table from the left panel onto the LATERAL canvas.

**7.9** In the **Columns** tab for the LATERAL subquery, check:
- `event.time`
- `t2.description` (from the outer scope)
- `event.value`

**7.10** Go to the **WHERE** tab inside the LATERAL editor. Add two rules:
- Field: `event.time` · Operator: `time lookback BETWEEN (col, interval)` · Value: `30d`
  *(This generates: `event.time BETWEEN $__timeFrom()::timestamp - INTERVAL '30d' AND $__timeFrom()::timestamp`)*
- Field: `[outer] t2.name` · Operator: `=` · Field ref value: `event.tag`

  > The second condition is a column-to-column comparison (`tag = t2.name`). Type `t2.name` directly into the value field without quotes — it will be emitted unquoted since it does not match the string-quoting rules.

**7.11** Go to the **ORDER BY** tab. Add `event.time DESC`.

**7.12** Go to the **Limit** tab. Set **Limit** to `1`.

**7.13** Click **← Main query** in the cyan banner to return to Part 2.

**7.14** In Part 2's **JOIN** popover for `e2`, set the ON clause to `true` (the LATERAL join ON condition).

**7.15** In Part 2's **WHERE** tab, add: `e2.value IS NOT NULL` (use the `notNull` operator).

**7.16** Click **Save** in the top toolbar.

**Verification:** SQL Part 2 should contain:
```sql
SELECT $__timeFrom()::timestamp AS time, t2.description, value
FROM tags t2
LEFT JOIN LATERAL (
    SELECT event.time, t2.description, event.value
    FROM event
    WHERE event.time BETWEEN $__timeFrom()::timestamp - INTERVAL '30d'
                         AND $__timeFrom()::timestamp
      AND t2.name = event.tag
    ORDER BY event.time DESC
    LIMIT 1
) AS e2 ON true
WHERE e2.value IS NOT NULL
```

---

## Feature Coverage Summary

| Step | Feature | Status |
|---|---|---|
| 1.2 | Add CTE, auto-enter visual editor | ✅ |
| 1.3 | Rename CTE | ✅ |
| 1.5 | Drag table into CTE canvas | ✅ |
| 1.6 | Select columns in Columns tab | ✅ |
| 1.7–1.8 | WHERE with OR combinator, multiple rules | ✅ |
| 1.9 | Return to main query from CTE | ✅ |
| 2.1–2.2 | Drag real table + CTE virtual table | ✅ |
| 2.3–2.4 | Draw INNER JOIN, verify type in popover | ✅ |
| 3.1–3.2 | Select specific columns | ✅ |
| 4.1–4.2 | WHERE with `$__timeFilter` Grafana macro | ✅ |
| 5.1–5.3 | Multi-column ORDER BY | ✅ |
| 6.1–6.4 | Grafana panel type + time column | ✅ |
| 7.1 | Add UNION ALL branch via Part Switcher | ✅ |
| 7.3–7.5 | Drag CTE virtual table + computed column + select column in Part 2 | ✅ |
| 7.6–7.7 | Add LATERAL subquery, enter editing mode | ✅ |
| 7.8–7.9 | Drag table into LATERAL canvas, select outer-scope columns | ✅ |
| 7.10 | WHERE with `$__timeLookback` (bounded BETWEEN) | ✅ |
| 7.10 | WHERE correlated reference to outer-scope column | ✅ |
| 7.11–7.12 | ORDER BY + LIMIT inside LATERAL subquery | ✅ |
| 7.13–7.15 | Return to main, set LATERAL ON clause, IS NOT NULL filter | ✅ |

**All features required for this query are now present.** The full lookback branch can be built visually without manual SQL editing.
