'use server';

import { getOpenAIClient, OPENAI_CONFIG, SYSTEM_PROMPTS } from '@/lib/openai';
import { saveExtraction } from '@/lib/actions/extractions';
import {
  ArtefactType,
  ExtractionKind,
  FinanceExtraction,
  ProductivityExtraction,
  MinutesExtraction,
  AbsenceExtraction,
  AbsenceType,
} from '@/lib/types';

/**
 * Map artefact types to extraction kinds
 */
function getExtractionKind(artefactType: ArtefactType): ExtractionKind | null {
  switch (artefactType) {
    case 'finance':
      return 'finance';
    case 'productivity':
      return 'productivity';
    case 'minutes':
      return 'minutes';
    case 'absence':
      return 'absence';
    default:
      return null;
  }
}

/**
 * Extract normalized metrics from artefact text using AI
 */
export async function extractMetricsFromText(
  artefactId: string,
  periodId: string,
  artefactType: ArtefactType,
  parsedText: string
): Promise<{ success: boolean; extractionId?: string; error?: string }> {
  const kind = getExtractionKind(artefactType);

  // Only extract metrics for finance, productivity, and minutes
  if (!kind) {
    return { success: true }; // Not an error, just nothing to extract
  }

  try {
    const openai = getOpenAIClient();

    // Select the appropriate system prompt
    let systemPrompt: string;
    switch (kind) {
      case 'finance':
        systemPrompt = SYSTEM_PROMPTS.FINANCE_EXTRACTOR;
        break;
      case 'productivity':
        systemPrompt = SYSTEM_PROMPTS.PRODUCTIVITY_EXTRACTOR;
        break;
      case 'minutes':
        systemPrompt = SYSTEM_PROMPTS.MINUTES_EXTRACTOR;
        break;
      case 'absence':
        systemPrompt = SYSTEM_PROMPTS.ABSENCE_EXTRACTOR;
        break;
    }

    // Truncate text if too long (keep first ~15000 chars for context window)
    const truncatedText = parsedText.length > 15000
      ? parsedText.substring(0, 15000) + '\n\n[Text truncated...]'
      : parsedText;

    console.log(`[MetricsExtraction] Extracting ${kind} metrics from artefact ${artefactId}`);

    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.model,
      temperature: OPENAI_CONFIG.temperature,
      max_tokens: OPENAI_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract structured data from this ${kind} document:\n\n${truncatedText}` },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('[MetricsExtraction] No content in OpenAI response');
      return { success: false, error: 'No content in AI response' };
    }

    // Parse the JSON response
    let payload: FinanceExtraction | ProductivityExtraction | MinutesExtraction | AbsenceExtraction;
    try {
      const parsed = JSON.parse(content);
      payload = normalizePayload(kind, parsed);
    } catch (parseError) {
      console.error('[MetricsExtraction] Failed to parse AI response:', parseError);
      return { success: false, error: 'Failed to parse AI response as JSON' };
    }

    // Save the extraction to Firestore
    const result = await saveExtraction(artefactId, periodId, kind, payload);

    if (result.success) {
      console.log(`[MetricsExtraction] Saved ${kind} extraction: ${result.extractionId}`);
    }

    return result;
  } catch (error) {
    console.error('[MetricsExtraction] Error extracting metrics:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract metrics',
    };
  }
}

/**
 * Normalize the AI response to match our type definitions
 */
function normalizePayload(
  kind: ExtractionKind,
  parsed: Record<string, unknown>
): FinanceExtraction | ProductivityExtraction | MinutesExtraction | AbsenceExtraction {
  switch (kind) {
    case 'finance':
      return normalizeFinancePayload(parsed);
    case 'productivity':
      return normalizeProductivityPayload(parsed);
    case 'minutes':
      return normalizeMinutesPayload(parsed);
    case 'absence':
      return normalizeAbsencePayload(parsed);
  }
}

function normalizeFinancePayload(parsed: Record<string, unknown>): FinanceExtraction {
  const metrics = Array.isArray(parsed.metrics) ? parsed.metrics : [];
  const highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
  const outliers = Array.isArray(parsed.outliers) ? parsed.outliers : [];

  return {
    metrics: metrics.map((m: Record<string, unknown>) => ({
      name: String(m.name || ''),
      value: parseFloat(String(m.value || '0').replace(/[^0-9.-]/g, '')) || 0,
      currency: 'NZD',
      period: 'monthly' as const,
      sourceRef: {
        page: typeof m.evidence_ref === 'object' && m.evidence_ref
          ? (m.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof m.evidence_ref === 'object' && m.evidence_ref
          ? (m.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    })),
    highlights: highlights.map((h: Record<string, unknown>) => ({
      text: String(h.text || ''),
      sourceRef: {
        page: typeof h.evidence_ref === 'object' && h.evidence_ref
          ? (h.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof h.evidence_ref === 'object' && h.evidence_ref
          ? (h.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    })),
    outliers: outliers.map((o: Record<string, unknown>) => ({
      text: String(o.text || ''),
      sourceRef: {
        page: typeof o.evidence_ref === 'object' && o.evidence_ref
          ? (o.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof o.evidence_ref === 'object' && o.evidence_ref
          ? (o.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    })),
  };
}

function normalizeProductivityPayload(parsed: Record<string, unknown>): ProductivityExtraction {
  // New format: teamMetrics + personMetrics directly from AI
  const rawPersonMetrics = Array.isArray(parsed.personMetrics) ? parsed.personMetrics : [];
  const rawTeamMetrics = parsed.teamMetrics as Record<string, unknown> | undefined;
  const highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
  const concerns = Array.isArray(parsed.concerns) ? parsed.concerns : [];

  // Normalize person metrics
  const personMetrics = rawPersonMetrics.map((m: Record<string, unknown>) => {
    const chargeable = parseFloat(String(m.chargeableHours || m.chargeable_hours || '0')) || 0;
    const internal = parseFloat(String(m.internalHours || m.internal_hours || '0')) || 0;
    const total = parseFloat(String(m.totalProductiveHours || m.total_productive_hours || '0')) || (chargeable + internal);
    const chargeability = parseFloat(String(m.chargeabilityPercent || m.chargeability_percent || '0')) ||
      (total > 0 ? (chargeable / total) * 100 : 0);

    return {
      personName: String(m.personName || m.person_name || ''),
      chargeableHours: chargeable,
      internalHours: internal,
      totalProductiveHours: total,
      chargeabilityPercent: Math.round(chargeability * 100) / 100, // Round to 2 decimals
      sourceRef: {
        page: typeof m.sourceRef === 'object' && m.sourceRef
          ? (m.sourceRef as Record<string, unknown>).page as number | undefined
          : typeof m.source_ref === 'object' && m.source_ref
          ? (m.source_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof m.sourceRef === 'object' && m.sourceRef
          ? (m.sourceRef as Record<string, unknown>).quote as string | undefined
          : typeof m.source_ref === 'object' && m.source_ref
          ? (m.source_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    };
  });

  // Calculate or use team totals
  let teamMetrics;
  if (rawTeamMetrics) {
    const chargeable = parseFloat(String(rawTeamMetrics.chargeableHours || rawTeamMetrics.chargeable_hours || '0')) || 0;
    const internal = parseFloat(String(rawTeamMetrics.internalHours || rawTeamMetrics.internal_hours || '0')) || 0;
    const total = parseFloat(String(rawTeamMetrics.totalProductiveHours || rawTeamMetrics.total_productive_hours || '0')) || (chargeable + internal);
    const chargeability = parseFloat(String(rawTeamMetrics.chargeabilityPercent || rawTeamMetrics.chargeability_percent || '0')) ||
      (total > 0 ? (chargeable / total) * 100 : 0);

    teamMetrics = {
      chargeableHours: chargeable,
      internalHours: internal,
      totalProductiveHours: total,
      chargeabilityPercent: Math.round(chargeability * 100) / 100,
      sourceRef: {
        page: typeof rawTeamMetrics.sourceRef === 'object' && rawTeamMetrics.sourceRef
          ? (rawTeamMetrics.sourceRef as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof rawTeamMetrics.sourceRef === 'object' && rawTeamMetrics.sourceRef
          ? (rawTeamMetrics.sourceRef as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    };
  } else {
    // Calculate team totals from person metrics
    const chargeable = personMetrics.reduce((sum, p) => sum + p.chargeableHours, 0);
    const internal = personMetrics.reduce((sum, p) => sum + p.internalHours, 0);
    const total = personMetrics.reduce((sum, p) => sum + p.totalProductiveHours, 0);

    teamMetrics = {
      chargeableHours: chargeable,
      internalHours: internal,
      totalProductiveHours: total,
      chargeabilityPercent: total > 0 ? Math.round((chargeable / total) * 10000) / 100 : 0,
      sourceRef: {},
    };
  }

  return {
    teamMetrics,
    personMetrics,
    highlights: highlights.map((h: Record<string, unknown>) => ({
      text: String(h.text || ''),
      sourceRef: {
        page: typeof h.sourceRef === 'object' && h.sourceRef
          ? (h.sourceRef as Record<string, unknown>).page as number | undefined
          : typeof h.evidence_ref === 'object' && h.evidence_ref
          ? (h.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof h.sourceRef === 'object' && h.sourceRef
          ? (h.sourceRef as Record<string, unknown>).quote as string | undefined
          : typeof h.evidence_ref === 'object' && h.evidence_ref
          ? (h.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    })),
    concerns: concerns.map((c: Record<string, unknown>) => ({
      text: String(c.text || ''),
      sourceRef: {
        page: typeof c.sourceRef === 'object' && c.sourceRef
          ? (c.sourceRef as Record<string, unknown>).page as number | undefined
          : typeof c.evidence_ref === 'object' && c.evidence_ref
          ? (c.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof c.sourceRef === 'object' && c.sourceRef
          ? (c.sourceRef as Record<string, unknown>).quote as string | undefined
          : typeof c.evidence_ref === 'object' && c.evidence_ref
          ? (c.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    })),
  };
}

function normalizeMinutesPayload(parsed: Record<string, unknown>): MinutesExtraction {
  const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const actionItems = Array.isArray(parsed.action_items) ? parsed.action_items : [];

  return {
    topics: topics.map((t: Record<string, unknown>) => ({
      title: String(t.title || ''),
      summary: String(t.summary || ''),
      sourceRef: {
        page: typeof t.evidence_ref === 'object' && t.evidence_ref
          ? (t.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof t.evidence_ref === 'object' && t.evidence_ref
          ? (t.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    })),
    decisions: decisions.map((d: Record<string, unknown>) => ({
      text: String(d.text || ''),
      sourceRef: {
        page: typeof d.evidence_ref === 'object' && d.evidence_ref
          ? (d.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof d.evidence_ref === 'object' && d.evidence_ref
          ? (d.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    })),
    actionItems: actionItems.map((a: Record<string, unknown>) => ({
      title: String(a.title || ''),
      owner: a.owner ? String(a.owner) : null,
      dueDate: a.due_date ? String(a.due_date) : null,
      status: 'open' as const,
      sourceRef: {
        page: typeof a.evidence_ref === 'object' && a.evidence_ref
          ? (a.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof a.evidence_ref === 'object' && a.evidence_ref
          ? (a.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    })),
  };
}

function normalizeAbsencePayload(parsed: Record<string, unknown>): AbsenceExtraction {
  const personAbsences = Array.isArray(parsed.personAbsences) ? parsed.personAbsences : [];
  const periodSummary = parsed.periodSummary as Record<string, unknown> | undefined;

  // Valid absence types (no OTHER - all absences must map to a known type)
  const validTypes: AbsenceType[] = ['SICK', 'ANL', 'WELL', 'ALT'];

  // Normalize absence type
  const normalizeAbsenceType = (type: unknown): AbsenceType => {
    const typeStr = String(type || '').toUpperCase();
    if (validTypes.includes(typeStr as AbsenceType)) {
      return typeStr as AbsenceType;
    }
    // Map common variations
    if (typeStr.includes('SICK') || typeStr.includes('ILL')) return 'SICK';
    if (typeStr.includes('ANNUAL') || typeStr.includes('VACATION') || typeStr.includes('HOLIDAY')) return 'ANL';
    if (typeStr.includes('WELL') || typeStr.includes('DUVET')) return 'WELL';
    if (typeStr.includes('LIEU') || typeStr.includes('TOIL') || typeStr.includes('ALT')) return 'ALT';
    // Default to ALT for any unknown type (no OTHER category)
    return 'ALT';
  };

  // Build person absences array
  const normalizedAbsences = personAbsences.map((a: Record<string, unknown>) => ({
    personName: String(a.personName || a.person_name || ''),
    absenceType: normalizeAbsenceType(a.absenceType || a.absence_type || a.type),
    days: Math.round((parseFloat(String(a.days || '0')) || 0) * 10) / 10, // Round to 1 decimal
    startDate: a.startDate || a.start_date ? String(a.startDate || a.start_date) : undefined,
    endDate: a.endDate || a.end_date ? String(a.endDate || a.end_date) : undefined,
    sourceRef: {
      row: typeof a.sourceRef === 'object' && a.sourceRef
        ? (a.sourceRef as Record<string, unknown>).row as number | undefined
        : undefined,
      quote: typeof a.sourceRef === 'object' && a.sourceRef
        ? (a.sourceRef as Record<string, unknown>).quote as string | undefined
        : undefined,
    },
  }));

  // Calculate summary by type (no OTHER category)
  const byType: Record<AbsenceType, number> = {
    SICK: 0,
    ANL: 0,
    WELL: 0,
    ALT: 0,
  };

  normalizedAbsences.forEach((a) => {
    byType[a.absenceType] += a.days;
  });

  // Round all byType values to 1 decimal
  Object.keys(byType).forEach((key) => {
    byType[key as AbsenceType] = Math.round(byType[key as AbsenceType] * 10) / 10;
  });

  const totalAbsenceDays = Math.round(Object.values(byType).reduce((sum, val) => sum + val, 0) * 10) / 10;

  return {
    periodSummary: {
      totalAbsenceDays: periodSummary?.totalAbsenceDays
        ? Math.round(parseFloat(String(periodSummary.totalAbsenceDays)) * 10) / 10
        : totalAbsenceDays,
      byType: periodSummary?.byType
        ? {
            SICK: Math.round((parseFloat(String((periodSummary.byType as Record<string, unknown>).SICK || '0')) || byType.SICK) * 10) / 10,
            ANL: Math.round((parseFloat(String((periodSummary.byType as Record<string, unknown>).ANL || '0')) || byType.ANL) * 10) / 10,
            WELL: Math.round((parseFloat(String((periodSummary.byType as Record<string, unknown>).WELL || '0')) || byType.WELL) * 10) / 10,
            ALT: Math.round((parseFloat(String((periodSummary.byType as Record<string, unknown>).ALT || '0')) || byType.ALT) * 10) / 10,
          }
        : byType,
    },
    personAbsences: normalizedAbsences,
    workingDaysInPeriod: parseFloat(String(parsed.workingDaysInPeriod || '22')) || 22,
    publicHolidaysInPeriod: parseFloat(String(parsed.publicHolidaysInPeriod || '0')) || 0,
  };
}
