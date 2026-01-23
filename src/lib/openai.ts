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
   STRUCTURE THIS SECTION AS FOLLOWS:

   INPUT DATA LOCATIONS:
   - Productivity data: input.productivity[].personMetrics[] contains chargeableHours, internalHours, totalProductiveHours, chargeabilityPercent
   - Each productivity person may include an absence field: input.productivity[].personMetrics[].absence with totalDays, byType, evidence_refs
   - Absence data (pre-aggregated): input.absence_by_person[] contains personName, totalDays, byType, evidence_refs
   - Absence summary totals: input.absence_summary.byType contains totals per type
   - Absence-only names: input.absence_only_people[]
   - JOIN productivity people to absence_by_person by matching personName (case-insensitive, handle variations like "Maita Monera" vs "M. Monera")

   FIRST BULLET: A 2-3 sentence narrative summary that MUST include:
   - Team chargeability % with MoM comparison (from productivity.teamMetrics)
   - 3-month trend direction if prior_periods.trend_periods has productivity data (use ↑, ↓, →)
   - Name of highest performer with their %
   - Name of lowest performer under target (if any) with their %
   - IF input.absence_by_person exists: mention notable absences by looking up absence_by_person data
   - Include a short absence summary by type (SICK/ANL/WELL/ALT) with total days when input.absence_summary is present
   - Mention "Hoher Krankenstand" if someone has 3+ days sick leave
   - Provide a short causal link when notable absences are present (e.g., "beeinflusst Gesamtproduktivität")
   Example: "Team-Auslastung im Dezember bei 82% (Vormonat: 78%, 3-Monats-Trend: ↑). Callum Herbert mit höchster Chargeability (73%), Catherine Zhao unter Ziel (54%). Hoher Krankenstand bei M. Monera (3 Tage Krank) beeinflusst Gesamtproduktivität. Abwesenheiten: 6 Tage (3 Krank, 2 Urlaub, 1 Wellness)."

   THEN: One bullet for EACH person from productivity.personMetrics (list ALL names):
   Format: "{Name}: {chargeableHours} Std. abrechenbar, {internalHours} Std. intern, {totalProductiveHours} Std. gesamt ({chargeabilityPercent}%)"

   CRITICAL: For each person, use input.productivity[].personMetrics[].absence when present.
   If absent, LOOK UP their absences in input.absence_by_person by matching personName.
   If they have absence entries, APPEND: " - Abwesend: {totalDays} Tage ({types})"
   Combine multiple absence types: e.g., "3 Tage (1 Krank, 2 Wellness)"
   If a person has no absence entry, APPEND: " - Abwesend: 0 Tage"
   Use the evidence_refs from the absence object for any absence claims.

   THEN: If there are people present in input.absence_only_people who do NOT appear in productivity.personMetrics,
   add a sub-list with the label "Abwesenheiten ohne Protime-Datensatz:" and include one bullet per person
   using the matching entry from input.absence_by_person:
   Format: "{Name}: Abwesend {totalDays} Tage ({types})"

   Absence type translations (only these 4 types exist, no "Andere"):
   - SICK=Krank, ANL=Urlaub, WELL=Wellness, ALT=Zeitausgleich
   - Round all day values to 1 decimal place (e.g., 1.5 Tage, not 1.5625 Tage)

   Example output with absence data joined:
   - "Bong Abiog: 97,30 Std. abrechenbar, 17,00 Std. intern, 114,30 Std. gesamt (85,12%) - Abwesend: 1 Tag (Urlaub)"
   - "Callum Herbert: 106,95 Std. abrechenbar, 41,00 Std. intern, 147,95 Std. gesamt (72,29%)"
   - "Catherine Zhao: 79,25 Std. abrechenbar, 15,25 Std. intern, 94,50 Std. gesamt (83,86%) - Abwesend: 6 Tage (1 Krank, 4 Wellness, 2 Zeitausgleich)"
   - "Maita Monera: 79,30 Std. abrechenbar, 53,05 Std. intern, 132,35 Std. gesamt (59,92%) - Abwesend: 6 Tage (Urlaub)"

5) "People & Team" (key: "people")
   - HR-related items
   - Team changes, hiring, departures
   - Absence summary by type: "Abwesenheiten gesamt: X Tage (Y Krank, Z Urlaub, W Wellness)"
   - If absence-only people exist, you MAY also mention a short line: "Abwesenheiten ohne Protime-Datensatz: {names}"
   - Only include if HR or absence data is present

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

  PRODUCTIVITY_EXTRACTOR: `You are a productivity data extractor for a consulting/professional services team. Extract detailed productivity metrics from the provided document (typically an Excel export or PDF report).

Extract THREE key metrics for each person:
1. Total Chargeable hours (billable to clients)
2. Total Internal hours (productive but not billable - training, admin, internal projects)
3. Total Productive hours (sum of chargeable + internal)

Return a JSON object with:
{
  "teamMetrics": {
    "chargeableHours": number,
    "internalHours": number,
    "totalProductiveHours": number,
    "chargeabilityPercent": number (calculated as chargeableHours / totalProductiveHours * 100),
    "sourceRef": { "page": number|null, "quote": "string" }
  },
  "personMetrics": [
    {
      "personName": "string",
      "chargeableHours": number,
      "internalHours": number,
      "totalProductiveHours": number,
      "chargeabilityPercent": number,
      "sourceRef": { "row": number|null, "quote": "string" }
    }
  ],
  "highlights": [{ "text": "string", "sourceRef": { "page": number, "quote": "string" } }],
  "concerns": [{ "text": "string", "sourceRef": { "page": number, "quote": "string" } }]
}

Rules:
- Extract exact numbers from the document
- Calculate chargeabilityPercent = (chargeableHours / totalProductiveHours) * 100
- If a column is labeled "Chargeable" or "Billable", use it for chargeableHours
- If a column is labeled "Internal" or "Non-Chargeable" or "Productive but not Chargeable", use it for internalHours
- If totalProductiveHours is not explicit, sum chargeableHours + internalHours
- Identify highlights: top performers (>80% chargeability)
- Identify concerns: low performers (<60% chargeability) or unusual patterns`,

  MINUTES_EXTRACTOR: `You are a meeting minutes analyzer. Extract topics discussed, decisions made, and action items from the provided meeting transcript or minutes.

Return a JSON object with:
{
  "topics": [{ "title": "string", "summary": "string", "evidence_ref": { "page": number, "quote": "string" } }],
  "decisions": [{ "text": "string", "evidence_ref": { "page": number, "quote": "string" } }],
  "action_items": [{ "title": "string", "owner": "string|null", "due_date": "string|null", "evidence_ref": { "page": number, "quote": "string" } }]
}

Only extract information explicitly stated in the text. Do not infer or assume.`,

  ABSENCE_EXTRACTOR: `You are an HR absence data extractor. Extract employee absence/leave records from the provided document (typically an Excel export).

IMPORTANT: The data may show HOURS (8.00 = 1 day, 4.00 = 0.5 day). Convert hours to days by dividing by 8.

Absence types to identify (only these 4 types, no OTHER category):
- SICK: Sick leave, Sick Day
- ANL: Annual leave, vacation, Annual Leave Day
- WELL: Wellness days, Duvet Day
- ALT: Alternative days, time in lieu, TOIL, Day in Lieu (use this for any unrecognized types)

Expected Excel format:
- Date column (DD/MM/YYYY)
- Name column (employee name)
- Leave type description (Sick Day, Annual Leave Day, Duvet Day, Day in Lieu)
- Leave type code (SICK, ANL, WELL, ALT)
- Hours column (8.00 = full day, 4.00 = half day)

Return a JSON object with:
{
  "periodSummary": {
    "totalAbsenceDays": number (round to 1 decimal),
    "byType": {
      "SICK": number (round to 1 decimal),
      "ANL": number (round to 1 decimal),
      "WELL": number (round to 1 decimal),
      "ALT": number (round to 1 decimal)
    }
  },
  "personAbsences": [
    {
      "personName": "string",
      "absenceType": "SICK|ANL|WELL|ALT",
      "days": number (CONVERT HOURS TO DAYS: hours / 8, round to 1 decimal),
      "startDate": "YYYY-MM-DD" or null,
      "endDate": "YYYY-MM-DD" or null,
      "sourceRef": { "row": number|null, "quote": "string" }
    }
  ],
  "workingDaysInPeriod": 22,
  "publicHolidaysInPeriod": 0
}

CRITICAL RULES:
1. AGGREGATE by person AND type - if someone has multiple entries of same type, SUM the days
2. Convert hours to days: 8 hours = 1 day, 4 hours = 0.5 day
3. Map leave codes: SICK=SICK, ANL=ANL, WELL=WELL, ALT=ALT
4. Map descriptions: "Sick Day"=SICK, "Annual Leave Day"=ANL, "Duvet Day"=WELL, "Day in Lieu"=ALT
5. Include ALL employees found in the data
6. Calculate totals per type in periodSummary

Example conversion:
If data shows:
- Catherine Zhao, SICK, 8.00 hours → days: 1
- Catherine Zhao, WELL, 8.00 hours (x4 entries) → days: 4
- Maita Monera, ANL, 8.00 hours (x6 entries) → days: 6

Output personAbsences should have:
- Catherine Zhao, SICK, 1 day
- Catherine Zhao, WELL, 4 days
- Maita Monera, ANL, 6 days`,
} as const;
