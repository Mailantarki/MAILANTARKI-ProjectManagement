begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

select ok(not has_function_privilege('anon', 'public.document_counts(uuid[], text)', 'execute'),
  'anon cannot count documents');
select ok(not has_function_privilege('authenticated', 'public.document_counts(uuid[], text)', 'execute'),
  'authenticated cannot bypass RLS through document counts');
select ok(has_function_privilege('service_role', 'public.document_counts(uuid[], text)', 'execute'),
  'service role can count documents');
select is((select count(*) from public.document_counts(array[gen_random_uuid()])), 0::bigint,
  'unknown projects return no rows');

select * from finish();
rollback;
