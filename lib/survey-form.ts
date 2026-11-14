import {
  creditUnit,
  maxMinCompletionSeconds,
  productConfig,
  type ProductRules,
} from "@/lib/config"
import type { QuestionInput, QuestionKind, SurveyInput } from "@/lib/types"

const kinds: QuestionKind[] = ["single", "multiple", "short", "rating"]

export type DraftQuestion = QuestionInput & { key: string }

export function blankQuestion(kind: QuestionKind, key: string): DraftQuestion {
  return {
    key,
    prompt: "",
    kind,
    options: kind === "single" || kind === "multiple" ? ["", ""] : [],
    ratingMin: 1,
    ratingMax: 5,
    ratingMinLabel: kind === "rating" ? "Not at all" : "",
    ratingMaxLabel: kind === "rating" ? "Very much" : "",
    isScreening: false,
    correctOptionIndexes: [],
  }
}

export function exampleSurvey(): { title: string; description: string; tags: string[]; questions: DraftQuestion[] } {
  return {
    title: "Weekend study habits of university students",
    description:
      "This survey explores how university students spend their weekends studying, including time spent, study locations, and productivity habits.",
    tags: ["Study habits", "Campus life"],
    questions: [
      {
        key: "ex-1",
        kind: "single",
        prompt: "How many hours do you study on weekends?",
        options: ["0–2", "3–5", "6+"],
        ratingMin: 1,
        ratingMax: 5,
        ratingMinLabel: "",
        ratingMaxLabel: "",
        isScreening: false,
        correctOptionIndexes: [],
      },
      {
        key: "ex-2",
        kind: "multiple",
        prompt: "Which study locations do you use on weekends?",
        options: ["Library", "Dorm / Home", "Café", "Other"],
        ratingMin: 1,
        ratingMax: 5,
        ratingMinLabel: "",
        ratingMaxLabel: "",
        isScreening: false,
        correctOptionIndexes: [],
      },
      {
        key: "ex-3",
        kind: "rating",
        prompt: "How productive do you feel when studying on weekends?",
        options: [],
        ratingMin: 1,
        ratingMax: 5,
        ratingMinLabel: "Not productive",
        ratingMaxLabel: "Very productive",
        isScreening: false,
        correctOptionIndexes: [],
      },
      {
        key: "ex-4",
        kind: "short",
        prompt: "What helps you stay focused while studying on weekends?",
        options: [],
        ratingMin: 1,
        ratingMax: 5,
        ratingMinLabel: "",
        ratingMaxLabel: "",
        isScreening: false,
        correctOptionIndexes: [],
      },
      {
        key: "ex-5",
        kind: "single",
        prompt: "Are you currently enrolled in a university program?",
        options: ["Yes", "No"],
        ratingMin: 1,
        ratingMax: 5,
        ratingMinLabel: "",
        ratingMaxLabel: "",
        isScreening: true,
        correctOptionIndexes: [0],
      },
    ],
  }
}

export function validateSurveyInput(
  input: SurveyInput,
  rules?: Pick<ProductRules, "questionsPerCredit" | "minSecondsPerQuestion">,
): { ok: true; value: SurveyInput } | { ok: false; message: string } {
  const title = input.title.trim()
  const description = input.description.trim()
  if (title.length < productConfig.titleMin || title.length > productConfig.titleMax) {
    return { ok: false, message: "Title must be between 3 and 120 characters." }
  }
  if (description.length > productConfig.descriptionMax) {
    return { ok: false, message: "Description must be 1000 characters or fewer." }
  }
  if (input.questions.length < 1 || input.questions.length > productConfig.maxQuestions) {
    return { ok: false, message: "A survey needs between 1 and 20 questions." }
  }

  const tags: string[] = []
  const seenTags = new Set<string>()
  for (const raw of input.tags) {
    const tag = raw.trim()
    if (!tag) continue
    if (tag.length > productConfig.maxTagLength) {
      return { ok: false, message: "Tags must be 24 characters or fewer." }
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9 &/-]{0,23}$/.test(tag)) {
      return { ok: false, message: "Tags can use letters, numbers, spaces, and & / -." }
    }
    const key = tag.toLowerCase()
    if (seenTags.has(key)) continue
    if (tags.length >= productConfig.maxTags) {
      return { ok: false, message: "Use at most 5 tags." }
    }
    seenTags.add(key)
    tags.push(tag)
  }

  const questions: QuestionInput[] = []
  for (const question of input.questions) {
    if (!kinds.includes(question.kind)) {
      return { ok: false, message: "Unknown question type." }
    }
    const prompt = question.prompt.trim()
    if (prompt.length < productConfig.promptMin || prompt.length > productConfig.promptMax) {
      return { ok: false, message: "Each question needs a prompt between 3 and 280 characters." }
    }

    if (question.kind === "single" || question.kind === "multiple") {
      const options = question.options.map((option) => option.trim())
      if (options.some((option) => option.length === 0)) {
        return { ok: false, message: "Options cannot be blank." }
      }
      if (options.length < productConfig.minOptions || options.length > productConfig.maxOptions) {
        return { ok: false, message: "Choice questions need 2 to 8 options." }
      }
      const optionKeys = new Set<string>()
      for (const option of options) {
        if (option.length > productConfig.optionMax) {
          return { ok: false, message: "Options must be 80 characters or fewer." }
        }
        const key = option.toLowerCase()
        if (optionKeys.has(key)) return { ok: false, message: "Options must be unique." }
        optionKeys.add(key)
      }
      let correct = [...new Set(question.correctOptionIndexes)].filter(
        (index) => Number.isInteger(index) && index >= 0 && index < options.length,
      )
      if (question.isScreening) {
        if (question.kind === "single") correct = correct.slice(0, 1)
        if (correct.length < 1) {
          return { ok: false, message: "Mark the correct answer for each screening question." }
        }
        if (question.kind === "single" && correct.length !== 1) {
          return { ok: false, message: "A single-choice screening question needs exactly one correct option." }
        }
      } else {
        correct = []
      }
      questions.push({
        prompt,
        kind: question.kind,
        options,
        ratingMin: 1,
        ratingMax: 5,
        ratingMinLabel: "",
        ratingMaxLabel: "",
        isScreening: question.isScreening,
        correctOptionIndexes: correct,
      })
      continue
    }

    if (question.isScreening) {
      return { ok: false, message: "Only single-choice and multiple-choice questions can be screening questions." }
    }

    if (question.kind === "rating") {
      const ratingMin = question.ratingMin
      const ratingMax = question.ratingMax
      if (
        !Number.isInteger(ratingMin) ||
        !Number.isInteger(ratingMax) ||
        ratingMin < 0 ||
        ratingMax > 10 ||
        ratingMax <= ratingMin ||
        ratingMax - ratingMin > 9
      ) {
        return { ok: false, message: "Rating scales must run from a lower number to a higher one, between 0 and 10." }
      }
      const ratingMinLabel = question.ratingMinLabel.trim()
      const ratingMaxLabel = question.ratingMaxLabel.trim()
      if (
        ratingMinLabel.length > productConfig.ratingLabelMax ||
        ratingMaxLabel.length > productConfig.ratingLabelMax
      ) {
        return { ok: false, message: "Rating labels must be 40 characters or fewer." }
      }
      questions.push({
        prompt,
        kind: "rating",
        options: [],
        ratingMin,
        ratingMax,
        ratingMinLabel,
        ratingMaxLabel,
        isScreening: false,
        correctOptionIndexes: [],
      })
      continue
    }

    questions.push({
      prompt,
      kind: "short",
      options: [],
      ratingMin: 1,
      ratingMax: 5,
      ratingMinLabel: "",
      ratingMaxLabel: "",
      isScreening: false,
      correctOptionIndexes: [],
    })
  }

  const questionsPerCredit = rules?.questionsPerCredit ?? productConfig.questionsPerCredit
  const secondsPerQuestion = rules?.minSecondsPerQuestion ?? productConfig.minSecondsPerQuestion
  const maxMinSeconds = maxMinCompletionSeconds(questions.length, secondsPerQuestion)
  if (!Number.isInteger(input.minCompletionSeconds) || input.minCompletionSeconds < 0) {
    return { ok: false, message: "Minimum time must be a whole number of seconds, zero or more." }
  }
  if (input.minCompletionSeconds > maxMinSeconds) {
    return {
      ok: false,
      message: `Minimum time cannot exceed ${maxMinSeconds} seconds for ${questions.length} ${questions.length === 1 ? "question" : "questions"}.`,
    }
  }

  const unit = creditUnit(questions.length, questionsPerCredit)
  let creditsToAllocate = input.creditsToAllocate
  if (input.publish) {
    if (!Number.isInteger(creditsToAllocate) || creditsToAllocate < unit) {
      return {
        ok: false,
        message: `Allocate at least ${unit} ${unit === 1 ? "credit" : "credits"} so one person can respond.`,
      }
    }
  } else if (!Number.isInteger(creditsToAllocate) || creditsToAllocate < 0) {
    creditsToAllocate = 0
  }

  return {
    ok: true,
    value: {
      id: input.id,
      title,
      description,
      tags,
      publish: input.publish,
      minCompletionSeconds: input.minCompletionSeconds,
      creditsToAllocate,
      questions,
    },
  }
}
