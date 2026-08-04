/**
 * Consolidate legacy "usage" lesson exercises into the new `subQuizzes` field.
 *
 * Background: usage-focused lessons author their post-passage checks as standalone `other`-type
 * freeform-canvas slides (`skill: "usage"`) placed right after a `reading`+`fluency`+`usage` "Usage N"
 * slide (the ANCHOR). The new `subQuizzes` field (see `packages/types/src/slide.ts`) embeds the same
 * mini-quiz directly on the anchor instead of as separate slides. This migration extracts each eligible
 * exercise's question/choices from its `elements` (one `text` = question, textChoice elements = choices,
 * exactly one `isCorrectAnswer`), appends it to the owning anchor's `slideData.subQuizzes`, and marks the
 * original exercise slide `isTrash: true` (soft delete — recoverable, matches how this codebase already
 * retires superseded slides; see `migrate-slide-sort-order.ts`'s trashed duplicates).
 *
 * ANCHOR/OWNERSHIP: within one lesson there can be several "Usage N" anchors in a row. Each anchor claims
 * every `other`+`usage` exercise between itself and the NEXT anchor's `sortOrder` (see
 * `assignCandidatesToAnchors` in the helpers module) — never all trailing exercises in the lesson, which
 * would misattribute a later passage's exercises to an earlier one.
 *
 * NEVER AUTO-CONVERTED (reported only):
 *   - A candidate whose OWN `slideData.subQuizzes` is already non-empty (already authored via the new UI;
 *     flattening its elements-derived question in on top could duplicate or shadow real content).
 *   - A candidate whose `elements` don't match the expected shape exactly (not exactly 1 `text` + 1-or-more
 *     `textChoice` with exactly 1 `isCorrectAnswer`, and nothing else in the array).
 *   - A candidate that sorts before every anchor in its lesson (no owner).
 *
 * SAFETY:
 *   - DRY-RUN by default: prints the plan and mutates NOTHING.
 *   - `--apply` performs writes, but only after the shared fail-closed guard passes.
 *   - The guard resolves the ACTUAL connected database name from the live mongoose connection. A
 *     production apply (db name EXACTLY `b2b-prod`) requires `--allow-production`; an unresolved or
 *     unrecognized name refuses any apply.
 *   - Each anchor + its converted candidates are written inside ONE transaction (anchor's `subQuizzes`
 *     update and every converted candidate's `isTrash: true` land together or not at all), so a failure
 *     mid-lesson never leaves an exercise trashed without its content having landed on the anchor.
 *
 * Run:
 *   # dry-run (safe, read-only):
 *   pnpm --filter b2b-api exec tsx src/scripts/migrate-usage-exercises-to-subquizzes.ts
 *   # apply on a non-production db:
 *   pnpm --filter b2b-api exec tsx src/scripts/migrate-usage-exercises-to-subquizzes.ts --apply
 *   # apply on production:
 *   pnpm --filter b2b-api exec tsx src/scripts/migrate-usage-exercises-to-subquizzes.ts --apply --allow-production
 */
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { SlideModel } from "../domains/slides/slide.model.js";
import { connectToDatabase } from "../shared/config/database.js";
import { logger } from "../shared/utils/logger.js";
import {
  type AnchorSlideInput,
  type CandidateSlideInput,
  type ElementLike,
  evaluateApplyGuard,
  planLessonConversion,
} from "./migrate-usage-exercises-to-subquizzes.helpers.js";
import { resolveConnectedDbName } from "./revalidate-grammar-form-publication.js";

const ANCHOR_FILTER = {
  type: "reading",
  skill: "usage",
  knowledgeArea: "fluency",
  isTrash: false,
  isDeleted: false,
} as const;

const CANDIDATE_FILTER = {
  type: "other",
  skill: "usage",
  isTrash: false,
  isDeleted: false,
} as const;

interface CliFlags {
  readonly apply: boolean;
  readonly allowProduction: boolean;
}

function parseFlags(argv: readonly string[]): CliFlags {
  return {
    apply: argv.includes("--apply"),
    allowProduction: argv.includes("--allow-production"),
  };
}

interface RawSlide {
  readonly _id: mongoose.Types.ObjectId;
  readonly lessonId: mongoose.Types.ObjectId;
  readonly sortOrder: number;
  readonly elements?: ElementLike[];
  readonly slideData?: { subQuizzes?: unknown[] };
}

async function loadByLesson<T>(
  filter: Record<string, unknown>,
  map: (slide: RawSlide) => T
): Promise<Map<string, T[]>> {
  const slides = (await SlideModel.find(filter)
    .select("_id lessonId sortOrder elements slideData")
    .lean()) as unknown as RawSlide[];

  const byLesson = new Map<string, T[]>();
  for (const slide of slides) {
    const lessonId = slide.lessonId.toString();
    const mapped = map(slide);
    const bucket = byLesson.get(lessonId);
    if (bucket) bucket.push(mapped);
    else byLesson.set(lessonId, [mapped]);
  }
  return byLesson;
}

async function loadAnchorsByLesson(): Promise<Map<string, AnchorSlideInput[]>> {
  return loadByLesson(ANCHOR_FILTER, (slide) => ({
    id: slide._id.toString(),
    sortOrder: slide.sortOrder,
  }));
}

async function loadCandidatesByLesson(): Promise<Map<string, CandidateSlideInput[]>> {
  return loadByLesson(CANDIDATE_FILTER, (slide) => ({
    id: slide._id.toString(),
    sortOrder: slide.sortOrder,
    elements: slide.elements ?? [],
    existingSubQuizCount: slide.slideData?.subQuizzes?.length ?? 0,
  }));
}

interface LessonPlanSummary {
  readonly lessonId: string;
  readonly converted: number;
  readonly skippedHasOwnSubQuizzes: number;
  readonly skippedUnexpectedShape: readonly { candidateId: string; reason: string }[];
  readonly skippedNoAnchor: number;
}

/**
 * Write one lesson's plan inside a single transaction: append `newSubQuizzes` to each anchor's
 * `slideData.subQuizzes` (defaulting a missing array to `[]` first) and set `isTrash: true` on every
 * converted candidate. All-or-nothing per lesson — a failure aborts only this lesson's transaction.
 */
async function applyLessonPlan(anchorPlans: LessonConversionAnchorPlans): Promise<{
  anchorsUpdated: number;
  candidatesTrashed: number;
}> {
  let anchorsUpdated = 0;
  let candidatesTrashed = 0;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const plan of anchorPlans) {
      if (plan.newSubQuizzes.length === 0) continue;

      const anchorObjectId = new mongoose.Types.ObjectId(plan.anchorId);
      const anchor = await SlideModel.findOne(
        { _id: anchorObjectId },
        { "slideData.subQuizzes": 1 },
        { session }
      ).lean<{ slideData?: { subQuizzes?: unknown[] } }>();
      const existing = anchor?.slideData?.subQuizzes ?? [];

      const anchorRes = await SlideModel.updateOne(
        { _id: anchorObjectId },
        { $set: { "slideData.subQuizzes": [...existing, ...plan.newSubQuizzes] } },
        { session }
      );
      anchorsUpdated += anchorRes.modifiedCount ?? 0;

      if (plan.convertedCandidateIds.length > 0) {
        const candidateObjectIds = plan.convertedCandidateIds.map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        const candidatesRes = await SlideModel.updateMany(
          { _id: { $in: candidateObjectIds } },
          { $set: { isTrash: true } },
          { session }
        );
        candidatesTrashed += candidatesRes.modifiedCount ?? 0;
      }
    }
    await session.commitTransaction();
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  return { anchorsUpdated, candidatesTrashed };
}

type LessonConversionAnchorPlans = ReturnType<typeof planLessonConversion>["anchorPlans"];

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  await connectToDatabase();
  const dbName = resolveConnectedDbName();

  logger.info(
    `migrate-usage-exercises-to-subquizzes: connected db="${dbName ?? "<unresolved>"}"${
      flags.apply ? "" : " (DRY RUN)"
    }`
  );

  const [anchorsByLesson, candidatesByLesson] = await Promise.all([
    loadAnchorsByLesson(),
    loadCandidatesByLesson(),
  ]);

  const lessonIds = new Set([...anchorsByLesson.keys(), ...candidatesByLesson.keys()]);

  const lessonSummaries: LessonPlanSummary[] = [];
  const lessonPlans = new Map<string, LessonConversionAnchorPlans>();
  let totalConverted = 0;
  let totalSkippedHasOwn = 0;
  let totalSkippedShape = 0;
  let totalSkippedNoAnchor = 0;

  for (const lessonId of lessonIds) {
    const anchors = anchorsByLesson.get(lessonId) ?? [];
    const candidates = candidatesByLesson.get(lessonId) ?? [];

    const plan = planLessonConversion(anchors, candidates, randomUUID);
    lessonPlans.set(lessonId, plan.anchorPlans);

    const converted = plan.candidatePlans.filter((p) => p.outcome.kind === "converted").length;
    const skippedHasOwn = plan.candidatePlans.filter(
      (p) => p.outcome.kind === "skipped-has-own-subquizzes"
    ).length;
    const skippedShape = plan.candidatePlans
      .filter((p) => p.outcome.kind === "skipped-unexpected-shape")
      .map((p) => ({
        candidateId: p.candidateId,
        reason: (p.outcome as { reason: string }).reason,
      }));
    const skippedNoAnchor = plan.candidatePlans.filter(
      (p) => p.outcome.kind === "skipped-no-anchor"
    ).length;

    totalConverted += converted;
    totalSkippedHasOwn += skippedHasOwn;
    totalSkippedShape += skippedShape.length;
    totalSkippedNoAnchor += skippedNoAnchor;

    if (converted + skippedHasOwn + skippedShape.length + skippedNoAnchor > 0) {
      lessonSummaries.push({
        lessonId,
        converted,
        skippedHasOwnSubQuizzes: skippedHasOwn,
        skippedUnexpectedShape: skippedShape,
        skippedNoAnchor,
      });
    }
  }

  logger.info("Usage-exercise-to-subQuizzes migration plan:", {
    lessonsScanned: lessonIds.size,
    lessonsWithChanges: lessonSummaries.length,
    totalConverted,
    totalSkippedHasOwnSubQuizzes: totalSkippedHasOwn,
    totalSkippedUnexpectedShape: totalSkippedShape,
    totalSkippedNoAnchor: totalSkippedNoAnchor,
  });

  const shapeIssues = lessonSummaries.flatMap((s) => s.skippedUnexpectedShape);
  if (shapeIssues.length > 0) {
    logger.info("FLAGGED — unexpected elements shape (manual review needed):", {
      count: shapeIssues.length,
      sample: shapeIssues.slice(0, 20),
    });
  }
  if (totalSkippedHasOwn > 0) {
    logger.info(
      `FLAGGED — ${totalSkippedHasOwn} candidate(s) already have their own subQuizzes; left untouched.`
    );
  }
  if (totalSkippedNoAnchor > 0) {
    logger.info(
      `FLAGGED — ${totalSkippedNoAnchor} candidate(s) sort before any usage/fluency anchor in their lesson; left untouched.`
    );
  }

  if (!flags.apply) {
    logger.info("DRY RUN complete. No writes performed. Re-run with --apply to convert.");
    return;
  }

  if (totalConverted === 0) {
    logger.info("Nothing to convert — no eligible exercises. (0 writes)");
    return;
  }

  const guard = evaluateApplyGuard(dbName, { allowProduction: flags.allowProduction });
  if (!guard.allowed) {
    logger.error(`Refusing to apply: ${guard.reason}`);
    return;
  }
  logger.info(guard.reason);

  let anchorsUpdated = 0;
  let candidatesTrashed = 0;
  let lessonsProcessed = 0;
  for (const [lessonId, anchorPlans] of lessonPlans) {
    const hasWork = anchorPlans.some((p) => p.newSubQuizzes.length > 0);
    if (!hasWork) continue;
    const result = await applyLessonPlan(anchorPlans);
    anchorsUpdated += result.anchorsUpdated;
    candidatesTrashed += result.candidatesTrashed;
    lessonsProcessed++;
    if (lessonsProcessed % 25 === 0) {
      logger.info(`  processed ${lessonsProcessed} lesson(s)...`, { lessonId });
    }
  }

  logger.info("Usage-exercise-to-subQuizzes migration applied:", {
    lessonsProcessed,
    anchorsUpdated,
    candidatesTrashed,
  });
}

// Only run when invoked directly, so the exported functions above stay importable by tests.
const invokedDirectly = process.argv[1]?.includes("migrate-usage-exercises-to-subquizzes");
if (invokedDirectly) {
  main()
    .then(() => mongoose.connection.close())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("migrate-usage-exercises-to-subquizzes: failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      mongoose.connection.close().finally(() => process.exit(1));
    });
}
