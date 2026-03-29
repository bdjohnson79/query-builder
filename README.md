# SQL Query Builder

A visual, drag-and-drop SQL query builder for PostgreSQL. Define your database schema once in the app, then let users build queries without writing SQL — with first-class support for Grafana dashboards.

**No database server required.** The app stores its own data in an embedded database that lives in a local folder. Getting started is just `npm install && npm run dev`.

---

## Features

- **Visual canvas** — drag tables onto a canvas and draw joins between them; pick INNER, LEFT, RIGHT, FULL OUTER, or CROSS JOIN with a click
- **Column selection** — check columns directly on the canvas; set aliases and aggregates (COUNT, SUM, AVG, MIN, MAX) in the Columns tab
- **WHERE / HAVING** — point-and-click rule builder with nested AND/OR groups; no SQL required
- **GROUP BY, ORDER BY, LIMIT/OFFSET** — dedicated tabs for each
- **Window functions** — ROW_NUMBER, RANK, LAG, LEAD, and more with PARTITION BY and frame clauses
- **CTEs** — define Common Table Expressions visually or in raw SQL; CTEs appear as draggable virtual tables
- **JSONB** — map JSONB columns to defined structures, extract paths, unnest arrays
- **Grafana integration** — time axis, `time_bucket`, gapfill, `$__timeFilter` and 11 other Grafana macros, variable population mode
- **TimescaleDB helpers** — `time_bucket` intervals, `locf`/`interpolate` gapfill strategies, ST-One aggregates (`first`, `last`, `increase_v2`)
- **Query library** — save queries to the built-in library with names, descriptions, folders, and tags; search and filter
- **File save/load** — export any query to a `.json` file and reload it later (no account needed)
- **Templates** — pre-built starters for time series, aggregation, and Grafana variable queries
- **Schema import** — paste JSON from a helper SQL query and import tables/columns directly from a live PostgreSQL database
- **Live SQL preview** — see the generated SQL update in real time; edit it manually when needed

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or later
- npm (included with Node.js)
- Git (to clone the repo)

No Docker. No PostgreSQL. No admin rights needed for installation.

---

## Installation (Windows, no admin required)

### 1 — Install Node.js without admin rights

If Node.js is not already installed and you don't have admin rights:

1. Go to [nodejs.org](https://nodejs.org/) and download the **Windows Binary (.zip)** for the LTS release (not the installer)
2. Extract the zip to a folder you own, e.g. `C:\Users\YourName\tools\nodejs`
3. Add that folder to your user `PATH`:
   - Open **Start**, search for **"Edit environment variables for your account"**
   - Under **User variables**, select `Path` → **Edit** → **New**
   - Paste in `C:\Users\YourName\tools\nodejs`
   - Click OK, then open a new terminal to pick up the change
4. Verify: open a terminal and run `node --version`

### 2 — Clone and install

```
git clone https://github.com/bdjohnson79/query-builder.git
cd query-builder
npm install
```

### 3 — Run

```
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The first time you run the app it will automatically:
- Create a local database folder at `data/pglite/`
- Apply all schema migrations
- Seed the KHC x ST-One schema so there is something to explore right away

Subsequent starts are instant — data persists in `data/pglite/` between runs.

> **Note:** The `data/` folder is listed in `.gitignore` and will never be committed. Your saved queries and any schema changes you make stay on your machine.

---

## How to use

### Overview

There are two areas of the app:

| URL | Purpose |
|---|---|
| `/admin/schema` | **Admin** — define schemas, tables, columns, and join relationships |
| `/builder` | **Builder** — drag-and-drop query canvas for users |

---

### Step 1 — Define your schema (admin)

Go to **Schema Admin** (link in the top nav of the builder, or navigate to `/admin/schema`).

The layout is three columns: **Schemas → Tables → Table Editor**.

1. Click **+** next to Schemas to create a schema (e.g. `public`)
2. Click **+** next to Tables to add a table; give it the actual database table name
3. In the Table Editor on the right, add columns — name, PostgreSQL type, nullable, default, primary key flag
4. Click **Save** to persist column changes
5. Click **Relationships** to define foreign key paths between tables — these are used by the builder to suggest and wire up joins

**Schema import shortcut:** If you have access to a live PostgreSQL database, click the **Import** button (upload icon in the admin nav). The dialog shows a SQL snippet to run against your database. Copy the JSON output, paste it into the dialog, and the app will detect new and changed tables and import them in bulk.

---

### Step 2 — Build a query

Navigate to the **builder** (`/builder` or the home page).

#### Add tables

Drag tables from the **left panel** onto the canvas. Each table becomes a node showing its columns. Use the search box to filter by name.

CTEs you define also appear in the left panel as purple cards.

#### Create joins

Drag from the **right handle** (→) of one table to the **left handle** (←) of another. A join edge appears.

- Click the join label to change the join type (INNER, LEFT, RIGHT, FULL OUTER, CROSS)
- Click **Custom ON** to write a custom join condition

#### Select columns

Check the box next to any column on a canvas node to include it in the SELECT clause.

Use the **Columns tab** (right panel) to:
- Reorder columns with ↑ / ↓
- Set a column alias
- Apply an aggregate function (COUNT, SUM, AVG, MIN, MAX)
- Add computed columns: free-form expressions, CASE WHEN logic, time dimension extractions, or ST-One aggregates (`first`, `last`, `increase_v2`)

#### Filter rows — WHERE tab

Click **+ Add Rule** to add a condition. Choose a column, an operator, and a value.

- Click **+ Add Group** to create nested AND/OR groups
- Grafana time macros (`$__timeFilter`, etc.) are available as operators
- Values that start with `$` are treated as Grafana variables and emitted unquoted

#### Aggregate — GROUP BY tab

Check the columns to group by. Combine with aggregate functions set in the Columns tab.

Use the **HAVING tab** for post-aggregation filters (same rule builder as WHERE).

#### Sort and limit

Use the **ORDER BY tab** to add sort levels (ASC/DESC, NULLS FIRST/LAST). Use the **LIMIT tab** to add LIMIT and OFFSET.

#### Grafana time series — Grafana tab

If building a Grafana time-series panel:

1. Set the **time column** (the timestamp column in your main table)
2. Optionally enable **TimescaleDB time_bucket** and pick an interval (1m, 5m, 1h, 1d, `$__interval`, etc.)
3. Enable **Gapfill** if you want continuous time ranges with `locf` or `interpolate` fill
4. Choose the **panel type** — the app will warn if your query shape doesn't match

The Grafana tab also has a **macro reference** — click any macro name to copy its syntax.

#### View and copy the SQL

The **SQL tab** shows the generated query, updated live as you make changes.

- Click **Copy** or use the **Copy SQL** button in the nav bar to copy to clipboard
- You can edit the SQL directly in the tab; an "Edited" badge will appear
- Click **Revert** to go back to the auto-generated version

---

### Step 3 — Save and reuse queries

#### Save to the built-in library

Click **Save** in the nav bar. Give the query a name, optional description, folder, and tags. If a query with the same name already exists you can overwrite it.

#### Load from the library

Click **Load** to open the query library. Filter by folder, search by name or description, or click tag chips to narrow the list. Hover over a query card to reveal **Load**, **Duplicate**, **Export**, and **Delete** actions.

#### Save to / load from a file

Use **Save to File** and **Load from File** (nav bar) to export and import queries as `.json` files. Useful for sharing queries with colleagues or keeping personal backups outside the app.

---

### CTEs (Common Table Expressions)

Open the **CTEs tab** in the right panel and click **+ Add CTE**.

1. Give the CTE a name
2. A blue banner appears on the canvas — you are now editing the CTE's sub-query
3. Build the sub-query the same way you build any query (drag tables, add joins, select columns, etc.)
4. Click **Done editing CTE** to return to the main query
5. The CTE appears in the left panel as a purple virtual table you can drag onto the main canvas

Toggle **Raw SQL mode** in the CTE editor to paste custom SQL and declare output columns manually. Check **Recursive** for `WITH RECURSIVE` CTEs.

---

### Window functions

Open the **Windows tab** and click **+ Add Window Function**. Choose the function (ROW_NUMBER, RANK, SUM, LAG, LEAD, etc.), set the alias, define PARTITION BY columns, and optionally specify a frame clause. The function is added to the SELECT clause automatically.

---

### JSONB columns

If a table has a `jsonb` column, open the **JSONB tab** to:

- Map the column to a structure defined in `/admin/json-structures`
- Extract individual paths using the `#>>` operator — extracted paths appear as selectable fields in WHERE and SELECT
- Expand all top-level fields at once with `jsonb_to_record()`
- Unnest JSONB arrays with a `LATERAL` join

---

### Templates

Click **Templates** in the nav bar for pre-built query starters:

| Template | What it builds |
|---|---|
| Time Series | `time_bucket` aggregation with `$__timeFilter` |
| Aggregation | Generic GROUP BY summary |
| Grafana Variables | Variable-population query with `__value` / `__text` aliases |

Templates fill the canvas, columns, and filters with a working starting point to adapt to your schema.

---

## Updating

```
git pull
npm install
npm run dev
```

Any new database migrations are applied automatically on the next start.

---

## Resetting your local data

To wipe saved queries and schema changes and start fresh, stop the dev server and delete the `data/` folder:

```
rmdir /s /q data
```

The next `npm run dev` will recreate it and re-seed the default schema.
