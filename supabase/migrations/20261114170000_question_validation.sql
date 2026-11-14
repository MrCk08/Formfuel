-- Creator-defined data validation on questions.
--
-- Null validation keeps the previous rules: every answer is required, short
-- answers are 1–500 characters, and multiple choice needs at least one
-- selection. A failed creator check rejects the submission, so no response row
-- is completed, no cap slot is consumed, and no credits are awarded.
-- Screening, search codes, credit allocation, promotion, and minimum
-- completion time are unchanged.
--
-- The decisions here match lib/validation.ts. Keep the messages together.

alter table public.questions
  add column validation jsonb;

alter table public.questions
  add constraint questions_validation_is_object
  check (validation is null or jsonb_typeof(validation) = 'object');

comment on column public.questions.validation is
  'Creator checks. Null keeps legacy behavior: required, short answers 1–500 characters, multiple choice at least one selection.';

-- ---------------------------------------------------------------------------
-- Safe custom patterns. Rejects invalid syntax, non-portable escapes, nested
-- repeats, and quantified alternation before the database ever runs the match.
-- ---------------------------------------------------------------------------

create or replace function private.regex_is_safe(p_pattern text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_len int;
  v_i int := 1;
  v_ch text;
  v_next text;
  v_depth int := 0;
  v_in_class boolean := false;
  v_class_start boolean := false;
  v_last text := 'none';
  v_quantifiers int := 0;
  v_atom_is_group boolean := false;
  v_closed_alt boolean := false;
  v_group_alt boolean[] := array[false, false, false, false];
  v_safe constant text := 'dDwWsSntrfv.*+?()[]{}|^$-/' || chr(92);
  v_body text;
  v_rel int;
  v_lower int;
  v_upper int;
  v_comma int;
begin
  if p_pattern is null or btrim(p_pattern) = '' or char_length(p_pattern) > 120 then
    return false;
  end if;
  if p_pattern ~ '[[:cntrl:]]' or p_pattern ~ '\(\?' then
    return false;
  end if;
  v_group_alt[0] := false;

  v_len := char_length(p_pattern);
  while v_i <= v_len loop
    v_ch := substr(p_pattern, v_i, 1);

    if v_in_class then
      if v_ch = '\' then
        if v_i >= v_len then
          return false;
        end if;
        v_next := substr(p_pattern, v_i + 1, 1);
        if position(v_next in v_safe) = 0 then
          return false;
        end if;
        v_i := v_i + 2;
        v_class_start := false;
        continue;
      end if;
      if v_ch = ']' and not v_class_start then
        v_in_class := false;
        v_last := 'atom';
        v_atom_is_group := false;
      end if;
      v_class_start := false;
      v_i := v_i + 1;
      continue;
    end if;

    if v_ch = '\' then
      if v_i >= v_len then
        return false;
      end if;
      v_next := substr(p_pattern, v_i + 1, 1);
      if position(v_next in v_safe) = 0 then
        return false;
      end if;
      v_i := v_i + 2;
      v_last := 'atom';
      v_atom_is_group := false;
      continue;
    end if;

    if v_ch = '[' then
      v_in_class := true;
      v_class_start := true;
      v_i := v_i + 1;
      continue;
    end if;

    if v_ch = '(' then
      v_depth := v_depth + 1;
      if v_depth > 3 then
        return false;
      end if;
      v_group_alt[v_depth] := false;
      v_last := 'none';
      v_atom_is_group := false;
      v_i := v_i + 1;
      continue;
    end if;

    if v_ch = ')' then
      if v_depth < 1 then
        return false;
      end if;
      v_closed_alt := coalesce(v_group_alt[v_depth], false);
      v_group_alt[v_depth] := false;
      v_depth := v_depth - 1;
      v_last := 'atom';
      v_atom_is_group := true;
      v_i := v_i + 1;
      continue;
    end if;

    if v_ch = '|' then
      v_group_alt[v_depth] := true;
      v_last := 'none';
      v_atom_is_group := false;
      v_i := v_i + 1;
      continue;
    end if;

    if v_ch in ('^', '$') then
      v_last := 'none';
      v_atom_is_group := false;
      v_i := v_i + 1;
      continue;
    end if;

    if v_ch in ('*', '+', '?', '{') then
      if v_ch = '?' and v_last = 'quant' then
        v_i := v_i + 1;
        continue;
      end if;
      if v_depth > 0 or v_last <> 'atom' then
        return false;
      end if;
      if v_atom_is_group and v_closed_alt then
        return false;
      end if;
      if v_ch = '{' then
        v_rel := position('}' in substr(p_pattern, v_i + 1));
        if v_rel = 0 then
          return false;
        end if;
        v_body := substr(p_pattern, v_i + 1, v_rel - 1);
        if v_body !~ '^[0-9]{1,2}(,[0-9]{0,2})?$' then
          return false;
        end if;
        v_comma := position(',' in v_body);
        if v_comma = 0 then
          v_lower := v_body::int;
          if v_lower > 40 then
            return false;
          end if;
        else
          v_lower := substr(v_body, 1, v_comma - 1)::int;
          if v_lower > 40 then
            return false;
          end if;
          if v_comma < char_length(v_body) then
            v_upper := substr(v_body, v_comma + 1)::int;
            if v_upper > 40 or v_upper < v_lower then
              return false;
            end if;
          end if;
        end if;
        v_i := v_i + v_rel + 1;
      else
        v_i := v_i + 1;
      end if;
      v_quantifiers := v_quantifiers + 1;
      if v_quantifiers > 8 then
        return false;
      end if;
      v_last := 'quant';
      v_atom_is_group := false;
      continue;
    end if;

    if v_ch in (']', '}') then
      return false;
    end if;

    v_last := 'atom';
    v_atom_is_group := false;
    v_i := v_i + 1;
  end loop;

  if v_in_class or v_depth <> 0 then
    return false;
  end if;

  begin
    perform '' ~ p_pattern;
  exception
    when others then
      return false;
  end;

  return true;
end;
$$;

create or replace function private.is_http_url(p_text text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rest text;
  v_hostport text;
  v_host text;
  v_port text;
  v_cut int;
  v_colon int;
  v_tld text;
begin
  if p_text is null or char_length(p_text) = 0 or char_length(p_text) > 500 then
    return false;
  end if;
  if left(lower(p_text), 8) = 'https://' then
    v_rest := substr(p_text, 9);
  elsif left(lower(p_text), 7) = 'http://' then
    v_rest := substr(p_text, 8);
  else
    return false;
  end if;
  if v_rest = '' or v_rest ~ '[[:space:]]' then
    return false;
  end if;

  v_cut := char_length(v_rest) + 1;
  if position('/' in v_rest) > 0 then
    v_cut := least(v_cut, position('/' in v_rest));
  end if;
  if position('?' in v_rest) > 0 then
    v_cut := least(v_cut, position('?' in v_rest));
  end if;
  if position('#' in v_rest) > 0 then
    v_cut := least(v_cut, position('#' in v_rest));
  end if;
  v_hostport := substr(v_rest, 1, v_cut - 1);
  if v_hostport = '' or position('.' in v_hostport) = 0 then
    return false;
  end if;

  v_host := v_hostport;
  v_colon := position(':' in v_hostport);
  if v_colon > 0 then
    if position(':' in substr(v_hostport, v_colon + 1)) > 0 then
      return false;
    end if;
    v_port := substr(v_hostport, v_colon + 1);
    if v_port !~ '^[0-9]{1,5}$' or v_port::int < 1 or v_port::int > 65535 then
      return false;
    end if;
    v_host := substr(v_hostport, 1, v_colon - 1);
  end if;

  if v_host !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' then
    return false;
  end if;
  v_tld := regexp_replace(v_host, '^.*\.', '');
  return v_tld ~ '^[A-Za-z]{2,}$';
end;
$$;

create or replace function private.validation_message(p_rules jsonb, p_check text, p_detail text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_check
    when 'presence' then 'Presence Check Failed: '
    when 'length' then 'Length Check Failed: '
    when 'format' then 'Format Check Failed: '
    when 'range' then 'Range Check Failed: '
    when 'selection' then 'Selection Range Check Failed: '
    else 'Validation failed: '
  end || coalesce(nullif(btrim(coalesce(p_rules ->> 'errorMessage', '')), ''), p_detail);
$$;

create or replace function private.range_detail(p_rules jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_rules -> 'minValue') = 'number' and jsonb_typeof(p_rules -> 'maxValue') = 'number'
      then format('Enter a number between %s and %s', p_rules ->> 'minValue', p_rules ->> 'maxValue')
    when jsonb_typeof(p_rules -> 'minValue') = 'number'
      then format('Enter a number of at least %s', p_rules ->> 'minValue')
    else format('Enter a number of at most %s', p_rules ->> 'maxValue')
  end;
$$;

create or replace function private.clean_question_validation(
  p_kind text,
  p_option_count int,
  p_screening boolean,
  p_raw jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_required boolean := true;
  v_error text;
  v_min_length int;
  v_max_length int;
  v_format text := 'none';
  v_regex text;
  v_min_value numeric;
  v_max_value numeric;
  v_has boolean := false;
  v_result jsonb;
begin
  if p_raw is null or jsonb_typeof(p_raw) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_raw) <> 'object' then
    raise exception 'Validation rules must be an object.';
  end if;
  if octet_length(p_raw::text) > 2000 then
    raise exception 'Validation rules are too large.';
  end if;

  if p_raw ? 'required' and jsonb_typeof(p_raw -> 'required') <> 'null' then
    if jsonb_typeof(p_raw -> 'required') <> 'boolean' then
      raise exception 'Presence check must be true or false.';
    end if;
    v_required := (p_raw ->> 'required')::boolean;
  end if;
  if p_screening and not v_required then
    raise exception 'Screening questions must stay required.';
  end if;

  if p_raw ? 'errorMessage' and jsonb_typeof(p_raw -> 'errorMessage') <> 'null' then
    if jsonb_typeof(p_raw -> 'errorMessage') <> 'string' then
      raise exception 'Custom error messages must be text.';
    end if;
    v_error := btrim(p_raw ->> 'errorMessage');
    if v_error = '' then
      v_error := null;
    elsif char_length(v_error) > 160 then
      raise exception 'Custom error messages must be 160 characters or fewer.';
    elsif v_error ~ '[[:cntrl:]]' then
      raise exception 'Custom error messages must be a single line.';
    end if;
  end if;

  if p_kind = 'short' then
    if p_raw ? 'minLength' and jsonb_typeof(p_raw -> 'minLength') <> 'null' then
      if p_raw ->> 'minLength' !~ '^[0-9]+$'
        or (p_raw ->> 'minLength')::int < 1
        or (p_raw ->> 'minLength')::int > 500
      then
        raise exception 'Minimum length must be a whole number from 1 to 500.';
      end if;
      v_min_length := (p_raw ->> 'minLength')::int;
    end if;
    if p_raw ? 'maxLength' and jsonb_typeof(p_raw -> 'maxLength') <> 'null' then
      if p_raw ->> 'maxLength' !~ '^[0-9]+$'
        or (p_raw ->> 'maxLength')::int < 1
        or (p_raw ->> 'maxLength')::int > 500
      then
        raise exception 'Maximum length must be a whole number from 1 to 500.';
      end if;
      v_max_length := (p_raw ->> 'maxLength')::int;
    end if;
    if v_min_length is not null and v_max_length is not null and v_min_length > v_max_length then
      raise exception 'Minimum length cannot be greater than maximum length.';
    end if;

    if p_raw ? 'formatType' and jsonb_typeof(p_raw -> 'formatType') <> 'null' then
      if jsonb_typeof(p_raw -> 'formatType') <> 'string' then
        raise exception 'Unknown format check.';
      end if;
      v_format := p_raw ->> 'formatType';
      if v_format not in ('none', 'email', 'integer', 'decimal', 'alphanumeric', 'hk_phone', 'url', 'custom_regex') then
        raise exception 'Unknown format check.';
      end if;
    end if;

    v_regex := nullif(btrim(coalesce(p_raw ->> 'customRegex', '')), '');
    if v_format = 'custom_regex' then
      if v_regex is null then
        raise exception 'Enter a custom regular expression.';
      end if;
      if char_length(v_regex) > 120 then
        raise exception 'Custom regular expressions must be 120 characters or fewer.';
      end if;
      if not private.regex_is_safe(v_regex) then
        raise exception 'That regular expression is invalid or unsafe.';
      end if;
    elsif v_regex is not null then
      raise exception 'Custom regular expressions are only used with the custom format.';
    end if;

    if p_raw ? 'minValue' and jsonb_typeof(p_raw -> 'minValue') <> 'null' then
      if jsonb_typeof(p_raw -> 'minValue') <> 'number' then
        raise exception 'Range limits must be numbers.';
      end if;
      v_min_value := (p_raw ->> 'minValue')::numeric;
    end if;
    if p_raw ? 'maxValue' and jsonb_typeof(p_raw -> 'maxValue') <> 'null' then
      if jsonb_typeof(p_raw -> 'maxValue') <> 'number' then
        raise exception 'Range limits must be numbers.';
      end if;
      v_max_value := (p_raw ->> 'maxValue')::numeric;
    end if;
    if v_format not in ('integer', 'decimal') and (v_min_value is not null or v_max_value is not null) then
      raise exception 'Range checks apply only when the format is a whole number or a decimal.';
    end if;
    if v_min_value is not null and abs(v_min_value) > 1000000000000
      or v_max_value is not null and abs(v_max_value) > 1000000000000
    then
      raise exception 'Range limits are too large.';
    end if;
    if v_min_value is not null and v_min_value <> trunc(v_min_value, 8)
      or v_max_value is not null and v_max_value <> trunc(v_max_value, 8)
    then
      raise exception 'Range limits can have at most 8 decimal places.';
    end if;
    if v_min_value is not null and v_max_value is not null and v_min_value > v_max_value then
      raise exception 'Minimum value cannot be greater than maximum value.';
    end if;
  elsif (p_raw ? 'minLength' and jsonb_typeof(p_raw -> 'minLength') = 'number')
    or (p_raw ? 'maxLength' and jsonb_typeof(p_raw -> 'maxLength') = 'number')
  then
    raise exception 'Length checks apply only to short answers.';
  elsif (p_raw ? 'formatType' and jsonb_typeof(p_raw -> 'formatType') = 'string' and p_raw ->> 'formatType' not in ('none', ''))
    or nullif(btrim(coalesce(p_raw ->> 'customRegex', '')), '') is not null
  then
    raise exception 'Format checks apply only to short answers.';
  elsif p_kind = 'multiple' then
    if p_raw ? 'minValue' and jsonb_typeof(p_raw -> 'minValue') <> 'null' then
      if p_raw ->> 'minValue' !~ '^[0-9]+$' then
        raise exception 'Selection limits must be whole numbers.';
      end if;
      v_min_value := (p_raw ->> 'minValue')::numeric;
      if v_min_value < 0 or v_min_value > p_option_count then
        raise exception 'Selection limits must be between 0 and the number of options.';
      end if;
    end if;
    if p_raw ? 'maxValue' and jsonb_typeof(p_raw -> 'maxValue') <> 'null' then
      if p_raw ->> 'maxValue' !~ '^[0-9]+$' then
        raise exception 'Selection limits must be whole numbers.';
      end if;
      v_max_value := (p_raw ->> 'maxValue')::numeric;
      if v_max_value < 0 or v_max_value > p_option_count then
        raise exception 'Selection limits must be between 0 and the number of options.';
      end if;
    end if;
    if v_min_value is not null and v_max_value is not null and v_min_value > v_max_value then
      raise exception 'Minimum selections cannot be greater than maximum selections.';
    end if;
    if v_required and v_max_value = 0 then
      raise exception 'A required question needs room for at least 1 selection.';
    end if;
  elsif (p_raw ? 'minValue' and jsonb_typeof(p_raw -> 'minValue') <> 'null')
    or (p_raw ? 'maxValue' and jsonb_typeof(p_raw -> 'maxValue') <> 'null')
  then
    raise exception 'Range checks apply to whole-number, decimal, and multiple-choice questions.';
  end if;

  if not v_required or v_error is not null or v_min_length is not null or v_max_length is not null
    or v_format <> 'none' or v_min_value is not null or v_max_value is not null
  then
    v_has := true;
  end if;
  if not v_has then
    return null;
  end if;

  v_result := jsonb_build_object('required', v_required);
  if v_error is not null then
    v_result := v_result || jsonb_build_object('errorMessage', v_error);
  end if;
  if v_min_length is not null then
    v_result := v_result || jsonb_build_object('minLength', v_min_length);
  end if;
  if v_max_length is not null then
    v_result := v_result || jsonb_build_object('maxLength', v_max_length);
  end if;
  if v_format <> 'none' then
    v_result := v_result || jsonb_build_object('formatType', v_format);
  end if;
  if v_format = 'custom_regex' then
    v_result := v_result || jsonb_build_object('customRegex', v_regex);
  end if;
  if v_min_value is not null then
    v_result := v_result || jsonb_build_object('minValue', p_raw -> 'minValue');
  end if;
  if v_max_value is not null then
    v_result := v_result || jsonb_build_object('maxValue', p_raw -> 'maxValue');
  end if;
  return v_result;
end;
$$;

-- Rejects creator-rule failures. Legacy questions (validation is null) keep
-- the original exception text. Returns the value that should be stored.
create or replace function private.normalize_answer(
  p_question public.questions,
  p_answer jsonb
) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rules jsonb := p_question.validation;
  v_legacy boolean := v_rules is null;
  v_required boolean := case
    when v_legacy then true
    else coalesce((v_rules ->> 'required')::boolean, true)
  end;
  v_text text;
  v_len int;
  v_max int;
  v_min int;
  v_format text;
  v_num numeric;
  v_indexes int[] := array[]::int[];
  v_index_text text;
  v_count int;
  v_limit int;
  v_regex text;
  v_rating int;
begin
  if p_answer is null or jsonb_typeof(p_answer) <> 'object' then
    raise exception 'Answers are missing';
  end if;

  if p_question.kind = 'short' then
    v_text := btrim(coalesce(p_answer ->> 'text', ''));
    if v_text = '' then
      if v_required then
        if v_legacy then
          raise exception 'Short answers must be between 1 and 500 characters';
        end if;
        raise exception '%', private.validation_message(v_rules, 'presence', 'This question is required');
      end if;
      return jsonb_build_object('text', '');
    end if;

    v_len := char_length(v_text);
    v_max := 500;
    if not v_legacy and jsonb_typeof(v_rules -> 'maxLength') = 'number' then
      v_max := (v_rules ->> 'maxLength')::int;
    end if;
    if v_len > v_max then
      if v_legacy then
        raise exception 'Short answers must be between 1 and 500 characters';
      end if;
      raise exception '%', private.validation_message(v_rules, 'length', format('Please enter at most %s characters', v_max));
    end if;
    if not v_legacy and jsonb_typeof(v_rules -> 'minLength') = 'number' then
      v_min := (v_rules ->> 'minLength')::int;
      if v_len < v_min then
        raise exception '%', private.validation_message(v_rules, 'length', format('Please enter at least %s characters', v_min));
      end if;
    end if;

    v_format := case when v_legacy then 'none' else coalesce(v_rules ->> 'formatType', 'none') end;
    if v_format = 'email' then
      if v_text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception '%', private.validation_message(v_rules, 'format', 'Must be a valid email address');
      end if;
    elsif v_format = 'integer' then
      if v_text !~ '^-?(0|[1-9][0-9]{0,14})$' then
        raise exception '%', private.validation_message(v_rules, 'format', 'Must be a whole number');
      end if;
    elsif v_format = 'decimal' then
      if v_text !~ '^-?((0|[1-9][0-9]{0,14})(\.[0-9]{1,8})?|\.[0-9]{1,8})$' then
        raise exception '%', private.validation_message(v_rules, 'format', 'Must be a number');
      end if;
    elsif v_format = 'alphanumeric' then
      if v_text !~ '^[a-zA-Z0-9]+$' then
        raise exception '%', private.validation_message(v_rules, 'format', 'Must be alphanumeric');
      end if;
    elsif v_format = 'hk_phone' then
      if v_text !~ '^[2-9][0-9]{7}$' then
        raise exception '%', private.validation_message(v_rules, 'format', 'Must be an 8-digit Hong Kong phone number');
      end if;
    elsif v_format = 'url' then
      if not private.is_http_url(v_text) then
        raise exception '%', private.validation_message(v_rules, 'format', 'Must be a valid URL');
      end if;
    elsif v_format = 'custom_regex' then
      v_regex := btrim(coalesce(v_rules ->> 'customRegex', ''));
      if not private.regex_is_safe(v_regex) then
        raise exception 'This question has an invalid format rule';
      end if;
      if v_text !~ v_regex then
        raise exception '%', private.validation_message(v_rules, 'format', 'Must match the required format');
      end if;
    elsif v_format <> 'none' then
      raise exception 'This question has an invalid format rule';
    end if;

    if v_format in ('integer', 'decimal') and not v_legacy then
      v_num := v_text::numeric;
      if (jsonb_typeof(v_rules -> 'minValue') = 'number' and v_num < (v_rules ->> 'minValue')::numeric)
        or (jsonb_typeof(v_rules -> 'maxValue') = 'number' and v_num > (v_rules ->> 'maxValue')::numeric)
      then
        raise exception '%', private.validation_message(v_rules, 'range', private.range_detail(v_rules));
      end if;
    end if;

    return jsonb_build_object('text', v_text);
  end if;

  if p_question.kind = 'rating' then
    v_text := p_answer ->> 'rating';
    if v_text is null or v_text = '' then
      if v_required then
        if v_legacy then
          raise exception 'Choose a rating';
        end if;
        raise exception '%', private.validation_message(v_rules, 'presence', 'This question is required');
      end if;
      return jsonb_build_object('rating', null);
    end if;
    if v_text !~ '^[0-9]+$' then
      raise exception 'Choose a rating';
    end if;
    v_rating := v_text::int;
    if v_rating < p_question.rating_min or v_rating > p_question.rating_max then
      raise exception 'That rating is outside the scale';
    end if;
    return jsonb_build_object('rating', v_rating);
  end if;

  if p_question.kind in ('single', 'multiple') then
    if p_answer -> 'optionIndexes' is null or jsonb_typeof(p_answer -> 'optionIndexes') <> 'array' then
      raise exception 'Choose an option for every choice question';
    end if;

    for v_index_text in
      select item from jsonb_array_elements_text(p_answer -> 'optionIndexes') as item
    loop
      if v_index_text !~ '^[0-9]+$' then
        raise exception 'Choose an option for every choice question';
      end if;
      v_indexes := v_indexes || v_index_text::int;
    end loop;

    if exists (
      select 1 from unnest(v_indexes) as choice
      where choice < 0 or choice >= cardinality(p_question.options)
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

    select coalesce(array_agg(choice order by choice), array[]::int[])
    into v_indexes
    from unnest(v_indexes) as choice;
    v_count := cardinality(v_indexes);

    if v_count = 0 then
      if v_required then
        if v_legacy then
          if p_question.kind = 'single' then
            raise exception 'Choose one option';
          end if;
          raise exception 'Choose at least one option';
        end if;
        raise exception '%', private.validation_message(v_rules, 'presence', 'This question is required');
      end if;
      return jsonb_build_object('optionIndexes', '[]'::jsonb);
    end if;

    if p_question.kind = 'single' then
      if v_count <> 1 then
        raise exception 'Choose one option';
      end if;
      return jsonb_build_object('optionIndexes', to_jsonb(v_indexes));
    end if;

    if not v_legacy and jsonb_typeof(v_rules -> 'minValue') = 'number' and v_count < (v_rules ->> 'minValue')::int then
      v_limit := (v_rules ->> 'minValue')::int;
      raise exception '%', private.validation_message(
        v_rules,
        'selection',
        case when v_limit = 1 then 'Select at least 1 option' else format('Select at least %s options', v_limit) end
      );
    end if;
    if not v_legacy and jsonb_typeof(v_rules -> 'maxValue') = 'number' and v_count > (v_rules ->> 'maxValue')::int then
      v_limit := (v_rules ->> 'maxValue')::int;
      raise exception '%', private.validation_message(
        v_rules,
        'selection',
        case when v_limit = 1 then 'Select at most 1 option' else format('Select at most %s options', v_limit) end
      );
    end if;

    return jsonb_build_object('optionIndexes', to_jsonb(v_indexes));
  end if;

  raise exception 'Unknown question type';
end;
$$;

-- Self-check. A wrong message or an accepted unsafe pattern aborts the migration.
do $$
declare
  v_q public.questions;
  v_value jsonb;
begin
  if not private.regex_is_safe('^[A-Za-z0-9]+$') then
    raise exception 'safe pattern rejected';
  end if;
  if private.regex_is_safe('(a+)+') then
    raise exception 'nested quantifier accepted';
  end if;
  if private.regex_is_safe('(a|aa)+') then
    raise exception 'quantified alternation accepted';
  end if;
  if not private.regex_is_safe('^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then
    raise exception 'email-like pattern rejected';
  end if;
  if private.clean_question_validation('short', 0, false, null) is not null then
    raise exception 'null rules should stay null';
  end if;
  if private.clean_question_validation('short', 0, false, '{"required": true}'::jsonb) is not null then
    raise exception 'default required should stay null';
  end if;

  v_q.kind := 'short';
  v_q.prompt := 'Email address please';
  v_q.validation := null;

  begin
    perform private.normalize_answer(v_q, '{"text": ""}'::jsonb);
    raise exception 'legacy empty short should fail';
  exception
    when others then
      if sqlerrm not like '%Short answers must be between 1 and 500 characters%' then
        raise;
      end if;
  end;

  if private.normalize_answer(v_q, '{"text": "  hello  "}'::jsonb) <> '{"text": "hello"}'::jsonb then
    raise exception 'legacy trim failed';
  end if;

  v_q.validation := '{"required": true, "formatType": "email", "minLength": 15, "maxLength": 300, "errorMessage": "Use your campus email"}'::jsonb;
  begin
    perform private.normalize_answer(v_q, '{"text": "short@x.co"}'::jsonb);
    raise exception 'short email should fail length';
  exception
    when others then
      if sqlerrm not like '%Length Check Failed: Use your campus email%' then
        raise;
      end if;
  end;

  begin
    perform private.normalize_answer(v_q, '{"text": "not-an-email-address"}'::jsonb);
    raise exception 'bad email should fail format';
  exception
    when others then
      if sqlerrm not like '%Format Check Failed: Use your campus email%' then
        raise;
      end if;
  end;

  v_value := private.normalize_answer(v_q, '{"text": "student.name@university.edu"}'::jsonb);
  if v_value ->> 'text' <> 'student.name@university.edu' then
    raise exception 'good email rejected';
  end if;

  v_q.validation := '{"required": true, "formatType": "integer", "minValue": 12, "maxValue": 25}'::jsonb;
  begin
    perform private.normalize_answer(v_q, '{"text": "11"}'::jsonb);
    raise exception '11 should fail range';
  exception
    when others then
      if sqlerrm not like '%Range Check Failed: Enter a number between 12 and 25%' then
        raise;
      end if;
  end;
  if (private.normalize_answer(v_q, '{"text": "25"}'::jsonb) ->> 'text') <> '25' then
    raise exception '25 should pass';
  end if;

  v_q.validation := '{"required": false, "formatType": "hk_phone"}'::jsonb;
  if private.normalize_answer(v_q, '{"text": "   "}'::jsonb) <> '{"text": ""}'::jsonb then
    raise exception 'optional blank should pass';
  end if;
  begin
    perform private.normalize_answer(v_q, '{"text": "12345678"}'::jsonb);
    raise exception 'bad hk phone should fail';
  exception
    when others then
      if sqlerrm not like '%Format Check Failed: Must be an 8-digit Hong Kong phone number%' then
        raise;
      end if;
  end;
  if (private.normalize_answer(v_q, '{"text": "91234567"}'::jsonb) ->> 'text') <> '91234567' then
    raise exception 'hk phone should pass';
  end if;

  v_q.kind := 'multiple';
  v_q.options := array['Library', 'Dorm / Home', 'Café', 'Other'];
  v_q.validation := null;
  begin
    perform private.normalize_answer(v_q, '{"optionIndexes": []}'::jsonb);
    raise exception 'legacy multiple empty should fail';
  exception
    when others then
      if sqlerrm not like '%Choose at least one option%' then
        raise;
      end if;
  end;

  v_q.validation := '{"required": true, "minValue": 2, "maxValue": 3}'::jsonb;
  begin
    perform private.normalize_answer(v_q, '{"optionIndexes": [0]}'::jsonb);
    raise exception 'one selection should fail min';
  exception
    when others then
      if sqlerrm not like '%Selection Range Check Failed: Select at least 2 options%' then
        raise;
      end if;
  end;
  if private.normalize_answer(v_q, '{"optionIndexes": [2, 0]}'::jsonb) <> '{"optionIndexes": [0, 2]}'::jsonb then
    raise exception 'selection was not sorted';
  end if;
  v_q.validation := '{"required": false}'::jsonb;
  if private.normalize_answer(v_q, '{"optionIndexes": []}'::jsonb) <> '{"optionIndexes": []}'::jsonb then
    raise exception 'optional multiple empty failed';
  end if;

  v_q.kind := 'rating';
  v_q.options := null;
  v_q.rating_min := 1;
  v_q.rating_max := 5;
  v_q.validation := '{"required": false}'::jsonb;
  if private.normalize_answer(v_q, '{}'::jsonb) <> '{"rating": null}'::jsonb then
    raise exception 'optional rating empty failed';
  end if;

  if not private.is_http_url('https://example.com/path?q=1') then
    raise exception 'url should pass';
  end if;
  if private.is_http_url('example.com') then
    raise exception 'bare host should fail';
  end if;

  begin
    perform private.clean_question_validation('short', 0, false, '{"formatType": "custom_regex", "customRegex": "(a+)+"}'::jsonb);
    raise exception 'unsafe regex should be rejected';
  exception
    when others then
      if sqlerrm not like '%invalid or unsafe%' then
        raise;
      end if;
  end;

  begin
    perform private.clean_question_validation('single', 2, true, '{"required": false}'::jsonb);
    raise exception 'optional screening should be rejected';
  exception
    when others then
      if sqlerrm not like '%Screening questions must stay required%' then
        raise;
      end if;
  end;
end $$;


-- ---------------------------------------------------------------------------
-- save_survey stores the cleaned validation object. Null means legacy rules.
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
  v_validation jsonb;
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

    v_validation := private.clean_question_validation(
      v_kind,
      coalesce(cardinality(v_options), 0),
      v_is_screening,
      case when v_q ? 'validation' then v_q -> 'validation' else null end
    );

    insert into public.questions (
      survey_id, position, kind, prompt, options,
      rating_min, rating_max, rating_min_label, rating_max_label,
      validation
    ) values (
      v_id, v_idx, v_kind, v_prompt, v_options,
      v_rating_min, v_rating_max, v_rating_min_label, v_rating_max_label,
      v_validation
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
          'correctOptionIndexes', coalesce(to_jsonb(sk.correct_indexes), '[]'::jsonb),
          'validation', q.validation
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

-- Submit still saves too-fast and failed-screening responses. Creator-rule
-- failures raise inside normalize_answer before any answer row or cap update.

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

revoke all on function private.regex_is_safe(text) from public, anon, authenticated;
revoke all on function private.is_http_url(text) from public, anon, authenticated;
revoke all on function private.validation_message(jsonb, text, text) from public, anon, authenticated;
revoke all on function private.range_detail(jsonb) from public, anon, authenticated;
revoke all on function private.clean_question_validation(text, int, boolean, jsonb) from public, anon, authenticated;
revoke all on function private.normalize_answer(public.questions, jsonb) from public, anon, authenticated;
revoke all on function private.save_survey(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.get_own_survey(uuid, uuid) from public, anon, authenticated;
revoke all on function private.submit_response(uuid, uuid, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
