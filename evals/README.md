# Skill evals

Skill quality is validated by running the scenarios in each `*.jsonl` against a
live agent, because trigger/behavior correctness is not unit-testable.

## Scenario schema (canonical — identical across all phases, R6)

One grader reads this single shape for every asset in every phase:

- `id` — scenario id
- `prompt` — the cold user message
- `expectTrigger` — the asset id that MUST fire, or `null` for a no-trigger scenario
- `mustNotTrigger` — (optional) array of asset ids that must NOT fire (co-trigger guard)
- `expect` — array of behavioral assertions checked against the transcript
- `toolsAbsent` — (optional) MCP tool names to simulate as unavailable (fallback paths)

## Claude-A / Claude-B process

- **Claude-A (actor):** runs in the vault with the candidate skill installed and
  the Specorator MCP server connected. It receives each scenario `prompt` cold.
- **Claude-B (grader):** receives Claude-A's full transcript plus the scenario's
  `should_trigger` + `expect` list and returns pass/fail per assertion. Claude-B
  never sees the skill body, only the transcript and the rubric.

## Model matrix

Run every scenario across the support matrix (e.g. the current Opus, Sonnet, and
Haiku tiers) for BOTH roles where practical, since trigger sensitivity varies by
model. A scenario passes only if it passes on every actor model in the matrix.
`should_trigger:false` scenarios guard against over-triggering.

## Running

These run out-of-band (not in `npx vitest run`). Wire them into CI as a separate
job once the harness exists; Phase 1 runs them manually before publishing the
skill. Record results (model × scenario × pass/fail) alongside the skill version.
