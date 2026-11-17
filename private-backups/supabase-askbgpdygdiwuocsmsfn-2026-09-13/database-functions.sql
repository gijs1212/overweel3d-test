CREATE OR REPLACE FUNCTION auth.email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$function$


CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$


CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$


CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$


CREATE OR REPLACE FUNCTION cron.alter_job(job_id bigint, schedule text DEFAULT NULL::text, command text DEFAULT NULL::text, database text DEFAULT NULL::text, username text DEFAULT NULL::text, active boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE c
AS '$libdir/pg_cron', $function$cron_alter_job$function$


CREATE OR REPLACE FUNCTION cron.job_cache_invalidate()
 RETURNS trigger
 LANGUAGE c
AS '$libdir/pg_cron', $function$cron_job_cache_invalidate$function$


CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
 RETURNS bigint
 LANGUAGE c
AS '$libdir/pg_cron', $function$cron_schedule_named$function$


CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text)
 RETURNS bigint
 LANGUAGE c
 STRICT
AS '$libdir/pg_cron', $function$cron_schedule$function$


CREATE OR REPLACE FUNCTION cron.schedule_in_database(job_name text, schedule text, command text, database text, username text DEFAULT NULL::text, active boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE c
AS '$libdir/pg_cron', $function$cron_schedule_named$function$


CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
 RETURNS boolean
 LANGUAGE c
 STRICT
AS '$libdir/pg_cron', $function$cron_unschedule$function$


CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
 RETURNS boolean
 LANGUAGE c
 STRICT
AS '$libdir/pg_cron', $function$cron_unschedule_named$function$


CREATE OR REPLACE FUNCTION extensions.armor(bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$


CREATE OR REPLACE FUNCTION extensions.armor(bytea, text[], text[])
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$


CREATE OR REPLACE FUNCTION extensions.crypt(text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_crypt$function$


CREATE OR REPLACE FUNCTION extensions.dearmor(text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_dearmor$function$


CREATE OR REPLACE FUNCTION extensions.decrypt(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_decrypt$function$


CREATE OR REPLACE FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_decrypt_iv$function$


CREATE OR REPLACE FUNCTION extensions.digest(bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$


CREATE OR REPLACE FUNCTION extensions.digest(text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$


CREATE OR REPLACE FUNCTION extensions.encrypt(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_encrypt$function$


CREATE OR REPLACE FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_encrypt_iv$function$


CREATE OR REPLACE FUNCTION extensions.gen_random_bytes(integer)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_random_bytes$function$


CREATE OR REPLACE FUNCTION extensions.gen_random_uuid()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/pgcrypto', $function$pg_random_uuid$function$


CREATE OR REPLACE FUNCTION extensions.gen_salt(text)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt$function$


CREATE OR REPLACE FUNCTION extensions.gen_salt(text, integer)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt_rounds$function$


CREATE OR REPLACE FUNCTION extensions.grant_pg_cron_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
    revoke trigger on cron.job_run_details from postgres;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION extensions.grant_pg_graphql_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    if not exists (
        select 1
        from pg_catalog.pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$function$


CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8.0', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION extensions.hmac(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$


CREATE OR REPLACE FUNCTION extensions.hmac(text, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$


CREATE OR REPLACE FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone)
 RETURNS SETOF record
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pg_stat_statements', $function$pg_stat_statements_1_11$function$


CREATE OR REPLACE FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone)
 RETURNS record
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pg_stat_statements', $function$pg_stat_statements_info$function$


CREATE OR REPLACE FUNCTION extensions.pg_stat_statements_reset(userid oid DEFAULT 0, dbid oid DEFAULT 0, queryid bigint DEFAULT 0, minmax_only boolean DEFAULT false)
 RETURNS timestamp with time zone
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pg_stat_statements', $function$pg_stat_statements_reset_1_11$function$


CREATE OR REPLACE FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text)
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_armor_headers$function$


CREATE OR REPLACE FUNCTION extensions.pgp_key_id(bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_key_id_w$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt(bytea, bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_encrypt(text, bytea)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_encrypt(text, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgp_sym_decrypt(bytea, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_sym_decrypt(bytea, text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgp_sym_encrypt(text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_sym_encrypt(text, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$


CREATE OR REPLACE FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$


CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$


CREATE OR REPLACE FUNCTION extensions.pgrst_drop_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$


CREATE OR REPLACE FUNCTION extensions.set_graphql_placeholder()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
            set search_path to ''
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$function$


CREATE OR REPLACE FUNCTION extensions.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$


CREATE OR REPLACE FUNCTION extensions.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$


CREATE OR REPLACE FUNCTION extensions.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$


CREATE OR REPLACE FUNCTION extensions.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$


CREATE OR REPLACE FUNCTION extensions.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$


CREATE OR REPLACE FUNCTION extensions.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$


CREATE OR REPLACE FUNCTION extensions.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$


CREATE OR REPLACE FUNCTION extensions.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$


CREATE OR REPLACE FUNCTION extensions.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$


CREATE OR REPLACE FUNCTION extensions.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$


CREATE OR REPLACE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $function$


CREATE OR REPLACE FUNCTION net._await_response(request_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
    rec net._http_response;
begin
    while rec is null loop
        select *
        into rec
        from net._http_response
        where id = request_id;

        if rec is null then
            -- Wait 50 ms before checking again
            perform pg_sleep(0.05);
        end if;
    end loop;

    return true;
end;
$function$


CREATE OR REPLACE FUNCTION net._encode_url_with_params_array(url text, params_array text[])
 RETURNS text
 LANGUAGE c
 IMMUTABLE
AS 'pg_net', $function$_encode_url_with_params_array$function$


CREATE OR REPLACE FUNCTION net._http_collect_response(request_id bigint, async boolean DEFAULT true)
 RETURNS net.http_response_result
 LANGUAGE plpgsql
AS $function$
declare
    rec net._http_response;
    req_exists boolean;
begin

    if not async then
        perform net._await_response(request_id);
    end if;

    select *
    into rec
    from net._http_response
    where id = request_id;

    if rec is null or rec.error_msg is not null then
        -- The request is either still processing or the request_id provided does not exist

        -- TODO: request in progress is indistinguishable from request that doesn't exist

        -- No request matching request_id found
        return (
            'ERROR',
            coalesce(rec.error_msg, 'request matching request_id not found'),
            null
        )::net.http_response_result;

    end if;

    -- Return a valid, populated http_response_result
    return (
        'SUCCESS',
        'ok',
        (
            rec.status_code,
            rec.headers,
            rec.content
        )::net.http_response
    )::net.http_response_result;
end;
$function$


CREATE OR REPLACE FUNCTION net._urlencode_string(string character varying)
 RETURNS text
 LANGUAGE c
 IMMUTABLE
AS 'pg_net', $function$_urlencode_string$function$


CREATE OR REPLACE FUNCTION net.check_worker_is_up()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (select pid from pg_stat_activity where backend_type ilike '%pg_net%') then
    raise exception using
      message = 'the pg_net background worker is not up'
    , detail  = 'the pg_net background worker is down due to an internal error and cannot process requests'
    , hint    = 'make sure that you didn''t modify any of pg_net internal tables';
  end if;
end
$function$


CREATE OR REPLACE FUNCTION net.http_collect_response(request_id bigint, async boolean DEFAULT true)
 RETURNS net.http_response_result
 LANGUAGE plpgsql
AS $function$
begin
  raise notice 'The net.http_collect_response function is deprecated.';
  select net._http_collect_response(request_id, async);
end;
$function$


CREATE OR REPLACE FUNCTION net.http_delete(url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000, body jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
declare
    request_id bigint;
    params_array text[];
begin
    select coalesce(array_agg(net._urlencode_string(key) || '=' || net._urlencode_string(value)), '{}')
    into params_array
    from jsonb_each_text(params);

    -- Add to the request queue
    insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
    values (
        'DELETE',
        net._encode_url_with_params_array(url, params_array),
        headers,
        convert_to(body::text, 'UTF8'),
        timeout_milliseconds
    )
    returning id
    into request_id;

    perform net.wake();

    return request_id;
end
$function$


CREATE OR REPLACE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
declare
    request_id bigint;
    params_array text[];
begin
    select coalesce(array_agg(net._urlencode_string(key) || '=' || net._urlencode_string(value)), '{}')
    into params_array
    from jsonb_each_text(params);

    -- Add to the request queue
    insert into net.http_request_queue(method, url, headers, timeout_milliseconds)
    values (
        'GET',
        net._encode_url_with_params_array(url, params_array),
        headers,
        timeout_milliseconds
    )
    returning id
    into request_id;

    perform net.wake();

    return request_id;
end
$function$


CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
declare
    request_id bigint;
    params_array text[];
    content_type text;
begin

    -- Exctract the content_type from headers
    select
        header_value into content_type
    from
        jsonb_each_text(coalesce(headers, '{}'::jsonb)) r(header_name, header_value)
    where
        lower(header_name) = 'content-type'
    limit
        1;

    -- If the user provided new headers and omitted the content type
    -- add it back in automatically
    if content_type is null then
        select headers || '{"Content-Type": "application/json"}'::jsonb into headers;
    end if;

    -- Confirm that the content-type is set as "application/json"
    if content_type <> 'application/json' then
        raise exception 'Content-Type header must be "application/json"';
    end if;

    select
        coalesce(array_agg(net._urlencode_string(key) || '=' || net._urlencode_string(value)), '{}')
    into
        params_array
    from
        jsonb_each_text(params);

    -- Add to the request queue
    insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
    values (
        'POST',
        net._encode_url_with_params_array(url, params_array),
        headers,
        convert_to(body::text, 'UTF8'),
        timeout_milliseconds
    )
    returning id
    into request_id;

    perform net.wake();

    return request_id;
end
$function$


CREATE OR REPLACE FUNCTION net.wait_until_running()
 RETURNS void
 LANGUAGE c
AS 'pg_net', $function$wait_until_running$function$


CREATE OR REPLACE FUNCTION net.wake()
 RETURNS void
 LANGUAGE c
AS 'pg_net', $function$wake$function$


CREATE OR REPLACE FUNCTION net.worker_restart()
 RETURNS boolean
 LANGUAGE c
AS 'pg_net', $function$worker_restart$function$


CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename text)
 RETURNS TABLE(username text, password text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $function$


CREATE OR REPLACE FUNCTION public.approve_and_count_print_job_run(p_suggestion_job_id uuid, p_plate_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_suggestion public.print_jobs%rowtype;
  v_job public.print_jobs%rowtype;
  v_order public.orders%rowtype;
  v_runs jsonb;
  v_statuses jsonb;
  v_total_plates integer;
  v_run_number integer;
  v_remaining integer;
  v_completed boolean;
  v_completed_plates integer;
  v_observed_file text;
begin
  if (select auth.uid()) is null or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan een printrun goedkeuren' using errcode = '42501';
  end if;
  if p_plate_number is null or p_plate_number < 1 then
    raise exception 'Ongeldig plaatnummer' using errcode = '22023';
  end if;

  select * into v_suggestion from public.print_jobs where id = p_suggestion_job_id for update;
  if not found then return jsonb_build_object('counted', false, 'reason', 'suggestion_not_found'); end if;
  if v_suggestion.status <> 'suggested' then return jsonb_build_object('counted', false, 'reason', 'suggestion_not_active'); end if;
  if v_suggestion.printer_id is null then return jsonb_build_object('counted', false, 'reason', 'printer_missing'); end if;

  select * into v_order from public.orders where id = v_suggestion.order_id for update;
  if not found or v_order.status in ('completed', 'cancelled') then
    return jsonb_build_object('counted', false, 'reason', 'order_closed');
  end if;
  if p_plate_number > greatest(coalesce(v_order.total_plates, 0), 1) then
    return jsonb_build_object('counted', false, 'reason', 'plate_out_of_range');
  end if;

  select * into v_job from public.print_jobs
  where order_id = v_suggestion.order_id and plate_number = p_plate_number
  for update;
  if not found then return jsonb_build_object('counted', false, 'reason', 'plate_job_not_found'); end if;
  if v_job.status in ('completed', 'cancelled') or v_job.runs_completed >= v_job.runs_required then
    return jsonb_build_object('counted', false, 'reason', 'already_fully_printed');
  end if;

  v_total_plates := greatest(coalesce(v_order.total_plates, 0), v_job.plate_number);
  v_runs := case when jsonb_typeof(v_order.plate_runs_completed) = 'array' then v_order.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(v_order.plate_print_statuses) = 'array' then v_order.plate_print_statuses else '[]'::jsonb end;
  while jsonb_array_length(v_runs) < v_total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;

  v_run_number := greatest(coalesce(v_job.runs_completed, 0), coalesce((v_runs ->> (v_job.plate_number - 1))::integer, 0)) + 1;
  v_run_number := least(v_run_number, v_job.runs_required);
  v_remaining := greatest(v_job.runs_required - v_run_number, 0);
  v_completed := v_remaining = 0;
  v_observed_file := coalesce(nullif(v_suggestion.observed_file_name, ''), nullif(v_job.observed_file_name, ''), v_job.expected_file_name);

  insert into public.print_runs (print_job_id, printer_id, run_number, observed_file_name, status, completed_at, filament_used_grams, raw_status)
  values (v_job.id, v_suggestion.printer_id, v_run_number, v_observed_file, 'completed', now(), v_job.estimated_filament_grams,
    jsonb_build_object('source', 'admin_approval', 'suggestionJobId', v_suggestion.id, 'approvedBy', (select auth.uid())))
  on conflict (print_job_id, run_number) do update set
    printer_id = excluded.printer_id,
    observed_file_name = excluded.observed_file_name,
    status = 'completed',
    completed_at = excluded.completed_at,
    filament_used_grams = excluded.filament_used_grams,
    raw_status = excluded.raw_status;

  if v_suggestion.id <> v_job.id then
    update public.print_jobs set status = 'queued', printer_id = null, suggested_at = null,
      observed_file_name = null, approved_at = null, approved_by = null
    where id = v_suggestion.id;
  end if;

  update public.print_jobs set
    runs_completed = v_run_number,
    status = case when v_completed then 'completed' else 'awaiting_next_run' end,
    printer_id = v_suggestion.printer_id,
    completed_at = case when v_completed then now() else null end,
    approved_at = now(),
    approved_by = (select auth.uid()),
    observed_file_name = v_observed_file,
    comparison = coalesce(v_job.comparison, '{}'::jsonb) || jsonb_build_object(
      'match', true,
      'countedByAdminAt', now(),
      'countedSuggestionJobId', v_suggestion.id,
      'remainingRuns', v_remaining
    )
  where id = v_job.id;

  v_runs := jsonb_set(v_runs, array[(v_job.plate_number - 1)::text], to_jsonb(v_run_number));
  v_statuses := jsonb_set(v_statuses, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed));
  select count(*)::integer into v_completed_plates
  from jsonb_array_elements(v_statuses) as item(value)
  where item.value = 'true'::jsonb;

  update public.orders set
    plate_runs_completed = v_runs,
    plate_print_statuses = v_statuses,
    plates_completed = v_completed_plates,
    filament_used_g = coalesce(filament_used_g, 0) + coalesce(v_job.estimated_filament_grams, 0),
    print_duration_minutes = coalesce(print_duration_minutes, 0) + coalesce(v_job.estimated_duration_minutes, 0)
  where id = v_job.order_id;

  insert into public.order_events (order_id, event_type, event_description, performed_by, visible_to_customer)
  values (
    v_job.order_id,
    'print_run_completed',
    case when v_completed
      then format('Plaat %s is volledig geprint (%s van %s printruns).', v_job.plate_number, v_run_number, v_job.runs_required)
      else format('Plaat %s: printrun %s van %s voltooid; nog %s te printen.', v_job.plate_number, v_run_number, v_job.runs_required, v_remaining)
    end,
    (select auth.uid()),
    true
  );

  return jsonb_build_object(
    'counted', true,
    'runNumber', v_run_number,
    'runsRequired', v_job.runs_required,
    'remainingRuns', v_remaining,
    'completed', v_completed,
    'plateNumber', v_job.plate_number
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.award_order_loyalty_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare awarded integer; points_per_euro numeric := 1;
begin
 if new.status='completed' and old.status is distinct from 'completed' and new.user_id is not null then
  select case when jsonb_typeof(s.value)='number' then (s.value#>>'{}')::numeric else 1 end into points_per_euro
  from public.app_settings s where s.key='loyalty_points_per_euro';
  points_per_euro := greatest(0,coalesce(points_per_euro,1));
  awarded := greatest(0,floor(coalesce(new.final_price,0)*points_per_euro))::integer;
  if awarded>0 then
   insert into public.loyalty_transactions(user_id,order_id,points,kind,description)
   values(new.user_id,new.id,awarded,'earned','Punten voor bestelling '||new.order_number)
   on conflict (order_id,kind) where order_id is not null do nothing;
   if found then
    update public.profiles set loyalty_points=loyalty_points+awarded where user_id=new.user_id;
    new.loyalty_points_awarded:=awarded;
   end if;
  end if;
 end if;
 return new;
end; $function$


CREATE OR REPLACE FUNCTION public.check_discount_code(code_text text, email_text text, order_amount numeric)
 RETURNS TABLE(id uuid, code text, discount_type text, discount_value numeric, max_uses integer, times_used integer, expires_at timestamp with time zone, starts_at timestamp with time zone, assigned_to_email text, is_referral boolean, product_id uuid, category_id uuid, minimum_order_amount numeric, stackable boolean, per_customer_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return; end if;
  return query
  select d.id, d.code, d.discount_type, d.discount_value, d.max_uses, d.times_used,
    d.expires_at, d.starts_at, d.assigned_to_email, d.is_referral,
    d.product_id, d.category_id, d.minimum_order_amount, d.stackable, d.per_customer_limit
  from public.discount_codes d
  where upper(d.code) = upper(trim(code_text))
    and d.active
    and (d.starts_at is null or d.starts_at <= now())
    and (d.expires_at is null or d.expires_at > now())
    and (d.max_uses is null or d.times_used < d.max_uses)
    and (d.assigned_to_email is null or lower(d.assigned_to_email) = lower(trim(email_text)))
    and coalesce(order_amount, 0) >= d.minimum_order_amount
    and (d.per_customer_limit is null or (
      select count(*) from public.discount_redemptions r
      where r.discount_code_id = d.id and lower(r.customer_email) = lower(trim(email_text))
    ) < d.per_customer_limit)
  limit 1;
end;
$function$


CREATE OR REPLACE FUNCTION public.check_gift_card(code_text text, email_text text)
 RETURNS TABLE(code text, current_balance numeric, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return; end if;
  return query select g.code, g.current_balance, g.expires_at from public.gift_cards g
  where upper(g.code) = upper(trim(code_text)) and g.active and g.current_balance > 0
    and (g.expires_at is null or g.expires_at > now())
    and (g.assigned_to_email is null or lower(g.assigned_to_email) = lower(trim(email_text))) limit 1;
end;
$function$


CREATE OR REPLACE FUNCTION public.claim_account_welcome(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE claimed_id uuid;
BEGIN
  UPDATE public.profiles
  SET account_welcome_email_claimed_at = clock_timestamp()
  WHERE user_id = p_user_id
    AND account_welcome_email_sent_at IS NULL
    AND (
      account_welcome_email_claimed_at IS NULL
      OR account_welcome_email_claimed_at < clock_timestamp() - interval '15 minutes'
    )
  RETURNING id INTO claimed_id;
  RETURN claimed_id IS NOT NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.claim_newsletter_welcome(p_subscription_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE claimed_id uuid;
BEGIN
  UPDATE public.newsletter_subscriptions
  SET welcome_email_claimed_at = clock_timestamp()
  WHERE id = p_subscription_id
    AND active
    AND welcome_email_sent_at IS NULL
    AND (
      welcome_email_claimed_at IS NULL
      OR welcome_email_claimed_at < clock_timestamp() - interval '15 minutes'
    )
  RETURNING id INTO claimed_id;
  RETURN claimed_id IS NOT NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.claim_next_printer_queue_item(p_printer_id uuid)
 RETURNS printer_queue_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare claimed public.printer_queue_items; resolved_mapping integer[];
begin
  if auth.role() <> 'service_role' then raise exception 'Niet toegestaan'; end if;

  update public.printer_queue_items item
  set status = case when public.printer_queue_colors_available(item) then 'queued' else 'blocked' end,
      blocked_reason = case when public.printer_queue_colors_available(item) then null else 'Vereist filament zit niet correct in de AMS.' end
  where item.printer_id = p_printer_id and item.status in ('queued','blocked');

  select * into claimed
  from public.printer_queue_items
  where printer_id = p_printer_id and status = 'queued'
  order by position, created_at
  for update skip locked
  limit 1;

  if claimed.id is null then return null; end if;
  select coalesce(array_agg(chosen.tray_index order by requirement.ordinality), '{}'::integer[])
  into resolved_mapping
  from jsonb_array_elements(coalesce(claimed.required_colors, '[]'::jsonb)) with ordinality requirement(value, ordinality)
  cross join lateral (
    select slot.ams_unit * 4 + slot.slot_number - 1 as tray_index
    from public.printer_ams_slots slot
    where slot.printer_id = claimed.printer_id
      and (nullif(requirement.value->>'ams_unit', '') is null or slot.ams_unit = (requirement.value->>'ams_unit')::integer)
      and (nullif(requirement.value->>'slot_number', '') is null or slot.slot_number = (requirement.value->>'slot_number')::integer)
      and (nullif(requirement.value->>'color_hex', '') is null or lower(left(coalesce(slot.color_hex, ''), 7)) = lower(left(requirement.value->>'color_hex', 7)))
      and (nullif(requirement.value->>'material', '') is null or lower(coalesce(slot.material, '')) = lower(requirement.value->>'material'))
    order by slot.ams_unit, slot.slot_number
    limit 1
  ) chosen;
  update public.printer_queue_items
  set status = 'starting', command_claimed_at = now(), bridge_error = null, ams_mapping = resolved_mapping
  where id = claimed.id
  returning * into claimed;
  return claimed;
end;
$function$


CREATE OR REPLACE FUNCTION public.claim_order_confirmation(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE claimed_id uuid;
BEGIN
  UPDATE public.orders
  SET confirmation_email_claimed_at = clock_timestamp()
  WHERE id = p_order_id
    AND confirmation_email_sent_at IS NULL
    AND (confirmation_email_claimed_at IS NULL OR confirmation_email_claimed_at < clock_timestamp() - interval '15 minutes')
  RETURNING id INTO claimed_id;
  RETURN claimed_id IS NOT NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.claim_order_to_account(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requester_id uuid := auth.uid();
  current_owner uuid;
  target_order_id uuid;
begin
  if requester_id is null then
    raise exception 'U moet ingelogd zijn' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'Ongeldige bestellink' using errcode = '22023';
  end if;

  select id, user_id
  into target_order_id, current_owner
  from public.orders
  where customer_order_token = p_token
  for update;

  if not found then return false; end if;
  if current_owner = requester_id then return true; end if;

  -- Possession of the high-entropy customer order token is the authority to
  -- move the order. This deliberately permits a different account email.
  update public.orders
  set user_id = requester_id
  where id = target_order_id;

  insert into public.order_events (
    order_id, event_type, event_description, performed_by, visible_to_customer
  ) values (
    target_order_id,
    'account_link_changed',
    case when current_owner is null
      then 'Bestelling aan een klantaccount gekoppeld.'
      else 'Bestelling naar een ander klantaccount overgezet.'
    end,
    requester_id,
    false
  );

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.complete_print_job_run(p_job_id uuid, p_printer_id uuid, p_observed_file_name text, p_raw_status jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_job public.print_jobs%rowtype;
  v_order public.orders%rowtype;
  v_run_number integer;
  v_total_plates integer;
  v_runs jsonb;
  v_statuses jsonb;
  v_completed boolean;
begin
  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then return jsonb_build_object('counted', false, 'reason', 'job_not_found'); end if;
  if v_job.printer_id is distinct from p_printer_id then return jsonb_build_object('counted', false, 'reason', 'printer_mismatch'); end if;
  if v_job.status not in ('printing', 'paused') then return jsonb_build_object('counted', false, 'reason', 'already_counted'); end if;
  if v_job.approved_by is null or v_job.approved_at is null then
    return jsonb_build_object('counted', false, 'reason', 'admin_approval_required');
  end if;

  select * into v_order from public.orders where id = v_job.order_id for update;
  if v_order.status in ('completed', 'cancelled') then return jsonb_build_object('counted', false, 'reason', 'order_closed'); end if;
  v_total_plates := greatest(coalesce(v_order.total_plates, 0), v_job.plate_number);
  v_runs := case when jsonb_typeof(v_order.plate_runs_completed) = 'array' then v_order.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(v_order.plate_print_statuses) = 'array' then v_order.plate_print_statuses else '[]'::jsonb end;
  while jsonb_array_length(v_runs) < v_total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;

  v_run_number := greatest(coalesce(v_job.runs_completed, 0), coalesce((v_runs ->> (v_job.plate_number - 1))::integer, 0)) + 1;
  v_completed := v_run_number >= v_job.runs_required;
  insert into public.print_runs (print_job_id, printer_id, run_number, observed_file_name, status, completed_at, filament_used_grams, raw_status)
  values (v_job.id, p_printer_id, v_run_number, p_observed_file_name, 'completed', now(), v_job.estimated_filament_grams, coalesce(p_raw_status, '{}'::jsonb))
  on conflict (print_job_id, run_number) do update set status = 'completed', completed_at = excluded.completed_at,
    observed_file_name = excluded.observed_file_name, filament_used_grams = excluded.filament_used_grams, raw_status = excluded.raw_status;

  update public.print_jobs set
    runs_completed = v_run_number,
    status = case when v_completed then 'completed' else 'suggested' end,
    completed_at = case when v_completed then now() else null end,
    observed_file_name = p_observed_file_name,
    approved_at = case when v_completed then approved_at else null end,
    approved_by = case when v_completed then approved_by else null end,
    suggested_at = case when v_completed then suggested_at else now() end
  where id = v_job.id;

  v_runs := jsonb_set(v_runs, array[(v_job.plate_number - 1)::text], to_jsonb(v_run_number));
  v_statuses := jsonb_set(v_statuses, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed));
  update public.orders set plate_runs_completed = v_runs, plate_print_statuses = v_statuses,
    filament_used_g = coalesce(filament_used_g, 0) + coalesce(v_job.estimated_filament_grams, 0),
    print_duration_minutes = coalesce(print_duration_minutes, 0) + coalesce(v_job.estimated_duration_minutes, 0)
  where id = v_job.order_id;

  return jsonb_build_object('counted', true, 'runNumber', v_run_number, 'completed', v_completed, 'nextApprovalRequired', not v_completed);
end;
$function$


CREATE OR REPLACE FUNCTION public.convert_loyalty_points(points_to_redeem integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  current_points integer;
  generated_code text;
  discount_euros numeric;
  euros_per_point numeric := 0.05;
  customer_email text;
begin
  if caller_id is null then raise exception 'Niet ingelogd.'; end if;
  if points_to_redeem is null or points_to_redeem < 1 then
    raise exception 'Wissel minimaal één punt in.';
  end if;

  select p.loyalty_points, p.email into current_points, customer_email
  from public.profiles p where p.user_id = caller_id for update;
  if not found then raise exception 'Profiel niet gevonden.'; end if;
  if coalesce(current_points, 0) < points_to_redeem then raise exception 'Onvoldoende punten.'; end if;
  if coalesce(trim(customer_email), '') = '' then raise exception 'E-mailadres ontbreekt in uw profiel.'; end if;

  select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric else 0.05 end
    into euros_per_point
  from public.app_settings s where s.key = 'loyalty_euros_per_point';
  euros_per_point := greatest(0.0001, coalesce(euros_per_point, 0.05));
  discount_euros := round(points_to_redeem * euros_per_point, 2);
  generated_code := 'LOYAL-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 10));

  update public.profiles set loyalty_points = loyalty_points - points_to_redeem where user_id = caller_id;
  insert into public.loyalty_transactions(user_id, points, kind, description)
  values (caller_id, -points_to_redeem, 'redeemed', 'Ingewisseld voor kortingscode ' || generated_code);
  insert into public.discount_codes(
    code, discount_type, discount_value, max_uses, times_used, assigned_to_email,
    active, is_public, starts_at, expires_at, per_customer_limit, stackable
  ) values (
    generated_code, 'fixed', discount_euros, 1, 0, customer_email,
    true, false, now(), null, 1, false
  );
  return generated_code;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_guest_order(p_order jsonb)
 RETURNS TABLE(id uuid, customer_order_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE created_id uuid; created_token text;
BEGIN
  IF p_order IS NULL
    OR jsonb_typeof(p_order) <> 'object'
    OR octet_length(p_order::text) > 200000
    OR COALESCE(BTRIM(p_order ->> 'customer_name'), '') = ''
    OR char_length(BTRIM(p_order ->> 'customer_name')) > 200
    OR COALESCE(BTRIM(p_order ->> 'customer_email'), '') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(BTRIM(p_order ->> 'customer_email')) > 254
    OR COALESCE(BTRIM(p_order ->> 'order_number'), '') !~ '^OW3D-[0-9]+$'
    OR char_length(p_order ->> 'order_number') > 40
    OR COALESCE(p_order ->> 'quantity', '') !~ '^[0-9]{1,7}$'
    OR COALESCE(p_order ->> 'instant_quote_price', '') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$'
    OR COALESCE(p_order ->> 'order_method', 'file') NOT IN ('file', 'link', 'prebuilt', 'custom', 'mixed')
    OR char_length(COALESCE(p_order ->> 'phone', '')) > 100
    OR char_length(COALESCE(p_order ->> 'company_name', '')) > 200
    OR char_length(COALESCE(p_order ->> 'billing_address', '')) > 500
    OR char_length(COALESCE(p_order ->> 'shipping_address', '')) > 500
    OR char_length(COALESCE(p_order ->> 'notes', '')) > 10000
    OR char_length(COALESCE(p_order ->> 'file_links', '')) > 100000
    OR (p_order ? 'catalog_items' AND (
      jsonb_typeof(p_order -> 'catalog_items') <> 'array'
      OR octet_length((p_order -> 'catalog_items')::text) > 100000
    ))
  THEN
    RAISE EXCEPTION 'Invalid guest order data';
  END IF;

  INSERT INTO public.orders AS created_order (
    order_number,user_id,customer_email,customer_name,phone,company_name,billing_address,
    shipping_address,postal_code,city,country,material,color,quantity,notes,print_preferences,
    instant_quote_price,file_links,order_method,status
  ) VALUES (
    p_order ->> 'order_number',NULL,BTRIM(p_order ->> 'customer_email'),BTRIM(p_order ->> 'customer_name'),
    COALESCE(p_order ->> 'phone', ''),COALESCE(p_order ->> 'company_name', ''),
    COALESCE(p_order ->> 'billing_address', ''),COALESCE(p_order ->> 'shipping_address', p_order ->> 'billing_address', ''),
    COALESCE(p_order ->> 'postal_code', ''),COALESCE(p_order ->> 'city', ''),COALESCE(p_order ->> 'country', 'Nederland'),
    COALESCE(p_order ->> 'material', ''),COALESCE(p_order ->> 'color', ''),
    GREATEST(COALESCE((p_order ->> 'quantity')::integer, 1), 0),COALESCE(p_order ->> 'notes', ''),
    COALESCE(p_order ->> 'print_preferences', ''),GREATEST(COALESCE((p_order ->> 'instant_quote_price')::numeric, 0), 0),
    COALESCE(p_order ->> 'file_links', ''),COALESCE(p_order ->> 'order_method', 'file'),'submitted'::public.order_status
  )
  RETURNING created_order.id, created_order.customer_order_token INTO created_id, created_token;

  IF p_order ? 'catalog_items'
    AND jsonb_typeof(p_order -> 'catalog_items') = 'array'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'catalog_items'
    )
  THEN
    EXECUTE 'UPDATE public.orders SET catalog_items = $1 WHERE id = $2'
      USING p_order -> 'catalog_items', created_id;
  END IF;
  RETURN QUERY SELECT created_id, created_token;
END;
$function$


CREATE OR REPLACE FUNCTION public.decrement_manual_order_plate_run(p_order_id uuid, p_plate_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_job public.print_jobs%rowtype;
  v_runs jsonb;
  v_statuses jsonb;
  v_required jsonb;
  v_required_runs integer;
  v_completed_runs integer;
  v_completed_plates integer;
  v_reversed_run boolean := false;
begin
  if (select auth.uid()) is null
     or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan een printrun corrigeren' using errcode = '42501';
  end if;
  if p_plate_number is null or p_plate_number < 1 then
    raise exception 'Ongeldig plaatnummer' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Bestelling niet gevonden'; end if;
  if p_plate_number > greatest(coalesce(v_order.total_plates, 0), 0) then
    raise exception 'Plaat % bestaat niet in deze bestelling', p_plate_number using errcode = '22023';
  end if;

  v_runs := case when jsonb_typeof(v_order.plate_runs_completed) = 'array' then v_order.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(v_order.plate_print_statuses) = 'array' then v_order.plate_print_statuses else '[]'::jsonb end;
  v_required := case when jsonb_typeof(v_order.plate_runs_required_per_plate) = 'array' then v_order.plate_runs_required_per_plate else '[]'::jsonb end;
  while jsonb_array_length(v_runs) < v_order.total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_order.total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;
  while jsonb_array_length(v_required) < v_order.total_plates loop v_required := v_required || '1'::jsonb; end loop;

  select * into v_job
  from public.print_jobs
  where order_id = p_order_id
    and plate_number = p_plate_number
    and active
  for update;

  v_required_runs := greatest(
    1,
    coalesce((v_required ->> (p_plate_number - 1))::integer, 1),
    coalesce(v_job.runs_required, 1)
  );
  v_completed_runs := greatest(
    0,
    coalesce((v_runs ->> (p_plate_number - 1))::integer, 0),
    coalesce(v_job.runs_completed, 0)
  );

  if v_completed_runs = 0 then
    return jsonb_build_object(
      'decremented', false,
      'reason', 'no_completed_runs',
      'plateNumber', p_plate_number,
      'runsCompleted', 0,
      'runsRequired', v_required_runs,
      'remaining', v_required_runs,
      'completed', false,
      'plateRunsCompleted', v_runs,
      'platePrintStatuses', v_statuses,
      'plateRunsRequired', v_required
    );
  end if;

  if v_job.id is not null then
    update public.print_runs
    set status = 'cancelled',
        completed_at = null,
        raw_status = coalesce(raw_status, '{}'::jsonb) || jsonb_build_object(
          'correctedByAdminAt', now(),
          'correctedBy', (select auth.uid())
        )
    where print_job_id = v_job.id
      and run_number = v_completed_runs
      and status = 'completed'
    returning true into v_reversed_run;

    update public.print_jobs
    set runs_completed = v_completed_runs - 1,
        status = 'queued',
        completed_at = null,
        printer_id = null,
        suggested_at = null,
        approved_at = null,
        approved_by = null
    where id = v_job.id;
  end if;

  v_completed_runs := v_completed_runs - 1;
  v_runs := jsonb_set(v_runs, array[(p_plate_number - 1)::text], to_jsonb(v_completed_runs));
  v_statuses := jsonb_set(v_statuses, array[(p_plate_number - 1)::text], 'false'::jsonb);
  v_required := jsonb_set(v_required, array[(p_plate_number - 1)::text], to_jsonb(v_required_runs));

  select count(*)::integer into v_completed_plates
  from jsonb_array_elements(v_statuses) item(value)
  where item.value = 'true'::jsonb;

  update public.orders
  set plate_runs_completed = v_runs,
      plate_print_statuses = v_statuses,
      plate_runs_required_per_plate = v_required,
      plates_completed = v_completed_plates,
      filament_used_g = case when v_reversed_run then greatest(0, coalesce(filament_used_g, 0) - coalesce(v_job.estimated_filament_grams, 0)) else filament_used_g end,
      print_duration_minutes = case when v_reversed_run then greatest(0, coalesce(print_duration_minutes, 0) - coalesce(v_job.estimated_duration_minutes, 0)) else print_duration_minutes end
  where id = p_order_id;

  insert into public.order_events(order_id, event_type, event_description, performed_by, visible_to_customer)
  values (
    p_order_id,
    'plate_print_correction',
    'Correctie plaat ' || p_plate_number || ': aantal geprinte uitvoeringen teruggezet naar ' || v_completed_runs || ' van ' || v_required_runs || '.',
    (select auth.uid()),
    true
  );

  return jsonb_build_object(
    'decremented', true,
    'plateNumber', p_plate_number,
    'runsCompleted', v_completed_runs,
    'runsRequired', v_required_runs,
    'remaining', greatest(0, v_required_runs - v_completed_runs),
    'completed', false,
    'platesCompleted', v_completed_plates,
    'plateRunsCompleted', v_runs,
    'platePrintStatuses', v_statuses,
    'plateRunsRequired', v_required
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  new_number TEXT;
BEGIN
  new_number := 'OW3D-' || LPAD(nextval('public.order_number_seq')::TEXT, 5, '0');
  RETURN new_number;
END;
$function$


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE existing_subscription_active boolean := false;
BEGIN
  SELECT active
  INTO existing_subscription_active
  FROM public.newsletter_subscriptions
  WHERE lower(email) = lower(coalesce(NEW.email, ''))
  LIMIT 1;

  INSERT INTO public.profiles (user_id, email, full_name, newsletter_subscribed)
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(NEW.raw_user_meta_data ->> 'full_name', ''),
    coalesce(existing_subscription_active, false)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.newsletter_subscriptions
  SET user_id = NEW.id
  WHERE lower(email) = lower(coalesce(NEW.email, ''))
    AND user_id IS NULL;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$


CREATE OR REPLACE FUNCTION public.increment_discount_usage(code_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.discount_codes
  SET times_used = times_used + 1
  WHERE code = code_text;
END;
$function$


CREATE OR REPLACE FUNCTION public.printer_queue_colors_available(p_item printer_queue_items)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (
    select 1
    from jsonb_array_elements(coalesce(p_item.required_colors, '[]'::jsonb)) requirement
    where not exists (
      select 1
      from public.printer_ams_slots slot
      where slot.printer_id = p_item.printer_id
        and (
          nullif(requirement->>'ams_unit', '') is null
          or slot.ams_unit = (requirement->>'ams_unit')::integer
        )
        and (
          nullif(requirement->>'slot_number', '') is null
          or slot.slot_number = (requirement->>'slot_number')::integer
        )
        and (
          nullif(requirement->>'color_hex', '') is null
          or lower(left(coalesce(slot.color_hex, ''), 7)) = lower(left(requirement->>'color_hex', 7))
        )
        and (
          nullif(requirement->>'material', '') is null
          or lower(coalesce(slot.material, '')) = lower(requirement->>'material')
        )
    )
  );
$function$


CREATE OR REPLACE FUNCTION public.promote_inventory_to_filament_color(p_inventory_id uuid, p_name text, p_material text, p_hex text, p_description text DEFAULT ''::text, p_active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  source_inventory public.filament_inventory%rowtype;
  new_color_id uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Alleen administrators kunnen een voorraadrol als kleur toevoegen.' using errcode = '42501';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Vul een kleurnaam in.' using errcode = '22023';
  end if;
  if nullif(trim(p_material), '') is null then
    raise exception 'Vul een materiaal in.' using errcode = '22023';
  end if;
  if trim(p_hex) !~* '^#[0-9a-f]{6}$' then
    raise exception 'Gebruik een geldige hexcode, bijvoorbeeld #1A2B3C.' using errcode = '22023';
  end if;

  select *
  into source_inventory
  from public.filament_inventory
  where id = p_inventory_id
  for update;

  if not found then
    raise exception 'De voorraadregel bestaat niet meer.' using errcode = 'P0002';
  end if;
  if source_inventory.filament_color_id is not null then
    raise exception 'Deze voorraadregel is al aan een kleur gekoppeld.' using errcode = '23505';
  end if;
  if exists (
    select 1
    from public.filament_colors color
    where lower(trim(color.name)) = lower(trim(p_name))
      and upper(trim(color.material)) = upper(trim(p_material))
  ) then
    raise exception 'Deze kleurnaam bestaat al voor dit materiaal.' using errcode = '23505';
  end if;

  insert into public.filament_colors (
    name, material, hex, description, sort_order, active
  ) values (
    trim(p_name), upper(trim(p_material)), upper(trim(p_hex)), trim(coalesce(p_description, '')),
    coalesce((select max(color.sort_order) + 1 from public.filament_colors color), 0),
    p_active
  )
  returning id into new_color_id;

  -- The catalogue trigger creates the palette row. Copy the AMS observation
  -- into that row before removing the former unlisted-AMS row.
  update public.filament_inventory
  set
    total_weight_grams = source_inventory.total_weight_grams,
    manual_weight_grams = source_inventory.manual_weight_grams,
    spool_capacity_grams = source_inventory.spool_capacity_grams,
    remaining_percent = source_inventory.remaining_percent,
    source_printer_id = source_inventory.source_printer_id,
    source_ams_unit = source_inventory.source_ams_unit,
    source_slot_number = source_inventory.source_slot_number,
    tray_uuid = source_inventory.tray_uuid,
    last_seen_at = source_inventory.last_seen_at
  where inventory_key = 'palette:' || new_color_id::text;

  delete from public.filament_inventory where id = source_inventory.id;

  insert into public.product_color_availability (product_id, color_id, available)
  select product.id, new_color_id, true
  from public.products product
  where cardinality(coalesce(product.materials, '{}'::text[])) = 0
     or exists (
       select 1
       from unnest(coalesce(product.materials, '{}'::text[])) product_material
       where upper(trim(product_material)) = upper(trim(p_material))
     )
  on conflict (product_id, color_id) do update set available = excluded.available;

  return new_color_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.record_discount_redemption(code_text text, order_id_value uuid, discount_amount_value numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d public.discount_codes%rowtype; o public.orders%rowtype;
begin
  if auth.uid() is null then return false; end if;
  select * into o from public.orders where id = order_id_value and (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
  if o.id is null then raise exception 'Bestelling niet gevonden.'; end if;
  select * into d from public.discount_codes where upper(code) = upper(trim(code_text)) for update;
  if d.id is null or not d.active or (d.starts_at is not null and d.starts_at > now()) or (d.expires_at is not null and d.expires_at <= now()) then
    raise exception 'Kortingscode is niet geldig.';
  end if;
  if d.max_uses is not null and d.times_used >= d.max_uses then raise exception 'Kortingscode is maximaal gebruikt.'; end if;
  if d.per_customer_limit is not null and (select count(*) from public.discount_redemptions where discount_code_id = d.id and lower(customer_email) = lower(o.customer_email)) >= d.per_customer_limit then
    raise exception 'Kortingscode is voor deze klant maximaal gebruikt.';
  end if;
  insert into public.discount_redemptions(discount_code_id, order_id, user_id, customer_email, discount_amount)
  values (d.id, o.id, auth.uid(), o.customer_email, greatest(0, discount_amount_value));
  update public.discount_codes set times_used = times_used + 1 where id = d.id;
  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.record_manual_order_plate_run(p_order_id uuid, p_plate_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_order public.orders%rowtype; v_job public.print_jobs%rowtype; v_runs jsonb; v_statuses jsonb; v_required jsonb;
 v_required_runs integer; v_completed_runs integer; v_remaining integer; v_completed_plates integer;
begin
 if (select auth.uid()) is null or not public.has_role((select auth.uid()), 'admin'::public.app_role) then raise exception 'Alleen een admin kan een printrun registreren' using errcode='42501'; end if;
 if p_plate_number is null or p_plate_number < 1 then raise exception 'Ongeldig plaatnummer' using errcode='22023'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Bestelling niet gevonden'; end if;
 if p_plate_number > greatest(coalesce(v_order.total_plates,0),0) then raise exception 'Plaat % bestaat niet in deze bestelling',p_plate_number using errcode='22023'; end if;
 v_runs:=case when jsonb_typeof(v_order.plate_runs_completed)='array' then v_order.plate_runs_completed else '[]'::jsonb end;
 v_statuses:=case when jsonb_typeof(v_order.plate_print_statuses)='array' then v_order.plate_print_statuses else '[]'::jsonb end;
 v_required:=case when jsonb_typeof(v_order.plate_runs_required_per_plate)='array' then v_order.plate_runs_required_per_plate else '[]'::jsonb end;
 while jsonb_array_length(v_runs)<v_order.total_plates loop v_runs:=v_runs||'0'::jsonb; end loop;
 while jsonb_array_length(v_statuses)<v_order.total_plates loop v_statuses:=v_statuses||'false'::jsonb; end loop;
 while jsonb_array_length(v_required)<v_order.total_plates loop v_required:=v_required||'1'::jsonb; end loop;
 select * into v_job from public.print_jobs where order_id=p_order_id and plate_number=p_plate_number for update;
 v_required_runs:=greatest(1,coalesce((v_required->>(p_plate_number-1))::integer,1),coalesce(v_job.runs_required,1));
 v_completed_runs:=least(v_required_runs,greatest(0,coalesce((v_runs->>(p_plate_number-1))::integer,0),coalesce(v_job.runs_completed,0)));
 if v_completed_runs>=v_required_runs then
  return jsonb_build_object('counted',false,'reason','already_completed','plateNumber',p_plate_number,'runsCompleted',v_completed_runs,'runsRequired',v_required_runs,'remaining',0,'completed',true,'plateRunsCompleted',v_runs,'platePrintStatuses',v_statuses,'plateRunsRequired',v_required);
 end if;
 v_completed_runs:=v_completed_runs+1; v_remaining:=greatest(0,v_required_runs-v_completed_runs);
 v_runs:=jsonb_set(v_runs,array[(p_plate_number-1)::text],to_jsonb(v_completed_runs));
 v_statuses:=jsonb_set(v_statuses,array[(p_plate_number-1)::text],to_jsonb(v_remaining=0));
 v_required:=jsonb_set(v_required,array[(p_plate_number-1)::text],to_jsonb(v_required_runs));
 select count(*)::integer into v_completed_plates from jsonb_array_elements(v_statuses) item(value) where item.value='true'::jsonb;
 update public.orders set plate_runs_completed=v_runs,plate_print_statuses=v_statuses,plate_runs_required_per_plate=v_required,plates_completed=v_completed_plates where id=p_order_id;
 if v_job.id is not null then update public.print_jobs set runs_required=v_required_runs,runs_completed=v_completed_runs,status=case when v_remaining=0 then 'completed' else status end,completed_at=case when v_remaining=0 then coalesce(completed_at,now()) else null end where id=v_job.id; end if;
 insert into public.order_events(order_id,event_type,event_description,performed_by,visible_to_customer) values(p_order_id,'plate_printed','Plaat '||p_plate_number||': uitvoering '||v_completed_runs||' van '||v_required_runs||' is als geprint geregistreerd.',(select auth.uid()),true);
 return jsonb_build_object('counted',true,'plateNumber',p_plate_number,'runsCompleted',v_completed_runs,'runsRequired',v_required_runs,'remaining',v_remaining,'completed',v_remaining=0,'platesCompleted',v_completed_plates,'plateRunsCompleted',v_runs,'platePrintStatuses',v_statuses,'plateRunsRequired',v_required);
end; $function$


CREATE OR REPLACE FUNCTION public.record_order_link_visit(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE updated_id uuid;
BEGIN
  UPDATE public.orders
  SET link_first_viewed_at = COALESCE(link_first_viewed_at, clock_timestamp()),
      link_last_viewed_at = clock_timestamp(),
      link_view_count = link_view_count + 1
  WHERE customer_order_token = p_token
  RETURNING id INTO updated_id;
  RETURN updated_id IS NOT NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.redeem_gift_card(code_text text, order_id_value uuid, requested_amount numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g public.gift_cards%rowtype; o public.orders%rowtype; used numeric;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd.'; end if;
  select * into o from public.orders where id = order_id_value and (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
  if o.id is null then raise exception 'Bestelling niet gevonden.'; end if;
  select * into g from public.gift_cards where upper(code) = upper(trim(code_text)) for update;
  if g.id is null or not g.active or g.current_balance <= 0 or (g.expires_at is not null and g.expires_at <= now()) then raise exception 'Cadeaubon is niet geldig.'; end if;
  if g.assigned_to_email is not null and lower(g.assigned_to_email) <> lower(o.customer_email) then raise exception 'Cadeaubon hoort bij een ander e-mailadres.'; end if;
  used := least(g.current_balance, greatest(0, requested_amount));
  if used <= 0 then return 0; end if;
  insert into public.gift_card_redemptions(gift_card_id, order_id, user_id, amount) values (g.id, o.id, auth.uid(), used);
  update public.gift_cards set current_balance = current_balance - used, active = current_balance - used > 0 where id = g.id;
  update public.orders set gift_card_code = g.code, gift_card_amount = used where id = o.id;
  return used;
end;
$function$


CREATE OR REPLACE FUNCTION public.redeem_printer_pairing_code(p_code_hash text, p_access_hash text, p_refresh_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pairing public.printer_pairing_codes%rowtype; printer_serial text;
begin
  select * into pairing from public.printer_pairing_codes where code_hash = p_code_hash for update;
  if pairing.id is null or pairing.expires_at <= now() or pairing.redeemed_at is not null then return null; end if;
  update public.printers set bridge_token_hash = p_access_hash, bridge_refresh_token_hash = p_refresh_hash,
    bridge_token_refreshed_at = now() where id = pairing.printer_id returning device_serial into printer_serial;
  if printer_serial is null then return null; end if;
  update public.printer_pairing_codes set redeemed_at = now(), bambu_access_code = null,
    slicer_cert_pem = null, slicer_key_pem = null, slicer_crl_pem = null where id = pairing.id;
  return jsonb_build_object('printer_id', pairing.printer_id, 'bambu_serial', printer_serial,
    'bambu_host', pairing.bambu_host, 'bambu_access_code', pairing.bambu_access_code,
    'ftps_username', pairing.ftps_username, 'ftps_port', pairing.ftps_port);
end; $function$


CREATE OR REPLACE FUNCTION public.refresh_order_plate_data(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
begin
  if (select auth.uid()) is null or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan plaatgegevens verversen' using errcode = '42501';
  end if;

  update public.orders
  set
    plate_print_statuses = plate_print_statuses,
    plate_runs_required_per_plate = plate_runs_required_per_plate
  where id = p_order_id
  returning * into v_order;

  if not found then
    return jsonb_build_object('refreshed', false, 'reason', 'order_not_found');
  end if;

  return jsonb_build_object(
    'refreshed', true,
    'orderId', v_order.id,
    'platePrintStatuses', v_order.plate_print_statuses,
    'plateRunsCompleted', v_order.plate_runs_completed,
    'plateRunsRequired', v_order.plate_runs_required_per_plate,
    'platesCompleted', v_order.plates_completed
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.refresh_printer_queue_color_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare affected_printer uuid := coalesce(new.printer_id, old.printer_id);
begin
  update public.printer_queue_items item
  set status = case when public.printer_queue_colors_available(item) then 'queued' else 'blocked' end,
      blocked_reason = case when public.printer_queue_colors_available(item) then null else 'Vereist filament zit niet correct in de AMS.' end
  where item.printer_id = affected_printer and item.status in ('queued','blocked');
  return null;
end;
$function$


CREATE OR REPLACE FUNCTION public.reorder_printer_queue(p_printer_id uuid, p_item_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare item_id uuid; item_count integer; requested_count integer; ordinal integer := 0;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Niet toegestaan'; end if;
  select count(*) into item_count from public.printer_queue_items
    where printer_id = p_printer_id and status in ('queued','blocked','paused');
  select count(distinct value) into requested_count from unnest(p_item_ids) value;
  if item_count <> coalesce(array_length(p_item_ids, 1), 0) or requested_count <> item_count then
    raise exception 'De wachtrij is intussen gewijzigd. Vernieuw en probeer opnieuw.';
  end if;
  foreach item_id in array p_item_ids loop
    ordinal := ordinal + 1;
    update public.printer_queue_items set position = -ordinal where id = item_id and printer_id = p_printer_id and status in ('queued','blocked','paused');
    if not found then raise exception 'Ongeldig wachtrij-item'; end if;
  end loop;
  update public.printer_queue_items set position = -position * 1000
    where printer_id = p_printer_id and position < 0;
end;
$function$


CREATE OR REPLACE FUNCTION public.request_printer_file_metadata(p_file_id uuid, p_plate_number integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare next_id bigint;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Alleen admins kunnen bestandsmetadata opvragen'; end if;
  if p_plate_number is not null and p_plate_number < 1 then raise exception 'Ongeldig plaatnummer'; end if;
  update public.printer_sd_files
  set metadata_request_id = metadata_request_id + 1, metadata_requested_plate_number = p_plate_number, metadata_last_error = null
  where id = p_file_id returning metadata_request_id into next_id;
  if next_id is null then raise exception 'Printbestand niet gevonden'; end if;
  return next_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.request_printer_ftps_scan(p_printer_id uuid, p_kind text, p_scan_paths jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  next_id bigint;
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'Alleen admins kunnen een printerscan starten';
  end if;
  if p_kind = 'files' then
    if jsonb_typeof(p_scan_paths) <> 'array' or jsonb_array_length(p_scan_paths) not between 1 and 25 then
      raise exception 'Kies minimaal één en maximaal 25 scanmappen';
    end if;
    update public.printers set
      ftps_scan_paths = p_scan_paths,
      ftps_scan_requested_at = clock_timestamp(),
      ftps_scan_request_id = ftps_scan_request_id + 1
    where id = p_printer_id
    returning ftps_scan_request_id into next_id;
  elsif p_kind = 'folders' then
    update public.printers set
      ftps_folder_scan_requested_at = clock_timestamp(),
      ftps_folder_scan_request_id = ftps_folder_scan_request_id + 1
    where id = p_printer_id
    returning ftps_folder_scan_request_id into next_id;
  else
    raise exception 'Onbekend scantype';
  end if;
  if next_id is null then raise exception 'Printer niet gevonden'; end if;
  return next_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.request_printer_queue_start(p_printer_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare next_id bigint;
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'Alleen admins kunnen een printerstart aanvragen';
  end if;
  if not exists (
    select 1 from public.printer_queue_items
    where printer_id = p_printer_id and status in ('queued', 'blocked')
  ) then
    raise exception 'Er staat geen print klaar';
  end if;
  update public.printers
  set print_start_request_id = print_start_request_id + 1
  where id = p_printer_id
  returning print_start_request_id into next_id;
  if next_id is null then raise exception 'Printer niet gevonden'; end if;
  return next_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.save_order_3mf_plate_selection(p_order_id uuid, p_mappings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_item jsonb;
  v_mapping public.order_3mf_plate_mappings%rowtype;
  v_order_file public.order_files%rowtype;
  v_logical integer := 0;
  v_statuses jsonb := '[]'::jsonb;
  v_runs jsonb := '[]'::jsonb;
  v_required jsonb := '[]'::jsonb;
  v_completed_plates integer := 0;
begin
  if (select auth.uid()) is null
     or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan 3MF-platen selecteren' using errcode = '42501';
  end if;
  if jsonb_typeof(p_mappings) <> 'array' or jsonb_array_length(p_mappings) < 1 then
    raise exception 'Selecteer minimaal één plaat' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct ((value->>'orderFileId') || ':' || (value->>'sourcePlateNumber')))
    from jsonb_array_elements(p_mappings)
  ) then
    raise exception 'Dezelfde bronplaat is meer dan één keer geselecteerd' using errcode = '22023';
  end if;
  perform 1 from public.orders where id = p_order_id for update;
  if not found then raise exception 'Bestelling niet gevonden'; end if;

  -- Preserve counters from jobs before rebuilding the active logical order.
  update public.order_3mf_plate_mappings mapping
  set runs_required = greatest(mapping.runs_required, job.runs_required),
      runs_completed = greatest(mapping.runs_completed, job.runs_completed)
  from public.print_jobs job
  where mapping.id = job.plate_mapping_id and mapping.order_id = p_order_id;

  update public.order_3mf_plate_mappings
  set active = false, logical_plate_number = null
  where order_id = p_order_id;
  update public.print_jobs set active = false where order_id = p_order_id;
  with ranked as (
    select id, row_number() over (order by created_at, id) as position
    from public.print_jobs
    where order_id = p_order_id
  )
  update public.print_jobs job
  set plate_number = 1000000 + ranked.position
  from ranked
  where ranked.id = job.id;

  for v_item in select value from jsonb_array_elements(p_mappings)
  loop
    v_logical := v_logical + 1;
    if coalesce((v_item->>'sourcePlateNumber')::integer, 0) < 1 then
      raise exception 'Ongeldig bronplaatnummer' using errcode = '22023';
    end if;
    select * into v_order_file
    from public.order_files
    where id = (v_item->>'orderFileId')::uuid and order_id = p_order_id;
    if not found then raise exception '3MF-bestand hoort niet bij deze bestelling'; end if;

    insert into public.order_3mf_plate_mappings (
      order_id, order_file_id, source_plate_number, logical_plate_number,
      source_file_name, preview_storage_path, colors, runs_required, active
    ) values (
      p_order_id,
      v_order_file.id,
      (v_item->>'sourcePlateNumber')::integer,
      v_logical,
      coalesce(nullif(v_item->>'sourceFileName', ''), v_order_file.original_filename),
      nullif(v_item->>'previewStoragePath', ''),
      case when jsonb_typeof(v_item->'colors') = 'array' then v_item->'colors' else '[]'::jsonb end,
      greatest(coalesce((v_item->>'runsRequired')::integer, 1), 1),
      true
    )
    on conflict (order_file_id, source_plate_number) do update
    set logical_plate_number = excluded.logical_plate_number,
        source_file_name = excluded.source_file_name,
        preview_storage_path = coalesce(excluded.preview_storage_path, order_3mf_plate_mappings.preview_storage_path),
        colors = excluded.colors,
        runs_required = greatest(excluded.runs_required, order_3mf_plate_mappings.runs_required, order_3mf_plate_mappings.runs_completed, 1),
        active = true
    returning * into v_mapping;

    update public.order_files
    set customer_visible = false, file_purpose = 'production_3mf'
    where id = v_mapping.order_file_id;

    insert into public.print_jobs (
      order_id, plate_mapping_id, source_order_file_id, source_plate_number,
      plate_number, plate_name, expected_file_name, three_mf_storage_path,
      runs_required, runs_completed, colors, status, active
    ) values (
      p_order_id, v_mapping.id, v_mapping.order_file_id, v_mapping.source_plate_number,
      v_logical, 'Plaat ' || v_logical,
      v_order_file.original_filename, v_order_file.storage_path,
      v_mapping.runs_required, v_mapping.runs_completed, v_mapping.colors,
      case when v_mapping.runs_completed >= v_mapping.runs_required then 'completed' else 'queued' end,
      true
    )
    on conflict (plate_mapping_id) where plate_mapping_id is not null do update
    set plate_number = excluded.plate_number,
        plate_name = excluded.plate_name,
        source_order_file_id = excluded.source_order_file_id,
        source_plate_number = excluded.source_plate_number,
        expected_file_name = excluded.expected_file_name,
        three_mf_storage_path = excluded.three_mf_storage_path,
        runs_required = excluded.runs_required,
        runs_completed = excluded.runs_completed,
        colors = excluded.colors,
        status = excluded.status,
        printer_id = null,
        suggested_at = null,
        approved_at = null,
        approved_by = null,
        active = true;

    v_statuses := v_statuses || to_jsonb(v_mapping.runs_completed >= v_mapping.runs_required);
    v_runs := v_runs || to_jsonb(v_mapping.runs_completed);
    v_required := v_required || to_jsonb(v_mapping.runs_required);
    if v_mapping.runs_completed >= v_mapping.runs_required then
      v_completed_plates := v_completed_plates + 1;
    end if;
  end loop;

  update public.orders
  set total_plates = v_logical,
      plate_print_statuses = v_statuses,
      plate_runs_completed = v_runs,
      plate_runs_required_per_plate = v_required,
      plates_completed = v_completed_plates
  where id = p_order_id;

  return jsonb_build_object(
    'saved', true,
    'totalPlates', v_logical,
    'platePrintStatuses', v_statuses,
    'plateRunsCompleted', v_runs,
    'plateRunsRequired', v_required,
    'platesCompleted', v_completed_plates,
    'mappings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mapping.id,
        'orderFileId', mapping.order_file_id,
        'sourcePlateNumber', mapping.source_plate_number,
        'logicalPlateNumber', mapping.logical_plate_number,
        'sourceFileName', mapping.source_file_name,
        'previewStoragePath', mapping.preview_storage_path,
        'colors', mapping.colors,
        'runsRequired', mapping.runs_required,
        'runsCompleted', mapping.runs_completed
      ) order by mapping.logical_plate_number), '[]'::jsonb)
      from public.order_3mf_plate_mappings mapping
      where mapping.order_id = p_order_id and mapping.active
    )
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.set_newsletter_subscription(p_email text, p_source text, p_active boolean, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(subscription_id uuid, welcome_needed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  normalized_email text := lower(btrim(p_email));
  normalized_source text := lower(coalesce(nullif(btrim(p_source), ''), 'website'));
BEGIN
  IF normalized_email IS NULL
    OR char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'Ongeldig e-mailadres' USING ERRCODE = '22023';
  END IF;

  IF normalized_source NOT IN ('popup', 'footer', 'website', 'profile') THEN
    normalized_source := 'website';
  END IF;

  RETURN QUERY
  INSERT INTO public.newsletter_subscriptions AS subscription (
    email, source, active, subscribed_at, unsubscribed_at, user_id
  )
  VALUES (
    normalized_email,
    normalized_source,
    p_active,
    now(),
    CASE WHEN p_active THEN NULL ELSE now() END,
    p_user_id
  )
  ON CONFLICT ((lower(email))) DO UPDATE
  SET
    active = EXCLUDED.active,
    unsubscribed_at = CASE WHEN EXCLUDED.active THEN NULL ELSE now() END,
    subscribed_at = CASE
      WHEN EXCLUDED.active AND NOT subscription.active THEN now()
      ELSE subscription.subscribed_at
    END,
    source = CASE WHEN EXCLUDED.active THEN EXCLUDED.source ELSE subscription.source END,
    user_id = COALESCE(subscription.user_id, EXCLUDED.user_id)
  RETURNING subscription.id,
    subscription.active AND subscription.welcome_email_sent_at IS NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_printer_queue_item_color_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status in ('queued','blocked') then
    if public.printer_queue_colors_available(new) then
      new.status := 'queued';
      new.blocked_reason := null;
    else
      new.status := 'blocked';
      new.blocked_reason := 'Vereist filament zit niet correct in de AMS.';
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_unique_main_image()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_main THEN
    UPDATE public.product_images
    SET is_main = FALSE
    WHERE product_id = NEW.product_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.subscribe_to_newsletter(_email text, _source text DEFAULT 'website'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  normalized_email text := lower(btrim(_email));
  normalized_source text := lower(coalesce(nullif(btrim(_source), ''), 'website'));
BEGIN
  IF normalized_email IS NULL
    OR char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'Ongeldig e-mailadres' USING ERRCODE = '22023';
  END IF;

  IF normalized_source NOT IN ('popup', 'footer', 'website') THEN
    normalized_source := 'website';
  END IF;

  INSERT INTO public.newsletter_subscriptions (
    email,
    source,
    active,
    subscribed_at,
    unsubscribed_at
  )
  VALUES (
    normalized_email,
    normalized_source,
    true,
    now(),
    NULL
  )
  ON CONFLICT ((lower(email))) DO UPDATE
  SET
    active = true,
    unsubscribed_at = NULL,
    subscribed_at = CASE
      WHEN public.newsletter_subscriptions.active THEN public.newsletter_subscriptions.subscribed_at
      ELSE now()
    END,
    source = CASE
      WHEN public.newsletter_subscriptions.active THEN public.newsletter_subscriptions.source
      ELSE EXCLUDED.source
    END;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_filament_color_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into public.filament_inventory (
    inventory_key,
    filament_color_id,
    material,
    color_name,
    color_hex,
    total_weight_grams,
    spool_capacity_grams,
    remaining_percent,
    last_seen_at
  ) values (
    'palette:' || new.id::text,
    new.id,
    new.material,
    new.name,
    new.hex,
    null,
    1000,
    null,
    now()
  )
  on conflict (inventory_key) do update set
    filament_color_id = excluded.filament_color_id,
    material = excluded.material,
    color_name = excluded.color_name,
    color_hex = excluded.color_hex;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_newsletter_profile_preference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET newsletter_subscribed = NEW.active
    WHERE user_id = NEW.user_id
      AND newsletter_subscribed IS DISTINCT FROM NEW.active;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_print_job_plate_mapping_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.plate_mapping_id is not null then
    update public.order_3mf_plate_mappings
    set runs_required = greatest(new.runs_required, new.runs_completed, 1),
        runs_completed = greatest(new.runs_completed, 0)
    where id = new.plate_mapping_id;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.synchronize_order_plate_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_job public.print_jobs%rowtype;
  v_runs jsonb;
  v_statuses jsonb;
  v_required jsonb;
  v_total_plates integer;
  v_required_runs integer;
  v_order_runs integer;
  v_completed_runs integer;
  v_manual_complete boolean;
  v_completed_plates integer;
begin
  v_total_plates := greatest(coalesce(new.total_plates, 0), 0);
  v_runs := case when jsonb_typeof(new.plate_runs_completed) = 'array' then new.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(new.plate_print_statuses) = 'array' then new.plate_print_statuses else '[]'::jsonb end;
  v_required := case when jsonb_typeof(new.plate_runs_required_per_plate) = 'array' then new.plate_runs_required_per_plate else '[]'::jsonb end;

  while jsonb_array_length(v_runs) < v_total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;
  while jsonb_array_length(v_required) < v_total_plates loop v_required := v_required || '1'::jsonb; end loop;

  for v_job in
    select *
    from public.print_jobs
    where order_id = new.id
      and plate_number between 1 and v_total_plates
    order by plate_number
    for update
  loop
    v_required_runs := greatest(
      1,
      coalesce((v_required ->> (v_job.plate_number - 1))::integer, 1),
      coalesce(v_job.runs_required, 1),
      coalesce(v_job.runs_completed, 0)
    );
    v_order_runs := greatest(0, coalesce((v_runs ->> (v_job.plate_number - 1))::integer, 0));
    v_manual_complete := coalesce((v_statuses ->> (v_job.plate_number - 1))::boolean, false);
    v_completed_runs := least(
      v_required_runs,
      greatest(
        coalesce(v_job.runs_completed, 0),
        v_order_runs,
        case when v_manual_complete then v_required_runs else 0 end
      )
    );

    update public.print_jobs
    set
      runs_required = v_required_runs,
      runs_completed = v_completed_runs,
      status = case when v_completed_runs >= v_required_runs then 'completed' else status end,
      completed_at = case
        when v_completed_runs >= v_required_runs then coalesce(completed_at, now())
        else completed_at
      end
    where id = v_job.id;

    v_runs := jsonb_set(v_runs, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed_runs));
    v_statuses := jsonb_set(v_statuses, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed_runs >= v_required_runs));
    v_required := jsonb_set(v_required, array[(v_job.plate_number - 1)::text], to_jsonb(v_required_runs));
  end loop;

  select count(*)::integer
  into v_completed_plates
  from jsonb_array_elements(v_statuses) item(value)
  where item.value = 'true'::jsonb;

  new.plate_runs_completed := v_runs;
  new.plate_print_statuses := v_statuses;
  new.plate_runs_required_per_plate := v_required;
  new.plates_completed := v_completed_plates;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.verify_product_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.user_id := auth.uid();
  new.verified := exists (
    select 1 from public.orders o
    where o.id = new.order_id
      and o.user_id = auth.uid()
      and o.status = 'completed'
      and exists (
        select 1 from jsonb_array_elements(coalesce(o.catalog_items, '[]'::jsonb)) item
        where item->>'productId' = new.product_id::text
      )
  );
  if not new.verified then
    raise exception 'Alleen voltooide, geverifieerde aankopen kunnen worden beoordeeld.';
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024))
 RETURNS SETOF realtime.wal_rls
 LANGUAGE plpgsql
AS $function$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    -- Reset the role on every FOR..LOOP batch execution.
                    -- The first batch of 10 rows is pre-fetched using the current connection role (PG internal behaviour)
                    -- then we have to reset it again otherwise it would use the role defined in the `set_config` above
                    -- to fetch the remaining rows when rows>10, which could be a user-defined role that lacks execution grants.
                    -- The flow is:
                    --   1. run batch with conn role
                    --   2. set_config working_role
                    --   3. execute walrus
                    --   4. reset role (revert)
                    --   5. repeat
                    perform set_config('role', null, true);

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$function$


CREATE OR REPLACE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$function$


CREATE OR REPLACE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[])
 RETURNS text
 LANGUAGE sql
AS $function$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $function$


CREATE OR REPLACE FUNCTION realtime."cast"(val text, type_ regtype)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$function$


CREATE OR REPLACE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
/*
Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
*/
declare
    op_symbol text = (
        case
            when op = 'eq' then '='
            when op = 'neq' then '!='
            when op = 'lt' then '<'
            when op = 'lte' then '<='
            when op = 'gt' then '>'
            when op = 'gte' then '>='
            when op = 'in' then '= any'
            else 'UNKNOWN OP'
        end
    );
    res boolean;
begin
    execute format(
        'select %L::'|| type_::text || ' ' || op_symbol
        || ' ( %L::'
        || (
            case
                when op = 'in' then type_::text || '[]'
                else type_::text end
        )
        || ')', val_1, val_2) into res;
    return res;
end;
$function$


CREATE OR REPLACE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$function$


CREATE OR REPLACE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$function$


CREATE OR REPLACE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer)
 RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
 LANGUAGE sql
 SET log_min_messages TO 'fatal'
AS $function$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$function$


CREATE OR REPLACE FUNCTION realtime.quote_wal2json(entity regclass)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$function$


CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$function$


CREATE OR REPLACE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$function$


CREATE OR REPLACE FUNCTION realtime.subscription_check_filters()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    new.selected_columns = (
        select array_agg(c order by c)
        from unnest(new.selected_columns) c
    );

    return new;
end;
$function$


CREATE OR REPLACE FUNCTION realtime.to_regrole(role_name text)
 RETURNS regrole
 LANGUAGE sql
 IMMUTABLE
AS $function$ select role_name::regrole $function$


CREATE OR REPLACE FUNCTION realtime.topic()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
select nullif(current_setting('realtime.topic', true), '')::text;
$function$


CREATE OR REPLACE FUNCTION realtime.wal2json_escape_identifier(name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$function$


CREATE OR REPLACE FUNCTION storage.allow_any_operation(expected_operations text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$function$


CREATE OR REPLACE FUNCTION storage.allow_only_operation(expected_operation text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$function$


CREATE OR REPLACE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$function$


CREATE OR REPLACE FUNCTION storage.enforce_bucket_name_length()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$function$


CREATE OR REPLACE FUNCTION storage.extension(name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$function$


CREATE OR REPLACE FUNCTION storage.filename(name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[array_length(_parts, 1)];
END
$function$


CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$


CREATE OR REPLACE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$function$


CREATE OR REPLACE FUNCTION storage.get_size_by_bucket()
 RETURNS TABLE(size bigint, bucket_id text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$function$


CREATE OR REPLACE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text)
 RETURNS TABLE(key text, id text, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$function$


CREATE OR REPLACE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text)
 RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION storage.operation()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$function$


CREATE OR REPLACE FUNCTION storage.protect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text)
 RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_prefix_len INT;
    v_prefix_start INT;
    v_combined_levels INT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_prefix_len := length(coalesce(prefix, ''));
    v_prefix_start := coalesce(array_length(string_to_array(coalesce(prefix, ''), v_delimiter), 1), 1);
    v_combined_levels := coalesce(array_length(string_to_array(v_prefix, v_delimiter), 1), 1);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT array_to_string(path_tokens[$1:$2], '/') AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $3 || '%%'
                  AND bucket_id = $4
                  AND array_length(objects.path_tokens, 1) <> $2
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT array_to_string(path_tokens[$1:$2], '/') AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $3 || '%%'
               AND bucket_id = $4
               AND array_length(objects.path_tokens, 1) = $2
             ORDER BY %I %s)
            LIMIT $5 OFFSET $6
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING v_prefix_start, v_combined_levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := substring(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter) from v_prefix_len + 1);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := substring(v_current.name from v_prefix_len + 1);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text)
 RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
    v_sort_order text;
    v_sort_column text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    -- Defense-in-depth: this function is independently reachable and must
    -- not trust p_sort_order/p_sort_column to already be validated by a
    -- caller. Normalize to the same strict allow-list storage.search_v2
    -- uses before interpolating anything into dynamic SQL below.
    v_sort_order := lower(coalesce(p_sort_order, 'asc'));
    IF v_sort_order NOT IN ('asc', 'desc') THEN
        v_sort_order := 'asc';
    END IF;

    v_sort_column := lower(coalesce(p_sort_column, 'updated_at'));
    IF v_sort_column NOT IN ('updated_at', 'created_at') THEN
        v_sort_column := 'updated_at';
    END IF;

    IF v_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        v_sort_column,
        v_cursor_op,
        v_sort_column,
        v_sort_order,
        v_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$function$


CREATE OR REPLACE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text)
 RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$function$


CREATE OR REPLACE FUNCTION storage.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$function$


CREATE OR REPLACE FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea DEFAULT '\x7067736f6469756d'::bytea, nonce bytea DEFAULT NULL::bytea)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE
AS '$libdir/supabase_vault', $function$pgsodium_crypto_aead_det_decrypt_by_id$function$


CREATE OR REPLACE FUNCTION vault._crypto_aead_det_encrypt(message bytea, additional bytea, key_id bigint, context bytea DEFAULT '\x7067736f6469756d'::bytea, nonce bytea DEFAULT NULL::bytea)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE
AS '$libdir/supabase_vault', $function$pgsodium_crypto_aead_det_encrypt_by_id$function$


CREATE OR REPLACE FUNCTION vault._crypto_aead_det_noncegen()
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE
AS '$libdir/supabase_vault', $function$pgsodium_crypto_aead_det_noncegen$function$


CREATE OR REPLACE FUNCTION vault.create_secret(new_secret text, new_name text DEFAULT NULL::text, new_description text DEFAULT ''::text, new_key_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  rec record;
BEGIN
  INSERT INTO vault.secrets (secret, name, description)
  VALUES (
    new_secret,
    new_name,
    new_description
  )
  RETURNING * INTO rec;
  UPDATE vault.secrets s
  SET secret = encode(vault._crypto_aead_det_encrypt(
    message := convert_to(rec.secret, 'utf8'),
    additional := convert_to(s.id::text, 'utf8'),
    key_id := 0,
    context := 'pgsodium'::bytea,
    nonce := rec.nonce
  ), 'base64')
  WHERE id = rec.id;
  RETURN rec.id;
END
$function$


CREATE OR REPLACE FUNCTION vault.update_secret(secret_id uuid, new_secret text DEFAULT NULL::text, new_name text DEFAULT NULL::text, new_description text DEFAULT NULL::text, new_key_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  decrypted_secret text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = secret_id);
BEGIN
  UPDATE vault.secrets s
  SET
    secret = CASE WHEN new_secret IS NULL THEN s.secret
                  ELSE encode(vault._crypto_aead_det_encrypt(
                    message := convert_to(new_secret, 'utf8'),
                    additional := convert_to(s.id::text, 'utf8'),
                    key_id := 0,
                    context := 'pgsodium'::bytea,
                    nonce := s.nonce
                  ), 'base64') END,
    name = coalesce(new_name, s.name),
    description = coalesce(new_description, s.description),
    updated_at = now()
  WHERE s.id = secret_id;
END
$function$


