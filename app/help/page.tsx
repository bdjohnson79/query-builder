import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'User Manual — SQL Query Builder',
}

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'schema-admin', label: 'Schema Admin' },
  { id: 'schema-import', label: '↳ Schema Import' },
  { id: 'canvas', label: 'Canvas & Tables' },
  { id: 'joins', label: '↳ Joins' },
  { id: 'columns', label: 'Selecting Columns' },
  { id: 'where', label: 'WHERE Filters' },
  { id: 'groupby', label: 'GROUP BY & HAVING' },
  { id: 'orderby', label: 'ORDER BY & LIMIT' },
  { id: 'window', label: 'Window Functions' },
  { id: 'ctes', label: 'CTEs & Subqueries' },
  { id: 'jsonb', label: 'JSONB Columns' },
  { id: 'grafana', label: 'Grafana Integration' },
  { id: 'templates', label: 'Templates' },
  { id: 'saving', label: 'Saving Queries' },
  { id: 'library', label: 'Query Library' },
  { id: 'sql-preview', label: 'SQL Preview' },
]

export default function HelpPage() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar TOC */}
      <aside className="sticky top-0 h-screen w-56 shrink-0 overflow-y-auto border-r bg-muted/30 py-6">
        <div className="px-4 mb-4">
          <a href="/builder" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Query Builder
          </a>
        </div>
        <div className="px-4 mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contents
        </div>
        <nav className="space-y-0.5 px-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-8 py-10 max-w-4xl">
        <h1 className="text-3xl font-bold mb-1">SQL Query Builder</h1>
        <p className="text-muted-foreground mb-10 text-lg">User Manual</p>

        {/* ─── Overview ─────────────────────────────────────────── */}
        <Section id="overview" title="Overview">
          <p>
            The SQL Query Builder is a graphical, drag-and-drop tool for composing PostgreSQL queries
            without writing SQL from scratch. An administrator defines the database schema inside the
            app; users then build queries against that schema and copy the generated SQL into Grafana,
            psql, or any other PostgreSQL client.
          </p>
          <p className="mt-3">There are two top-level areas:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>
              <strong>Schema Admin</strong> (<code>/admin/schema</code>) — define schemas, tables,
              columns, foreign keys, and JSONB structures.
            </li>
            <li>
              <strong>Query Builder</strong> (<code>/builder</code>) — visually compose queries,
              configure filters/aggregations, and copy or save the result.
            </li>
          </ul>
          <p className="mt-3">
            There is no live database connection. SQL is generated entirely in the browser based on
            the schema you have defined.
          </p>
        </Section>

        {/* ─── Schema Admin ─────────────────────────────────────── */}
        <Section id="schema-admin" title="Schema Admin">
          <p>
            Navigate to <strong>Schema Admin</strong> from the top-right link on either page. The
            layout has three columns: schemas on the left, tables in the middle, and the editor on
            the right.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Schemas</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Click <Kbd>+</Kbd> in the schema column to create a new schema (e.g. <code>public</code>, <code>timescaledb</code>).</li>
            <li>Click a schema name to select it and see its tables.</li>
            <li>Hover over a schema row to reveal the delete button. Deleting a schema cascades to all its tables and columns.</li>
          </ul>

          <h3 className="mt-5 mb-2 font-semibold text-base">Tables</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Select a schema, then click <Kbd>+</Kbd> in the tables column to add a table.</li>
            <li>Fill in the <strong>Table Name</strong> (required, snake_case database name), <strong>Display Name</strong> (optional friendly label), and <strong>Description</strong> (shown as a tooltip in the builder).</li>
          </ul>

          <h3 className="mt-5 mb-2 font-semibold text-base">Columns</h3>
          <p>Select a table to open the column editor. Each column has:</p>
          <table className="mt-2 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <Th>Field</Th>
                <Th>Description</Th>
              </tr>
            </thead>
            <tbody>
              <Tr><Td>Name</Td><Td>Column name as it appears in the database.</Td></Tr>
              <Tr><Td>Type</Td><Td>PostgreSQL type: text, integer, bigint, numeric, boolean, timestamp, timestamptz, date, jsonb, uuid, etc.</Td></Tr>
              <Tr><Td>Nullable</Td><Td>Whether the column allows NULL values.</Td></Tr>
              <Tr><Td>Default</Td><Td>Default value expression (optional).</Td></Tr>
              <Tr><Td>PK</Td><Td>Mark as primary key — shown with a key icon in the builder.</Td></Tr>
              <Tr><Td>Description</Td><Td>Documentation text; shown as a tooltip when hovering the column in the builder.</Td></Tr>
            </tbody>
          </table>
          <p className="mt-3">Click <strong>Save</strong> to persist all column changes at once.</p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Foreign Keys (Relationships)</h3>
          <p>
            Click <strong>Relationships</strong> at the bottom of the tables column. Use the form to
            define a join path: select the source table and column, then the target table and column.
            A constraint name is auto-suggested but can be overridden.
          </p>
          <p className="mt-2">
            Foreign keys are used for <em>documentation only</em> — they help you understand the data
            model but do not auto-create joins in the builder. Self-referencing (recursive) foreign
            keys are supported.
          </p>
        </Section>

        {/* ─── Schema Import ────────────────────────────────────── */}
        <Section id="schema-import" title="Schema Import">
          <p>
            If your PostgreSQL database already has tables defined, you can import the schema in bulk
            rather than entering each table manually.
          </p>
          <ol className="mt-3 list-decimal pl-5 space-y-2">
            <li>
              Click <strong>Import</strong> (upload icon) in the Schema Admin nav bar.
            </li>
            <li>
              The dialog shows a <strong>helper SQL query</strong>. Run it against your database and
              copy the resulting JSON output.
            </li>
            <li>
              Paste the JSON into the textarea and click <strong>Next</strong>. A diff table shows
              which tables are <span className="text-green-700 font-medium">new</span>,{' '}
              <span className="text-blue-700 font-medium">changed</span>, or{' '}
              <span className="text-muted-foreground font-medium">unchanged</span>.
            </li>
            <li>
              Check the tables you want to import (all selected by default), then click{' '}
              <strong>Import Selected</strong>.
            </li>
          </ol>
          <p className="mt-3">
            Import is non-destructive — existing tables and columns are updated but never deleted.
            You can run it multiple times to pick up schema changes.
          </p>
        </Section>

        {/* ─── Canvas & Tables ──────────────────────────────────── */}
        <Section id="canvas" title="Canvas & Tables">
          <p>
            The canvas is the main workspace. Drag a table from the left panel onto the canvas to
            add it to your query. A table node appears with its column list.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Table Nodes</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Header colour</strong>: blue = regular table, purple = CTE (virtual table).</li>
            <li><strong>Alias</strong>: shown below the table name. Click it to rename (e.g. change <code>events</code> to <code>e</code>). Aliases are used throughout the generated SQL.</li>
            <li><strong>Remove</strong>: click the <Kbd>×</Kbd> button in the top-right corner of the node.</li>
            <li><strong>Move</strong>: drag the node header to reposition it on the canvas.</li>
            <li><strong>Duplicate table</strong>: drag the same table onto the canvas a second time — it gets a numbered alias automatically (e.g. <code>events_2</code>).</li>
          </ul>

          <h3 className="mt-5 mb-2 font-semibold text-base">Canvas Controls</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Pan</strong>: click and drag on the canvas background.</li>
            <li><strong>Zoom</strong>: scroll wheel, or use the zoom buttons in the bottom-left.</li>
            <li><strong>Fit view</strong>: click the fit-to-screen button to centre all nodes.</li>
            <li><strong>Mini-map</strong>: bottom-right overview; drag the viewport rectangle to navigate.</li>
            <li><strong>Delete</strong>: select a node or edge and press <Kbd>Delete</Kbd>.</li>
          </ul>

          <h3 className="mt-5 mb-2 font-semibold text-base">Selecting Columns on the Canvas</h3>
          <p>
            Check the checkbox next to any column name to include it in the <code>SELECT</code>{' '}
            clause. Unchecking removes it. The order and aliases are managed in the{' '}
            <strong>Columns</strong> tab of the right panel.
          </p>
          <p className="mt-2">
            Hover over a column name to see its description tooltip (if one was set in Schema Admin).
          </p>
        </Section>

        {/* ─── Joins ────────────────────────────────────────────── */}
        <Section id="joins" title="Joins">
          <p>
            To join two tables, drag from the <strong>right handle</strong> (circle on the right
            edge) of one table node to the <strong>left handle</strong> of another. A join edge
            appears.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Configuring a Join</h3>
          <p>Click the label on the join edge to open the join popover:</p>
          <table className="mt-2 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50"><Th>Option</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <Tr><Td>Join type</Td><Td>INNER, LEFT, RIGHT, FULL OUTER, or CROSS JOIN.</Td></Tr>
              <Tr><Td>Auto ON clause</Td><Td>Generated from the foreign key or handle connection (e.g. <code>t1.id = t2.table_id</code>).</Td></Tr>
              <Tr><Td>Custom ON clause</Td><Td>Paste any valid SQL condition. Use table aliases as defined on the canvas. When set, the edge turns indigo and shows "CUSTOM".</Td></Tr>
              <Tr><Td>Remove join</Td><Td>Deletes the join edge entirely.</Td></Tr>
            </tbody>
          </table>

          <h3 className="mt-5 mb-2 font-semibold text-base">Join Colour Guide</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {[
              { color: 'bg-blue-500', label: 'INNER JOIN' },
              { color: 'bg-green-500', label: 'LEFT JOIN' },
              { color: 'bg-orange-500', label: 'RIGHT JOIN' },
              { color: 'bg-purple-500', label: 'FULL OUTER' },
              { color: 'bg-red-500', label: 'CROSS JOIN' },
              { color: 'bg-indigo-500', label: 'Custom ON' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded-full ${color}`} />
                {label}
              </span>
            ))}
          </div>

          <h3 className="mt-5 mb-2 font-semibold text-base">Tips</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>You can have multiple joins — add as many tables as needed.</li>
            <li>
              For complex conditions like range overlaps (<code>a.time &lt;@ b.tsrange</code>),
              use the Custom ON clause.
            </li>
            <li>CROSS JOIN ignores the ON clause entirely.</li>
          </ul>
        </Section>

        {/* ─── Selecting Columns ────────────────────────────────── */}
        <Section id="columns" title="Selecting Columns">
          <p>
            The <strong>Columns</strong> tab in the right panel lets you reorder, alias, and
            aggregate the columns you have checked on the canvas.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Per-Column Controls</h3>
          <table className="mt-2 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50"><Th>Control</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <Tr><Td>↑ / ↓ arrows</Td><Td>Reorder columns in the SELECT list.</Td></Tr>
              <Tr><Td>Alias</Td><Td>Override the column name in the output. Required for expressions.</Td></Tr>
              <Tr><Td>Aggregate</Td><Td>Wrap in COUNT, SUM, AVG, MIN, MAX, or COUNT DISTINCT.</Td></Tr>
              <Tr><Td>× remove</Td><Td>Remove from SELECT (same as unchecking on canvas).</Td></Tr>
            </tbody>
          </table>

          <h3 className="mt-5 mb-2 font-semibold text-base">Adding Expressions</h3>
          <p>Four helper buttons below the column list let you add calculated columns:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1.5">
            <li>
              <strong>Expression</strong> — free-form SQL. Write any valid expression (e.g.{' '}
              <code>EXTRACT(epoch FROM t1.created_at) * 1000</code>) and give it an alias.
            </li>
            <li>
              <strong>CASE WHEN</strong> — visual builder for conditional expressions. Add
              WHEN/THEN pairs, an optional ELSE, and an alias. A live preview shows the SQL before
              you add it.
            </li>
            <li>
              <strong>Time dimension</strong> — extract temporal components (hour, day of week,
              month, shift bucket, etc.) from a timestamp column. Choose a source column and a
              dimension; the expression is generated automatically.
            </li>
            <li>
              <strong>ST-One aggregate</strong> — <code>first(value, time)</code>,{' '}
              <code>last(value, time)</code>, and <code>increase_v2(value, resets)</code> aggregate
              functions used with ST-One sensor data.
            </li>
          </ul>
        </Section>

        {/* ─── WHERE ────────────────────────────────────────────── */}
        <Section id="where" title="WHERE Filters">
          <p>
            The <strong>WHERE</strong> tab uses a visual rule builder. No SQL syntax is required.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Rules and Groups</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Click <strong>+ Rule</strong> to add a filter condition: choose a column, an operator, and a value.</li>
            <li>Click <strong>+ Group</strong> to add a nested AND/OR group (generates parentheses in the SQL).</li>
            <li>Toggle <strong>AND / OR</strong> at the top of each group to change the logical combinator.</li>
            <li>Delete any rule or group with its <Kbd>×</Kbd> button.</li>
          </ul>

          <h3 className="mt-5 mb-2 font-semibold text-base">Operators</h3>
          <p>Standard SQL operators: <code>=, !=, &lt;, &gt;, &lt;=, &gt;=, LIKE, NOT LIKE, IN, NOT IN, IS NULL, IS NOT NULL, BETWEEN, NOT BETWEEN</code>.</p>
          <p className="mt-2">Grafana time-range operators (these become macros in the SQL):</p>
          <ul className="mt-1 list-disc pl-5 space-y-1 text-sm">
            <li><code>$__timeFilter</code> — standard Grafana time range filter</li>
            <li><code>$__unixEpochFilter</code> — for Unix epoch (seconds) timestamps</li>
            <li><code>$__unixEpochNanoFilter</code> — for nanosecond timestamps</li>
          </ul>

          <h3 className="mt-5 mb-2 font-semibold text-base">Grafana Variables</h3>
          <p>
            Values starting with <code>$</code> (e.g. <code>$machine</code>) are treated as Grafana
            dashboard variables and are left <em>unquoted</em> in the generated SQL — Grafana
            substitutes them at render time. A blue badge confirms the variable is recognised.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">JSONB Paths in WHERE</h3>
          <p>
            If a JSONB column has a structure mapped (see <a href="#jsonb" className="text-blue-600 hover:underline">JSONB Columns</a>), individual paths appear as selectable fields in the rule builder.
          </p>
        </Section>

        {/* ─── GROUP BY ─────────────────────────────────────────── */}
        <Section id="groupby" title="GROUP BY & HAVING">
          <h3 className="mb-2 font-semibold text-base">GROUP BY</h3>
          <p>
            The <strong>GROUP BY</strong> tab shows all columns from tables on the canvas. Check any
            column to add it to the GROUP BY clause. Typically you group by dimension columns and
            apply aggregates (COUNT, SUM, etc.) to the measure columns.
          </p>
          <p className="mt-2">
            <strong>Tip:</strong> any column you check on the canvas that has an aggregate function
            set in the Columns tab does not need to appear in GROUP BY — only non-aggregated columns
            need to be grouped.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-base">HAVING</h3>
          <p>
            HAVING is in the <strong>Advanced</strong> section of the right panel. It uses the same
            visual rule builder as WHERE but the conditions are evaluated <em>after</em>{' '}
            aggregation. Use it to filter groups (e.g.{' '}
            <code>HAVING COUNT(*) &gt; 10</code>).
          </p>
        </Section>

        {/* ─── ORDER BY & LIMIT ─────────────────────────────────── */}
        <Section id="orderby" title="ORDER BY & LIMIT">
          <h3 className="mb-2 font-semibold text-base">ORDER BY</h3>
          <p>
            Click <strong>+ Add sort</strong> in the ORDER BY tab to add a sort level. For each
            level you can set:
          </p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li><strong>Column</strong> — choose from any column in your query.</li>
            <li><strong>Direction</strong> — ASC (default) or DESC.</li>
            <li><strong>NULLs</strong> — Default, NULLS FIRST, or NULLS LAST.</li>
          </ul>
          <p className="mt-2">Drag rows or use the remove button to manage multiple sort levels.</p>

          <h3 className="mt-4 mb-2 font-semibold text-base">LIMIT / OFFSET</h3>
          <p>
            Found under <strong>Advanced → LIMIT</strong>. Enter a number in LIMIT to cap the
            number of rows returned. Enter a number in OFFSET to skip the first N rows. Clear either
            field to remove it from the query.
          </p>
        </Section>

        {/* ─── Window Functions ─────────────────────────────────── */}
        <Section id="window" title="Window Functions">
          <p>
            Found under <strong>Advanced → Windows</strong>. Window functions compute values
            across a set of rows related to the current row without collapsing them into a single
            group.
          </p>
          <p className="mt-3">Click <strong>+ Add window function</strong> and configure:</p>
          <table className="mt-2 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50"><Th>Field</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <Tr><Td>Function</Td><Td>ROW_NUMBER, RANK, DENSE_RANK, SUM, AVG, COUNT, MIN, MAX, LAG, LEAD, NTILE, PERCENT_RANK, CUME_DIST.</Td></Tr>
              <Tr><Td>Alias</Td><Td>Column name for the result (required).</Td></Tr>
              <Tr><Td>Expression</Td><Td>Column or expression to operate on (not needed for ROW_NUMBER / RANK).</Td></Tr>
              <Tr><Td>PARTITION BY</Td><Td>Comma-separated column references that define the window partition (e.g. <code>t1.machine_id</code>).</Td></Tr>
              <Tr><Td>Frame clause</Td><Td>Custom window frame (e.g. <code>ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW</code>).</Td></Tr>
            </tbody>
          </table>
          <p className="mt-3">Add as many window functions as you need.</p>
        </Section>

        {/* ─── CTEs ─────────────────────────────────────────────── */}
        <Section id="ctes" title="CTEs & Subqueries">
          <p>
            CTEs (Common Table Expressions) let you define named sub-queries that the main query
            can reference like tables. They are found under <strong>Advanced → CTEs</strong> in the
            right panel.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Creating a CTE</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Click <strong>+ Add CTE</strong> in the CTE panel.</li>
            <li>Give the CTE a name (used in the <code>WITH</code> clause).</li>
            <li>Choose <strong>Visual</strong> or <strong>Raw SQL</strong> mode.</li>
          </ol>

          <h3 className="mt-5 mb-2 font-semibold text-base">Visual Mode</h3>
          <p>
            Click <strong>Edit</strong> on the CTE card. The canvas switches into "CTE editing mode"
            (blue banner at the top). You now build the CTE body exactly like a normal query — drag
            tables onto the canvas, add columns, joins, and filters. Click{' '}
            <strong>← Main query</strong> to return.
          </p>
          <p className="mt-2">
            Output columns are derived automatically from the SELECT list of the CTE body.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Raw SQL Mode</h3>
          <p>
            Paste any valid SQL directly into the textarea. You must also define the{' '}
            <strong>Output columns</strong> (name + type) so that the CTE can be dragged onto the
            canvas as a virtual table.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Using a CTE in the Main Query</h3>
          <p>
            After defining a CTE, it appears in the <strong>Virtual Tables</strong> section of the
            left panel (purple cards). Drag it onto the canvas to use it as a data source — it joins
            and filters just like a regular table.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">RECURSIVE CTEs</h3>
          <p>
            Check <strong>Recursive</strong> in the CTE editor to emit{' '}
            <code>WITH RECURSIVE</code>. Write the base case and recursive term in Raw SQL mode.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">UNION ALL Branch</h3>
          <p>
            At the bottom of the CTE panel there is a <strong>UNION ALL</strong> section. Paste a
            raw SQL SELECT here to append a second branch to the main query (inserted before ORDER BY
            / LIMIT). Useful for lookback patterns where you UNION a historical baseline with the
            current window.
          </p>
        </Section>

        {/* ─── JSONB ────────────────────────────────────────────── */}
        <Section id="jsonb" title="JSONB Columns">
          <p>
            PostgreSQL <code>jsonb</code> columns can be mapped to a structure so you can select
            individual paths. Go to <strong>Advanced → JSONB</strong> in the right panel.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Mapping a Structure</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Select the JSONB column from the dropdown.</li>
            <li>Pick a structure from the list (built-in presets or custom structures you've defined under <a href="/admin/json-structures" className="text-blue-600 hover:underline">Admin → JSON Structures</a>).</li>
          </ol>
          <p className="mt-2">
            Once mapped, the table node on the canvas shows an expand toggle. Click it to see all
            available paths as selectable rows.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Path Extraction Mode (default)</h3>
          <p>
            Check individual paths in the expanded column list. Each path becomes a column in the
            SELECT using the <code>#&gt;&gt;</code> operator (e.g.{' '}
            <code>t1.payload #&gt;&gt; '&#123;"sensor_id"&#125;'</code>).
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Expand as Record Mode</h3>
          <p>
            Switches to <code>CROSS JOIN jsonb_to_record()</code>, which expands all top-level
            fields of the JSON object into typed columns. Set the record alias (e.g. <code>r</code>)
            and check which fields to include.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Array Unnesting</h3>
          <p>
            Arrays inside the JSONB structure can be unnested via a <code>LATERAL</code> join. Click{' '}
            <strong>Unnest</strong> next to an array field, set the alias, choose element or
            recordset mode, and click <strong>Add LATERAL JOIN</strong>.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Inline JSON Parser</h3>
          <p>
            If no structure exists yet, paste a sample JSON document into the inline parser at the
            bottom of the JSONB panel. It infers the paths automatically. You can then add columns
            one by one directly from the parsed result.
          </p>
        </Section>

        {/* ─── Grafana ──────────────────────────────────────────── */}
        <Section id="grafana" title="Grafana Integration">
          <p>
            The <strong>Grafana</strong> tab (leftmost in the right panel) groups all features
            relevant to querying from a Grafana dashboard.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Time Axis</h3>
          <p>
            Choose the column that represents time. The builder generates the{' '}
            <code>$__timeFilter(alias.column)</code> macro. Two quick-add buttons let you:
          </p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Add the time filter to the WHERE clause in one click.</li>
            <li>Add the time column to ORDER BY in one click.</li>
          </ul>

          <h3 className="mt-5 mb-2 font-semibold text-base">TimescaleDB time_bucket</h3>
          <p>
            Select a timestamp column, pick a bucket interval (1m, 5m, 1h, 6h, 1d, 7d, 1mo, or{' '}
            <code>$__interval</code> for Grafana auto-calculation), set an alias, and click{' '}
            <strong>Apply</strong>. The generated expression is added to the SELECT list.
          </p>
          <p className="mt-2">
            Check <strong>Gapfill</strong> to use <code>time_bucket_gapfill</code>. When gapfill
            is active, the Columns tab shows a per-column strategy dropdown where you can choose{' '}
            <code>locf</code> (last-observation-carried-forward) or{' '}
            <code>interpolate</code> for each measure column.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">$__timeGroup Builder</h3>
          <p>
            An alternative bucketing macro for non-TimescaleDB data sources. Configure the column
            and interval, then click <strong>Add to GROUP BY</strong>.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Panel Type & Validation</h3>
          <p>Select the Grafana panel type you are building for:</p>
          <table className="mt-2 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50"><Th>Panel type</Th><Th>Required query structure</Th></tr>
            </thead>
            <tbody>
              <Tr><Td>Time Series</Td><Td>A timestamp column, a numeric value column, ORDER BY time.</Td></Tr>
              <Tr><Td>Stat / Bar Chart</Td><Td>At least one numeric aggregate column.</Td></Tr>
              <Tr><Td>Table</Td><Td>Any query works.</Td></Tr>
              <Tr><Td>Heatmap</Td><Td>Three columns: time, bucket/series, count.</Td></Tr>
            </tbody>
          </table>
          <p className="mt-2">
            The builder shows validation warnings and quick-fix buttons when required structure is
            missing.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Variable Mode</h3>
          <p>
            Check <strong>"This query populates a Grafana dashboard variable"</strong> when the
            query feeds a variable drop-down. Alias your value column as <code>__value</code> and
            your label column as <code>__text</code> (Grafana convention). The builder warns if
            these aliases are missing.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Macro Reference</h3>
          <p>The Grafana tab includes a collapsible reference of all 12 Grafana macros with copy buttons:</p>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-mono text-muted-foreground">
            {[
              '$__timeFilter(col)',
              '$__timeFrom()',
              '$__timeTo()',
              '$__timeGroup(col, interval)',
              '$__timeGroupAlias(col, interval)',
              '$__unixEpochFilter(col)',
              '$__unixEpochFrom()',
              '$__unixEpochTo()',
              '$__unixEpochNanoFilter(col)',
              '$__timeEpoch(col)',
              '$__schema()',
              '$__table() / $__column()',
            ].map((m) => <div key={m}>{m}</div>)}
          </div>
        </Section>

        {/* ─── Templates ────────────────────────────────────────── */}
        <Section id="templates" title="Templates">
          <p>
            Click <strong>Templates</strong> in the nav bar to open the template library. Templates
            are pre-built query starters for common patterns. Selecting a template populates the
            canvas, columns, and filters automatically.
          </p>
          <p className="mt-3">Templates are organised into three categories:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>
              <strong>Time Series</strong> — aggregated queries with a <code>time_bucket</code>,
              grouped by a categorical column, with <code>$__timeFilter</code> pre-applied.
            </li>
            <li>
              <strong>Aggregation</strong> — generic GROUP BY starters for summary statistics.
            </li>
            <li>
              <strong>Grafana Variables</strong> — thin queries designed to populate Grafana
              dashboard variable drop-downs.
            </li>
          </ul>
          <p className="mt-3">
            If a template requires tables that are not yet defined in your schema, a warning appears
            on the template card. You can still load the template — it will use raw SQL for the
            missing parts.
          </p>
        </Section>

        {/* ─── Saving ───────────────────────────────────────────── */}
        <Section id="saving" title="Saving Queries">
          <p>
            Click <strong>Save</strong> in the nav bar to persist the current query. The save dialog
            has:
          </p>
          <table className="mt-3 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50"><Th>Field</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <Tr><Td>Name</Td><Td>Required. Identifies the query in the library.</Td></Tr>
              <Tr><Td>Description</Td><Td>Optional summary shown in the query library card.</Td></Tr>
              <Tr><Td>Folder</Td><Td>Optional. Organises queries into a flat folder. Create a new folder inline without closing the dialog.</Td></Tr>
              <Tr><Td>Tags</Td><Td>Optional. Type a tag and press <Kbd>Enter</Kbd> or <Kbd>,</Kbd>. Add multiple tags. Click the <Kbd>×</Kbd> on a chip to remove a tag.</Td></Tr>
            </tbody>
          </table>

          <h3 className="mt-5 mb-2 font-semibold text-base">Overwrite Detection</h3>
          <p>
            If you type a name that matches an existing saved query, an amber banner appears showing
            when that query was last saved. Check <strong>"Update the existing query instead"</strong>{' '}
            to overwrite it rather than create a duplicate. The Save button changes to{' '}
            <strong>Update</strong> to confirm your intent.
          </p>
        </Section>

        {/* ─── Query Library ────────────────────────────────────── */}
        <Section id="library" title="Query Library">
          <p>
            Click <strong>Load</strong> in the nav bar to open the query library. All saved queries
            are shown here.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Browsing & Filtering</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Left sidebar</strong> — filter by folder. "All Queries" shows everything. "Unfoldered" shows queries with no folder assigned.</li>
            <li><strong>Search</strong> — type to filter by name or description in real time.</li>
            <li><strong>Sort</strong> — Newest first (default), Oldest first, or Name A→Z.</li>
            <li><strong>Tag filter</strong> — click any tag chip on a query card to activate it as a filter. All active tag filters must match. Click again (or click the <Kbd>×</Kbd> chip in the filter bar) to deactivate.</li>
          </ul>

          <h3 className="mt-5 mb-2 font-semibold text-base">Per-Query Actions</h3>
          <p>Hover over a query card to reveal four action buttons:</p>
          <table className="mt-2 w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50"><Th>Action</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <Tr><Td>Load</Td><Td>Loads the query into the builder canvas and closes the dialog.</Td></Tr>
              <Tr><Td>Duplicate</Td><Td>Creates a copy named "Copy of …" in the same folder.</Td></Tr>
              <Tr><Td>Export JSON</Td><Td>Downloads the query as a <code>.json</code> file including query state, SQL, tags, and folder name.</Td></Tr>
              <Tr><Td>Delete</Td><Td>Permanently deletes the query after confirmation.</Td></Tr>
            </tbody>
          </table>

          <h3 className="mt-5 mb-2 font-semibold text-base">Import JSON</h3>
          <p>
            Click <strong>Import JSON</strong> in the dialog footer to load a previously exported{' '}
            <code>.json</code> file. The query state is loaded directly into the builder canvas. The
            query is not automatically saved to the library — use <strong>Save</strong> afterwards
            if you want to keep it.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Sharing Queries</h3>
          <p>
            Export a query to <code>.json</code>, share the file with a colleague, and they can
            import it via the Import JSON button. All query structure is self-contained in the file.
          </p>
        </Section>

        {/* ─── SQL Preview ──────────────────────────────────────── */}
        <Section id="sql-preview" title="SQL Preview">
          <p>
            The <strong>SQL</strong> tab in the right panel shows the generated PostgreSQL query,
            formatted and ready to paste.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Copying SQL</h3>
          <p>
            Use the <strong>Copy</strong> button inside the SQL tab, or the <strong>Copy SQL</strong>{' '}
            button in the nav bar. Both copy the current SQL to the clipboard.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Manual Editing</h3>
          <p>
            The SQL pane is an editable textarea. Click into it and make any changes you need.
            When you have manually edited the SQL:
          </p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>An <strong>Edited</strong> badge appears at the top.</li>
            <li>The manual version is what gets saved and copied.</li>
            <li>The visual query builder continues to track state, but the display shows your edits.</li>
            <li>Click <strong>Revert</strong> to discard manual edits and return to the auto-generated SQL.</li>
          </ul>
          <p className="mt-2">
            <strong>Note:</strong> manual edits are lost if you click <strong>Reset</strong> in the
            nav bar.
          </p>

          <h3 className="mt-5 mb-2 font-semibold text-base">Grafana Warning</h3>
          <p>
            When the SQL has been manually edited, the <strong>Grafana</strong> tab shows a warning
            banner to remind you that the visual builder and the SQL may be out of sync. Use{' '}
            <strong>Revert</strong> to restore sync.
          </p>
        </Section>

        {/* ─── footer ───────────────────────────────────────────── */}
        <div className="mt-16 border-t pt-6 text-sm text-muted-foreground">
          <div className="flex gap-4">
            <a href="/builder" className="hover:text-foreground transition-colors">← Query Builder</a>
            <a href="/admin/schema" className="hover:text-foreground transition-colors">Schema Admin →</a>
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-14 scroll-mt-8">
      <h2 className="text-xl font-bold mb-4 pb-2 border-b">{title}</h2>
      <div className="text-sm leading-relaxed space-y-0">{children}</div>
    </section>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[11px] font-mono leading-none">
      {children}
    </kbd>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border px-3 py-1.5 text-left font-medium bg-muted/50">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border px-3 py-1.5 text-muted-foreground">{children}</td>
}

function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="even:bg-muted/20">{children}</tr>
}
