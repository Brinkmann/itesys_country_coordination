'use server';

import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
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
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'text/csv'
    ) {
      const xlsxResult = await extractFromExcel(buffer, mimeType);
      if (xlsxResult.success) {
        extractedText = xlsxResult.text || null;
      } else {
        extractionError = xlsxResult.error || 'Excel extraction failed';
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
 * Extract text from Excel buffer (xlsx, xls, csv) using SheetJS
 * Converts spreadsheet data to a structured text format for AI processing
 */
async function extractFromExcel(buffer: Buffer, mimeType: string): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    console.log(`[TextExtraction] Parsing Excel file, buffer size: ${buffer.length} bytes, type: ${mimeType}`);

    // Read the workbook from buffer
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const textParts: string[] = [];

    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];

      // Add sheet name as header
      textParts.push(`=== Sheet: ${sheetName} ===\n`);

      // Convert sheet to JSON for structured data (as array of arrays)
      const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

      if (jsonData.length === 0) {
        textParts.push('(Empty sheet)\n');
        continue;
      }

      // First row is typically headers
      const firstRow = jsonData[0];
      const headers: string[] = Array.isArray(firstRow) ? firstRow.map(h => String(h || '')) : [];
      if (headers.length > 0 && headers.some(h => h)) {
        textParts.push(`Headers: ${headers.filter(h => h).join(' | ')}\n`);
        textParts.push('-'.repeat(50) + '\n');
      }

      // Process data rows
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (Array.isArray(row) && row.some(cell => cell !== '')) {
          // Create a row representation with column context
          const rowParts: string[] = [];
          for (let j = 0; j < row.length; j++) {
            const cellValue = row[j];
            if (cellValue !== '' && cellValue !== null && cellValue !== undefined) {
              const header = headers && headers[j] ? headers[j] : `Col${j + 1}`;
              rowParts.push(`${header}: ${cellValue}`);
            }
          }
          if (rowParts.length > 0) {
            textParts.push(`Row ${i}: ${rowParts.join(', ')}\n`);
          }
        }
      }

      textParts.push('\n');
    }

    const text = textParts.join('');
    console.log(`[TextExtraction] Excel parsed successfully, text length: ${text.length}`);

    return {
      success: true,
      text: text,
    };
  } catch (error) {
    console.error('[TextExtraction] Excel extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse Excel file';
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
