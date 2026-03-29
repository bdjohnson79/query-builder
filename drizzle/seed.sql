-- Seed data exported from PostgreSQL 2026-03-28
-- Applied automatically on first run if the database is empty.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: app_schemas
--

INSERT INTO public.app_schemas VALUES (3, 'KHC x ST-One');


--
-- Data for Name: app_tables
--

INSERT INTO public.app_tables VALUES (7, 3, 'event', 'Event', NULL);
INSERT INTO public.app_tables VALUES (8, 3, 'tag', 'Tag', NULL);
INSERT INTO public.app_tables VALUES (9, 3, 'location', 'Location', NULL);
INSERT INTO public.app_tables VALUES (10, 3, 'location_tree', 'Location Tree', NULL);
INSERT INTO public.app_tables VALUES (11, 3, 'agg', 'Aggregation', NULL);
INSERT INTO public.app_tables VALUES (12, 3, 'agg_event', 'Aggregation Data', NULL);
INSERT INTO public.app_tables VALUES (13, 3, 'form', 'Form', NULL);
INSERT INTO public.app_tables VALUES (15, 3, 'form_event', 'Form Event', NULL);
INSERT INTO public.app_tables VALUES (14, 3, 'form_data', 'Form Data', NULL);


--
-- Data for Name: app_columns
--

INSERT INTO public.app_columns VALUES (28, 7, 'time', 'timestamp', false, NULL, false, 1, NULL);
INSERT INTO public.app_columns VALUES (29, 7, 'tag', 'text', false, NULL, false, 2, NULL);
INSERT INTO public.app_columns VALUES (30, 7, 'value', 'float4', true, NULL, false, 3, NULL);
INSERT INTO public.app_columns VALUES (31, 7, 'info', 'jsonb', true, NULL, false, 4, NULL);
INSERT INTO public.app_columns VALUES (32, 8, 'id', 'int4', false, NULL, true, 1, NULL);
INSERT INTO public.app_columns VALUES (33, 8, 'name', 'varchar', false, NULL, false, 2, NULL);
INSERT INTO public.app_columns VALUES (34, 8, 'description', 'text', true, NULL, false, 3, NULL);
INSERT INTO public.app_columns VALUES (35, 8, 'location', 'int4', true, NULL, false, 5, NULL);
INSERT INTO public.app_columns VALUES (36, 8, 'factor', 'float8', false, '1', false, 6, NULL);
INSERT INTO public.app_columns VALUES (37, 8, 'offset', 'float8', false, '0', false, 7, NULL);
INSERT INTO public.app_columns VALUES (38, 8, 'info', 'jsonb', true, NULL, false, 8, NULL);
INSERT INTO public.app_columns VALUES (39, 8, 'created_at', 'timestamptz', false, NULL, false, 9, NULL);
INSERT INTO public.app_columns VALUES (40, 8, 'updated_at', 'timestamptz', true, NULL, false, 10, NULL);
INSERT INTO public.app_columns VALUES (41, 8, 'labels', 'ltree[]', true, NULL, false, 11, NULL);
INSERT INTO public.app_columns VALUES (42, 8, 'type', 'text', true, NULL, false, 12, NULL);
INSERT INTO public.app_columns VALUES (43, 9, 'id', 'int4', false, NULL, true, 1, NULL);
INSERT INTO public.app_columns VALUES (44, 9, 'name', 'varchar', false, NULL, false, 2, NULL);
INSERT INTO public.app_columns VALUES (45, 9, 'description', 'text', true, NULL, false, 3, NULL);
INSERT INTO public.app_columns VALUES (46, 9, 'parent', 'int4', true, NULL, false, 4, NULL);
INSERT INTO public.app_columns VALUES (47, 9, 'is_machine', 'bool', true, 'false', false, 5, NULL);
INSERT INTO public.app_columns VALUES (48, 9, 'info', 'jsonb', true, NULL, false, 6, NULL);
INSERT INTO public.app_columns VALUES (49, 9, 'created_at', 'timestamptz', false, NULL, false, 7, NULL);
INSERT INTO public.app_columns VALUES (50, 9, 'updated_at', 'timestamptz', true, NULL, false, 8, NULL);
INSERT INTO public.app_columns VALUES (51, 9, 'active', 'bool', false, 'false', false, 9, NULL);
INSERT INTO public.app_columns VALUES (52, 9, 'slug', 'varchar', false, NULL, false, 10, NULL);
INSERT INTO public.app_columns VALUES (53, 9, 'asset_types', 'ltree[]', true, NULL, false, 11, NULL);
INSERT INTO public.app_columns VALUES (54, 10, 'id', 'int4', false, NULL, true, 1, NULL);
INSERT INTO public.app_columns VALUES (55, 10, 'name', 'varchar', false, NULL, false, 2, NULL);
INSERT INTO public.app_columns VALUES (56, 10, 'slug', 'varchar', false, NULL, false, 3, NULL);
INSERT INTO public.app_columns VALUES (57, 10, 'path', 'text', true, NULL, false, 4, NULL);
INSERT INTO public.app_columns VALUES (58, 10, 'parent', 'int4', true, NULL, false, 5, NULL);
INSERT INTO public.app_columns VALUES (59, 10, 'is_machine', 'bool', true, NULL, false, 6, NULL);
INSERT INTO public.app_columns VALUES (60, 10, 'active', 'bool', true, NULL, false, 7, NULL);
INSERT INTO public.app_columns VALUES (61, 11, 'cid', 'varchar', false, NULL, false, 1, NULL);
INSERT INTO public.app_columns VALUES (62, 11, 'id', 'uuid', false, NULL, true, 2, NULL);
INSERT INTO public.app_columns VALUES (63, 11, 'slug_agg', 'text', true, NULL, false, 3, NULL);
INSERT INTO public.app_columns VALUES (64, 11, 'var', 'jsonb', true, NULL, false, 4, NULL);
INSERT INTO public.app_columns VALUES (65, 11, 'active', 'bool', false, 'true', false, 5, NULL);
INSERT INTO public.app_columns VALUES (66, 11, 'labels', 'ltree[]', true, NULL, false, 6, NULL);
INSERT INTO public.app_columns VALUES (67, 11, 'location_slug', 'varchar', false, NULL, false, 7, NULL);
INSERT INTO public.app_columns VALUES (68, 11, 'level', 'int4', false, '1', false, 8, NULL);
INSERT INTO public.app_columns VALUES (69, 11, 'time_ptr', 'timestamp', true, NULL, false, 9, NULL);
INSERT INTO public.app_columns VALUES (70, 11, 'depends_on', 'jsonb', true, NULL, false, 10, NULL);
INSERT INTO public.app_columns VALUES (71, 11, 'created_at', 'timestamp', false, NULL, false, 11, NULL);
INSERT INTO public.app_columns VALUES (72, 11, 'updated_at', 'timestamp', true, NULL, false, 12, NULL);
INSERT INTO public.app_columns VALUES (73, 11, 'info', 'jsonb', true, NULL, false, 13, NULL);
INSERT INTO public.app_columns VALUES (74, 11, 'error', 'text', true, NULL, false, 14, NULL);
INSERT INTO public.app_columns VALUES (75, 11, 'next_run', 'timestamp', true, NULL, false, 15, NULL);
INSERT INTO public.app_columns VALUES (76, 11, 'last_successful_run', 'timestamp', true, NULL, false, 16, NULL);
INSERT INTO public.app_columns VALUES (77, 12, 'time', 'timestamp', false, NULL, false, 1, NULL);
INSERT INTO public.app_columns VALUES (78, 12, 'tsrange', 'tsrange', true, NULL, false, 2, NULL);
INSERT INTO public.app_columns VALUES (79, 12, 'agg', 'uuid', false, NULL, false, 3, NULL);
INSERT INTO public.app_columns VALUES (80, 12, 'value', 'float4', true, NULL, false, 4, NULL);
INSERT INTO public.app_columns VALUES (81, 12, 'info', 'jsonb', true, NULL, false, 5, NULL);
INSERT INTO public.app_columns VALUES (82, 12, 'created_at', 'timestamp', false, NULL, false, 6, NULL);
INSERT INTO public.app_columns VALUES (83, 12, 'updated_at', 'timestamp', true, NULL, false, 7, NULL);
INSERT INTO public.app_columns VALUES (84, 13, 'cid', 'varchar', false, NULL, false, 1, NULL);
INSERT INTO public.app_columns VALUES (85, 13, 'id', 'int4', false, NULL, true, 2, NULL);
INSERT INTO public.app_columns VALUES (86, 13, 'name', 'varchar', false, NULL, false, 3, NULL);
INSERT INTO public.app_columns VALUES (87, 13, 'slug', 'varchar', false, NULL, false, 4, NULL);
INSERT INTO public.app_columns VALUES (88, 13, 'active', 'bool', true, 'true', false, 5, NULL);
INSERT INTO public.app_columns VALUES (89, 13, 'form_json', 'jsonb', true, NULL, false, 6, NULL);
INSERT INTO public.app_columns VALUES (90, 13, 'description', 'varchar', true, NULL, false, 7, NULL);
INSERT INTO public.app_columns VALUES (91, 13, 'manual_disable', 'bool', true, 'false', false, 8, NULL);
INSERT INTO public.app_columns VALUES (92, 13, 'location_slug', 'varchar', false, NULL, false, 9, NULL);
INSERT INTO public.app_columns VALUES (93, 13, 'display_property', 'varchar', true, NULL, false, 10, NULL);
INSERT INTO public.app_columns VALUES (94, 13, 'created_at', 'timestamptz', false, NULL, false, 11, NULL);
INSERT INTO public.app_columns VALUES (95, 13, 'updated_at', 'timestamptz', true, NULL, false, 12, NULL);
INSERT INTO public.app_columns VALUES (96, 13, 'builder_slug', 'varchar', true, NULL, false, 13, NULL);
INSERT INTO public.app_columns VALUES (97, 13, 'type', 'text', false, 'event', false, 14, NULL);
INSERT INTO public.app_columns VALUES (98, 13, 'form_i18n', 'jsonb', true, NULL, false, 15, NULL);
INSERT INTO public.app_columns VALUES (106, 15, 'time', 'timestamp', false, NULL, false, 1, NULL);
INSERT INTO public.app_columns VALUES (107, 15, 'form_slug', 'varchar', false, NULL, false, 2, NULL);
INSERT INTO public.app_columns VALUES (108, 15, 'active', 'bool', true, 'true', false, 3, NULL);
INSERT INTO public.app_columns VALUES (109, 15, 'value', 'jsonb', true, NULL, false, 4, NULL);
INSERT INTO public.app_columns VALUES (110, 15, 'trigger_uid', 'uuid', true, NULL, false, 5, NULL);
INSERT INTO public.app_columns VALUES (111, 15, 'created_at', 'timestamptz', false, NULL, false, 6, NULL);
INSERT INTO public.app_columns VALUES (112, 15, 'updated_at', 'timestamptz', true, NULL, false, 7, NULL);
INSERT INTO public.app_columns VALUES (113, 15, 'display_value', 'text', true, NULL, false, 8, NULL);
INSERT INTO public.app_columns VALUES (114, 15, 'automatic', 'bool', false, 'false', false, 9, NULL);
INSERT INTO public.app_columns VALUES (116, 14, 'form_slug', 'text', false, NULL, false, 1, NULL);
INSERT INTO public.app_columns VALUES (117, 14, 'active', 'bool', false, 'true', false, 2, NULL);
INSERT INTO public.app_columns VALUES (118, 14, 'automatic', 'bool', false, 'false', false, 3, NULL);
INSERT INTO public.app_columns VALUES (119, 14, 'value', 'jsonb', true, NULL, false, 4, NULL);
INSERT INTO public.app_columns VALUES (120, 14, 'created_at', 'timestamp', false, NULL, false, 5, NULL);
INSERT INTO public.app_columns VALUES (121, 14, 'updated_at', 'timestamp', true, NULL, false, 6, NULL);
INSERT INTO public.app_columns VALUES (122, 14, 'time', 'timestamp', true, NULL, false, 7, NULL);


--
-- Data for Name: app_foreign_keys
--

INSERT INTO public.app_foreign_keys VALUES (5, 29, 33, 'event_tag__tag_name');
INSERT INTO public.app_foreign_keys VALUES (6, 35, 43, 'tag_location__location_id');
INSERT INTO public.app_foreign_keys VALUES (7, 79, 62, 'agg_event_agg__agg_id');
INSERT INTO public.app_foreign_keys VALUES (8, 67, 52, 'agg_location_slug__location_slug');
INSERT INTO public.app_foreign_keys VALUES (9, 56, 52, 'location_tree_slug__location_slug');
INSERT INTO public.app_foreign_keys VALUES (11, 107, 87, 'form_event_form_slug__form_slug');
INSERT INTO public.app_foreign_keys VALUES (12, 46, 43, 'location_parent__location_id');
INSERT INTO public.app_foreign_keys VALUES (13, 92, 52, 'form_location_slug__location_slug');


--
-- Data for Name: saved_queries
--

INSERT INTO public.saved_queries VALUES (1, 'Test Query', 'A test', '{"ctes": [], "joins": [], "limit": null, "where": {"id": "1", "rules": [], "combinator": "AND"}, "having": {"id": "2", "rules": [], "combinator": "AND"}, "offset": null, "tables": [], "groupBy": [], "orderBy": [], "distinct": false, "isSubquery": false, "selectedColumns": [], "windowFunctions": []}', 'SELECT *', NULL, '2026-03-09 19:43:18.815564', '2026-03-09 19:43:18.815564', NULL, NULL);


--
-- Sequence values
--

SELECT pg_catalog.setval('public.app_columns_id_seq', 122, true);
SELECT pg_catalog.setval('public.app_foreign_keys_id_seq', 13, true);
SELECT pg_catalog.setval('public.app_schemas_id_seq', 3, true);
SELECT pg_catalog.setval('public.app_tables_id_seq', 15, true);
SELECT pg_catalog.setval('public.json_structures_id_seq', 1, false);
SELECT pg_catalog.setval('public.saved_queries_id_seq', 1, true);
SELECT pg_catalog.setval('public.saved_query_folders_id_seq', 1, false);
