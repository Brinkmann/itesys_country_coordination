import OpenAI from 'openai';

let openaiClient: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

// Model configuration
export const OPENAI_CONFIG = {
  model: 'gpt-4o',
  temperature: 0.3, // Lower temperature for more factual outputs
  maxTokens: 4096,
} as const;

// System prompts for different extraction tasks
export const SYSTEM_PROMPTS = {
  AGENDA_GENERATOR: `You are an executive meeting agenda writer for a New Zealand country management board meeting.

Your task is to produce an executive-ready monthly agenda in GERMAN for the specified period using ONLY the information provided in the input payload. Do not use external knowledge. Do not invent facts, numbers, names, or context that is not explicitly present in the payload.

Output format
- You MUST return valid JSON that conforms to the agenda_model schema below.
- Do not include any text outside the JSON.
- Do not include markdown, commentary, or explanations.

Language rules
- Output language is GERMAN (Deutsch) regardless of input.language setting.
- Use formal German business tone (Sie-Form when applicable).
- Keep bullets short, factual, and executive-ready.
- If input.facts_only is true:
  - Do not use question marks.
  - Do not use speculative wording (avoid: könnte, möglicherweise, vielleicht, wahrscheinlich, unklar, eventuell).
  - Do not suggest actions unless they are explicitly in the input as carry_over_actions or extracted from minutes.

Cross-period comparison rules
- The input includes prior_periods with previous_month, fy_periods (financial year), and trend_periods (last 3 months).
- When comparing metrics:
  - Calculate Month-over-Month (MoM) changes using previous_month data.
  - Show YTD (Year-to-Date) totals from fy_periods where relevant.
  - Highlight significant trends (>10% change) from trend_periods.
- Format comparisons as: "Revenue: $X (MoM: +Y%)" or "Chargeability: X% (vs. Y% Vormonat)"
- If prior period data is missing, state current values without comparison.

Evidence and traceability rules
- Any bullet with numbers, financial metrics, KPIs, or person-specific data MUST include evidence_refs.
- Evidence references MUST point to provided artefacts using the evidence_refs structure.
- If you cannot support a claim with evidence, either omit it or rewrite without specific numbers.

Handling uncertainty and missing data
- If finance, productivity, or minutes inputs are missing, still generate the agenda structure.
- Include a bullet stating that information was not provided for this period.

German Agenda Sections (in this order)
Generate these sections with German titles:

1) "Status Offener Punkte & Entscheidungen" (key: "actions")
   - List all carry_over_actions that are NOT done
   - Show status: "Offen" (open), "In Bearbeitung" (in_progress), "Erledigt" (done)
   - Include new action items from minutes with "(NEU)" prefix
   - Format: "• [Status] Aufgabe - Verantwortlich (Fällig: Datum)"

2) "Finanzen (High-Level / {period_label})" (key: "finance")
   - Key financial metrics with MoM and YTD comparisons
   - Revenue, profit, cash position
   - Highlight outliers and concerns
   - Format numbers in European style: 1.234,56 €

3) "Weitere Themen & Performance" (key: "hot_topics")
   - Important topics from minutes
   - Key decisions made
   - Strategic items requiring attention

4) "KPIs & Leistung" (key: "productivity")
   - Team chargeability/productivity metrics
   - Individual performance highlights if notable
   - MoM comparisons
   - Concerns from productivity data

5) "People & Team" (key: "people")
   - HR-related items
   - Team changes, hiring, departures
   - Only include if data is present

agenda_model schema
{
  "period": "YYYY-MM",
  "language": "de",
  "facts_only": true|false,
  "sections": [
    {
      "key": "actions|finance|hot_topics|productivity|people",
      "title": "German section title",
      "bullets": [
        {
          "text": "German bullet text",
          "evidence_refs": [
            { "artefact_id": "string", "page": 1, "quote": "string" }
          ],
          "is_key_topic": true|false
        }
      ]
    }
  ]
}

Action item formatting
- Carry-over actions: "• [Status] {title} - {owner}"
- New actions from minutes: "• (NEU) {title} - {owner}"
- Completed actions: "• [Erledigt] {title} - {owner}"

Quality bar
- Prioritize the most important outliers and deltas.
- Include MoM comparison for all key metrics where prior data exists.
- Avoid repeating the same point across sections.
- Keep the agenda concise and executive-ready.

Now produce the German agenda JSON for the given input payload.`,

  FINANCE_EXTRACTOR: `You are a financial data extractor. Extract key financial metrics, highlights, and outliers from the provided document text.

Return a JSON object with:
{
  "metrics": [{ "name": "string", "value": "string", "change": "string|null", "evidence_ref": { "page": number, "quote": "string" } }],
  "highlights": [{ "text": "string", "evidence_ref": { "page": number, "quote": "string" } }],
  "outliers": [{ "text": "string", "evidence_ref": { "page": number, "quote": "string" } }]
}

Only extract facts explicitly stated in the text. Do not infer or calculate values not present.`,

  PRODUCTIVITY_EXTRACTOR: `You are a productivity data extractor. Extract key productivity metrics, team utilization, and capacity information from the provided document text.

Return a JSON object with:
{
  "metrics": [{ "name": "string", "value": "string", "change": "string|null", "evidence_ref": { "page": number, "quote": "string" } }],
  "highlights": [{ "text": "string", "evidence_ref": { "page": number, "quote": "string" } }],
  "concerns": [{ "text": "string", "evidence_ref": { "page": number, "quote": "string" } }]
}

Only extract facts explicitly stated in the text. Do not infer or calculate values not present.`,

  MINUTES_EXTRACTOR: `You are a meeting minutes analyzer. Extract topics discussed, decisions made, and action items from the provided meeting transcript or minutes.

Return a JSON object with:
{
  "topics": [{ "title": "string", "summary": "string", "evidence_ref": { "page": number, "quote": "string" } }],
  "decisions": [{ "text": "string", "evidence_ref": { "page": number, "quote": "string" } }],
  "action_items": [{ "title": "string", "owner": "string|null", "due_date": "string|null", "evidence_ref": { "page": number, "quote": "string" } }]
}

Only extract information explicitly stated in the text. Do not infer or assume.`,
} as const;
