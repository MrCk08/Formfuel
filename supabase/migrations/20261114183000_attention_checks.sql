-- One automatic quality check per response.
--
-- The question is not stored in public.questions, so it does not change the
-- creator question count, the credit cost, the 20-question cap, or the minimum
-- completion time. The correct answer stays in the private schema. A wrong or
-- missing answer is saved as failed_screening (or combined with too_fast) and
-- earns 0 credits. The pool matches lib/attention.ts.

alter table public.responses
  add column attention_passed boolean;

comment on column public.responses.attention_passed is
  'Whether the respondent passed the automatic quality check. Null until submit. The correct answer is not stored here.';

create table private.response_attention (
  response_id uuid primary key references public.responses (id) on delete cascade,
  position int not null check (position >= 0),
  prompt text not null check (char_length(prompt) between 3 and 280),
  options text[] not null check (cardinality(options) = 4),
  correct_index int not null check (correct_index between 0 and 3),
  selected_index int check (selected_index is null or selected_index between 0 and 3)
);

comment on table private.response_attention is
  'The quality check shown to one respondent. Not exposed through the Data API.';

revoke all on table private.response_attention from public, anon, authenticated;

create or replace function private.attention_item(p_index int)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_index
    when 0 then jsonb_build_object(
      'prompt', 'Quality Check: To verify you are reading carefully, please select ''Verified'' below.',
      'options', jsonb_build_array('Skipped', 'Verified', 'Random', 'None'),
      'correctIndex', 1
    )
    when 1 then jsonb_build_object(
      'prompt', 'Quality Check: To show you are reading each question, please select the color Blue.',
      'options', jsonb_build_array('Red', 'Blue', 'Green', 'Yellow'),
      'correctIndex', 1
    )
    when 2 then jsonb_build_object(
      'prompt', 'Quality Check: Please select Wednesday to confirm you are paying attention.',
      'options', jsonb_build_array('Monday', 'Wednesday', 'Friday', 'Sunday'),
      'correctIndex', 1
    )
    when 3 then jsonb_build_object(
      'prompt', 'Quality Check: Select the number 7 below.',
      'options', jsonb_build_array('3', '5', '7', '9'),
      'correctIndex', 2
    )
    when 4 then jsonb_build_object(
      'prompt', 'Quality Check: If you have read this question, please select ''I understand''.',
      'options', jsonb_build_array('Skip this', 'I understand', 'Not sure', 'Leave blank'),
      'correctIndex', 1
    )
    else null
  end;
$$;

create or replace function private.ensure_attention(p_response uuid, p_survey uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
  v_item jsonb;
  v_options text[];
begin
  if exists (select 1 from private.response_attention where response_id = p_response) then
    return;
  end if;

  select count(*)::int into v_n from public.questions where survey_id = p_survey;
  if v_n < 1 then
    raise exception 'This survey has no questions';
  end if;

  v_item := private.attention_item(floor(random() * 5)::int);
  if v_item is null then
    raise exception 'Quality check pool is not configured';
  end if;

  select coalesce(array_agg(item order by ord), array[]::text[])
  into v_options
  from jsonb_array_elements_text(v_item -> 'options') with ordinality as picked(item, ord);

  insert into private.response_attention (response_id, position, prompt, options, correct_index)
  values (
    p_response,
    floor(random() * (v_n + 1))::int,
    v_item ->> 'prompt',
    v_options,
    (v_item ->> 'correctIndex')::int
  );
end;
$$;

create or replace function private.attention_for_client(p_response uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', 'attention',
    'position', position,
    'kind', 'single',
    'prompt', prompt,
    'options', to_jsonb(options)
  )
  from private.response_attention
  where response_id = p_response;
$$;

-- Same clock rules as before. started_at is set once and is not rewritten.
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

  perform private.ensure_attention(v_response.id, p_survey);

  return jsonb_build_object(
    'state', 'in_progress',
    'startedAt', v_response.started_at,
    'status', 'in_progress',
    'invalidReason', null,
    'creditsAwarded', 0,
    'attentionCheck', private.attention_for_client(v_response.id)
  );
end;
$$;

do $$
declare
  v_index int;
  v_item jsonb;
begin
  for v_index in 0..4 loop
    v_item := private.attention_item(v_index);
    if v_item is null or jsonb_array_length(v_item -> 'options') <> 4 then
      raise exception 'Quality check % is incomplete', v_index;
    end if;
    if (v_item ->> 'correctIndex')::int < 0 or (v_item ->> 'correctIndex')::int > 3 then
      raise exception 'Quality check % has no usable answer', v_index;
    end if;
    if (v_item -> 'options' -> (v_item ->> 'correctIndex')::int) is null then
      raise exception 'Quality check % answer is outside the options', v_index;
    end if;
  end loop;
  if private.attention_item(5) is not null then
    raise exception 'The quality check pool should contain 5 questions';
  end if;
end $$;

-- A wrong or missing quality check is failed_screening. It is saved and uses a
-- slot. Creator validation failures still raise before this grading runs.

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
  v_attention private.response_attention%rowtype;
  v_attention_failed boolean := true;
  v_selected int;
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
      or (
        value ->> 'questionId' is distinct from 'attention'
        and not exists (
          select 1 from public.questions q
          where q.survey_id = p_survey and q.id::text = value ->> 'questionId'
        )
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

    v_value := private.normalize_answer(v_question, v_answer);
    v_this_failed := false;

    if v_question.kind in ('single', 'multiple') then
      select coalesce(array_agg(item::int order by item::int), array[]::int[])
      into v_indexes
      from jsonb_array_elements_text(coalesce(v_value -> 'optionIndexes', '[]'::jsonb)) as item;

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

  select * into v_attention
  from private.response_attention
  where response_id = v_response.id;
  if not found then
    raise exception 'Start the survey before submitting';
  end if;

  select count(*) into v_match_count
  from jsonb_array_elements(p_answers) as value
  where value ->> 'questionId' = 'attention';
  if v_match_count > 1 then
    raise exception 'Please answer every question once';
  end if;

  if v_match_count = 1 then
    select value into v_answer
    from jsonb_array_elements(p_answers) as value
    where value ->> 'questionId' = 'attention'
    limit 1;

    if jsonb_typeof(v_answer -> 'optionIndexes') = 'array'
      and jsonb_array_length(v_answer -> 'optionIndexes') = 1
    then
      v_text := v_answer -> 'optionIndexes' ->> 0;
      if v_text ~ '^[0-3]$' then
        v_selected := v_text::int;
        v_attention_failed := v_selected is distinct from v_attention.correct_index;
      end if;
    end if;
  end if;

  update private.response_attention
  set selected_index = v_selected
  where response_id = v_response.id;

  if v_attention_failed then
    v_failed := true;
  end if;

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
      submitted_at = now(),
      attention_passed = not v_attention_failed
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

revoke all on function private.attention_item(int) from public, anon, authenticated;
revoke all on function private.ensure_attention(uuid, uuid) from public, anon, authenticated;
revoke all on function private.attention_for_client(uuid) from public, anon, authenticated;
revoke all on function private.start_response(uuid, uuid) from public, anon, authenticated;
revoke all on function private.submit_response(uuid, uuid, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
