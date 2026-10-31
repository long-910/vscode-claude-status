# Pricing

How token cost is calculated (`src/data/pricing.ts`). All figures are **estimates** at
Anthropic's list API prices; they are calculated locally from the transcripts and never
fetched from an account.

---

## How an entry is priced

Every assistant entry in a transcript carries `message.model` and `message.usage`. With
`claudeStatus.pricing.useModelPricing` on (default), the rate is resolved in this order:

| Step | Rule | Reported as |
|---|---|---|
| 1. Normalize the id | Strip provider prefixes (`us.anthropic.`, `anthropic.`), snapshot dates (`-20250929`, `@20251101`), Bedrock suffixes (`-v1:0`) and `[1m]`: `us.anthropic.claude-sonnet-4-5-20250929-v1:0` → `claude-sonnet-4-5` | — |
| 2. User override | A key of `claudeStatus.pricing.modelOverrides` contained in the id (longest key wins) | `override` |
| 3. Built-in table | Parse `claude-<family>-<major>[-<minor>]` or the Claude 3 form `claude-<major>[-<minor>]-<family>`; use the newest row whose version is ≤ the model's (Mythos uses Fable's rates) | `builtin` |
| 4. Newer than the table | A known family with a newer version (e.g. a future `claude-opus-6`) or no version: the family's latest row | `estimated` — marked `≈` in the dashboard |
| 5. Unknown model | e.g. `<synthetic>`, no `model`: the manual rates | `manual` — marked `*` |

With `useModelPricing: false`, every entry uses the manual rates — exactly the calculation
before model pricing existed.

Every consumer — status bar totals, sidebar, project cost, prediction, heatmap, export —
uses the same `CostOptions` (`config.costOptions`), so the numbers always agree.

---

## Built-in rates

USD per 1M tokens, Anthropic first-party pricing, checked against
[platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)
on 2026-10-31. `pricing.test.ts` mirrors the published table, so a wrong row fails CI.

| Family | Versions | Input | Output | Cache hit |
|---|---|---|---|---|
| Fable / Mythos | 5 | $10.00 | $50.00 | $1.00 |
| Fable / Mythos | 5.1 | $10.00 | $50.00 | $0.25 |
| Opus | 3, 4, 4.1 | $15.00 | $75.00 | $1.50 |
| Opus | 4.5 – 4.8, 5 | $5.00 | $25.00 | $0.50 |
| Opus | 5.5 | $4.00 | $20.00 | $0.20 |
| Sonnet | 3.x – 4.x | $3.00 | $15.00 | $0.30 |
| Sonnet | 5 | $2.00 | $10.00 | $0.20 |
| Sonnet | 5.5 | $2.00 | $10.00 | $0.10 |
| Haiku | 3 | $0.25 | $1.25 | $0.03 |
| Haiku | 3.5 | $0.80 | $4.00 | $0.08 |
| Haiku | 4.5 | $1.00 | $5.00 | $0.10 |
| Haiku | 5.5, prompt ≤ 100K tokens | $0.10 | $0.50 | $0.01 |
| Haiku | 5.5, prompt > 100K tokens | $0.50 | $2.50 | $0.05 |

- **Cache writes:** 5-minute writes cost 1.25x and 1-hour writes 2x the model's input rate.
  Claude Code reports the split in `usage.cache_creation` (`ephemeral_5m_input_tokens` /
  `ephemeral_1h_input_tokens`); older entries without it are priced at the 5-minute rate.
- **Haiku 5.5 prompt length** is the entry's `input + cache read + cache write` tokens.

### Pricing modifiers

Applied on top of `builtin` / `estimated` rates when recorded on `message.usage` — never on
manual rates or overrides, which are taken as the exact rate you pay:

| Field | Value | Multiplier |
|---|---|---|
| `usage.speed` | `"fast"` (fast mode: Opus 5.5 / 5 / 4.8) | 2x every category |
| `usage.inference_geo` | `"us"` (US-only inference, Claude 4.6+) | 1.1x every category |

### Not modelled

Batch API discounts (Claude Code uses the Messages API), negotiated Enterprise discounts and
seat fees, and partner price lists (Bedrock, Google-managed Vertex), which differ by region.

---

## Settings

| Setting | Use |
|---|---|
| `pricing.useModelPricing` (default `true`) | Price by model. Off: manual rates for everything |
| `pricing.modelOverrides` | Exact rates for a model, e.g. a new release before the extension is updated: `{ "claude-opus-6": { "inputPerMillion": 4, "outputPerMillion": 20 } }`. Cache read defaults to 0.1x input, cache write to 1.25x input |
| `pricing.inputPerMillion`, `outputPerMillion`, `cacheReadPerMillion`, `cacheCreatePerMillion` | Manual rates (default: Sonnet 4.x, $3 / $15 / $0.30 / $3.75). Used for unknown models, or everything when model pricing is off |

Changing any `claudeStatus.pricing.*` setting recomputes all costs immediately.

---

## Updating prices (maintainers)

When Anthropic releases a model or changes a price:

1. Add or edit a row in `MODEL_RATES` (`src/data/pricing.ts`). Give every released model its
   own row, even at an unchanged price, so it reports as `builtin` rather than `estimated`.
2. Add the model to the published-price table and to the "every released model resolves as
   builtin" test in `src/test/suite/pricing.test.ts`.
3. Update the table above and the source date.

Until a release ships, users can bridge the gap with `pricing.modelOverrides`.
