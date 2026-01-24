'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebase/client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getPeriod } from '@/lib/actions/periods';
import { getArtefactsByPeriod, createArtefactRecord, deleteArtefact, getUploadUrl } from '@/lib/actions/artefacts';
import { getActionsByPeriod, getCarryOverActions, createAction, updateAction, deleteAction } from '@/lib/actions/actions';
import { extractTextFromArtefact } from '@/lib/services/textExtraction';
import { extractMetricsFromText } from '@/lib/services/metricsExtraction';
import { generateAgenda, getLatestAgenda } from '@/lib/services/agendaGeneration';
import { uploadFileToSignedUrl } from '@/lib/services/storageUpload';
import { Period, Artefact, ActionItem, ArtefactType, AgendaModel, formatPeriodLabel } from '@/lib/types';

type ArtefactTabKey = 'finance' | 'productivity' | 'absence' | 'minutes' | 'other';
type TabKey = ArtefactTabKey | 'agenda' | 'actions';

// Updated labels to match user's terminology
const ARTEFACT_TABS: { key: ArtefactTabKey; label: string; title: string; description: string; accept?: string }[] = [
  { key: 'finance', label: 'Management Report', title: 'Management Report', description: 'Upload financial reports and management summaries. The AI will extract key metrics and trends.' },
  { key: 'productivity', label: 'Protime', title: 'Protime Reports', description: 'Upload Protime reports with employee profitability and utilization data.' },
  { key: 'absence', label: 'Absences', title: 'Absence Records', description: 'Upload absence/leave data (Excel). Types: SICK, ANL (annual leave), WELL (wellness), ALT (in-lieu).', accept: '.xlsx,.xls,.csv' },
  { key: 'minutes', label: 'Meeting Minutes', title: 'Meeting Minutes', description: 'Upload previous meeting minutes or transcripts. The AI will extract decisions and action items.' },
  { key: 'other', label: 'Other', title: 'Other Documents', description: 'Upload any additional documents relevant to the board meeting.' },
];

export default function PeriodWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const periodId = params.periodId as string;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [period, setPeriod] = useState<Period | null>(null);
  const [artefacts, setArtefacts] = useState<Artefact[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [carryOverActions, setCarryOverActions] = useState<ActionItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('finance');
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [agenda, setAgenda] = useState<{ contentJson: AgendaModel; contentMd: string; status: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        router.push('/');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [periodData, artefactsData, actionsData, carryOverData, agendaData] = await Promise.all([
        getPeriod(periodId),
        getArtefactsByPeriod(periodId),
        getActionsByPeriod(periodId),
        getCarryOverActions(periodId),
        getLatestAgenda(periodId),
      ]);

      if (!periodData) {
        router.push('/periods');
        return;
      }

      setPeriod(periodData);
      setArtefacts(artefactsData);
      setActions(actionsData);
      setCarryOverActions(carryOverData);

      if (agendaData) {
        setAgenda({
          contentJson: agendaData.contentJson,
          contentMd: agendaData.contentMd,
          status: agendaData.status,
        });
      }

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setDataLoading(false);
    }
  }, [periodId, router]);

  useEffect(() => {
    if (user && periodId) {
      loadData();
    }
  }, [user, periodId, loadData]);

  const handleFileUpload = async (files: FileList, type: ArtefactType) => {
    if (!user || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        console.log(`[Upload] Starting upload for ${file.name} (${Math.round(file.size / 1024)} KB)`);

        // Step 1: Get a signed upload URL from the server
        const urlResult = await getUploadUrl(periodId, type, file.name, file.type);
        if (!urlResult.success || !urlResult.uploadUrl || !urlResult.storagePath || !urlResult.artefactId) {
          alert(urlResult.error || 'Failed to get upload URL');
          continue;
        }

        // Step 2: Upload directly to the signed URL (bypasses all size limits)
        const uploadResult = await uploadFileToSignedUrl(file, urlResult.uploadUrl, (progress) => {
          console.log(`[Upload] Progress: ${Math.round(progress.progress)}%`);
        });

        if (!uploadResult.success) {
          alert(uploadResult.error || 'Failed to upload file');
          continue;
        }

        // Step 3: Create artefact record in Firestore
        const recordResult = await createArtefactRecord(
          periodId,
          type,
          file.name,
          urlResult.storagePath,
          file.type,
          file.size,
          user.uid
        );

        if (!recordResult.success) {
          alert(recordResult.error || 'Failed to create artefact record');
          continue;
        }

        console.log(`[Upload] File uploaded successfully, starting text extraction`);

        // Step 4: Extract text from the uploaded file (don't fail if extraction fails)
        let extractedText: string | undefined;
        try {
          const extractResult = await extractTextFromArtefact(urlResult.artefactId, urlResult.storagePath, file.type);
          if (!extractResult.success) {
            console.error('Text extraction failed:', extractResult.error);
          } else {
            console.log(`[Upload] Text extraction completed successfully`);
            extractedText = extractResult.text;
          }
        } catch (extractError) {
          console.error('Text extraction error:', extractError);
        }

        // Step 5: Extract normalized metrics from the text (for cross-period comparison)
        if (extractedText) {
          try {
            console.log(`[Upload] Starting metrics extraction for ${type} document`);
            const metricsResult = await extractMetricsFromText(
              urlResult.artefactId,
              periodId,
              type,
              extractedText
            );
            if (metricsResult.success) {
              console.log(`[Upload] Metrics extraction completed`);
            } else if (metricsResult.error) {
              console.error('Metrics extraction failed:', metricsResult.error);
            }
          } catch (metricsError) {
            console.error('Metrics extraction error:', metricsError);
          }
        }
      }

      // Reload data to show new artefacts
      await loadData();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteArtefact = async (artefactId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    const result = await deleteArtefact(artefactId);
    if (result.success) {
      loadData();
    } else {
      alert(result.error || 'Failed to delete document');
    }
  };

  const handleGenerateAgenda = async () => {
    if (!user) return;

    // Check if there are artefacts with parsed text
    const artefactsWithText = artefacts.filter((a) => a.parsedText);
    if (artefactsWithText.length === 0) {
      alert('Please upload at least one document before generating an agenda. Make sure the documents have been processed.');
      return;
    }

    setGenerating(true);
    try {
      const result = await generateAgenda(
        periodId,
        artefacts,
        carryOverActions,
        'en',
        true,
        user.uid
      );

      if (result.success) {
        await loadData();
        setActiveTab('agenda');
      } else {
        alert(result.error || 'Failed to generate agenda');
      }
    } catch (error) {
      console.error('Error generating agenda:', error);
      alert('Error generating agenda. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportMarkdown = () => {
    if (!agenda?.contentMd) return;

    const blob = new Blob([agenda.contentMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agenda-${periodId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getArtefactsByType = (type: ArtefactType) => {
    return artefacts.filter((a) => a.type === type);
  };

  const getTaskProgress = () => {
    const tasks = [
      getArtefactsByType('finance').length > 0,
      getArtefactsByType('productivity').length > 0,
      getArtefactsByType('minutes').length > 0,
      agenda !== null,
      agenda?.status === 'final',
    ];
    return { completed: tasks.filter(Boolean).length, total: tasks.length };
  };

  const getMissingRequirements = () => {
    const missing: string[] = [];
    if (getArtefactsByType('finance').length === 0) {
      missing.push('Management Report not uploaded');
    }
    if (getArtefactsByType('productivity').length === 0) {
      missing.push('Protime report not uploaded');
    }
    if (getArtefactsByType('minutes').length === 0) {
      missing.push('Meeting minutes not uploaded');
    }
    return missing;
  };

  if (loading || dataLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!period) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Period not found</h2>
          <p style={{ color: '#6b7280', marginTop: 8 }}>The period {periodId} does not exist.</p>
          <Link href="/periods" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>
            Back to Periods
          </Link>
        </div>
      </div>
    );
  }

  const progress = getTaskProgress();
  const missingRequirements = getMissingRequirements();

  return (
    <div>
      <div className="workspace-header">
        <div className="workspace-breadcrumb">
          <Link href="/periods">Periods</Link> / {period.label}
        </div>
        <div className="workspace-title-row">
          <div className="workspace-title">
            <h1>{period.label} Workspace</h1>
          </div>
          <div className="workspace-actions">
            <div className="task-progress">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {progress.completed}/{progress.total} Tasks
              <div className="task-progress-bar">
                <div
                  className="task-progress-fill"
                  style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                />
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleExportMarkdown}
              disabled={!agenda?.contentMd}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Markdown
            </button>
            <button
              className="btn btn-primary"
              onClick={handleGenerateAgenda}
              disabled={generating || artefacts.length === 0}
            >
              {generating ? (
                <>
                  <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                  Generating...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Generate Agenda
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="tabs">
        <div className="tabs-left">
          {ARTEFACT_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {getArtefactsByType(tab.key).length > 0 && (
                <span style={{ marginLeft: 6, opacity: 0.6 }}>
                  ({getArtefactsByType(tab.key).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="tabs-right">
          <button
            className={`tab ${activeTab === 'agenda' ? 'active' : ''}`}
            onClick={() => setActiveTab('agenda')}
          >
            Agenda Editor
            {agenda && (
              <span style={{ marginLeft: 6 }} className={`badge ${agenda.status === 'final' ? 'badge-final' : 'badge-draft'}`}>
                {agenda.status}
              </span>
            )}
          </button>
          <button
            className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            Actions
            {(actions.length + carryOverActions.length) > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.6 }}>
                ({actions.length + carryOverActions.length})
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="workspace-content">
        <div className="workspace-main">
          {ARTEFACT_TABS.map((tab) =>
            activeTab === tab.key ? (
              <ArtefactSection
                key={tab.key}
                title={tab.title}
                description={tab.description}
                type={tab.key}
                artefacts={getArtefactsByType(tab.key)}
                onUpload={(files) => handleFileUpload(files, tab.key)}
                onDelete={handleDeleteArtefact}
                uploading={uploading}
                accept={tab.accept}
              />
            ) : null
          )}

          {activeTab === 'agenda' && (
            <AgendaEditor
              periodId={periodId}
              agenda={agenda}
              onRegenerate={handleGenerateAgenda}
              generating={generating}
            />
          )}

          {activeTab === 'actions' && (
            <ActionsTab
              periodId={periodId}
              actions={actions}
              carryOverActions={carryOverActions}
              onReload={loadData}
            />
          )}
        </div>

        <div className="workspace-sidebar">
          <div className="actions-panel">
            <div className="preview-panel-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              CHECKLIST
            </div>
            {missingRequirements.length === 0 ? (
              <p style={{ color: '#059669', fontSize: 14 }}>All required documents uploaded!</p>
            ) : (
              <div>
                {missingRequirements.map((req, i) => (
                  <div key={i} className="action-item-row">
                    <div className="action-item-indicator required" />
                    <div className="action-item-content">
                      <h4>{req}</h4>
                      <p>Required for agenda generation</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtefactSection({
  title,
  description,
  type,
  artefacts,
  onUpload,
  onDelete,
  uploading,
  accept,
}: {
  title: string;
  description: string;
  type: ArtefactType;
  artefacts: Artefact[];
  onUpload: (files: FileList) => void;
  onDelete: (id: string) => void;
  uploading: boolean;
  accept?: string;
}) {
  const [dragover, setDragover] = useState(false);
  const summaryFacts = artefacts
    .filter((artefact) => artefact.parsedText)
    .map((artefact) => ({
      id: artefact.id,
      filename: artefact.filename || 'Document',
      snippet: `${artefact.parsedText?.slice(0, 220).trim()}...`,
    }))
    .slice(0, 4);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    if (e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
    }
  };

  return (
    <div className="artefact-section">
      <div className="artefact-section-header">
        <div className="artefact-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {title}
        </div>
      </div>

      {artefacts.length > 0 && (
        <div className="artefact-list">
          {artefacts.map((artefact) => (
            <div key={artefact.id} className="artefact-item">
              <div className="artefact-item-icon">
                {artefact.parsedText ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ) : artefact.parseError ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                )}
              </div>
              <div className="artefact-item-info">
                <div className="artefact-item-name">{artefact.filename || 'Note'}</div>
                <div className="artefact-item-meta">
                  {artefact.fileSize ? `${Math.round(artefact.fileSize / 1024)} KB` : 'Text note'}
                  {' · '}
                  {new Date(artefact.createdAt).toLocaleDateString()}
                  {artefact.parsedText && ' · Processed'}
                  {artefact.parseError && ' · Error processing'}
                </div>
              </div>
              <div className="artefact-item-actions">
                <button className="btn btn-ghost" onClick={() => onDelete(artefact.id)} title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`upload-zone ${dragover ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById(`file-input-${type}`)?.click()}
      >
        <input
          id={`file-input-${type}`}
          type="file"
          accept={accept || '.pdf,.docx,.doc'}
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="upload-zone-icon">
          {uploading ? (
            <div className="loading-spinner" />
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          )}
        </div>
        <h3>Upload {title}</h3>
        <p>{description}</p>
      </div>

      <div className="summary-panel">
        <div className="summary-panel-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 6h13" />
            <path d="M8 12h13" />
            <path d="M8 18h13" />
            <circle cx="4" cy="6" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="4" cy="18" r="1.5" />
          </svg>
          KEY SUMMARY FACTS
        </div>
        <div className="summary-panel-content">
          {summaryFacts.length === 0 ? (
            <p style={{ color: '#9ca3af' }}>Upload documents to see extracted summary facts.</p>
          ) : (
            summaryFacts.map((fact) => (
              <div key={fact.id} className="summary-fact">
                <div className="summary-fact-title">{fact.filename}</div>
                <p>{fact.snippet}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AgendaEditor({
  periodId,
  agenda,
  onRegenerate,
  generating,
}: {
  periodId: string;
  agenda: { contentJson: AgendaModel; contentMd: string; status: string } | null;
  onRegenerate: () => void;
  generating: boolean;
}) {
  if (!agenda) {
    return (
      <div className="artefact-section">
        <div className="artefact-section-header">
          <div className="artefact-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Agenda Editor
          </div>
        </div>

        <div className="empty-state">
          <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <h3>No agenda draft yet</h3>
          <p>Upload your Management Report, Protime data, and Meeting Minutes, then click &quot;Generate Agenda&quot; to create an AI-powered draft.</p>
          <button
            className="btn btn-primary"
            onClick={onRegenerate}
            disabled={generating}
            style={{ marginTop: 16 }}
          >
            {generating ? 'Generating...' : 'Generate Agenda'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="artefact-section">
      <div className="artefact-section-header">
        <div className="artefact-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Agenda Editor
          <span className={`badge ${agenda.status === 'final' ? 'badge-final' : 'badge-draft'}`} style={{ marginLeft: 12 }}>
            {agenda.status}
          </span>
        </div>
        <button
          className="btn btn-secondary"
          onClick={onRegenerate}
          disabled={generating}
        >
          {generating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>

      <div style={{ background: '#f9fafb', borderRadius: 8, padding: 20, marginTop: 16 }}>
        {agenda.contentJson.sections.map((section, idx) => (
          <div key={idx} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>
              {section.title}
            </h3>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {section.bullets.map((bullet, bidx) => (
                <li key={bidx} style={{ marginBottom: 8, lineHeight: 1.6 }}>
                  {bullet.text}
                  {bullet.evidence_refs && bullet.evidence_refs.length > 0 && (
                    <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
                      [{bullet.evidence_refs.length} source{bullet.evidence_refs.length > 1 ? 's' : ''}]
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, color: '#6b7280' }}>
          View Markdown Source
        </summary>
        <pre style={{ background: '#1a1a1a', color: '#e5e7eb', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 13, marginTop: 8 }}>
          {agenda.contentMd}
        </pre>
      </details>
    </div>
  );
}

function ActionsTab({
  periodId,
  actions,
  carryOverActions,
  onReload,
}: {
  periodId: string;
  actions: ActionItem[];
  carryOverActions: ActionItem[];
  onReload: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newOwner.trim()) return;

    setCreating(true);
    try {
      const result = await createAction({
        periodIdCreated: periodId,
        title: newTitle,
        owner: newOwner,
      });

      if (result.success) {
        setNewTitle('');
        setNewOwner('');
        setShowAddForm(false);
        onReload();
      } else {
        alert(result.error || 'Failed to create action');
      }
    } catch (error) {
      console.error('Error creating action:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (actionId: string, status: 'open' | 'in_progress' | 'done') => {
    await updateAction(actionId, { status });
    onReload();
  };

  const handleDelete = async (actionId: string) => {
    if (!confirm('Are you sure you want to delete this action?')) return;
    await deleteAction(actionId);
    onReload();
  };

  const allActions = [...actions, ...carryOverActions];

  return (
    <div className="artefact-section">
      <div className="artefact-section-header">
        <div className="artefact-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Action Items
        </div>
        <button className="btn btn-secondary" onClick={() => setShowAddForm(!showAddForm)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Action
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateAction} style={{ marginBottom: 20, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Title</label>
              <input
                type="text"
                className="form-input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Action item title"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Owner</label>
              <input
                type="text"
                className="form-input"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="Assigned to"
                required
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {allActions.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <h3>No action items</h3>
          <p>Add action items to track tasks and follow-ups for this period.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {carryOverActions.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>
                Carry-over from previous periods
              </div>
              {carryOverActions.map((action) => (
                <ActionItemRow
                  key={action.id}
                  action={action}
                  isCarryOver
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))}
            </>
          )}

          {actions.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginTop: 16, marginBottom: 4 }}>
                This period
              </div>
              {actions.map((action) => (
                <ActionItemRow
                  key={action.id}
                  action={action}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionItemRow({
  action,
  isCarryOver,
  onStatusChange,
  onDelete,
}: {
  action: ActionItem;
  isCarryOver?: boolean;
  onStatusChange: (id: string, status: 'open' | 'in_progress' | 'done') => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="artefact-item">
      <select
        value={action.status}
        onChange={(e) => onStatusChange(action.id, e.target.value as 'open' | 'in_progress' | 'done')}
        style={{
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid #e5e7eb',
          fontSize: 12,
          background: action.status === 'done' ? '#d1fae5' : action.status === 'in_progress' ? '#fef3c7' : '#fff',
        }}
      >
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
      </select>
      <div className="artefact-item-info">
        <div className="artefact-item-name" style={{ textDecoration: action.status === 'done' ? 'line-through' : 'none' }}>
          {action.title}
        </div>
        <div className="artefact-item-meta">
          {action.owner}
          {isCarryOver && ` · From ${formatPeriodLabel(action.periodIdCreated)}`}
          {action.dueDate && ` · Due ${new Date(action.dueDate).toLocaleDateString()}`}
        </div>
      </div>
      <button className="btn btn-ghost" onClick={() => onDelete(action.id)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}
