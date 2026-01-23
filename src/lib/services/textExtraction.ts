'use server';

import mammoth from 'mammoth';
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
      return { success: false, error: 'File not found in storage' };
    }

    const [buffer] = await file.download();
    console.log(`[TextExtraction] Downloaded file successfully, size: ${buffer.length} bytes`);

    let extractedText: string | null = null;
    let extractionError: string | null = null;

    if (mimeType === 'application/pdf') {
      const pdfResult = await extractFromPdf(buffer);
      if (pdfResult.success) {
        extractedText = pdfResult.text || null;
      } else {
        extractionError = pdfResult.error || 'PDF extraction failed';
      }
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const docxResult = await extractFromDocx(buffer);
      if (docxResult.success) {
        extractedText = docxResult.text || null;
      } else {
        extractionError = docxResult.error || 'DOCX extraction failed';
      }
    } else {
      extractionError = `Unsupported file type: ${mimeType}`;
    }

    // Update the artefact with parsed text
    if (extractedText) {
      await updateArtefactParsedText(artefactId, extractedText, null);
      // Return plain serializable object
      return { success: true, text: extractedText };
    } else {
      const errorMsg = extractionError || 'Unknown parsing error';
      await setArtefactParseError(artefactId, errorMsg);
      return { success: false, error: errorMsg };
    }
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
async function extractFromPdf(buffer: Buffer): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    console.log(`[TextExtraction] Parsing PDF with unpdf, buffer size: ${buffer.length} bytes`);

    // Dynamic import to avoid issues with module loading
    const { extractText } = await import('unpdf');

    // Convert Buffer to Uint8Array for unpdf
    const uint8Array = new Uint8Array(buffer);

    // Extract text from all pages - only use extractText, not getDocumentProxy
    // to avoid serialization issues with complex PDF.js objects
    const result = await extractText(uint8Array, { mergePages: true });

    // Extract only the text string to ensure it's serializable
    const text = typeof result.text === 'string' ? result.text : String(result.text || '');

    console.log(`[TextExtraction] PDF parsed successfully, text length: ${text.length}`);

    return {
      success: true,
      text: text,
    };
  } catch (error) {
    console.error('[TextExtraction] PDF extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse PDF';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Extract text from DOCX buffer using mammoth
 */
async function extractFromDocx(buffer: Buffer): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    console.log(`[TextExtraction] Parsing DOCX, buffer size: ${buffer.length} bytes`);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || '';
    console.log(`[TextExtraction] DOCX parsed successfully, text length: ${text.length}`);

    return {
      success: true,
      text: text,
    };
  } catch (error) {
    console.error('[TextExtraction] DOCX extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse DOCX';
    return {
      success: false,
      error: errorMessage,
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
