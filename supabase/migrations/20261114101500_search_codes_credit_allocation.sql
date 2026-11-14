-- Search codes, credit allocation, and per-survey minimum time.
--
-- Does not rewrite the init migration. Privileged logic stays in `private`.
-- Public functions remain thin SECURITY DEFINER gateways with search_path = ''
-- that pass auth.uid() into private functions.
--
-- Credit model (replaces the flat publish fee, free-create quota, and
-- "8 credits raises the cap by 10"):
--   cost per response = ceil(question_count / questions_per_credit)
--   response cap      = floor(credits_allocated / cost per response)
--   valid completion earns that same cost; invalid responses earn 0
--
-- Existing data:
--   * Profiles with a 0 balance are granted starting_credits once, through
--     credit_ledger (reason signup_grant). Non-zero balances are left alone.
--   * Open and closed surveys keep their current response cap. credits_allocated
--     is set to cap * cost so the new formula reproduces that cap. Owners are
--     not charged again, and no spend row is invented for the old free cap.
--   * Drafts are unfunded: credits_allocated = 0 and response_cap = 0.
--   * Existing minimum times were the global 120 seconds. They are kept when
--     question_count * 20 allows it, and clamped down to that cap otherwise.
--   * Every survey receives a unique 6-character search code.

-- ---------------------------------------------------------------------------
-- Product rules
-- ---------------------------------------------------------------------------

alter table public.product_rules
  add column starting_credits int not null default 10 check (starting_credits >= 0),
  add column questions_per_credit int not null default 10 check (questions_per_credit > 0),
  add column min_seconds_per_question int not null default 20 check (min_seconds_per_question > 0),
  add column default_min_completion_seconds int not null default 60 check (default_min_completion_seconds >= 0);

update public.product_rules
set starting_credits = 10,
    questions_per_credit = 10,
    min_seconds_per_question = 20,
    default_min_completion_seconds = 60,
    promote_cost = 12,
    promote_days = 7
where id = 1;

alter table public.product_rules
  drop column default_response_cap,
  drop column reward_per_valid,
  drop column raise_cap_step,
  drop column raise_cap_cost,
  drop column extra_survey_cost,
  drop column free_create_quota,
  drop column min_completion_seconds;

comment on table public.product_rules is
  'Live rules. 1 credit covers questions_per_credit questions. A survey minimum time cannot exceed question_count * min_seconds_per_question. The create form defaults to default_min_completion_seconds when that fits under the cap.';

-- ---------------------------------------------------------------------------
-- Profiles: one starting grant, no free-publish quota
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start int;
  v_name text;
  v_inserted int;
begin
  select starting_credits into v_start
  from public.product_rules
  where id = 1;

  if v_start is null or v_start < 0 then
    v_start := 10;
  end if;

  v_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Student'
  ), 80);

  insert into public.profiles (id, display_name, avatar_url, credit_balance)
  values (
    new.id,
    v_name,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    ),
    v_start
  )
  on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return new;
  end if;

  if v_start > 0 then
    insert into public.credit_ledger (user_id, amount, balance_after, reason)
    values (new.id, v_start, v_start, 'signup_grant');
  end if;

  return new;
end;
$$;

alter table public.profiles drop column free_creates_remaining;
alter table public.profiles alter column credit_balance set default 10;

-- ---------------------------------------------------------------------------
-- Surveys: search code, allocated credits, per-survey minimum time
-- ---------------------------------------------------------------------------

alter table public.surveys
  add column search_code text,
  add column credits_allocated int not null default 0 check (credits_allocated >= 0),
  add column min_completion_seconds int not null default 60 check (min_completion_seconds >= 0);

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = any (con.conkey)
  where con.conrelid = 'public.surveys'::regclass
    and con.contype = 'c'
    and att.attname = 'response_cap'
    and pg_get_constraintdef(con.oid) ilike '%response_cap > 0%';

  if v_name is not null then
    execute format('alter table public.surveys drop constraint %I', v_name);
  end if;
end $$;

alter table public.surveys
  add constraint surveys_response_cap_nonnegative check (response_cap >= 0);

comment on column public.surveys.search_code is
  'Unique public code assigned when the survey row is created. Typed on Browse to find the survey.';
comment on column public.surveys.credits_allocated is
  'Credits the owner has put on this survey. Cap = floor(credits_allocated / ceil(question_count / questions_per_credit)).';
comment on column public.surveys.min_completion_seconds is
  'Owner-chosen minimum. A response is too_fast only when elapsed seconds are strictly below this value.';

-- ---------------------------------------------------------------------------
-- Ledger reasons. Historical rows keep their old reasons.
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = any (con.conkey)
  where con.conrelid = 'public.credit_ledger'::regclass
    and con.contype = 'c'
    and att.attname = 'reason';

  if v_name is not null then
    execute format('alter table public.credit_ledger drop constraint %I', v_name);
  end if;
end $$;

alter table public.credit_ledger
  add constraint credit_ledger_reason_check
  check (reason in (
    'survey_completion',
    'raise_cap',
    'promote',
    'create_survey',
    'signup_grant',
    'fund_survey'
  ));

-- The new signup trigger inserts signup_grant, so the reason must be legal
-- before any later user insert. The check above is already in place.
-- Backfill of existing zero balances happens after helper functions exist,
-- once survey columns are populated. See the backfill block further down.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.credit_unit(p_questions int, p_per_credit int)
returns int
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_per_credit is null or p_per_credit < 1 then 1
    when p_questions is null or p_questions < 1 then 1
    else ceil(p_questions::numeric / p_per_credit)::int
  end
$$;

create or replace function private.generate_search_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * char_length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.surveys where search_code = v_code
    );
    if v_attempt >= 25 then
      raise exception 'Could not assign a search code';
    end if;
  end loop;
  return v_code;
end;
$$;

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

  if p_reason not in ('fund_survey', 'promote') then
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

-- ---------------------------------------------------------------------------
-- Backfill surveys, then require a search code
-- ---------------------------------------------------------------------------

do $$
declare
  v_id uuid;
  v_per int;
  v_seconds int;
begin
  select questions_per_credit, min_seconds_per_question
  into v_per, v_seconds
  from public.product_rules
  where id = 1;

  update public.surveys s
  set credits_allocated = s.response_cap * private.credit_unit(
        (select count(*)::int from public.questions q where q.survey_id = s.id),
        v_per
      ),
      min_completion_seconds = least(
        120,
        (select count(*)::int from public.questions q where q.survey_id = s.id) * v_seconds
      )
  where s.status in ('open', 'closed');

  update public.surveys as draft_survey
  set credits_allocated = 0,
      response_cap = 0,
      min_completion_seconds = least(
        120,
        (select count(*)::int from public.questions q where q.survey_id = draft_survey.id) * v_seconds
      )
  where draft_survey.status = 'draft';

  for v_id in select id from public.surveys where search_code is null loop
    update public.surveys
    set search_code = private.generate_search_code()
    where id = v_id
      and search_code is null;
  end loop;
end $$;

alter table public.surveys alter column search_code set not null;

alter table public.surveys
  add constraint surveys_search_code_format_check
  check (search_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$');

alter table public.surveys
  add constraint surveys_published_cap_check
  check (status = 'draft' or response_cap > 0);

alter table public.surveys
  add constraint surveys_tags_count_check
  check (cardinality(tags) <= 5);

create unique index surveys_search_code_key on public.surveys (search_code);
create index surveys_tags_gin on public.surveys using gin (tags);

-- ---------------------------------------------------------------------------
-- Backfill testers who still have a 0 balance. One ledger row each.
-- Profiles that already hold credits are not topped up.
-- ---------------------------------------------------------------------------

do $$
declare
  v_start int;
begin
  select starting_credits into v_start
  from public.product_rules
  where id = 1;

  if v_start is null or v_start < 0 then
    v_start := 10;
  end if;

  insert into public.credit_ledger (user_id, amount, balance_after, reason)
  select p.id, v_start, v_start, 'signup_grant'
  from public.profiles p
  where p.credit_balance = 0
    and v_start > 0;

  update public.profiles
  set credit_balance = v_start
  where credit_balance = 0
    and v_start > 0;
end $$;

-- ---------------------------------------------------------------------------
-- save_survey: allocate credits on publish, store min time, assign a code
-- ---------------------------------------------------------------------------

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
  v_estimated int;
  v_n int;
  v_tag text;
  v_clean_tags text[] := '{}';
  v_seen text[] := '{}';
  v_balance int;
  v_drafts int;
  v_min_seconds int;
  v_max_min int;
  v_credits int := 0;
  v_unit int;
  v_cap int := 0;
  v_allocated int := 0;
  v_code text;
  v_attempt int;
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

  v_max_min := v_n * v_cfg.min_seconds_per_question;
  if coalesce(p_payload ->> 'minCompletionSeconds', '') = '' then
    v_min_seconds := least(v_cfg.default_min_completion_seconds, v_max_min);
  else
    if p_payload ->> 'minCompletionSeconds' !~ '^[0-9]+$' then
      raise exception 'Minimum time must be a whole number of seconds';
    end if;
    v_min_seconds := (p_payload ->> 'minCompletionSeconds')::int;
  end if;

  if v_min_seconds > v_max_min then
    raise exception 'Minimum time cannot exceed % seconds for % %',
      v_max_min,
      v_n,
      case when v_n = 1 then 'question' else 'questions' end;
  end if;

  v_unit := private.credit_unit(v_n, v_cfg.questions_per_credit);
  if v_publish then
    if coalesce(p_payload ->> 'creditsToAllocate', '') !~ '^[0-9]+$' then
      raise exception 'Enter a whole number of credits to allocate';
    end if;
    v_credits := (p_payload ->> 'creditsToAllocate')::int;
    if v_credits < v_unit then
      raise exception 'Allocate at least % % so one person can respond',
        v_unit, case when v_unit = 1 then 'credit' else 'credits' end;
    end if;
    v_cap := floor(v_credits::numeric / v_unit)::int;
    if v_cap < 1 then
      raise exception 'Allocate enough credits for at least one response';
    end if;
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

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Profile not found';
  end if;

  v_estimated := greatest(1, ceil(v_n::numeric / 2.0))::int;

  if v_id is null then
    select count(*) into v_drafts
    from public.surveys
    where owner_id = p_user and status = 'draft';

    if v_drafts >= 10 then
      raise exception 'You already have 10 drafts. Publish or delete one first.';
    end if;

    v_attempt := 0;
    loop
      v_attempt := v_attempt + 1;
      begin
        v_code := private.generate_search_code();
        insert into public.surveys (
          owner_id, title, description, tags, status, response_cap, estimated_minutes,
          search_code, credits_allocated, min_completion_seconds
        ) values (
          p_user, v_title, v_description, v_clean_tags, 'draft', 0, v_estimated,
          v_code, 0, v_min_seconds
        )
        returning id into v_id;
        exit;
      exception
        when unique_violation then
          if v_attempt >= 8 then
            raise exception 'Could not assign a search code';
          end if;
      end;
    end loop;
  else
    update public.surveys
    set title = v_title,
        description = v_description,
        tags = v_clean_tags,
        estimated_minutes = v_estimated,
        min_completion_seconds = v_min_seconds
    where id = v_id
    returning search_code into v_code;

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
    v_balance := private.spend_credits(p_user, v_credits, 'fund_survey', v_id);
    v_allocated := v_credits;
    update public.surveys
    set status = 'open',
        published_at = coalesce(published_at, now()),
        credits_allocated = v_allocated,
        response_cap = v_cap
    where id = v_id;
  else
    select credit_balance into v_balance from public.profiles where id = p_user;
    select response_cap, credits_allocated into v_cap, v_allocated
    from public.surveys where id = v_id;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_publish then 'open' else 'draft' end,
    'creditBalance', v_balance,
    'searchCode', v_code,
    'responseCap', v_cap,
    'creditsAllocated', v_allocated,
    'minCompletionSeconds', v_min_seconds
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Add credits to an open survey. Replaces the flat raise-cap purchase.
-- ---------------------------------------------------------------------------

create or replace function private.fund_survey(p_user uuid, p_survey uuid, p_credits int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
  v_cfg public.product_rules%rowtype;
  v_questions int;
  v_unit int;
  v_remainder int;
  v_need int;
  v_new_allocated int;
  v_new_cap int;
  v_balance int;
begin
  if p_user is null then
    raise exception 'Not signed in';
  end if;

  if p_credits is null or p_credits <= 0 then
    raise exception 'Add at least 1 credit';
  end if;

  select * into v_survey from public.surveys where id = p_survey for update;
  if not found or v_survey.owner_id <> p_user then
    raise exception 'Survey not found';
  end if;
  if v_survey.status <> 'open' then
    raise exception 'Only an open survey can receive more credits';
  end if;

  select * into v_cfg from public.product_rules where id = 1;
  if not found then
    raise exception 'Product rules are not configured';
  end if;

  select count(*)::int into v_questions from public.questions where survey_id = p_survey;
  v_unit := private.credit_unit(v_questions, v_cfg.questions_per_credit);
  v_remainder := v_survey.credits_allocated % v_unit;
  v_need := case when v_remainder = 0 then v_unit else v_unit - v_remainder end;

  if p_credits < v_need then
    raise exception 'Add at least % % to fund another response',
      v_need, case when v_need = 1 then 'credit' else 'credits' end;
  end if;

  v_new_allocated := v_survey.credits_allocated + p_credits;
  v_new_cap := floor(v_new_allocated::numeric / v_unit)::int;
  if v_new_cap <= v_survey.response_cap then
    raise exception 'Add at least % % to fund another response',
      v_need, case when v_need = 1 then 'credit' else 'credits' end;
  end if;

  v_balance := private.spend_credits(p_user, p_credits, 'fund_survey', p_survey);

  update public.surveys
  set credits_allocated = v_new_allocated,
      response_cap = v_new_cap
  where id = p_survey;

  return jsonb_build_object(
    'responseCap', v_new_cap,
    'creditsAllocated', v_new_allocated,
    'creditBalance', v_balance
  );
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
    'searchCode', s.search_code,
    'responseCap', s.response_cap,
    'responseCount', s.response_count,
    'creditsAllocated', s.credits_allocated,
    'minCompletionSeconds', s.min_completion_seconds,
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

-- ---------------------------------------------------------------------------
-- Submit uses this survey's minimum time and pays ceil(questions / 10).
-- started_at is still set once in start_response and is not rewritten here.
-- elapsed = floor(extract(epoch from (now() - started_at))).
-- too_fast only when elapsed is strictly below the survey minimum.
-- ---------------------------------------------------------------------------

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
  v_question_count int := 0;
  v_unit int;
begin
  if p_user is null then
    raise exception 'Not signed in';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers are missing';
  end if;

  select * into v_cfg from public.product_rules where id = 1;
  if not found then
    raise exception 'Product rules are not configured';
  end if;

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
    v_question_count := v_question_count + 1;

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
  v_too_fast := v_elapsed < v_survey.min_completion_seconds;

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

  v_unit := private.credit_unit(v_question_count, v_cfg.questions_per_credit);

  if v_status = 'valid' then
    select credit_balance into v_balance
    from public.profiles
    where id = p_user
    for update;

    update public.profiles
    set credit_balance = credit_balance + v_unit
    where id = p_user
    returning credit_balance into v_balance;

    insert into public.credit_ledger (
      user_id, amount, balance_after, reason, survey_id, response_id
    ) values (
      p_user, v_unit, v_balance, 'survey_completion', p_survey, v_response.id
    );

    v_awarded := v_unit;
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
-- Public gateways
-- ---------------------------------------------------------------------------

create or replace function public.fund_survey(p_survey_id uuid, p_credits int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return private.fund_survey(auth.uid(), p_survey_id, p_credits);
end;
$$;

drop function if exists public.raise_cap(uuid);
drop function if exists private.raise_cap(uuid, uuid);

revoke all on function private.credit_unit(int, int) from public, anon, authenticated;
revoke all on function private.generate_search_code() from public, anon, authenticated;
revoke all on function private.spend_credits(uuid, int, text, uuid) from public, anon, authenticated;
revoke all on function private.save_survey(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.fund_survey(uuid, uuid, int) from public, anon, authenticated;
revoke all on function private.get_own_survey(uuid, uuid) from public, anon, authenticated;
revoke all on function private.submit_response(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

revoke all on function public.fund_survey(uuid, int) from public, anon;
grant execute on function public.fund_survey(uuid, int) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
    grant execute on function private.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

notify pgrst, 'reload schema';
