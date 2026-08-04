import { describe, expect, it } from "vitest";
import {
  type AnchorSlideInput,
  type CandidateSlideInput,
  assignCandidatesToAnchors,
  extractSubQuizFromElements,
  planLessonConversion,
} from "./migrate-usage-exercises-to-subquizzes.helpers.js";

let idCounter = 0;
const makeId = () => `id-${++idCounter}`;

describe("extractSubQuizFromElements", () => {
  it("extracts question + options + correctAnswer from a single-choice exercise", () => {
    const result = extractSubQuizFromElements(
      [
        { type: "text", content: "How are you?" },
        { type: "textChoice", text: "Good", isCorrectAnswer: true },
      ],
      makeId
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subQuiz.question).toBe("How are you?");
      expect(result.subQuiz.correctAnswer).toBe("Good");
      expect(result.subQuiz.options).toEqual([]);
      expect(result.subQuiz.questionMode).toBe("multiple_choice");
    }
  });

  it("puts non-correct textChoice elements into options, in original order", () => {
    const result = extractSubQuizFromElements(
      [
        { type: "text", content: "What time is the train departing?" },
        { type: "textChoice", text: "7 AM", isCorrectAnswer: false },
        { type: "textChoice", text: "10 AM", isCorrectAnswer: true },
        { type: "textChoice", text: "9 PM", isCorrectAnswer: false },
      ],
      makeId
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subQuiz.correctAnswer).toBe("10 AM");
      expect(result.subQuiz.options).toEqual(["7 AM", "9 PM"]);
    }
  });

  it("rejects zero text elements", () => {
    const result = extractSubQuizFromElements(
      [{ type: "textChoice", text: "A", isCorrectAnswer: true }],
      makeId
    );
    expect(result).toEqual({ ok: false, reason: "expected exactly 1 text element, found 0" });
  });

  it("rejects more than one text element", () => {
    const result = extractSubQuizFromElements(
      [
        { type: "text", content: "Q1" },
        { type: "text", content: "Q2" },
        { type: "textChoice", text: "A", isCorrectAnswer: true },
      ],
      makeId
    );
    expect(result).toEqual({ ok: false, reason: "expected exactly 1 text element, found 2" });
  });

  it("rejects zero textChoice elements", () => {
    const result = extractSubQuizFromElements([{ type: "text", content: "Q" }], makeId);
    expect(result).toEqual({ ok: false, reason: "no textChoice elements" });
  });

  it("rejects zero correct answers", () => {
    const result = extractSubQuizFromElements(
      [
        { type: "text", content: "Q" },
        { type: "textChoice", text: "A", isCorrectAnswer: false },
        { type: "textChoice", text: "B", isCorrectAnswer: false },
      ],
      makeId
    );
    expect(result).toEqual({
      ok: false,
      reason: "expected exactly 1 correct textChoice, found 0",
    });
  });

  it("rejects more than one correct answer", () => {
    const result = extractSubQuizFromElements(
      [
        { type: "text", content: "Q" },
        { type: "textChoice", text: "A", isCorrectAnswer: true },
        { type: "textChoice", text: "B", isCorrectAnswer: true },
      ],
      makeId
    );
    expect(result).toEqual({
      ok: false,
      reason: "expected exactly 1 correct textChoice, found 2",
    });
  });

  it("rejects unexpected element types instead of silently ignoring them", () => {
    const result = extractSubQuizFromElements(
      [
        { type: "text", content: "Q" },
        { type: "textChoice", text: "A", isCorrectAnswer: true },
        { type: "image" },
      ],
      makeId
    );
    expect(result).toEqual({ ok: false, reason: "unexpected element type(s): image" });
  });
});

describe("assignCandidatesToAnchors", () => {
  const anchors: AnchorSlideInput[] = [
    { id: "anchor-1", sortOrder: 1000 },
    { id: "anchor-2", sortOrder: 2000 },
  ];

  it("assigns a candidate to the anchor immediately before it", () => {
    const candidates: CandidateSlideInput[] = [
      { id: "c1", sortOrder: 1500, elements: [], existingSubQuizCount: 0 },
      { id: "c2", sortOrder: 2500, elements: [], existingSubQuizCount: 0 },
    ];
    const { assigned, unassigned } = assignCandidatesToAnchors(anchors, candidates);
    expect(assigned.get("anchor-1")?.map((c) => c.id)).toEqual(["c1"]);
    expect(assigned.get("anchor-2")?.map((c) => c.id)).toEqual(["c2"]);
    expect(unassigned).toEqual([]);
  });

  it("stops an anchor's window at the NEXT anchor, even with multiple candidates in between", () => {
    const candidates: CandidateSlideInput[] = [
      { id: "c1", sortOrder: 1100, elements: [], existingSubQuizCount: 0 },
      { id: "c2", sortOrder: 1200, elements: [], existingSubQuizCount: 0 },
      { id: "c3", sortOrder: 2100, elements: [], existingSubQuizCount: 0 },
    ];
    const { assigned } = assignCandidatesToAnchors(anchors, candidates);
    expect(assigned.get("anchor-1")?.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(assigned.get("anchor-2")?.map((c) => c.id)).toEqual(["c3"]);
  });

  it("the last anchor's window is unbounded (extends to the end of the lesson)", () => {
    const candidates: CandidateSlideInput[] = [
      { id: "c1", sortOrder: 999999, elements: [], existingSubQuizCount: 0 },
    ];
    const { assigned } = assignCandidatesToAnchors(anchors, candidates);
    expect(assigned.get("anchor-2")?.map((c) => c.id)).toEqual(["c1"]);
  });

  it("a candidate sorting before every anchor is unassigned", () => {
    const candidates: CandidateSlideInput[] = [
      { id: "c1", sortOrder: 500, elements: [], existingSubQuizCount: 0 },
    ];
    const { assigned, unassigned } = assignCandidatesToAnchors(anchors, candidates);
    expect(assigned.get("anchor-1")).toEqual([]);
    expect(unassigned.map((c) => c.id)).toEqual(["c1"]);
  });

  it("preserves ascending sortOrder within each anchor's candidate list", () => {
    const candidates: CandidateSlideInput[] = [
      { id: "c-late", sortOrder: 1900, elements: [], existingSubQuizCount: 0 },
      { id: "c-early", sortOrder: 1100, elements: [], existingSubQuizCount: 0 },
    ];
    const { assigned } = assignCandidatesToAnchors(anchors, candidates);
    expect(assigned.get("anchor-1")?.map((c) => c.id)).toEqual(["c-early", "c-late"]);
  });
});

describe("planLessonConversion", () => {
  const anchors: AnchorSlideInput[] = [{ id: "anchor-1", sortOrder: 1000 }];
  const validElements = (question: string, answer: string) => [
    { type: "text" as const, content: question },
    { type: "textChoice" as const, text: answer, isCorrectAnswer: true },
  ];

  it("converts an eligible candidate and queues it for isTrash", () => {
    const candidates: CandidateSlideInput[] = [
      { id: "c1", sortOrder: 1100, elements: validElements("Q1", "A1"), existingSubQuizCount: 0 },
    ];
    const plan = planLessonConversion(anchors, candidates, makeId);
    expect(plan.anchorPlans).toHaveLength(1);
    expect(plan.anchorPlans[0]?.newSubQuizzes).toHaveLength(1);
    expect(plan.anchorPlans[0]?.newSubQuizzes[0]?.question).toBe("Q1");
    expect(plan.anchorPlans[0]?.convertedCandidateIds).toEqual(["c1"]);
    expect(plan.candidatePlans).toEqual([
      {
        candidateId: "c1",
        outcome: { kind: "converted", subQuiz: plan.anchorPlans[0]?.newSubQuizzes[0] },
      },
    ]);
  });

  it("orders newSubQuizzes by sortOrder regardless of input order", () => {
    const candidates: CandidateSlideInput[] = [
      {
        id: "c-later",
        sortOrder: 1900,
        elements: validElements("Q-later", "A"),
        existingSubQuizCount: 0,
      },
      {
        id: "c-earlier",
        sortOrder: 1100,
        elements: validElements("Q-earlier", "A"),
        existingSubQuizCount: 0,
      },
    ];
    const plan = planLessonConversion(anchors, candidates, makeId);
    expect(plan.anchorPlans[0]?.newSubQuizzes.map((q) => q.question)).toEqual([
      "Q-earlier",
      "Q-later",
    ]);
  });

  it("skips (and never trashes) a candidate that already has its own subQuizzes", () => {
    const candidates: CandidateSlideInput[] = [
      { id: "c1", sortOrder: 1100, elements: validElements("Q1", "A1"), existingSubQuizCount: 2 },
    ];
    const plan = planLessonConversion(anchors, candidates, makeId);
    expect(plan.anchorPlans[0]?.newSubQuizzes).toEqual([]);
    expect(plan.anchorPlans[0]?.convertedCandidateIds).toEqual([]);
    expect(plan.candidatePlans).toEqual([
      { candidateId: "c1", outcome: { kind: "skipped-has-own-subquizzes" } },
    ]);
  });

  it("skips a candidate with an unexpected elements shape, with a reason", () => {
    const candidates: CandidateSlideInput[] = [
      {
        id: "c1",
        sortOrder: 1100,
        elements: [{ type: "text", content: "Q" }],
        existingSubQuizCount: 0,
      },
    ];
    const plan = planLessonConversion(anchors, candidates, makeId);
    expect(plan.candidatePlans).toEqual([
      {
        candidateId: "c1",
        outcome: { kind: "skipped-unexpected-shape", reason: "no textChoice elements" },
      },
    ]);
  });

  it("reports a candidate sorting before every anchor as skipped-no-anchor", () => {
    const candidates: CandidateSlideInput[] = [
      { id: "c1", sortOrder: 1, elements: validElements("Q", "A"), existingSubQuizCount: 0 },
    ];
    const plan = planLessonConversion(anchors, candidates, makeId);
    expect(plan.candidatePlans).toEqual([
      { candidateId: "c1", outcome: { kind: "skipped-no-anchor" } },
    ]);
    expect(plan.anchorPlans[0]?.newSubQuizzes).toEqual([]);
  });
});
