-- Formfuel schema, RLS, and transactional credit/response functions.
--
-- Privileged logic lives in the `private` schema. Do not add `private` to the
-- Data API exposed schemas (Project Settings → Data API). The public functions
-- are thin SECURITY DEFINER gateways: they pass auth.uid() through and do not
-- contain business rules.
--
-- Lock order inside transactions: survey row, then response row, then profile.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

comment on schema private is
  'Formfuel privileged functions and screening keys. Not exposed via the Data API.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.product_rules (
  id int primary key check (id = 1),
  default_response_cap int not null check (default_response_cap > 0),
  reward_per_valid int not null check (reward_per_valid > 0),
  raise_cap_step int not null check (raise_cap_step > 0),
  raise_cap_cost int not null check (raise_cap_cost > 0),
  promote_cost int not null check (promote_cost > 0),
  promote_days int not null check (promote_days > 0),
  extra_survey_cost int not null check (extra_survey_cost > 0),
  free_create_quota int not null check (free_create_quota >= 0),
  min_completion_seconds int not null check (min_completion_seconds >= 0)
);

-- Keep these numbers aligned with lib/config.ts.
insert into public.product_rules (
  id,
  default_response_cap,
  reward_per_valid,
  raise_cap_step,
  raise_cap_cost,
  promote_cost,
  promote_days,
  extra_survey_cost,
  free_create_quota,
  min_completion_seconds
) values (
  1, 10, 8, 10, 8, 12, 7, 8, 1, 120
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  credit_balance int not null default 0 check (credit_balance >= 0),
  free_creates_remaining int not null default 1 check (free_creates_remaining >= 0),
  created_at timestamptz not null default now()
);

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  response_cap int not null check (response_cap > 0),
  response_count int not null default 0 check (response_count >= 0),
  estimated_minutes int not null default 1 check (estimated_minutes > 0),
  promoted_until timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (response_count <= response_cap)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  position int not null check (position > 0),
  kind text not null check (kind in ('single', 'multiple', 'short', 'rating')),
  prompt text not null check (char_length(prompt) between 3 and 280),
  options text[],
  rating_min int,
  rating_max int,
  rating_min_label text,
  rating_max_label text,
  unique (survey_id, position),
  check (
    (
      kind in ('single', 'multiple')
      and options is not null
      and cardinality(options) between 2 and 8
      and rating_min is null
      and rating_max is null
    )
    or (
      kind = 'short'
      and options is null
      and rating_min is null
      and rating_max is null
    )
    or (
      kind = 'rating'
      and options is null
      and rating_min is not null
      and rating_max is not null
      and rating_min >= 0
      and rating_max <= 10
      and rating_max > rating_min
      and rating_max - rating_min <= 9
    )
  )
);

-- Correct answers never sit on a public table, so respondents cannot select them.
create table private.screening_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  correct_indexes int[] not null check (cardinality(correct_indexes) >= 1)
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  respondent_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'valid', 'invalid')),
  invalid_reason text check (
    invalid_reason is null
    or invalid_reason in ('too_fast', 'failed_screening', 'too_fast_and_failed_screening')
  ),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (survey_id, respondent_id),
  check (
    (status = 'in_progress' and submitted_at is null and invalid_reason is null)
    or (status = 'valid' and submitted_at is not null and invalid_reason is null)
    or (status = 'invalid' and submitted_at is not null and invalid_reason is not null)
  )
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  value jsonb not null,
  unique (response_id, question_id)
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null check (amount <> 0),
  balance_after int not null check (balance_after >= 0),
  reason text not null check (reason in ('survey_completion', 'raise_cap', 'promote', 'create_survey')),
  survey_id uuid references public.surveys (id) on delete set null,
  response_id uuid references public.responses (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index credit_ledger_completion_once
  on public.credit_ledger (response_id)
  where reason = 'survey_completion' and response_id is not null;

create table public.survey_bookmarks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  survey_id uuid not null references public.surveys (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, survey_id)
);

create index surveys_owner_idx on public.surveys (owner_id, created_at desc);
create index surveys_browse_idx on public.surveys (status, published_at desc);
create index surveys_promoted_idx on public.surveys (promoted_until desc) where status = 'open';
create index questions_survey_idx on public.questions (survey_id, position);
create index responses_survey_idx on public.responses (survey_id, submitted_at desc);
create index answers_response_idx on public.answers (response_id);
create index answers_question_idx on public.answers (question_id);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create index survey_bookmarks_survey_idx on public.survey_bookmarks (survey_id, user_id);

-- ---------------------------------------------------------------------------
-- Privileged helpers
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger surveys_set_updated_at
  before update on public.surveys
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quota int;
  v_name text;
begin
  select free_create_quota into v_quota
  from public.product_rules
  where id = 1;

  if v_quota is null then
    v_quota := 1;
  end if;

  v_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Student'
  ), 80);

  insert into public.profiles (
    id, display_name, avatar_url, credit_balance, free_creates_remaining
  ) values (
    new.id,
    v_name,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    ),
    0,
    v_quota
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.spend_credits(
  p_user uuid,
  p_amount int,
  p_reason text,
  p_survey uuid
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid credit amount';
  end if;

  if p_reason not in ('raise_cap', 'promote', 'create_survey') then
    raise exception 'Invalid spend reason';
  end if;

  select credit_balance into v_balance
  from public.profiles
  where id = p_user
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_balance < p_amount then
    raise exception 'Not enough credits';
  end if;

  update public.profiles
  set credit_balance = credit_balance - p_amount
  where id = p_user
  returning credit_balance into v_balance;

  insert into public.credit_ledger (user_id, amount, balance_after, reason, survey_id)
  values (p_user, -p_amount, v_balance, p_reason, p_survey);

  return v_balance;
end;
$$;

create or replace function private.save_survey(p_user uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text;
  v_description text;
  v_publish boolean;
  v_questions jsonb;
  v_q jsonb;
  v_idx int := 0;
  v_kind text;
  v_prompt text;
  v_options text[];
  v_option text;
  v_is_screening boolean;
  v_correct int[];
  v_correct_text text;
  v_rating_min int;
  v_rating_max int;
  v_rating_min_label text;
  v_rating_max_label text;
  v_question_id uuid;
  v_existing public.surveys%rowtype;
  v_cfg public.product_rules%rowtype;
  v_profile public.profiles%rowtype;
  v_estimated int;
  v_n int;
  v_tag text;
  v_clean_tags text[] := '{}';
  v_seen text[] := '{}';
  v_balance int;
  v_free int;
  v_drafts int;
begin
  if p_user is null then
    raise exception 'Not signed in';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Survey payload is invalid';
  end if;

  select * into v_cfg from public.product_rules where id = 1;
  if not found then
    raise exception 'Product rules are not configured';
  end if;

  v_title := nullif(btrim(coalesce(p_payload ->> 'title', '')), '');
  v_description := btrim(coalesce(p_payload ->> 'description', ''));
  v_publish := coalesce((p_payload ->> 'publish')::boolean, false);
  v_questions := p_payload -> 'questions';

  if p_payload ? 'id' and nullif(p_payload ->> 'id', '') is not null then
    v_id := (p_payload ->> 'id')::uuid;
  end if;

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'Title must be between 3 and 120 characters';
  end if;

  if char_length(v_description) > 1000 then
    raise exception 'Description must be 1000 characters or fewer';
  end if;

  if v_questions is null or jsonb_typeof(v_questions) <> 'array' then
    raise exception 'Add at least one question';
  end if;

  v_n := jsonb_array_length(v_questions);
  if v_n < 1 or v_n > 20 then
    raise exception 'A survey needs between 1 and 20 questions';
  end if;

  if p_payload ? 'tags' and jsonb_typeof(p_payload -> 'tags') = 'array' then
    for v_tag in
      select jsonb_array_elements_text(p_payload -> 'tags')
    loop
      v_tag := btrim(v_tag);
      if v_tag = '' then
        continue;
      end if;
      if char_length(v_tag) > 24 then
        raise exception 'Tags must be 24 characters or fewer';
      end if;
      if v_tag !~ '^[A-Za-z0-9][A-Za-z0-9 &/\-]{0,23}$' then
        raise exception 'Tags can use letters, numbers, spaces, and & / -';
      end if;
      if lower(v_tag) = any (v_seen) then
        continue;
      end if;
      if cardinality(v_clean_tags) >= 5 then
        raise exception 'Use at most 5 tags';
      end if;
      v_seen := v_seen || lower(v_tag);
      v_clean_tags := v_clean_tags || v_tag;
    end loop;
  elsif p_payload ? 'tags' and jsonb_typeof(p_payload -> 'tags') <> 'array' then
    raise exception 'Tags must be a list';
  end if;

  if v_id is not null then
    select * into v_existing
    from public.surveys
    where id = v_id
    for update;

    if not found or v_existing.owner_id <> p_user then
      raise exception 'Survey not found';
    end if;
    if v_existing.status <> 'draft' then
      raise exception 'Published surveys cannot be edited';
    end if;
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_publish
    and v_profile.free_creates_remaining <= 0
    and v_profile.credit_balance < v_cfg.extra_survey_cost
  then
    raise exception
      'You have used your free survey. Answer other surveys to earn %s credits, then you can publish another.',
      v_cfg.extra_survey_cost;
  end if;

  v_estimated := greatest(1, ceil(v_n::numeric / 2.0))::int;

  if v_id is null then
    select count(*) into v_drafts
    from public.surveys
    where owner_id = p_user and status = 'draft';

    if v_drafts >= 10 then
      raise exception 'You already have 10 drafts. Publish or delete one first.';
    end if;

    insert into public.surveys (
      owner_id, title, description, tags, status, response_cap, estimated_minutes
    ) values (
      p_user, v_title, v_description, v_clean_tags, 'draft', v_cfg.default_response_cap, v_estimated
    )
    returning id into v_id;
  else
    update public.surveys
    set title = v_title,
        description = v_description,
        tags = v_clean_tags,
        estimated_minutes = v_estimated
    where id = v_id;

    delete from public.questions where survey_id = v_id;
  end if;

  for v_q in
    select value from jsonb_array_elements(v_questions)
  loop
    v_idx := v_idx + 1;
    v_kind := v_q ->> 'kind';
    v_prompt := btrim(coalesce(v_q ->> 'prompt', ''));
    v_is_screening := coalesce((v_q ->> 'isScreening')::boolean, false);
    v_options := null;
    v_correct := null;
    v_rating_min := null;
    v_rating_max := null;
    v_rating_min_label := null;
    v_rating_max_label := null;

    if v_kind is null or v_kind not in ('single', 'multiple', 'short', 'rating') then
      raise exception 'Unknown question type';
    end if;

    if char_length(v_prompt) < 3 or char_length(v_prompt) > 280 then
      raise exception 'Each question needs a prompt between 3 and 280 characters';
    end if;

    if v_kind in ('single', 'multiple') then
      if v_q -> 'options' is null or jsonb_typeof(v_q -> 'options') <> 'array' then
        raise exception 'Choice questions need options';
      end if;

      v_options := array[]::text[];
      for v_option in
        select btrim(item) from jsonb_array_elements_text(v_q -> 'options') as item
      loop
        if v_option = '' then
          raise exception 'Options cannot be blank';
        end if;
        if char_length(v_option) > 80 then
          raise exception 'Options must be 80 characters or fewer';
        end if;
        if exists (
          select 1 from unnest(v_options) as existing
          where lower(existing) = lower(v_option)
        ) then
          raise exception 'Options must be unique';
        end if;
        v_options := v_options || v_option;
      end loop;

      if cardinality(v_options) < 2 or cardinality(v_options) > 8 then
        raise exception 'Choice questions need 2 to 8 options';
      end if;

      if v_is_screening then
        if v_q -> 'correctOptionIndexes' is null
          or jsonb_typeof(v_q -> 'correctOptionIndexes') <> 'array'
        then
          raise exception 'Screening questions need a correct answer';
        end if;

        v_correct := array[]::int[];
        for v_correct_text in
          select item from jsonb_array_elements_text(v_q -> 'correctOptionIndexes') as item
        loop
          if v_correct_text !~ '^[0-9]+$' then
            raise exception 'Screening answers must be option numbers';
          end if;
          v_correct := v_correct || v_correct_text::int;
        end loop;

        if cardinality(v_correct) < 1 then
          raise exception 'Screening questions need a correct answer';
        end if;
        if v_kind = 'single' and cardinality(v_correct) <> 1 then
          raise exception 'A single-choice screening question needs exactly one correct option';
        end if;
        if exists (
          select 1 from unnest(v_correct) as choice
          where choice < 0 or choice >= cardinality(v_options)
        ) then
          raise exception 'Screening answer is out of range';
        end if;
        if (
          select count(*) from unnest(v_correct)
        ) <> (
          select count(distinct choice) from unnest(v_correct) as choice
        ) then
          raise exception 'Screening answers must be unique';
        end if;
      end if;
    elsif v_is_screening then
      raise exception 'Only single-choice and multiple-choice questions can be screening questions';
    end if;

    if v_kind = 'rating' then
      v_rating_min := coalesce((v_q ->> 'ratingMin')::int, 1);
      v_rating_max := coalesce((v_q ->> 'ratingMax')::int, 5);
      if v_rating_min < 0 or v_rating_max > 10 or v_rating_max <= v_rating_min or v_rating_max - v_rating_min > 9 then
        raise exception 'Rating scales must run from a lower number to a higher one, between 0 and 10';
      end if;
      v_rating_min_label := nullif(btrim(coalesce(v_q ->> 'ratingMinLabel', '')), '');
      v_rating_max_label := nullif(btrim(coalesce(v_q ->> 'ratingMaxLabel', '')), '');
      if v_rating_min_label is not null and char_length(v_rating_min_label) > 40 then
        raise exception 'Rating labels must be 40 characters or fewer';
      end if;
      if v_rating_max_label is not null and char_length(v_rating_max_label) > 40 then
        raise exception 'Rating labels must be 40 characters or fewer';
      end if;
    end if;

    insert into public.questions (
      survey_id, position, kind, prompt, options,
      rating_min, rating_max, rating_min_label, rating_max_label
    ) values (
      v_id, v_idx, v_kind, v_prompt, v_options,
      v_rating_min, v_rating_max, v_rating_min_label, v_rating_max_label
    )
    returning id into v_question_id;

    if v_is_screening then
      insert into private.screening_keys (question_id, correct_indexes)
      values (
        v_question_id,
        (select array_agg(choice order by choice) from unnest(v_correct) as choice)
      );
    end if;
  end loop;

  if v_publish then
    if v_profile.free_creates_remaining > 0 then
      update public.profiles
      set free_creates_remaining = free_creates_remaining - 1
      where id = p_user
      returning free_creates_remaining, credit_balance into v_free, v_balance;
    else
      v_balance := private.spend_credits(p_user, v_cfg.extra_survey_cost, 'create_survey', v_id);
      select free_creates_remaining into v_free
      from public.profiles
      where id = p_user;
    end if;

    update public.surveys
    set status = 'open',
        published_at = coalesce(published_at, now())
    where id = v_id;
  else
    v_balance := v_profile.credit_balance;
    v_free := v_profile.free_creates_remaining;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_publish then 'open' else 'draft' end,
    'creditBalance', v_balance,
    'freeCreatesRemaining', v_free
  );
end;
$$;

create or replace function private.delete_draft(p_user uuid, p_survey uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
begin
  select * into v_survey
  from public.surveys
  where id = p_survey
  for update;

  if not found or v_survey.owner_id <> p_user then
    raise exception 'Survey not found';
  end if;

  if v_survey.status <> 'draft' then
    raise exception 'Only drafts can be deleted';
  end if;

  if exists (select 1 from public.responses where survey_id = p_survey) then
    raise exception 'This draft already has responses';
  end if;

  delete from public.surveys where id = p_survey;
end;
$$;

create or replace function private.raise_cap(p_user uuid, p_survey uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
  v_cfg public.product_rules%rowtype;
  v_balance int;
  v_cap int;
begin
  select * into v_survey from public.surveys where id = p_survey for update;
  if not found or v_survey.owner_id <> p_user then
    raise exception 'Survey not found';
  end if;
  if v_survey.status not in ('draft', 'open') then
    raise exception 'This survey is closed';
  end if;

  select * into v_cfg from public.product_rules where id = 1;
  v_balance := private.spend_credits(p_user, v_cfg.raise_cap_cost, 'raise_cap', p_survey);

  update public.surveys
  set response_cap = response_cap + v_cfg.raise_cap_step
  where id = p_survey
  returning response_cap into v_cap;

  return jsonb_build_object('responseCap', v_cap, 'creditBalance', v_balance);
end;
$$;

create or replace function private.promote_survey(p_user uuid, p_survey uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
  v_cfg public.product_rules%rowtype;
  v_balance int;
  v_until timestamptz;
begin
  select * into v_survey from public.surveys where id = p_survey for update;
  if not found or v_survey.owner_id <> p_user then
    raise exception 'Survey not found';
  end if;
  if v_survey.status <> 'open' then
    raise exception 'Publish the survey before promoting it';
  end if;

  select * into v_cfg from public.product_rules where id = 1;
  v_balance := private.spend_credits(p_user, v_cfg.promote_cost, 'promote', p_survey);

  update public.surveys
  set promoted_until = greatest(promoted_until, now()) + make_interval(days => v_cfg.promote_days)
  where id = p_survey
  returning promoted_until into v_until;

  return jsonb_build_object('promotedUntil', v_until, 'creditBalance', v_balance);
end;
$$;

create or replace function private.close_survey(p_user uuid, p_survey uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
begin
  select * into v_survey from public.surveys where id = p_survey for update;
  if not found or v_survey.owner_id <> p_user then
    raise exception 'Survey not found';
  end if;
  if v_survey.status <> 'open' then
    raise exception 'Only an open survey can be closed';
  end if;

  update public.surveys set status = 'closed' where id = p_survey;
end;
$$;

create or replace function private.get_own_survey(p_user uuid, p_survey uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'description', s.description,
    'tags', to_jsonb(s.tags),
    'status', s.status,
    'responseCap', s.response_cap,
    'responseCount', s.response_count,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'kind', q.kind,
          'prompt', q.prompt,
          'options', coalesce(to_jsonb(q.options), '[]'::jsonb),
          'ratingMin', q.rating_min,
          'ratingMax', q.rating_max,
          'ratingMinLabel', q.rating_min_label,
          'ratingMaxLabel', q.rating_max_label,
          'isScreening', (sk.question_id is not null),
          'correctOptionIndexes', coalesce(to_jsonb(sk.correct_indexes), '[]'::jsonb)
        )
        order by q.position
      )
      from public.questions q
      left join private.screening_keys sk on sk.question_id = q.id
      where q.survey_id = s.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.surveys s
  where s.id = p_survey and s.owner_id = p_user;

  if v_result is null then
    raise exception 'Survey not found';
  end if;

  return v_result;
end;
$$;

create or replace function private.start_response(p_user uuid, p_survey uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
  v_response public.responses%rowtype;
  v_awarded int;
begin
  if p_user is null then
    raise exception 'Not signed in';
  end if;

  select * into v_survey from public.surveys where id = p_survey for update;
  if not found then
    raise exception 'Survey not found';
  end if;

  select * into v_response
  from public.responses
  where survey_id = p_survey and respondent_id = p_user
  for update;

  if found and v_response.status <> 'in_progress' then
    select amount into v_awarded
    from public.credit_ledger
    where response_id = v_response.id and reason = 'survey_completion';

    return jsonb_build_object(
      'state', 'submitted',
      'startedAt', v_response.started_at,
      'submittedAt', v_response.submitted_at,
      'status', v_response.status,
      'invalidReason', v_response.invalid_reason,
      'creditsAwarded', coalesce(v_awarded, 0)
    );
  end if;

  if v_survey.owner_id = p_user then
    raise exception 'You cannot answer your own survey';
  end if;

  if v_survey.status <> 'open' then
    raise exception 'This survey is not accepting responses';
  end if;

  if not found then
    if v_survey.response_count >= v_survey.response_cap then
      raise exception 'This survey has reached its response cap';
    end if;

    insert into public.responses (survey_id, respondent_id, status, started_at)
    values (p_survey, p_user, 'in_progress', now())
    returning * into v_response;
  end if;

  return jsonb_build_object(
    'state', 'in_progress',
    'startedAt', v_response.started_at,
    'status', 'in_progress',
    'invalidReason', null,
    'creditsAwarded', 0
  );
end;
$$;

create or replace function private.submit_response(
  p_user uuid,
  p_survey uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
  v_response public.responses%rowtype;
  v_cfg public.product_rules%rowtype;
  v_question public.questions%rowtype;
  v_answer jsonb;
  v_value jsonb;
  v_text text;
  v_indexes int[];
  v_index_text text;
  v_rating int;
  v_correct int[];
  v_sorted_submitted int[];
  v_sorted_correct int[];
  v_updated int;
  v_answer_count int;
  v_match_count int;
  v_elapsed int;
  v_too_fast boolean;
  v_failed boolean := false;
  v_this_failed boolean;
  v_status text;
  v_reason text;
  v_balance int;
  v_awarded int := 0;
  v_ready jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if p_user is null then
    raise exception 'Not signed in';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers are missing';
  end if;

  select * into v_cfg from public.product_rules where id = 1;

  select * into v_survey from public.surveys where id = p_survey for update;
  if not found then
    raise exception 'Survey not found';
  end if;

  select * into v_response
  from public.responses
  where survey_id = p_survey and respondent_id = p_user
  for update;

  if not found then
    raise exception 'Start the survey before submitting';
  end if;

  if v_response.status <> 'in_progress' then
    raise exception 'You already responded to this survey';
  end if;

  if v_survey.owner_id = p_user then
    raise exception 'You cannot answer your own survey';
  end if;

  if v_survey.status <> 'open' then
    raise exception 'This survey is not accepting responses';
  end if;

  if v_survey.response_count >= v_survey.response_cap then
    raise exception 'This survey has reached its response cap';
  end if;

  select count(*) into v_answer_count from jsonb_array_elements(p_answers);
  select count(distinct value ->> 'questionId') into v_match_count
  from jsonb_array_elements(p_answers) as value;

  if v_answer_count <> v_match_count then
    raise exception 'Please answer every question once';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_answers) as value
    where jsonb_typeof(value) <> 'object'
      or not exists (
        select 1 from public.questions q
        where q.survey_id = p_survey and q.id::text = value ->> 'questionId'
      )
  ) then
    raise exception 'Unknown question in submission';
  end if;

  for v_question in
    select * from public.questions
    where survey_id = p_survey
    order by position
  loop
    select count(*) into v_match_count
    from jsonb_array_elements(p_answers) as value
    where value ->> 'questionId' = v_question.id::text;

    if v_match_count <> 1 then
      raise exception 'Please answer every question';
    end if;

    select value into v_answer
    from jsonb_array_elements(p_answers) as value
    where value ->> 'questionId' = v_question.id::text
    limit 1;

    v_value := null;
    v_this_failed := false;

    if v_question.kind in ('single', 'multiple') then
      if v_answer -> 'optionIndexes' is null
        or jsonb_typeof(v_answer -> 'optionIndexes') <> 'array'
      then
        raise exception 'Choose an option for every choice question';
      end if;

      v_indexes := array[]::int[];
      for v_index_text in
        select item from jsonb_array_elements_text(v_answer -> 'optionIndexes') as item
      loop
        if v_index_text !~ '^[0-9]+$' then
          raise exception 'Choose an option for every choice question';
        end if;
        v_indexes := v_indexes || v_index_text::int;
      end loop;

      if v_question.kind = 'single' and cardinality(v_indexes) <> 1 then
        raise exception 'Choose one option';
      end if;
      if v_question.kind = 'multiple' and cardinality(v_indexes) < 1 then
        raise exception 'Choose at least one option';
      end if;
      if exists (
        select 1 from unnest(v_indexes) as choice
        where choice < 0 or choice >= cardinality(v_question.options)
      ) then
        raise exception 'That option is not on this question';
      end if;
      if (
        select count(*) from unnest(v_indexes)
      ) <> (
        select count(distinct choice) from unnest(v_indexes) as choice
      ) then
        raise exception 'Duplicate options are not allowed';
      end if;

      select array_agg(choice order by choice) into v_sorted_submitted
      from unnest(v_indexes) as choice;
      v_indexes := v_sorted_submitted;
      v_value := jsonb_build_object('optionIndexes', to_jsonb(v_indexes));

      select correct_indexes into v_correct
      from private.screening_keys
      where question_id = v_question.id;

      if found then
        select array_agg(choice order by choice) into v_sorted_correct
        from unnest(v_correct) as choice;
        if v_indexes is distinct from v_sorted_correct then
          v_this_failed := true;
        end if;
      end if;
    elsif v_question.kind = 'short' then
      v_text := btrim(coalesce(v_answer ->> 'text', ''));
      if char_length(v_text) < 1 or char_length(v_text) > 500 then
        raise exception 'Short answers must be between 1 and 500 characters';
      end if;
      v_value := jsonb_build_object('text', v_text);
    elsif v_question.kind = 'rating' then
      v_text := v_answer ->> 'rating';
      if v_text is null or v_text !~ '^[0-9]+$' then
        raise exception 'Choose a rating';
      end if;
      v_rating := v_text::int;
      if v_rating < v_question.rating_min or v_rating > v_question.rating_max then
        raise exception 'That rating is outside the scale';
      end if;
      v_value := jsonb_build_object('rating', v_rating);
    else
      raise exception 'Unknown question type';
    end if;

    if v_this_failed then
      v_failed := true;
    end if;

    v_ready := v_ready || jsonb_build_array(
      jsonb_build_object('questionId', v_question.id, 'value', v_value)
    );
  end loop;

  for v_item in
    select value from jsonb_array_elements(v_ready)
  loop
    insert into public.answers (response_id, question_id, value)
    values (
      v_response.id,
      (v_item ->> 'questionId')::uuid,
      v_item -> 'value'
    );
  end loop;

  v_elapsed := floor(extract(epoch from (now() - v_response.started_at)))::int;
  v_too_fast := v_elapsed < v_cfg.min_completion_seconds;

  if v_too_fast and v_failed then
    v_status := 'invalid';
    v_reason := 'too_fast_and_failed_screening';
  elsif v_too_fast then
    v_status := 'invalid';
    v_reason := 'too_fast';
  elsif v_failed then
    v_status := 'invalid';
    v_reason := 'failed_screening';
  else
    v_status := 'valid';
    v_reason := null;
  end if;

  update public.responses
  set status = v_status,
      invalid_reason = v_reason,
      submitted_at = now()
  where id = v_response.id;

  update public.surveys
  set response_count = response_count + 1
  where id = p_survey and response_count < response_cap;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This survey has reached its response cap';
  end if;

  if v_status = 'valid' then
    select credit_balance into v_balance
    from public.profiles
    where id = p_user
    for update;

    update public.profiles
    set credit_balance = credit_balance + v_cfg.reward_per_valid
    where id = p_user
    returning credit_balance into v_balance;

    insert into public.credit_ledger (
      user_id, amount, balance_after, reason, survey_id, response_id
    ) values (
      p_user, v_cfg.reward_per_valid, v_balance, 'survey_completion', p_survey, v_response.id
    );

    v_awarded := v_cfg.reward_per_valid;
  end if;

  return jsonb_build_object(
    'responseId', v_response.id,
    'status', v_status,
    'invalidReason', v_reason,
    'creditsAwarded', v_awarded,
    'elapsedSeconds', v_elapsed
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public gateways. Business rules stay in private.
-- ---------------------------------------------------------------------------

create or replace function public.save_survey(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return private.save_survey(auth.uid(), p_payload);
end;
$$;

create or replace function public.delete_draft(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  perform private.delete_draft(auth.uid(), p_survey_id);
end;
$$;

create or replace function public.raise_cap(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return private.raise_cap(auth.uid(), p_survey_id);
end;
$$;

create or replace function public.promote_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return private.promote_survey(auth.uid(), p_survey_id);
end;
$$;

create or replace function public.close_survey(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  perform private.close_survey(auth.uid(), p_survey_id);
end;
$$;

create or replace function public.get_own_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return private.get_own_survey(auth.uid(), p_survey_id);
end;
$$;

create or replace function public.start_response(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return private.start_response(auth.uid(), p_survey_id);
end;
$$;

create or replace function public.submit_response(p_survey_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return private.submit_response(auth.uid(), p_survey_id, p_answers);
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.spend_credits(uuid, int, text, uuid) from public, anon, authenticated;
revoke all on function private.save_survey(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.delete_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function private.raise_cap(uuid, uuid) from public, anon, authenticated;
revoke all on function private.promote_survey(uuid, uuid) from public, anon, authenticated;
revoke all on function private.close_survey(uuid, uuid) from public, anon, authenticated;
revoke all on function private.get_own_survey(uuid, uuid) from public, anon, authenticated;
revoke all on function private.start_response(uuid, uuid) from public, anon, authenticated;
revoke all on function private.submit_response(uuid, uuid, jsonb) from public, anon, authenticated;

revoke all on function public.save_survey(jsonb) from public, anon;
revoke all on function public.delete_draft(uuid) from public, anon;
revoke all on function public.raise_cap(uuid) from public, anon;
revoke all on function public.promote_survey(uuid) from public, anon;
revoke all on function public.close_survey(uuid) from public, anon;
revoke all on function public.get_own_survey(uuid) from public, anon;
revoke all on function public.start_response(uuid) from public, anon;
revoke all on function public.submit_response(uuid, jsonb) from public, anon;

grant execute on function public.save_survey(jsonb) to authenticated;
grant execute on function public.delete_draft(uuid) to authenticated;
grant execute on function public.raise_cap(uuid) to authenticated;
grant execute on function public.promote_survey(uuid) to authenticated;
grant execute on function public.close_survey(uuid) to authenticated;
grant execute on function public.get_own_survey(uuid) to authenticated;
grant execute on function public.start_response(uuid) to authenticated;
grant execute on function public.submit_response(uuid, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
    grant execute on function private.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on table public.product_rules from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.surveys from public, anon, authenticated;
revoke all on table public.questions from public, anon, authenticated;
revoke all on table public.responses from public, anon, authenticated;
revoke all on table public.answers from public, anon, authenticated;
revoke all on table public.credit_ledger from public, anon, authenticated;
revoke all on table public.survey_bookmarks from public, anon, authenticated;

grant select on table public.product_rules to anon, authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.surveys to authenticated;
grant select on table public.questions to authenticated;
grant select on table public.responses to authenticated;
grant select on table public.answers to authenticated;
grant select on table public.credit_ledger to authenticated;
grant select, insert, delete on table public.survey_bookmarks to authenticated;

alter table public.product_rules enable row level security;
alter table public.profiles enable row level security;
alter table public.surveys enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;
alter table public.answers enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.survey_bookmarks enable row level security;
alter table private.screening_keys enable row level security;

create policy product_rules_read on public.product_rules
  for select to anon, authenticated
  using (true);

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy surveys_select_visible on public.surveys
  for select to authenticated
  using (
    status = 'open'
    or owner_id = (select auth.uid())
  );

create policy questions_select_visible on public.questions
  for select to authenticated
  using (
    exists (
      select 1 from public.surveys s
      where s.id = questions.survey_id
        and (s.status = 'open' or s.owner_id = (select auth.uid()))
    )
  );

create policy responses_select_participant on public.responses
  for select to authenticated
  using (
    respondent_id = (select auth.uid())
    or exists (
      select 1 from public.surveys s
      where s.id = responses.survey_id
        and s.owner_id = (select auth.uid())
    )
  );

create policy answers_select_participant on public.answers
  for select to authenticated
  using (
    exists (
      select 1
      from public.responses r
      join public.surveys s on s.id = r.survey_id
      where r.id = answers.response_id
        and (
          r.respondent_id = (select auth.uid())
          or s.owner_id = (select auth.uid())
        )
    )
  );

create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy bookmarks_select_own on public.survey_bookmarks
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy bookmarks_insert_own on public.survey_bookmarks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.surveys s
      where s.id = survey_id
        and (s.status = 'open' or s.owner_id = (select auth.uid()))
    )
  );

create policy bookmarks_delete_own on public.survey_bookmarks
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- No policies on private.screening_keys: default deny for API roles.
-- Security definer functions bypass RLS as the table owner.

insert into public.profiles (id, display_name, avatar_url, credit_balance, free_creates_remaining)
select
  u.id,
  left(coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Student'
  ), 80),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(u.raw_user_meta_data ->> 'picture', '')
  ),
  0,
  (select free_create_quota from public.product_rules where id = 1)
from auth.users u
on conflict (id) do nothing;

notify pgrst, 'reload schema';
