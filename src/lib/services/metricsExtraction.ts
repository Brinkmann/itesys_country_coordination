'use server';

import { getOpenAIClient, OPENAI_CONFIG, SYSTEM_PROMPTS } from '@/lib/openai';
import { saveExtraction } from '@/lib/actions/extractions';
import {
  ArtefactType,
  ExtractionKind,
  FinanceExtraction,
  ProductivityExtraction,
  MinutesExtraction,
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
    let payload: FinanceExtraction | ProductivityExtraction | MinutesExtraction;
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
): FinanceExtraction | ProductivityExtraction | MinutesExtraction {
  switch (kind) {
    case 'finance':
      return normalizeFinancePayload(parsed);
    case 'productivity':
      return normalizeProductivityPayload(parsed);
    case 'minutes':
      return normalizeMinutesPayload(parsed);
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
  const metrics = Array.isArray(parsed.metrics) ? parsed.metrics : [];
  const highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
  const concerns = Array.isArray(parsed.concerns) ? parsed.concerns : [];

  // Find team totals (no person name) vs individual metrics
  const personMetrics = metrics
    .filter((m: Record<string, unknown>) => m.name && String(m.name).toLowerCase() !== 'team')
    .map((m: Record<string, unknown>) => ({
      personName: String(m.name || ''),
      chargeableHours: parseFloat(String(m.chargeable_hours || m.value || '0')) || 0,
      internalHours: parseFloat(String(m.internal_hours || '0')) || 0,
      totalProductiveHours: parseFloat(String(m.total_hours || '0')) || 0,
      chargeabilityPercent: parseFloat(String(m.chargeability || '0')) || 0,
      sourceRef: {
        page: typeof m.evidence_ref === 'object' && m.evidence_ref
          ? (m.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof m.evidence_ref === 'object' && m.evidence_ref
          ? (m.evidence_ref as Record<string, unknown>).quote as string | undefined
          : undefined,
      },
    }));

  // Calculate team totals from person metrics if not explicitly provided
  const teamMetrics = {
    chargeableHours: personMetrics.reduce((sum, p) => sum + p.chargeableHours, 0),
    internalHours: personMetrics.reduce((sum, p) => sum + p.internalHours, 0),
    totalProductiveHours: personMetrics.reduce((sum, p) => sum + p.totalProductiveHours, 0),
    chargeabilityPercent: 0,
    sourceRef: {},
  };

  if (teamMetrics.totalProductiveHours > 0) {
    teamMetrics.chargeabilityPercent =
      (teamMetrics.chargeableHours / teamMetrics.totalProductiveHours) * 100;
  }

  return {
    teamMetrics,
    personMetrics,
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
    concerns: concerns.map((c: Record<string, unknown>) => ({
      text: String(c.text || ''),
      sourceRef: {
        page: typeof c.evidence_ref === 'object' && c.evidence_ref
          ? (c.evidence_ref as Record<string, unknown>).page as number | undefined
          : undefined,
        quote: typeof c.evidence_ref === 'object' && c.evidence_ref
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
