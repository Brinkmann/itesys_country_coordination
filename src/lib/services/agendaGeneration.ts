'use server';

import { getOpenAIClient, OPENAI_CONFIG, SYSTEM_PROMPTS } from '@/lib/openai';
import { getAdminFirestore, COLLECTIONS } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import {
  Artefact,
  ActionItem,
  AgendaModel,
  AgendaSection,
  AbsenceExtraction,
  AbsenceType,
  Extraction,
  EvidenceRef,
  FinanceExtraction as TypedFinanceExtraction,
  ProductivityExtraction as TypedProductivityExtraction,
  getPreviousPeriods,
  getFYPeriods,
  formatPeriodLabel,
} from '@/lib/types';
import { getExtractionsForPeriods } from '@/lib/actions/extractions';

// Extraction schemas
interface FinanceExtraction {
  metrics: Array<{
    name: string;
    value: string;
    change: string | null;
    evidence_ref: { page: number | null; quote: string };
  }>;
  highlights: Array<{
    text: string;
    evidence_ref: { page: number | null; quote: string };
  }>;
  outliers: Array<{
    text: string;
    evidence_ref: { page: number | null; quote: string };
  }>;
}

interface ProductivityExtraction {
  teamMetrics: {
    chargeableHours: number;
    internalHours: number;
    totalProductiveHours: number;
    chargeabilityPercent: number;
    sourceRef: { page: number | null; quote: string };
  };
  personMetrics: Array<{
    personName: string;
    chargeableHours: number;
    internalHours: number;
    totalProductiveHours: number;
    chargeabilityPercent: number;
    sourceRef: { row: number | null; quote: string };
  }>;
  highlights: Array<{
    text: string;
    sourceRef: { page: number | null; quote: string };
  }>;
  concerns: Array<{
    text: string;
    sourceRef: { page: number | null; quote: string };
  }>;
}

interface MinutesExtraction {
  topics: Array<{
    title: string;
    summary: string;
    evidence_ref: { page: number | null; quote: string };
  }>;
  decisions: Array<{
    text: string;
    evidence_ref: { page: number | null; quote: string };
  }>;
  action_items: Array<{
    title: string;
    owner: string | null;
    due_date: string | null;
    evidence_ref: { page: number | null; quote: string };
  }>;
}

interface AbsenceByPerson {
  personName: string;
  totalDays: number;
  byType: Record<AbsenceType, number>;
  evidence_refs: EvidenceRef[];
}

type ProductivityPersonWithAbsence = ProductivityExtraction['personMetrics'][number] & {
  absence?: AbsenceByPerson | null;
};

/**
 * Extract structured data from finance artefacts
 */
export async function extractFinanceData(
  artefact: Artefact
): Promise<{ success: boolean; extraction?: FinanceExtraction; error?: string }> {
  if (!artefact.parsedText) {
    return { success: false, error: 'No parsed text available' };
  }

  try {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: OPENAI_CONFIG.model,
      temperature: OPENAI_CONFIG.temperature,
      max_tokens: OPENAI_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.FINANCE_EXTRACTOR },
        {
          role: 'user',
          content: `Document: ${artefact.filename}\n\nContent:\n${artefact.parsedText.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'No response from AI' };
    }

    const extraction = JSON.parse(content) as FinanceExtraction;
    return { success: true, extraction };
  } catch (error) {
    console.error('Error extracting finance data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
    };
  }
}

/**
 * Extract structured data from productivity artefacts
 */
export async function extractProductivityData(
  artefact: Artefact
): Promise<{ success: boolean; extraction?: ProductivityExtraction; error?: string }> {
  if (!artefact.parsedText) {
    return { success: false, error: 'No parsed text available' };
  }

  try {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: OPENAI_CONFIG.model,
      temperature: OPENAI_CONFIG.temperature,
      max_tokens: OPENAI_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.PRODUCTIVITY_EXTRACTOR },
        {
          role: 'user',
          content: `Document: ${artefact.filename}\n\nContent:\n${artefact.parsedText.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'No response from AI' };
    }

    const extraction = JSON.parse(content) as ProductivityExtraction;
    return { success: true, extraction };
  } catch (error) {
    console.error('Error extracting productivity data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
    };
  }
}

/**
 * Extract structured data from minutes artefacts
 */
export async function extractMinutesData(
  artefact: Artefact
): Promise<{ success: boolean; extraction?: MinutesExtraction; error?: string }> {
  if (!artefact.parsedText) {
    return { success: false, error: 'No parsed text available' };
  }

  try {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: OPENAI_CONFIG.model,
      temperature: OPENAI_CONFIG.temperature,
      max_tokens: OPENAI_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.MINUTES_EXTRACTOR },
        {
          role: 'user',
          content: `Document: ${artefact.filename}\n\nContent:\n${artefact.parsedText.slice(0, 15000)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'No response from AI' };
    }

    const extraction = JSON.parse(content) as MinutesExtraction;
    return { success: true, extraction };
  } catch (error) {
    console.error('Error extracting minutes data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
    };
  }
}

/**
 * Store an extraction in Firestore
 */
async function storeExtraction(
  artefactId: string,
  periodId: string,
  kind: 'finance' | 'productivity' | 'minutes',
  payload: unknown
): Promise<string> {
  const db = getAdminFirestore();
  const extractionId = uuidv4();

  await db.collection(COLLECTIONS.EXTRACTIONS).doc(extractionId).set({
    artefactId,
    periodId,
    kind,
    payload,
    extractorVersion: 'v1.0',
    createdAt: Timestamp.now(),
  });

  return extractionId;
}

/**
 * Generate agenda from period data
 */
export async function generateAgenda(
  periodId: string,
  artefacts: Artefact[],
  carryOverActions: ActionItem[],
  language: 'en' | 'de' = 'en',
  factsOnly: boolean = true,
  userId: string
): Promise<{ success: boolean; agendaId?: string; error?: string }> {
  const client = getOpenAIClient();
  try {
    const db = getAdminFirestore();

    // Group artefacts by type
    const financeArtefacts = artefacts.filter((a) => a.type === 'finance' && a.parsedText);
    const productivityArtefacts = artefacts.filter((a) => a.type === 'productivity' && a.parsedText);
    const minutesArtefacts = artefacts.filter((a) => a.type === 'minutes' && a.parsedText);

    // Extract data from each type
    const financeExtractions: Array<{ artefactId: string; data: FinanceExtraction }> = [];
    const productivityExtractions: Array<{ artefactId: string; data: ProductivityExtraction }> = [];
    const minutesExtractions: Array<{ artefactId: string; data: MinutesExtraction }> = [];

    // Process finance artefacts
    for (const artefact of financeArtefacts) {
      const result = await extractFinanceData(artefact);
      if (result.success && result.extraction) {
        financeExtractions.push({ artefactId: artefact.id, data: result.extraction });
        await storeExtraction(artefact.id, periodId, 'finance', result.extraction);
      }
    }

    // Process productivity artefacts
    for (const artefact of productivityArtefacts) {
      const result = await extractProductivityData(artefact);
      if (result.success && result.extraction) {
        productivityExtractions.push({ artefactId: artefact.id, data: result.extraction });
        await storeExtraction(artefact.id, periodId, 'productivity', result.extraction);
      }
    }

    // Process minutes artefacts
    for (const artefact of minutesArtefacts) {
      const result = await extractMinutesData(artefact);
      if (result.success && result.extraction) {
        minutesExtractions.push({ artefactId: artefact.id, data: result.extraction });
        await storeExtraction(artefact.id, periodId, 'minutes', result.extraction);
      }
    }

    // Fetch prior period extractions for cross-period comparison
    const priorPeriodIds = getPreviousPeriods(periodId, 3); // Last 3 months for MoM
    const fyPeriodIds = getFYPeriods(periodId, 4); // FY periods (April start for NZ)

    // Combine unique period IDs for querying
    const allPriorPeriodIds = [...new Set([...priorPeriodIds, ...fyPeriodIds])];

    // Fetch prior finance, productivity, and absence extractions
    const priorFinanceExtractions = await getExtractionsForPeriods(allPriorPeriodIds, 'finance');
    const priorProductivityExtractions = await getExtractionsForPeriods(allPriorPeriodIds, 'productivity');
    const priorAbsenceExtractions = await getExtractionsForPeriods(allPriorPeriodIds, 'absence');

    // Fetch current period absence extractions
    const currentAbsenceExtractions = await getExtractionsForPeriods([periodId], 'absence');

    const normalizeName = (name: string) => name.trim().toLowerCase();

    const absenceByPersonMap = new Map<string, AbsenceByPerson>();
    const absenceTotalsByType: Record<AbsenceType, number> = {
      SICK: 0,
      ANL: 0,
      WELL: 0,
      ALT: 0,
    };

    for (const extraction of currentAbsenceExtractions) {
      const payload = extraction.payload as AbsenceExtraction;
      if (!payload?.personAbsences) continue;

      for (const record of payload.personAbsences) {
        const normalizedName = normalizeName(record.personName);
        if (!normalizedName) continue;

        const existing = absenceByPersonMap.get(normalizedName);
        const evidenceRef: EvidenceRef = {
          artefact_id: extraction.artefactId,
          page: null,
          quote: record.sourceRef?.quote ?? (record.sourceRef?.row ? `Row ${record.sourceRef.row}` : null),
        };

        if (!existing) {
          absenceByPersonMap.set(normalizedName, {
            personName: record.personName,
            totalDays: record.days,
            byType: {
              SICK: record.absenceType === 'SICK' ? record.days : 0,
              ANL: record.absenceType === 'ANL' ? record.days : 0,
              WELL: record.absenceType === 'WELL' ? record.days : 0,
              ALT: record.absenceType === 'ALT' ? record.days : 0,
            },
            evidence_refs: [evidenceRef],
          });
        } else {
          existing.totalDays += record.days;
          existing.byType[record.absenceType] += record.days;
          existing.evidence_refs.push(evidenceRef);
        }

        absenceTotalsByType[record.absenceType] += record.days;
      }
    }

    const absenceByPerson = Array.from(absenceByPersonMap.values()).map((entry) => ({
      ...entry,
      totalDays: Math.round(entry.totalDays * 10) / 10,
      byType: {
        SICK: Math.round(entry.byType.SICK * 10) / 10,
        ANL: Math.round(entry.byType.ANL * 10) / 10,
        WELL: Math.round(entry.byType.WELL * 10) / 10,
        ALT: Math.round(entry.byType.ALT * 10) / 10,
      },
    }));

    const absenceSummary = {
      totalAbsenceDays: Math.round(Object.values(absenceTotalsByType).reduce((sum, val) => sum + val, 0) * 10) / 10,
      byType: {
        SICK: Math.round(absenceTotalsByType.SICK * 10) / 10,
        ANL: Math.round(absenceTotalsByType.ANL * 10) / 10,
        WELL: Math.round(absenceTotalsByType.WELL * 10) / 10,
        ALT: Math.round(absenceTotalsByType.ALT * 10) / 10,
      },
    };

    const absenceByPersonLookup = new Map(
      absenceByPerson.map((person) => [normalizeName(person.personName), person])
    );

    const productivityPeople = new Set(
      productivityExtractions.flatMap((extraction) =>
        extraction.data.personMetrics.map((person) => normalizeName(person.personName))
      )
    );
    const absenceOnlyPeople = absenceByPerson
      .filter((person) => !productivityPeople.has(normalizeName(person.personName)))
      .map((person) => person.personName);

    // Build prior period comparison data
    const priorPeriodData = {
      // Previous month data for MoM comparison
      previous_month: priorPeriodIds[0] ? {
        period: priorPeriodIds[0],
        period_label: formatPeriodLabel(priorPeriodIds[0]),
        finance: priorFinanceExtractions
          .filter(e => e.periodId === priorPeriodIds[0])
          .map(e => ({ extraction_id: e.id, ...e.payload })),
        productivity: priorProductivityExtractions
          .filter(e => e.periodId === priorPeriodIds[0])
          .map(e => ({ extraction_id: e.id, ...e.payload })),
        absence: priorAbsenceExtractions
          .filter(e => e.periodId === priorPeriodIds[0])
          .map(e => ({ extraction_id: e.id, ...e.payload })),
      } : null,
      // FY to date aggregated metrics
      fy_periods: fyPeriodIds.map(pid => ({
        period: pid,
        period_label: formatPeriodLabel(pid),
        finance: priorFinanceExtractions
          .filter(e => e.periodId === pid)
          .map(e => ({ extraction_id: e.id, ...e.payload })),
        productivity: priorProductivityExtractions
          .filter(e => e.periodId === pid)
          .map(e => ({ extraction_id: e.id, ...e.payload })),
        absence: priorAbsenceExtractions
          .filter(e => e.periodId === pid)
          .map(e => ({ extraction_id: e.id, ...e.payload })),
      })),
      // Last 3 months trend data
      trend_periods: priorPeriodIds.map(pid => ({
        period: pid,
        period_label: formatPeriodLabel(pid),
        finance: priorFinanceExtractions
          .filter(e => e.periodId === pid)
          .map(e => ({ extraction_id: e.id, ...e.payload })),
        productivity: priorProductivityExtractions
          .filter(e => e.periodId === pid)
          .map(e => ({ extraction_id: e.id, ...e.payload })),
        absence: priorAbsenceExtractions
          .filter(e => e.periodId === pid)
          .map(e => ({ extraction_id: e.id, ...e.payload })),
      })),
    };

    // Build input payload for agenda generation
    const basePayload = {
      period: periodId,
      period_label: formatPeriodLabel(periodId),
      language,
      facts_only: factsOnly,
      finance: financeExtractions.map((e) => ({
        artefact_id: e.artefactId,
        ...e.data,
      })),
      productivity: productivityExtractions.map((e) => ({
        artefact_id: e.artefactId,
        ...e.data,
        personMetrics: e.data.personMetrics.map((person): ProductivityPersonWithAbsence => ({
          ...person,
          absence: absenceByPersonLookup.get(normalizeName(person.personName)) ?? null,
        })),
      })),
      // Current period absence data for utilization calculation
      absence: currentAbsenceExtractions.map((e) => ({
        extraction_id: e.id,
        artefact_id: e.artefactId,
        ...e.payload,
      })),
      absence_summary: absenceSummary,
      absence_by_person: absenceByPerson,
      absence_only_people: absenceOnlyPeople,
      minutes: minutesExtractions.map((e) => ({
        artefact_id: e.artefactId,
        ...e.data,
      })),
      carry_over_actions: carryOverActions.map((a) => ({
        id: a.id,
        title: a.title,
        owner: a.owner,
        status: a.status,
        due_date: a.dueDate?.toISOString() ?? null,
        period_created: a.periodIdCreated,
      })),
      // Cross-period comparison data
      prior_periods: priorPeriodData,
    };

    const requestAgenda = async (sectionScope: AgendaSection['key'][]) => {
      const response = await client.chat.completions.create({
        model: OPENAI_CONFIG.model,
        temperature: OPENAI_CONFIG.temperature,
        max_tokens: OPENAI_CONFIG.maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.AGENDA_GENERATOR },
          {
            role: 'user',
            content: JSON.stringify({ ...basePayload, section_scope: sectionScope }),
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      return JSON.parse(content) as AgendaModel;
    };

    const productivityAgenda = await requestAgenda(['productivity', 'people']);
    const coreAgenda = await requestAgenda(['actions', 'finance', 'hot_topics']);

    const agendaModel: AgendaModel = {
      period: basePayload.period,
      language: 'de',
      facts_only: basePayload.facts_only,
      sections: [
        ...coreAgenda.sections,
        ...productivityAgenda.sections,
      ],
    };

    // Convert to markdown
    const markdownContent = agendaModelToMarkdown(agendaModel);

    // Get next version number - simple query without orderBy to avoid index
    const existingAgendas = await db
      .collection(COLLECTIONS.AGENDAS)
      .where('periodId', '==', periodId)
      .get();

    let maxVersion = 0;
    existingAgendas.docs.forEach((doc) => {
      const version = doc.data().versionInt ?? 0;
      if (version > maxVersion) maxVersion = version;
    });
    const nextVersion = maxVersion + 1;

    // Store agenda
    const agendaId = uuidv4();
    await db.collection(COLLECTIONS.AGENDAS).doc(agendaId).set({
      periodId,
      versionInt: nextVersion,
      status: 'draft',
      language,
      factsOnly,
      contentJson: agendaModel,
      contentMd: markdownContent,
      createdBy: userId,
      createdAt: Timestamp.now(),
    });

    return { success: true, agendaId };
  } catch (error) {
    console.error('Error generating agenda:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate agenda',
    };
  }
}

/**
 * Convert agenda model to markdown
 */
function agendaModelToMarkdown(agenda: AgendaModel): string {
  const lines: string[] = [];

  // Format period label nicely
  const periodLabel = formatPeriodLabel(agenda.period);

  lines.push(`# Board Meeting Agenda - ${periodLabel}`);
  lines.push('');
  lines.push(`**Periode:** ${agenda.period}`);
  lines.push(`**Sprache:** ${agenda.language === 'de' ? 'Deutsch' : 'Englisch'}`);
  lines.push(`**Modus:** ${agenda.facts_only ? 'Nur Fakten' : 'Vollständig'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const section of agenda.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    for (const bullet of section.bullets) {
      // Mark key topics with emphasis
      const keyMarker = bullet.is_key_topic ? '**' : '';
      lines.push(`- ${keyMarker}${bullet.text}${keyMarker}`);

      // Add evidence refs as sub-bullets if present (for traceability)
      if (bullet.evidence_refs && bullet.evidence_refs.length > 0) {
        for (const ref of bullet.evidence_refs) {
          const pageInfo = ref.page ? ` (S. ${ref.page})` : '';
          const quote = ref.quote ? `: "${ref.quote}"` : '';
          lines.push(`  - *Quelle: ${ref.artefact_id}${pageInfo}${quote}*`);
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get agenda by ID
 */
export async function getAgenda(agendaId: string) {
  const db = getAdminFirestore();
  const doc = await db.collection(COLLECTIONS.AGENDAS).doc(agendaId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    periodId: data.periodId,
    versionInt: data.versionInt,
    status: data.status,
    language: data.language,
    factsOnly: data.factsOnly,
    contentJson: data.contentJson as AgendaModel,
    contentMd: data.contentMd,
    createdBy: data.createdBy,
    createdAt: data.createdAt?.toDate() ?? new Date(),
  };
}

/**
 * Get latest agenda for a period
 */
export async function getLatestAgenda(periodId: string) {
  const db = getAdminFirestore();

  // Simple query without orderBy to avoid index requirement
  const snapshot = await db
    .collection(COLLECTIONS.AGENDAS)
    .where('periodId', '==', periodId)
    .get();

  if (snapshot.empty) {
    return null;
  }

  // Find the doc with highest versionInt in code
  let latestDoc = snapshot.docs[0];
  let maxVersion = latestDoc.data().versionInt ?? 0;

  for (const doc of snapshot.docs) {
    const version = doc.data().versionInt ?? 0;
    if (version > maxVersion) {
      maxVersion = version;
      latestDoc = doc;
    }
  }

  const data = latestDoc.data();

  return {
    id: latestDoc.id,
    periodId: data.periodId,
    versionInt: data.versionInt,
    status: data.status,
    language: data.language,
    factsOnly: data.factsOnly,
    contentJson: data.contentJson as AgendaModel,
    contentMd: data.contentMd,
    createdBy: data.createdBy,
    createdAt: data.createdAt?.toDate() ?? new Date(),
  };
}

/**
 * Update agenda status to final
 */
export async function finalizeAgenda(agendaId: string) {
  const db = getAdminFirestore();

  await db.collection(COLLECTIONS.AGENDAS).doc(agendaId).update({
    status: 'final',
  });

  return { success: true };
}

/**
 * Update agenda content
 */
export async function updateAgendaContent(
  agendaId: string,
  contentJson: AgendaModel
) {
  const db = getAdminFirestore();

  const markdownContent = agendaModelToMarkdown(contentJson);

  await db.collection(COLLECTIONS.AGENDAS).doc(agendaId).update({
    contentJson,
    contentMd: markdownContent,
  });

  return { success: true };
}
