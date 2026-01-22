'use server';

import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { updateArtefactParsedText, setArtefactParseError } from '@/lib/actions/artefacts';
import { getAdminStorage } from '@/lib/firebase/admin';

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

    console.log(`[TextExtraction] Attempting to download from bucket: ${bucket.name}, path: ${storagePath}`);

    const file = bucket.file(storagePath);

    // Check if file exists first
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`[TextExtraction] File does not exist: ${storagePath}`);
      await setArtefactParseError(artefactId, `File not found in storage: ${storagePath}`);
      return { success: false, error: `File not found in storage` };
    }

    const [buffer] = await file.download();
    console.log(`[TextExtraction] Downloaded file successfully, size: ${buffer.length} bytes`);

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
    console.error('[TextExtraction] Error extracting text from artefact:', error);
    let errorMsg = 'Unknown error';
    if (error instanceof Error) {
      errorMsg = error.message;
      // Check for common storage errors
      if (errorMsg.includes('403') || errorMsg.includes('permission')) {
        errorMsg = 'Storage permission denied - check service account access to bucket';
      } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        errorMsg = 'File not found in storage';
      }
    }
    await setArtefactParseError(artefactId, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Extract text from PDF buffer using unpdf (serverless-compatible)
 */
async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    console.log(`[TextExtraction] Parsing PDF with unpdf, buffer size: ${buffer.length} bytes`);

    // Convert Buffer to Uint8Array for unpdf
    const uint8Array = new Uint8Array(buffer);

    // Get document proxy to access page count
    const pdf = await getDocumentProxy(uint8Array);
    const numPages = pdf.numPages;
    console.log(`[TextExtraction] PDF has ${numPages} pages`);

    // Extract text from all pages
    const { text } = await extractText(uint8Array, { mergePages: true });

    console.log(`[TextExtraction] PDF parsed successfully, text length: ${text?.length ?? 0}`);

    return {
      success: true,
      text: text || '',
      pages: undefined,
    };
  } catch (error) {
    console.error('[TextExtraction] PDF extraction error:', error);
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
    console.log(`[TextExtraction] Parsing DOCX, buffer size: ${buffer.length} bytes`);
    const result = await mammoth.extractRawText({ buffer });
    console.log(`[TextExtraction] DOCX parsed successfully, text length: ${result.value?.length ?? 0}`);

    return {
      success: true,
      text: result.value,
      pages: null as unknown as ParsedPage[] | undefined,
    };
  } catch (error) {
    console.error('[TextExtraction] DOCX extraction error:', error);
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
