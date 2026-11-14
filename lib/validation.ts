/**
 * Creator data-validation rules.
 *
 * Omitted rules keep today's behavior: every question is required, short answers
 * are 1–500 characters, and multiple choice needs at least one selection.
 *
 * private.clean_question_validation and private.normalize_answer in
 * supabase/migrations/20261114170000_question_validation.sql make the same
 * decisions. Keep the messages and the accepted patterns together.
 */
import { productConfig } from "@/lib/config"
import type { AnswerValue, FormatType, QuestionKind, QuestionValidation } from "@/lib/types"
import { formatTypes } from "@/lib/types"

export type ValidationDraft = {
  optionIndexes: number[]
  text: string
  rating: number | null
}

export type ValidatableQuestion = {
  kind: QuestionKind
  options: string[]
  ratingMin?: number | null
  ratingMax?: number | null
  validation?: QuestionValidation | null
}

export type ValidationCheck = "presence" | "length" | "format" | "range" | "selection" | "structure"

export type AnswerCheck =
  | { ok: true; value: AnswerValue }
  | { ok: false; check: ValidationCheck; message: string }

const MAX_REGEX_LENGTH = 120
const MAX_QUANTIFIERS = 8
const MAX_QUANTIFIER_BOUND = 40
const MAX_GROUP_DEPTH = 3
const MAX_ERROR_MESSAGE = 160
const MAX_BOUND = 1_000_000_000_000
const SAFE_ESCAPES = new Set(["d", "D", "w", "W", "s", "S", "n", "t", "r", "f", "v", "\\", ".", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|", "^", "$", "-", "/"])

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]{0,14})$/
const DECIMAL_PATTERN = /^-?(?:(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,8})?|\.[0-9]{1,8})$/
const ALPHANUMERIC_PATTERN = /^[a-zA-Z0-9]+$/
const HK_PHONE_PATTERN = /^[2-9][0-9]{7}$/

export function isRequired(validation: QuestionValidation | null | undefined) {
  if (!validation) return true
  return validation.required !== false
}

export function hasActiveRules(validation: QuestionValidation | null | undefined) {
  if (!validation) return false
  if (validation.required === false) return true
  if (validation.minLength != null || validation.maxLength != null) return true
  if (validation.formatType && validation.formatType !== "none") return true
  if (validation.customRegex?.trim()) return true
  if (validation.minValue != null || validation.maxValue != null) return true
  if (validation.errorMessage?.trim()) return true
  return false
}

export function formatTypeLabel(format: FormatType) {
  switch (format) {
    case "none":
      return "None (Any text)"
    case "integer":
      return "Integer / Whole Number Only"
    case "decimal":
      return "Decimal / Numeric Only"
    case "email":
      return "Email Address"
    case "hk_phone":
      return "8-Digit HK Phone Number"
    case "alphanumeric":
      return "Alphanumeric / Student ID"
    case "url":
      return "URL"
    case "custom_regex":
      return "Custom Regular Expression"
  }
}

export function validationSummary(kind: QuestionKind, validation: QuestionValidation | null | undefined) {
  if (!hasActiveRules(validation) || !validation) return null
  const parts = [validation.required === false ? "Optional" : "Required"]
  if (kind === "short") {
    if (validation.minLength != null || validation.maxLength != null) {
      parts.push(`${validation.minLength ?? 1}–${validation.maxLength ?? productConfig.shortAnswerMax} characters`)
    }
    if (validation.formatType && validation.formatType !== "none") {
      parts.push(shortFormatLabel(validation.formatType))
    }
    if (
      (validation.formatType === "integer" || validation.formatType === "decimal") &&
      (validation.minValue != null || validation.maxValue != null)
    ) {
      parts.push(boundSummary(validation.minValue, validation.maxValue))
    }
  }
  if (kind === "multiple" && (validation.minValue != null || validation.maxValue != null)) {
    if (validation.minValue != null && validation.maxValue != null) {
      parts.push(`Select ${validation.minValue}–${validation.maxValue}`)
    } else if (validation.minValue != null) {
      parts.push(`At least ${validation.minValue} selected`)
    } else {
      parts.push(`At most ${validation.maxValue} selected`)
    }
  }
  return parts.join(" · ")
}

/** Drop rules that do not apply to the new question type. */
export function validationForKind(kind: QuestionKind, validation: QuestionValidation | undefined) {
  if (!validation) return undefined
  if (kind === "short") {
    const numeric = validation.formatType === "integer" || validation.formatType === "decimal"
    return compactValidation({
      required: validation.required,
      minLength: validation.minLength,
      maxLength: validation.maxLength,
      formatType: validation.formatType,
      customRegex: validation.formatType === "custom_regex" ? validation.customRegex : undefined,
      minValue: numeric ? validation.minValue : undefined,
      maxValue: numeric ? validation.maxValue : undefined,
      errorMessage: validation.errorMessage,
    })
  }
  if (kind === "multiple") {
    return compactValidation({
      required: validation.required,
      minValue: validation.minValue,
      maxValue: validation.maxValue,
      errorMessage: validation.errorMessage,
    })
  }
  return compactValidation({
    required: validation.required,
    errorMessage: validation.errorMessage,
  })
}

export function compileQuestionValidation(
  kind: QuestionKind,
  optionCount: number,
  isScreening: boolean,
  input: QuestionValidation | null | undefined,
): { ok: true; validation?: QuestionValidation } | { ok: false; message: string } {
  if (input == null) return { ok: true }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "Validation rules must be an object." }
  }

  const required = input.required !== false
  if (typeof input.required !== "undefined" && typeof input.required !== "boolean") {
    return { ok: false, message: "Presence check must be true or false." }
  }
  if (isScreening && !required) {
    return { ok: false, message: "Screening questions must stay required." }
  }

  let errorMessage: string | undefined
  if (input.errorMessage != null && input.errorMessage !== "") {
    if (typeof input.errorMessage !== "string") {
      return { ok: false, message: "Custom error messages must be text." }
    }
    errorMessage = input.errorMessage.trim()
    if (errorMessage.length > MAX_ERROR_MESSAGE) {
      return { ok: false, message: "Custom error messages must be 160 characters or fewer." }
    }
    if (/[\u0000-\u001f]/.test(errorMessage)) {
      return { ok: false, message: "Custom error messages must be a single line." }
    }
    if (!errorMessage) errorMessage = undefined
  }

  const validation: QuestionValidation = {}
  if (!required) validation.required = false
  if (errorMessage) validation.errorMessage = errorMessage

  if (kind === "short") {
    const minLength = readLength(input.minLength, "Minimum length")
    if (!minLength.ok) return minLength
    const maxLength = readLength(input.maxLength, "Maximum length")
    if (!maxLength.ok) return maxLength
    if (minLength.value != null && maxLength.value != null && minLength.value > maxLength.value) {
      return { ok: false, message: "Minimum length cannot be greater than maximum length." }
    }
    if (minLength.value != null) validation.minLength = minLength.value
    if (maxLength.value != null) validation.maxLength = maxLength.value

    const format = readFormat(input.formatType)
    if (!format.ok) return format
    if (format.value && format.value !== "none") validation.formatType = format.value

    if (format.value === "custom_regex") {
      if (typeof input.customRegex !== "string" || !input.customRegex.trim()) {
        return { ok: false, message: "Enter a custom regular expression." }
      }
      const source = input.customRegex.trim()
      const unsafe = regexSafetyError(source)
      if (unsafe) return { ok: false, message: unsafe }
      validation.customRegex = source
    } else if (typeof input.customRegex === "string" && input.customRegex.trim()) {
      return { ok: false, message: "Custom regular expressions are only used with the custom format." }
    }

    const numeric = format.value === "integer" || format.value === "decimal"
    const minValue = readBound(input.minValue)
    if (!minValue.ok) return minValue
    const maxValue = readBound(input.maxValue)
    if (!maxValue.ok) return maxValue
    if (!numeric && (minValue.value != null || maxValue.value != null)) {
      return { ok: false, message: "Range checks apply only when the format is a whole number or a decimal." }
    }
    if (minValue.value != null && maxValue.value != null && minValue.value > maxValue.value) {
      return { ok: false, message: "Minimum value cannot be greater than maximum value." }
    }
    if (numeric && minValue.value != null) validation.minValue = minValue.value
    if (numeric && maxValue.value != null) validation.maxValue = maxValue.value
  } else if (present(input.minLength) || present(input.maxLength)) {
    return { ok: false, message: "Length checks apply only to short answers." }
  } else if (presentFormat(input.formatType) || (typeof input.customRegex === "string" && input.customRegex.trim())) {
    return { ok: false, message: "Format checks apply only to short answers." }
  } else if (kind === "multiple") {
    const minValue = readSelection(input.minValue, optionCount)
    if (!minValue.ok) return minValue
    const maxValue = readSelection(input.maxValue, optionCount)
    if (!maxValue.ok) return maxValue
    if (minValue.value != null && maxValue.value != null && minValue.value > maxValue.value) {
      return { ok: false, message: "Minimum selections cannot be greater than maximum selections." }
    }
    if (required && maxValue.value === 0) {
      return { ok: false, message: "A required question needs room for at least 1 selection." }
    }
    if (minValue.value != null) validation.minValue = minValue.value
    if (maxValue.value != null) validation.maxValue = maxValue.value
  } else if (present(input.minValue) || present(input.maxValue)) {
    return { ok: false, message: "Range checks apply to whole-number, decimal, and multiple-choice questions." }
  }

  if (!hasActiveRules(validation)) return { ok: true }
  if (validation.required !== false) validation.required = true
  return { ok: true, validation }
}

export function checkAnswer(question: ValidatableQuestion, draft: ValidationDraft): AnswerCheck {
  const rules = question.validation ?? null
  if (question.kind === "short") return checkShort(rules, draft.text)
  if (question.kind === "rating") return checkRating(question, rules, draft.rating)
  return checkChoice(question, rules, draft.optionIndexes)
}

export function answerIssue(question: ValidatableQuestion, draft: ValidationDraft) {
  const result = checkAnswer(question, draft)
  if (result.ok) return null
  return { check: result.check, message: result.message }
}

export function regexSafetyError(pattern: string): string | null {
  if (!pattern) return "Enter a custom regular expression."
  if (pattern.length > MAX_REGEX_LENGTH) return "Custom regular expressions must be 120 characters or fewer."
  if (/[\u0000-\u001f\u007f]/.test(pattern)) return "That regular expression is invalid or unsafe."
  if (/\(\?/.test(pattern)) return "That regular expression is invalid or unsafe."

  let index = 0
  let depth = 0
  let inClass = false
  let classStart = false
  let last: "none" | "atom" | "quant" = "none"
  let quantifiers = 0
  let atomIsGroup = false
  let closedGroupHasAlt = false
  const groupHasAlt = [false]

  while (index < pattern.length) {
    const char = pattern[index] ?? ""

    if (inClass) {
      if (char === "\\") {
        const escaped = pattern[index + 1]
        if (!escaped || !SAFE_ESCAPES.has(escaped)) return "That regular expression is invalid or unsafe."
        index += 2
        classStart = false
        continue
      }
      if (char === "]" && !classStart) {
        inClass = false
        last = "atom"
        atomIsGroup = false
      }
      classStart = false
      index += 1
      continue
    }

    if (char === "\\") {
      const escaped = pattern[index + 1]
      if (!escaped || !SAFE_ESCAPES.has(escaped)) return "That regular expression is invalid or unsafe."
      index += 2
      last = "atom"
      atomIsGroup = false
      continue
    }

    if (char === "[") {
      inClass = true
      classStart = true
      index += 1
      continue
    }

    if (char === "(") {
      depth += 1
      if (depth > MAX_GROUP_DEPTH) return "That regular expression is invalid or unsafe."
      groupHasAlt[depth] = false
      last = "none"
      atomIsGroup = false
      index += 1
      continue
    }

    if (char === ")") {
      if (depth < 1) return "That regular expression is invalid or unsafe."
      closedGroupHasAlt = groupHasAlt[depth] === true
      groupHasAlt[depth] = false
      depth -= 1
      last = "atom"
      atomIsGroup = true
      index += 1
      continue
    }

    if (char === "|") {
      groupHasAlt[depth] = true
      last = "none"
      atomIsGroup = false
      index += 1
      continue
    }

    if (char === "^" || char === "$") {
      last = "none"
      atomIsGroup = false
      index += 1
      continue
    }

    if (char === "*" || char === "+" || char === "?" || char === "{") {
      if (char === "?" && last === "quant") {
        index += 1
        continue
      }
      if (depth > 0 || last !== "atom") return "That regular expression is invalid or unsafe."
      if (atomIsGroup && closedGroupHasAlt) return "That regular expression is invalid or unsafe."
      if (char === "{") {
        const end = pattern.indexOf("}", index + 1)
        if (end < 0) return "That regular expression is invalid or unsafe."
        const body = pattern.slice(index + 1, end)
        if (!/^[0-9]{1,2}(,[0-9]{0,2})?$/.test(body)) return "That regular expression is invalid or unsafe."
        const [rawMin, rawMax] = body.split(",")
        const lower = Number(rawMin)
        if (lower > MAX_QUANTIFIER_BOUND) return "That regular expression is invalid or unsafe."
        if (rawMax != null && rawMax !== "") {
          const upper = Number(rawMax)
          if (upper > MAX_QUANTIFIER_BOUND || upper < lower) return "That regular expression is invalid or unsafe."
        }
        index = end + 1
      } else {
        index += 1
      }
      quantifiers += 1
      if (quantifiers > MAX_QUANTIFIERS) return "That regular expression is invalid or unsafe."
      last = "quant"
      atomIsGroup = false
      continue
    }

    if (char === "]" || char === "}") return "That regular expression is invalid or unsafe."
    last = "atom"
    atomIsGroup = false
    index += 1
  }

  if (inClass || depth !== 0) return "That regular expression is invalid or unsafe."
  try {
    // Compile only. Matching happens later, on a length-capped answer.
    RegExp(pattern)
  } catch {
    return "That regular expression is invalid or unsafe."
  }
  return null
}

export function isHttpUrl(text: string) {
  if (text.length === 0 || text.length > productConfig.shortAnswerMax) return false
  let rest = ""
  if (text.slice(0, 8).toLowerCase() === "https://") rest = text.slice(8)
  else if (text.slice(0, 7).toLowerCase() === "http://") rest = text.slice(7)
  else return false
  if (!rest || /\s/.test(rest)) return false
  const hostAndPort = rest.split(/[/?#]/, 1)[0] ?? ""
  if (!hostAndPort || !hostAndPort.includes(".")) return false
  let host = hostAndPort
  const colon = hostAndPort.indexOf(":")
  if (colon >= 0) {
    if (hostAndPort.indexOf(":", colon + 1) >= 0) return false
    const port = hostAndPort.slice(colon + 1)
    if (!/^[0-9]{1,5}$/.test(port)) return false
    const portNumber = Number(port)
    if (portNumber < 1 || portNumber > 65535) return false
    host = hostAndPort.slice(0, colon)
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(host)) {
    return false
  }
  const tld = host.slice(host.lastIndexOf(".") + 1)
  return /^[A-Za-z]{2,}$/.test(tld)
}

export function parseStoredValidation(value: unknown): QuestionValidation | undefined {
  let record = value
  if (typeof record === "string") {
    try {
      record = JSON.parse(record) as unknown
    } catch {
      return undefined
    }
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return undefined
  const row = record as Record<string, unknown>
  const validation: QuestionValidation = {}
  if (typeof row.required === "boolean") validation.required = row.required
  if (typeof row.minLength === "number") validation.minLength = row.minLength
  if (typeof row.maxLength === "number") validation.maxLength = row.maxLength
  if (typeof row.formatType === "string" && formatTypes.includes(row.formatType as FormatType)) {
    validation.formatType = row.formatType as FormatType
  }
  if (typeof row.customRegex === "string") validation.customRegex = row.customRegex
  if (typeof row.minValue === "number") validation.minValue = row.minValue
  if (typeof row.maxValue === "number") validation.maxValue = row.maxValue
  if (typeof row.errorMessage === "string") validation.errorMessage = row.errorMessage
  return hasActiveRules(validation) ? validation : undefined
}

function checkShort(rules: QuestionValidation | null, raw: string): AnswerCheck {
  const text = raw.trim()
  if (!text) {
    if (!isRequired(rules)) return { ok: true, value: { text: "" } }
    if (!rules) return fail("length", "Short answers must be between 1 and 500 characters")
    return creatorFail(rules, "presence", "This question is required")
  }

  const maxLength = rules?.maxLength ?? productConfig.shortAnswerMax
  if (text.length > maxLength) {
    if (!rules) return fail("length", "Short answers must be between 1 and 500 characters")
    return creatorFail(rules, "length", `Please enter at most ${maxLength} characters`)
  }
  if (rules?.minLength != null && text.length < rules.minLength) {
    return creatorFail(rules, "length", `Please enter at least ${rules.minLength} characters`)
  }

  const format = rules?.formatType ?? "none"
  if (format === "email" && !EMAIL_PATTERN.test(text)) {
    return creatorFail(rules, "format", "Must be a valid email address")
  }
  if (format === "integer" && !INTEGER_PATTERN.test(text)) {
    return creatorFail(rules, "format", "Must be a whole number")
  }
  if (format === "decimal" && !DECIMAL_PATTERN.test(text)) {
    return creatorFail(rules, "format", "Must be a number")
  }
  if (format === "alphanumeric" && !ALPHANUMERIC_PATTERN.test(text)) {
    return creatorFail(rules, "format", "Must be alphanumeric")
  }
  if (format === "hk_phone" && !HK_PHONE_PATTERN.test(text)) {
    return creatorFail(rules, "format", "Must be an 8-digit Hong Kong phone number")
  }
  if (format === "url" && !isHttpUrl(text)) {
    return creatorFail(rules, "format", "Must be a valid URL")
  }
  if (format === "custom_regex") {
    const pattern = rules?.customRegex?.trim() ?? ""
    if (regexSafetyError(pattern)) return fail("format", "This question has an invalid format rule")
    try {
      if (!RegExp(pattern).test(text)) return creatorFail(rules, "format", "Must match the required format")
    } catch {
      return fail("format", "This question has an invalid format rule")
    }
  }

  if ((format === "integer" || format === "decimal") && rules && (rules.minValue != null || rules.maxValue != null)) {
    const value = Number(text)
    if ((rules.minValue != null && value < rules.minValue) || (rules.maxValue != null && value > rules.maxValue)) {
      return creatorFail(rules, "range", rangeDetail(rules.minValue, rules.maxValue))
    }
  }

  return { ok: true, value: { text } }
}

function checkRating(question: ValidatableQuestion, rules: QuestionValidation | null, rating: number | null): AnswerCheck {
  if (rating == null) {
    if (!isRequired(rules)) return { ok: true, value: { rating: null } }
    if (!rules) return fail("presence", "Choose a rating")
    return creatorFail(rules, "presence", "This question is required")
  }
  const min = question.ratingMin ?? 1
  const max = question.ratingMax ?? 5
  if (!Number.isInteger(rating) || rating < min || rating > max) {
    return fail("structure", "That rating is outside the scale")
  }
  return { ok: true, value: { rating } }
}

function checkChoice(question: ValidatableQuestion, rules: QuestionValidation | null, optionIndexes: number[]): AnswerCheck {
  if (!Array.isArray(optionIndexes) || optionIndexes.some((index) => typeof index !== "number" || !Number.isInteger(index))) {
    return fail("structure", "Choose an option for every choice question")
  }
  if (optionIndexes.some((index) => index < 0 || index >= question.options.length)) {
    return fail("structure", "That option is not on this question")
  }
  if (new Set(optionIndexes).size !== optionIndexes.length) {
    return fail("structure", "Duplicate options are not allowed")
  }

  const indexes = [...optionIndexes].sort((a, b) => a - b)
  if (indexes.length === 0) {
    if (!isRequired(rules)) return { ok: true, value: { optionIndexes: [] } }
    if (!rules) {
      return fail("presence", question.kind === "single" ? "Choose one option" : "Choose at least one option")
    }
    return creatorFail(rules, "presence", "This question is required")
  }

  if (question.kind === "single") {
    if (indexes.length !== 1) return fail("structure", "Choose one option")
    return { ok: true, value: { optionIndexes: indexes } }
  }

  if (rules?.minValue != null && indexes.length < rules.minValue) {
    const min = rules.minValue
    return creatorFail(rules, "selection", min === 1 ? "Select at least 1 option" : `Select at least ${min} options`)
  }
  if (rules?.maxValue != null && indexes.length > rules.maxValue) {
    const max = rules.maxValue
    return creatorFail(rules, "selection", max === 1 ? "Select at most 1 option" : `Select at most ${max} options`)
  }
  return { ok: true, value: { optionIndexes: indexes } }
}

function creatorFail(
  rules: QuestionValidation | null,
  check: ValidationCheck,
  detail: string,
): AnswerCheck {
  const custom = rules?.errorMessage?.trim()
  const prefix = {
    presence: "Presence Check Failed",
    length: "Length Check Failed",
    format: "Format Check Failed",
    range: "Range Check Failed",
    selection: "Selection Range Check Failed",
    structure: "Validation failed",
  }[check]
  return { ok: false, check, message: `${prefix}: ${custom || detail}` }
}

function fail(check: ValidationCheck, message: string): AnswerCheck {
  return { ok: false, check, message }
}

function rangeDetail(min: number | undefined, max: number | undefined) {
  if (min != null && max != null) return `Enter a number between ${formatBound(min)} and ${formatBound(max)}`
  if (min != null) return `Enter a number of at least ${formatBound(min)}`
  return `Enter a number of at most ${formatBound(max)}`
}

function formatBound(value: number | undefined) {
  return JSON.stringify(value ?? null)
}

function boundSummary(min: number | undefined, max: number | undefined) {
  if (min != null && max != null) return `${min}–${max}`
  if (min != null) return `≥ ${min}`
  return `≤ ${max}`
}

function shortFormatLabel(format: FormatType) {
  switch (format) {
    case "email":
      return "Email"
    case "integer":
      return "Whole number"
    case "decimal":
      return "Decimal"
    case "alphanumeric":
      return "Alphanumeric"
    case "hk_phone":
      return "HK phone"
    case "url":
      return "URL"
    case "custom_regex":
      return "Custom format"
    case "none":
      return "Any text"
  }
}

function compactValidation(validation: QuestionValidation): QuestionValidation | undefined {
  const next: QuestionValidation = {}
  if (validation.required === false) next.required = false
  if (validation.minLength != null) next.minLength = validation.minLength
  if (validation.maxLength != null) next.maxLength = validation.maxLength
  if (validation.formatType && validation.formatType !== "none") next.formatType = validation.formatType
  if (next.formatType === "custom_regex" && validation.customRegex) next.customRegex = validation.customRegex
  if (validation.minValue != null) next.minValue = validation.minValue
  if (validation.maxValue != null) next.maxValue = validation.maxValue
  if (validation.errorMessage?.trim()) next.errorMessage = validation.errorMessage.trim()
  if (!hasActiveRules(next)) return undefined
  if (next.required !== false) next.required = true
  return next
}

function readLength(value: unknown, label: string): { ok: true; value?: number } | { ok: false; message: string } {
  if (!present(value)) return { ok: true }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > productConfig.shortAnswerMax) {
    return { ok: false, message: `${label} must be a whole number from 1 to 500.` }
  }
  return { ok: true, value }
}

function readBound(value: unknown): { ok: true; value?: number } | { ok: false; message: string } {
  if (!present(value)) return { ok: true }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, message: "Range limits must be numbers." }
  }
  if (Math.abs(value) > MAX_BOUND) return { ok: false, message: "Range limits are too large." }
  const text = JSON.stringify(value)
  const places = text.includes(".") ? text.length - text.indexOf(".") - 1 : 0
  if (places > 8) return { ok: false, message: "Range limits can have at most 8 decimal places." }
  return { ok: true, value }
}

function readSelection(value: unknown, optionCount: number): { ok: true; value?: number } | { ok: false; message: string } {
  if (!present(value)) return { ok: true }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { ok: false, message: "Selection limits must be whole numbers." }
  }
  if (value < 0 || value > optionCount) {
    return { ok: false, message: "Selection limits must be between 0 and the number of options." }
  }
  return { ok: true, value }
}

function readFormat(value: unknown): { ok: true; value?: FormatType } | { ok: false; message: string } {
  if (!present(value)) return { ok: true }
  if (typeof value !== "string" || !formatTypes.includes(value as FormatType)) {
    return { ok: false, message: "Unknown format check." }
  }
  return { ok: true, value: value as FormatType }
}

function present(value: unknown) {
  return value != null && value !== ""
}

function presentFormat(value: unknown) {
  return typeof value === "string" && value !== "" && value !== "none"
}
