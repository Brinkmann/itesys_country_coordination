// Data model types for GovernanceOS
// Based on the specification: periods, artefacts, extractions, agendas, action_items

export type UserRole = 'owner' | 'reader';

export type ArtefactType = 'finance' | 'productivity' | 'minutes' | 'hr' | 'other' | 'notes';

export type ArtefactVisibility = 'normal' | 'restricted';

export type AgendaStatus = 'draft' | 'final';

export type AgendaLanguage = 'de' | 'en';

export type ActionStatus = 'open' | 'in_progress' | 'done';

export type ExtractionKind = 'finance' | 'productivity' | 'minutes';

// User profile stored in Firestore
export interface Profile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Period document (keyed by YYYY-MM)
export interface Period {
  id: string; // YYYY-MM format
  label: string; // e.g., "January 2026"
  isHistorical: boolean;
  createdAt: Date;
  createdBy: string;
}

// Artefact document
export interface Artefact {
  id: string; // UUID
  periodId: string; // Reference to period YYYY-MM
  type: ArtefactType;
  filename: string | null; // null for notes type
  storagePath: string | null; // null for notes type
  uploadedBy: string;
  createdAt: Date;
  versionInt: number;
  tags: string[];
  parsedText: string | null;
  parsedPages: ParsedPage[] | null;
  visibility: ArtefactVisibility;
  parseError: string | null;
  fileSize?: number;
  mimeType?: string;
}

export interface ParsedPage {
  page: number;
  text: string;
}

// Extraction document (AI-extracted structured data)
export interface Extraction {
  id: string; // UUID
  artefactId: string;
  periodId: string;
  kind: ExtractionKind;
  payload: FinanceExtraction | ProductivityExtraction | MinutesExtraction;
  extractorVersion: string;
  createdAt: Date;
}

// Normalized finance metrics for cross-period comparison
export interface FinanceMetric {
  name: string; // e.g., "revenue", "netProfit", "cash"
  value: number;
  currency: string; // "NZD"
  period: 'monthly' | 'ytd' | 'annual';
  sourceRef: { page?: number; quote?: string };
}

export interface FinanceExtraction {
  metrics: FinanceMetric[];
  highlights: { text: string; sourceRef: { page?: number; quote?: string } }[];
  outliers: { text: string; sourceRef: { page?: number; quote?: string } }[];
}

// Normalized productivity metrics
export interface ProductivityMetric {
  personName?: string; // null for team totals
  chargeableHours: number;
  internalHours: number;
  totalProductiveHours: number;
  chargeabilityPercent: number;
  sourceRef: { page?: number; quote?: string };
}

export interface ProductivityExtraction {
  teamMetrics: ProductivityMetric;
  personMetrics: ProductivityMetric[];
  highlights: { text: string; sourceRef: { page?: number; quote?: string } }[];
  concerns: { text: string; sourceRef: { page?: number; quote?: string } }[];
}

// Minutes extraction with action items
export interface MinutesExtraction {
  topics: { title: string; summary: string; sourceRef: { page?: number; quote?: string } }[];
  decisions: { text: string; sourceRef: { page?: number; quote?: string } }[];
  actionItems: {
    title: string;
    owner: string | null;
    dueDate: string | null;
    status: 'open' | 'done';
    sourceRef: { page?: number; quote?: string };
  }[];
}

// Evidence reference for traceability
export interface EvidenceRef {
  artefact_id: string;
  page: number | null;
  quote: string | null;
}

// Agenda bullet point
export interface AgendaBullet {
  text: string;
  evidence_refs: EvidenceRef[];
  is_key_topic?: boolean;
}

// Agenda section
export interface AgendaSection {
  key: 'people' | 'finance' | 'hot_topics' | 'decisions' | 'actions';
  title: string;
  bullets: AgendaBullet[];
}

// Agenda model (the structured JSON from AI)
export interface AgendaModel {
  period: string; // YYYY-MM
  language: AgendaLanguage;
  facts_only: boolean;
  sections: AgendaSection[];
}

// Agenda document
export interface Agenda {
  id: string; // UUID
  periodId: string;
  versionInt: number;
  status: AgendaStatus;
  language: AgendaLanguage;
  factsOnly: boolean;
  contentJson: AgendaModel | null;
  contentMd: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Action item document
export interface ActionItem {
  id: string; // UUID
  periodIdCreated: string; // Period when action was created
  title: string;
  owner: string;
  status: ActionStatus;
  dueDate: Date | null;
  sourceArtefactId: string | null;
  sourceRef: EvidenceRef | null;
  createdAt: Date;
  lastUpdatedAt: Date;
}

// UI-specific types

export interface PeriodWithStats extends Period {
  artefactCounts: Record<ArtefactType, number>;
  totalArtefacts: number;
  hasAgenda: boolean;
  hasFinalAgenda: boolean;
}

export interface WorkspaceTab {
  key: ArtefactType | 'agenda' | 'actions';
  label: string;
  icon?: string;
}

// Form types for creating/editing

export interface CreatePeriodInput {
  id: string; // YYYY-MM
  label: string;
  isHistorical: boolean;
}

export interface UploadArtefactInput {
  periodId: string;
  type: ArtefactType;
  tags?: string[];
  visibility?: ArtefactVisibility;
}

export interface CreateActionInput {
  periodIdCreated: string;
  title: string;
  owner: string;
  dueDate?: Date | null;
  sourceArtefactId?: string | null;
}

export interface UpdateActionInput {
  title?: string;
  owner?: string;
  status?: ActionStatus;
  dueDate?: Date | null;
}

// API response types

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Date utilities for NZ timezone
export const NZ_TIMEZONE = 'Pacific/Auckland';

export function getCurrentNZPeriod(): string {
  const now = new Date();
  const nzDate = new Date(now.toLocaleString('en-US', { timeZone: NZ_TIMEZONE }));
  const year = nzDate.getFullYear();
  const month = String(nzDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatPeriodLabel(periodId: string): string {
  const [year, month] = periodId.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
}

export function isPeriodInPast(periodId: string): boolean {
  const current = getCurrentNZPeriod();
  return periodId < current;
}

export function isPeriodCurrent(periodId: string): boolean {
  return periodId === getCurrentNZPeriod();
}

/**
 * Get the previous N periods for comparison
 * Given a period like "2025-10", returns ["2025-09", "2025-08", ...]
 */
export function getPreviousPeriods(currentPeriod: string, count: number): string[] {
  const [year, month] = currentPeriod.split('-').map(Number);
  const periods: string[] = [];

  let y = year;
  let m = month;

  for (let i = 0; i < count; i++) {
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
  }

  return periods;
}

/**
 * Get financial year periods (April to March for NZ)
 * Returns all periods from FY start to the given period
 */
export function getFYPeriods(currentPeriod: string, fyStartMonth: number = 4): string[] {
  const [year, month] = currentPeriod.split('-').map(Number);
  const periods: string[] = [];

  // Determine FY start year
  const fyStartYear = month >= fyStartMonth ? year : year - 1;

  // Generate all periods from FY start to current
  let y = fyStartYear;
  let m = fyStartMonth;

  while (true) {
    const periodId = `${y}-${String(m).padStart(2, '0')}`;
    if (periodId > currentPeriod) break;
    periods.push(periodId);

    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return periods;
}
