import assert from "node:assert/strict"
import { ATTENTION_POOL, attentionCorrectIndex, withAttentionCheck } from "@/lib/attention"
import { checkAnswer, compileQuestionValidation, isHttpUrl, regexSafetyError } from "@/lib/validation"
import type { QuestionValidation } from "@/lib/types"

const short = (validation?: QuestionValidation | null) => ({
  kind: "short" as const,
  options: [],
  validation,
})

function message(question: ReturnType<typeof short>, text: string) {
  const result = checkAnswer(question, { optionIndexes: [], text, rating: null })
  return result.ok ? null : result.message
}

assert.equal(message(short(null), ""), "Short answers must be between 1 and 500 characters")
assert.equal(message(short(null), "  hello  "), null)
assert.equal(message(short(null), "a".repeat(501)), "Short answers must be between 1 and 500 characters")
assert.equal(checkAnswer(short(null), { optionIndexes: [], text: "  hello  ", rating: null }).ok && true, true)

const email = short({
  required: true,
  formatType: "email",
  minLength: 15,
  maxLength: 300,
  errorMessage: "Use your campus email",
})
assert.equal(message(email, "short@x.co"), "Length Check Failed: Use your campus email")
assert.equal(message(email, "not-an-email-address"), "Format Check Failed: Use your campus email")
assert.equal(message(email, "student.name@university.edu"), null)
assert.equal(message(email, ""), "Presence Check Failed: Use your campus email")

const age = short({ required: true, formatType: "integer", minValue: 12, maxValue: 25 })
assert.equal(message(age, "11"), "Range Check Failed: Enter a number between 12 and 25")
assert.equal(message(age, "12"), null)
assert.equal(message(age, "25"), null)
assert.equal(message(age, "25.5"), "Format Check Failed: Must be a whole number")
assert.equal(message(age, "abc"), "Format Check Failed: Must be a whole number")

const phone = short({ required: false, formatType: "hk_phone" })
assert.equal(message(phone, "   "), null)
assert.equal(message(phone, "12345678"), "Format Check Failed: Must be an 8-digit Hong Kong phone number")
assert.equal(message(phone, "91234567"), null)

assert.equal(message(short({ required: true, formatType: "decimal", minValue: 0, maxValue: 4 }), "3.5"), null)
assert.equal(message(short({ required: true, formatType: "decimal" }), "3.5.1"), "Format Check Failed: Must be a number")
assert.equal(message(short({ required: true, formatType: "alphanumeric" }), "A123"), null)
assert.equal(message(short({ required: true, formatType: "alphanumeric" }), "A-123"), "Format Check Failed: Must be alphanumeric")
assert.equal(message(short({ required: true, formatType: "url" }), "https://example.com/path?q=1"), null)
assert.equal(message(short({ required: true, formatType: "url" }), "example.com"), "Format Check Failed: Must be a valid URL")
assert.equal(isHttpUrl("http://example.com:443/a"), true)
assert.equal(isHttpUrl("ftp://example.com"), false)

const custom = short({ required: true, formatType: "custom_regex", customRegex: "^[A-Z]{2}[0-9]{4}$" })
assert.equal(message(custom, "AB1234"), null)
assert.equal(message(custom, "ab1234"), "Format Check Failed: Must match the required format")
assert.equal(regexSafetyError("(a+)+"), "That regular expression is invalid or unsafe.")
assert.equal(regexSafetyError("(a|aa)+"), "That regular expression is invalid or unsafe.")
assert.equal(regexSafetyError("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"), null)

const choice = {
  kind: "multiple" as const,
  options: ["Library", "Dorm / Home", "Café", "Other"],
}
assert.equal(
  checkAnswer({ ...choice, validation: null }, { optionIndexes: [], text: "", rating: null }).ok
    ? null
    : (checkAnswer({ ...choice, validation: null }, { optionIndexes: [], text: "", rating: null }) as { message: string }).message,
  "Choose at least one option",
)
const ranged = checkAnswer(
  { ...choice, validation: { required: true, minValue: 2, maxValue: 3 } },
  { optionIndexes: [0], text: "", rating: null },
)
assert.equal(ranged.ok, false)
if (!ranged.ok) assert.equal(ranged.message, "Selection Range Check Failed: Select at least 2 options")
const sorted = checkAnswer(
  { ...choice, validation: { required: true, minValue: 2, maxValue: 3 } },
  { optionIndexes: [2, 0], text: "", rating: null },
)
assert.equal(sorted.ok, true)
if (sorted.ok && "optionIndexes" in sorted.value) assert.deepEqual(sorted.value.optionIndexes, [0, 2])
const optional = checkAnswer(
  { ...choice, validation: { required: false } },
  { optionIndexes: [], text: "", rating: null },
)
assert.equal(optional.ok, true)

assert.equal(
  checkAnswer(
    { kind: "rating", options: [], ratingMin: 1, ratingMax: 5, validation: { required: false } },
    { optionIndexes: [], text: "", rating: null },
  ).ok,
  true,
)
assert.equal(
  checkAnswer(
    { kind: "single", options: ["Yes", "No"], validation: null },
    { optionIndexes: [], text: "", rating: null },
  ).ok
    ? null
    : "Choose one option",
  "Choose one option",
)

assert.deepEqual(compileQuestionValidation("short", 0, false, { required: true }), { ok: true })
assert.equal(compileQuestionValidation("short", 0, false, { minLength: 40, maxLength: 10 }).ok, false)
assert.equal(compileQuestionValidation("short", 0, true, { required: false }).ok, false)
assert.equal(compileQuestionValidation("multiple", 4, false, { minValue: 2, maxValue: 9 }).ok, false)
const saved = compileQuestionValidation("short", 0, false, {
  required: true,
  formatType: "email",
  minLength: 15,
  maxLength: 300,
})
assert.equal(saved.ok, true)
if (saved.ok) assert.equal(saved.validation?.formatType, "email")

assert.equal(ATTENTION_POOL.length, 5)
assert.equal(ATTENTION_POOL[0]?.correctOption, "Verified")
for (const item of ATTENTION_POOL) {
  assert.equal(item.options.length, 4)
  assert.equal(item.options.filter((option) => option === item.correctOption).length, 1)
  assert.ok(attentionCorrectIndex(item) >= 0)
}
const merged = withAttentionCheck(
  [
    {
      id: "q1",
      position: 1,
      kind: "short",
      prompt: "Email",
      options: [],
      ratingMin: null,
      ratingMax: null,
      ratingMinLabel: null,
      ratingMaxLabel: null,
    },
  ],
  { id: "attention", position: 0, prompt: ATTENTION_POOL[0].prompt, options: [...ATTENTION_POOL[0].options] },
)
assert.equal(merged.length, 2)
assert.equal(merged[0]?.attentionCheck, true)
assert.equal(merged[1]?.id, "q1")
assert.equal(merged[0]?.options.includes("Verified"), true)
assert.equal("correctOption" in (merged[0] ?? {}), false)

console.log("validation checks passed")
