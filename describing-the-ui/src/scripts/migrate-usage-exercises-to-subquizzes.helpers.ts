/**
 * PURE, dependency-free logic for `migrate-usage-exercises-to-subquizzes`.
 *
 * Legacy "usage" lessons author post-passage exercises as standalone `other`-type freeform-canvas slides
 * (one `text` element = the question, one-or-more `textChoice` elements = the choices, exactly one marked
 * `isCorrectAnswer`) placed right after a `reading`+`fluency` "Usage N" slide. The new `subQuizzes` field
 * (see `packages/types/src/slide.ts`) embeds the same mini-quiz directly on its parent slide instead. This
 * module converts the former into the latter WITHOUT touching a database, so the transformation is fully
 * unit-testable. The CLI (`migrate-usage-exercises-to-subquizzes.ts`) owns DB access, orchestration,
 * reporting, and writes.
 */

// Reuse the fail-closed apply guard from the grammar-form migrations rather than mirroring it — one
// source of truth for "may this apply write to the connected database?".
export {
  type ApplyFlags,
  type GuardDecision,
  PRODUCTION_DB_NAME,
  evaluateApplyGuard,
} from "./revalidate-grammar-form-publication.helpers.js";

/** The minimal element shape this migration reads off an `other` slide's `elements` array. */
export type ElementLike =
  | { readonly type: "text"; readonly content: string }
  | { readonly type: "textChoice"; readonly text: string; readonly isCorrectAnswer: boolean }
  | { readonly type: string };

export interface SubQuiz {
  readonly id: string;
  readonly question: string;
  readonly questionMode: "multiple_choice";
  readonly options: readonly string[];
  readonly correctAnswer: string;
}

export type SubQuizExtraction =
  | { readonly ok: true; readonly subQuiz: SubQuiz }
  | { readonly ok: false; readonly reason: string };

/**
 * Extract a single `SubQuiz` from an `other` slide's freeform-canvas `elements`. Only the exact shape seen
 * across real data is accepted — exactly one `text` element (the question) and one-or-more `textChoice`
 * elements with EXACTLY one `isCorrectAnswer: true` (the rest become `options`) — and nothing else in the
 * array. Anything else is reported (never guessed) so an editor can review it by hand.
 */
export function extractSubQuizFromElements(
  elements: readonly ElementLike[],
  makeId: () => string
): SubQuizExtraction {
  const textEls = elements.filter(
    (e): e is Extract<ElementLike, { type: "text" }> => e.type === "text"
  );
  const choiceEls = elements.filter(
    (e): e is Extract<ElementLike, { type: "textChoice" }> => e.type === "textChoice"
  );
  const otherEls = elements.filter((e) => e.type !== "text" && e.type !== "textChoice");

  if (otherEls.length > 0) {
    return {
      ok: false,
      reason: `unexpected element type(s): ${[...new Set(otherEls.map((e) => e.type))].join(", ")}`,
    };
  }
  if (textEls.length !== 1) {
    return { ok: false, reason: `expected exactly 1 text element, found ${textEls.length}` };
  }
  if (choiceEls.length === 0) {
    return { ok: false, reason: "no textChoice elements" };
  }

  const correctEls = choiceEls.filter((e) => e.isCorrectAnswer);
  if (correctEls.length !== 1) {
    return {
      ok: false,
      reason: `expected exactly 1 correct textChoice, found ${correctEls.length}`,
    };
  }

  return {
    ok: true,
    subQuiz: {
      id: makeId(),
      // biome-ignore lint/style/noNonNullAssertion: textEls.length === 1 was just checked above.
      question: textEls[0]!.content,
      questionMode: "multiple_choice",
      options: choiceEls.filter((e) => !e.isCorrectAnswer).map((e) => e.text),
      // biome-ignore lint/style/noNonNullAssertion: correctEls.length === 1 was just checked above.
      correctAnswer: correctEls[0]!.text,
    },
  };
}

export interface AnchorSlideInput {
  readonly id: string;
  readonly sortOrder: number;
}

export interface CandidateSlideInput {
  readonly id: string;
  readonly sortOrder: number;
  readonly elements: readonly ElementLike[];
  /** Length of the candidate's OWN `slideData.subQuizzes` (0 when absent) — never its elements. */
  readonly existingSubQuizCount: number;
}

/**
 * Assign each candidate to the anchor immediately before it in `sortOrder` order (the last anchor with
 * `sortOrder < candidate.sortOrder`), i.e. each anchor claims candidates up to (not including) the NEXT
 * anchor in the same lesson. A candidate that sorts before every anchor is `unassigned`.
 */
export function assignCandidatesToAnchors(
  anchors: readonly AnchorSlideInput[],
  candidates: readonly CandidateSlideInput[]
): { assigned: Map<string, CandidateSlideInput[]>; unassigned: CandidateSlideInput[] } {
  const sortedAnchors = [...anchors].sort((a, b) => a.sortOrder - b.sortOrder);
  const assigned = new Map<string, CandidateSlideInput[]>();
  for (const anchor of sortedAnchors) assigned.set(anchor.id, []);

  const unassigned: CandidateSlideInput[] = [];
  const sortedCandidates = [...candidates].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const candidate of sortedCandidates) {
    let owner: AnchorSlideInput | null = null;
    for (const anchor of sortedAnchors) {
      if (anchor.sortOrder < candidate.sortOrder) owner = anchor;
      else break;
    }
    if (owner === null) {
      unassigned.push(candidate);
    } else {
      // biome-ignore lint/style/noNonNullAssertion: every sortedAnchors entry was seeded into the map above.
      assigned.get(owner.id)!.push(candidate);
    }
  }
  return { assigned, unassigned };
}

export type CandidateOutcome =
  | { readonly kind: "converted"; readonly subQuiz: SubQuiz }
  | { readonly kind: "skipped-has-own-subquizzes" }
  | { readonly kind: "skipped-unexpected-shape"; readonly reason: string }
  | { readonly kind: "skipped-no-anchor" };

export interface CandidatePlan {
  readonly candidateId: string;
  readonly outcome: CandidateOutcome;
}

export interface AnchorPlan {
  readonly anchorId: string;
  /** New subQuiz entries to APPEND to the anchor's existing `slideData.subQuizzes`, in sortOrder order. */
  readonly newSubQuizzes: readonly SubQuiz[];
  /** Candidate slide ids successfully folded into `newSubQuizzes` — these get `isTrash: true`. */
  readonly convertedCandidateIds: readonly string[];
}

export interface LessonConversionPlan {
  readonly anchorPlans: readonly AnchorPlan[];
  readonly candidatePlans: readonly CandidatePlan[];
}

/**
 * Plan one lesson's conversion: assign candidates to their owning anchor, then for each owned candidate
 * either extract a `SubQuiz` (and queue the candidate for `isTrash: true`) or record why it was skipped.
 * A candidate with its OWN non-empty `subQuizzes` is always skipped (never overwritten/flattened) so an
 * editor reviews it manually. Never mutates anything — pure planning only.
 */
export function planLessonConversion(
  anchors: readonly AnchorSlideInput[],
  candidates: readonly CandidateSlideInput[],
  makeId: () => string
): LessonConversionPlan {
  const { assigned, unassigned } = assignCandidatesToAnchors(anchors, candidates);
  const candidatePlans: CandidatePlan[] = [];
  const anchorPlans: AnchorPlan[] = [];

  for (const candidate of unassigned) {
    candidatePlans.push({ candidateId: candidate.id, outcome: { kind: "skipped-no-anchor" } });
  }

  for (const [anchorId, ownedCandidates] of assigned) {
    const newSubQuizzes: SubQuiz[] = [];
    const convertedCandidateIds: string[] = [];

    for (const candidate of ownedCandidates) {
      if (candidate.existingSubQuizCount > 0) {
        candidatePlans.push({
          candidateId: candidate.id,
          outcome: { kind: "skipped-has-own-subquizzes" },
        });
        continue;
      }

      const extraction = extractSubQuizFromElements(candidate.elements, makeId);
      if (!extraction.ok) {
        candidatePlans.push({
          candidateId: candidate.id,
          outcome: { kind: "skipped-unexpected-shape", reason: extraction.reason },
        });
        continue;
      }

      newSubQuizzes.push(extraction.subQuiz);
      convertedCandidateIds.push(candidate.id);
      candidatePlans.push({
        candidateId: candidate.id,
        outcome: { kind: "converted", subQuiz: extraction.subQuiz },
      });
    }

    anchorPlans.push({ anchorId, newSubQuizzes, convertedCandidateIds });
  }

  return { anchorPlans, candidatePlans };
}
