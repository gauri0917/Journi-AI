// Eval harness for AI-assisted draft generation.
//
// Run with:
//   npm run eval            — RAG on (default, matches production behavior)
//   npm run eval:no-rag     — RAG off (baseline, for A/B comparison)
//   npm run eval:ab         — runs both back-to-back and diffs the results
//
// Calls generateWithRetry() from src/lib/generate.ts directly — the exact
// same function the live API route uses — so results measure production
// behavior, not a simulation of it. Requires OPENAI_API_KEY in .env.
//
// A "needs_clarification" outcome isn't scored as a failure — the harness
// runs unattended, so it can't answer interactively, and asking is a
// legitimate outcome per the system prompt's own rules. It's tracked as its
// own category, with clarificationPlausible on each case letting you see
// whether the model's judgment matched what the case was designed to test.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { generateWithRetry } from "../src/lib/generate";
import { EVAL_CASES, type EvalCase } from "./cases";
import { scoreAgainstRubric } from "./rubric";

interface CaseResult {
  id: string;
  industry: string;
  outcome: "draft" | "needs_clarification" | "failed";
  attempts: number;
  retrievedCount: number;
  avgConfidence: number | null;
  clarificationQuestion: string | null;
  clarificationPlausible: boolean;
  rubricPassed: boolean | null;
  failedChecks: string[];
  generationErrors: string[] | null;
}

async function runCase(evalCase: EvalCase, useRag: boolean): Promise<CaseResult> {
  try {
    const result = await generateWithRetry(evalCase.description, { useRag });

    if (!result.ok && result.needsClarification) {
      return {
        id: evalCase.id,
        industry: evalCase.industry,
        outcome: "needs_clarification",
        attempts: result.attempts,
        retrievedCount: result.retrievedCount,
        avgConfidence: null,
        clarificationQuestion: result.question,
        clarificationPlausible: evalCase.rubric.clarificationPlausible ?? false,
        rubricPassed: null,
        failedChecks: [],
        generationErrors: null,
      };
    }

    if (!result.ok) {
      return {
        id: evalCase.id,
        industry: evalCase.industry,
        outcome: "failed",
        attempts: result.attempts,
        retrievedCount: result.retrievedCount,
        avgConfidence: null,
        clarificationQuestion: null,
        clarificationPlausible: evalCase.rubric.clarificationPlausible ?? false,
        rubricPassed: null,
        failedChecks: [],
        generationErrors: result.errors,
      };
    }

    const rubricResult = scoreAgainstRubric(result.data, result.stageConfidence, evalCase);
    const failedChecks = rubricResult.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);

    return {
      id: evalCase.id,
      industry: evalCase.industry,
      outcome: "draft",
      attempts: result.attempts,
      retrievedCount: result.retrievedCount,
      avgConfidence: rubricResult.avgConfidence,
      clarificationQuestion: null,
      clarificationPlausible: evalCase.rubric.clarificationPlausible ?? false,
      rubricPassed: rubricResult.passed,
      failedChecks,
      generationErrors: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: evalCase.id,
      industry: evalCase.industry,
      outcome: "failed",
      attempts: 0,
      retrievedCount: 0,
      avgConfidence: null,
      clarificationQuestion: null,
      clarificationPlausible: evalCase.rubric.clarificationPlausible ?? false,
      rubricPassed: null,
      failedChecks: [],
      generationErrors: [message],
    };
  }
}

async function runAll(useRag: boolean, label: string): Promise<CaseResult[]> {
  console.log(`\nRunning eval harness [${label}] — ${EVAL_CASES.length} cases\n`);
  const results: CaseResult[] = [];
  for (const evalCase of EVAL_CASES) {
    process.stdout.write(`  ${evalCase.id} (${evalCase.industry})... `);
    const r = await runCase(evalCase, useRag);
    if (r.outcome === "needs_clarification") {
      console.log(`ASKED FOR CLARIFICATION${r.clarificationPlausible ? " (expected)" : " (unexpected)"}: "${r.clarificationQuestion}"`);
    } else if (r.outcome === "failed") {
      console.log(`FAILED (${r.attempts} attempts): ${r.generationErrors?.join("; ")}`);
    } else {
      console.log(
        `${r.rubricPassed ? "PASS" : "RUBRIC FAIL"} (${r.attempts} attempt${r.attempts > 1 ? "s" : ""}, avg confidence ${r.avgConfidence?.toFixed(2) ?? "n/a"}, retrieved ${r.retrievedCount})` +
          (r.failedChecks.length > 0 ? `\n      ${r.failedChecks.join("\n      ")}` : "")
      );
    }
    results.push(r);
  }
  return results;
}

function summarize(results: CaseResult[], label: string) {
  const total = results.length;
  const drafted = results.filter((r) => r.outcome === "draft").length;
  const clarified = results.filter((r) => r.outcome === "needs_clarification").length;
  const failed = results.filter((r) => r.outcome === "failed").length;
  const rubricPassed = results.filter((r) => r.rubricPassed === true).length;
  const firstAttempt = results.filter((r) => r.outcome === "draft" && r.attempts === 1).length;
  const avgConfidences = results.map((r) => r.avgConfidence).filter((c): c is number => c != null);
  const overallAvgConfidence = avgConfidences.length > 0 ? avgConfidences.reduce((a, b) => a + b, 0) / avgConfidences.length : null;

  console.log(`\n${"=".repeat(60)}\nSUMMARY [${label}]\n${"=".repeat(60)}`);
  console.log(`Total cases:              ${total}`);
  console.log(`Drafted directly:         ${drafted}/${total} (${pct(drafted, total)})`);
  console.log(`Asked for clarification:  ${clarified}/${total} (${pct(clarified, total)})`);
  console.log(`Hard failures:            ${failed}/${total} (${pct(failed, total)})`);
  console.log(`Rubric passed (of drafts): ${rubricPassed}/${drafted || 0} (${pct(rubricPassed, drafted)})`);
  console.log(`First-attempt success:    ${firstAttempt}/${drafted || 0} (${pct(firstAttempt, drafted)})`);
  console.log(`Overall avg confidence:   ${overallAvgConfidence?.toFixed(2) ?? "n/a"}`);

  const failureTaxonomy: Record<string, number> = {};
  for (const r of results) {
    for (const check of r.failedChecks) failureTaxonomy[check.split(":")[0]] = (failureTaxonomy[check.split(":")[0]] ?? 0) + 1;
  }
  if (Object.keys(failureTaxonomy).length > 0) {
    console.log("\nFailure taxonomy:");
    for (const [reason, count] of Object.entries(failureTaxonomy).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count}x  ${reason}`);
    }
  }

  return { total, drafted, clarified, failed, rubricPassed, firstAttempt, overallAvgConfidence };
}

function pct(n: number, total: number): string {
  if (total === 0) return "n/a";
  return `${((n / total) * 100).toFixed(0)}%`;
}

function writeReport(name: string, payload: unknown) {
  const resultsDir = path.join(__dirname, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const filename = `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(path.join(resultsDir, filename), JSON.stringify(payload, null, 2));
  console.log(`\nFull report written to eval/results/${filename}`);
}

async function main() {
  const mode = process.argv[2] ?? "rag";

  if (mode === "ab") {
    // A/B comparison: same 13 cases, RAG off then RAG on, diffed. This is
    // most meaningful once ai_draft_examples has real published examples in
    // it — with an empty corpus, "on" and "off" should be identical, which
    // is itself a useful sanity check that retrieval fails soft as designed.
    const withoutRag = await runAll(false, "RAG OFF");
    const summaryOff = summarize(withoutRag, "RAG OFF");
    const withRag = await runAll(true, "RAG ON");
    const summaryOn = summarize(withRag, "RAG ON");

    console.log(`\n${"=".repeat(60)}\nA/B DELTA (ON minus OFF)\n${"=".repeat(60)}`);
    console.log(`Rubric pass rate: ${pct(summaryOff.rubricPassed, summaryOff.drafted)} -> ${pct(summaryOn.rubricPassed, summaryOn.drafted)}`);
    console.log(`First-attempt success: ${pct(summaryOff.firstAttempt, summaryOff.drafted)} -> ${pct(summaryOn.firstAttempt, summaryOn.drafted)}`);
    console.log(
      `Avg confidence: ${summaryOff.overallAvgConfidence?.toFixed(2) ?? "n/a"} -> ${summaryOn.overallAvgConfidence?.toFixed(2) ?? "n/a"}`
    );

    writeReport("ab-comparison", { ragOff: { summary: summaryOff, results: withoutRag }, ragOn: { summary: summaryOn, results: withRag } });
    return;
  }

  const useRag = mode !== "no-rag";
  const results = await runAll(useRag, useRag ? "RAG ON" : "RAG OFF");
  const summary = summarize(results, useRag ? "RAG ON" : "RAG OFF");
  writeReport(useRag ? "rag-on" : "rag-off", { summary, results });
}

main().catch((err) => {
  console.error("Eval harness crashed:", err);
  process.exit(1);
});
