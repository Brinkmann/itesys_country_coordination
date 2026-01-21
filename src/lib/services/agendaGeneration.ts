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
  Extraction,
  EvidenceRef,
} from '@/lib/types';

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
  concerns: Array<{
    text: string;
    evidence_ref: { page: number | null; quote: string };
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

    // Build input payload for agenda generation
    const inputPayload = {
      period: periodId,
      language,
      facts_only: factsOnly,
      finance: financeExtractions.map((e) => ({
        artefact_id: e.artefactId,
        ...e.data,
      })),
      productivity: productivityExtractions.map((e) => ({
        artefact_id: e.artefactId,
        ...e.data,
      })),
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
    };

    // Generate agenda
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: OPENAI_CONFIG.model,
      temperature: OPENAI_CONFIG.temperature,
      max_tokens: OPENAI_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.AGENDA_GENERATOR },
        {
          role: 'user',
          content: JSON.stringify(inputPayload),
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'No response from AI' };
    }

    const agendaModel = JSON.parse(content) as AgendaModel;

    // Convert to markdown
    const markdownContent = agendaModelToMarkdown(agendaModel);

    // Get next version number
    const existingAgendas = await db
      .collection(COLLECTIONS.AGENDAS)
      .where('periodId', '==', periodId)
      .orderBy('versionInt', 'desc')
      .limit(1)
      .get();

    const nextVersion = existingAgendas.empty
      ? 1
      : (existingAgendas.docs[0].data().versionInt ?? 0) + 1;

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

  lines.push(`# Agenda - ${agenda.period}`);
  lines.push('');
  lines.push(`**Language:** ${agenda.language === 'de' ? 'German' : 'English'}`);
  lines.push(`**Mode:** ${agenda.facts_only ? 'Facts Only' : 'Full'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const section of agenda.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    for (const bullet of section.bullets) {
      lines.push(`- ${bullet.text}`);

      // Add evidence refs as sub-bullets if present
      if (bullet.evidence_refs && bullet.evidence_refs.length > 0) {
        for (const ref of bullet.evidence_refs) {
          const pageInfo = ref.page ? ` (p. ${ref.page})` : '';
          const quote = ref.quote ? `: "${ref.quote}"` : '';
          lines.push(`  - *Source: ${ref.artefact_id}${pageInfo}${quote}*`);
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

  const snapshot = await db
    .collection(COLLECTIONS.AGENDAS)
    .where('periodId', '==', periodId)
    .orderBy('versionInt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

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
