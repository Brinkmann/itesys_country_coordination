'use server';

import mammoth from 'mammoth';
import { updateArtefactParsedText, setArtefactParseError } from '@/lib/actions/artefacts';
import { getAdminStorage } from '@/lib/firebase/admin';

const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

export interface ParsedPage {
  page: number;
  text: string;
}

export interface ExtractionResult {
  success: boolean;
  text?: string;
  pages?: ParsedPage[];
  error?: string;
}

/**
 * Extract text from a file stored in Firebase Storage
 */
export async function extractTextFromArtefact(
  artefactId: string,
  storagePath: string,
  mimeType: string
): Promise<ExtractionResult> {
  try {
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    const [buffer] = await file.download();

    let result: ExtractionResult;

    if (mimeType === 'application/pdf') {
      result = await extractFromPdf(buffer);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      result = await extractFromDocx(buffer);
    } else {
      result = { success: false, error: `Unsupported file type: ${mimeType}` };
    }

    // Update the artefact with parsed text
    if (result.success && result.text) {
      await updateArtefactParsedText(artefactId, result.text, result.pages ?? null);
    } else if (!result.success) {
      await setArtefactParseError(artefactId, result.error ?? 'Unknown parsing error');
    }

    return result;
  } catch (error) {
    console.error('Error extracting text from artefact:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await setArtefactParseError(artefactId, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Extract text from PDF buffer using pdf-parse
 */
async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const data = await pdfParse(buffer);

    return {
      success: true,
      text: data.text,
      pages: undefined, // pdf-parse doesn't provide page-by-page breakdown easily
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse PDF',
    };
  }
}

/**
 * Extract text from DOCX buffer using mammoth
 */
async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });

    return {
      success: true,
      text: result.value,
      pages: null as unknown as ParsedPage[] | undefined,
    };
  } catch (error) {
    console.error('DOCX extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse DOCX',
    };
  }
}

/**
 * Process multiple artefacts for a period
 */
export async function processArtefactsForPeriod(
  artefacts: { id: string; storagePath: string | null; mimeType: string | null }[]
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (const artefact of artefacts) {
    if (!artefact.storagePath || !artefact.mimeType) {
      continue; // Skip notes or invalid artefacts
    }

    const result = await extractTextFromArtefact(
      artefact.id,
      artefact.storagePath,
      artefact.mimeType
    );

    if (result.success) {
      processed++;
    } else {
      failed++;
    }
  }

  return { processed, failed };
}
