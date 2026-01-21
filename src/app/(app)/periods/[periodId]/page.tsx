'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebase/client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getPeriod } from '@/lib/actions/periods';
import { getArtefactsByPeriod, createArtefact, deleteArtefact } from '@/lib/actions/artefacts';
import { getActionsByPeriod, getCarryOverActions, createAction, updateAction, deleteAction } from '@/lib/actions/actions';
import { Period, Artefact, ActionItem, ArtefactType, formatPeriodLabel, isPeriodCurrent } from '@/lib/types';

type ArtefactTabKey = 'finance' | 'productivity' | 'minutes';
type TabKey = ArtefactTabKey | 'agenda' | 'actions';

const ARTEFACT_TABS: { key: ArtefactTabKey; label: string; title: string }[] = [
  { key: 'finance', label: 'Finance', title: 'Financial Artefacts' },
  { key: 'productivity', label: 'Productivity', title: 'Productivity Reports' },
  { key: 'minutes', label: 'Minutes', title: 'Meeting Minutes' },
];

export default function PeriodWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const periodId = params.periodId as string;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period | null>(null);
  const [artefacts, setArtefacts] = useState<Artefact[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [carryOverActions, setCarryOverActions] = useState<ActionItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('finance');
  const [uploading, setUploading] = useState(false);

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
    try {
      const [periodData, artefactsData, actionsData, carryOverData] = await Promise.all([
        getPeriod(periodId),
        getArtefactsByPeriod(periodId),
        getActionsByPeriod(periodId),
        getCarryOverActions(periodId),
      ]);

      if (!periodData) {
        router.push('/periods');
        return;
      }

      setPeriod(periodData);
      setArtefacts(artefactsData);
      setActions(actionsData);
      setCarryOverActions(carryOverData);
    } catch (error) {
      console.error('Error loading data:', error);
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
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const result = await createArtefact(
            periodId,
            type,
            file.name,
            base64,
            file.type,
            user.uid
          );

          if (!result.success) {
            alert(result.error || 'Failed to upload file');
          }
        };
        reader.readAsDataURL(file);
      }

      // Reload artefacts after a short delay
      setTimeout(loadData, 1000);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteArtefact = async (artefactId: string) => {
    if (!confirm('Are you sure you want to delete this artefact?')) return;

    const result = await deleteArtefact(artefactId);
    if (result.success) {
      loadData();
    } else {
      alert(result.error || 'Failed to delete artefact');
    }
  };

  const getArtefactsByType = (type: ArtefactType) => {
    return artefacts.filter((a) => a.type === type);
  };

  const getTaskProgress = () => {
    const tasks = [
      getArtefactsByType('finance').length > 0,
      getArtefactsByType('productivity').length > 0,
      getArtefactsByType('minutes').length > 0,
      false, // agenda draft
      false, // final agenda
    ];
    return { completed: tasks.filter(Boolean).length, total: tasks.length };
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user || !period) {
    return null;
  }

  const progress = getTaskProgress();
  const isCurrent = isPeriodCurrent(periodId);

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
            <button className="btn btn-secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Package
            </button>
            <button className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Generate Agenda
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
            </button>
          ))}
        </div>
        <div className="tabs-right">
          <button
            className={`tab ${activeTab === 'agenda' ? 'active' : ''}`}
            onClick={() => setActiveTab('agenda')}
          >
            Agenda Editor
          </button>
          <button
            className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            Actions
          </button>
        </div>
      </div>

      <div className="workspace-content">
        <div className="workspace-main">
          {activeTab === 'finance' && (
            <ArtefactSection
              title="Financial Artefacts"
              type="finance"
              artefacts={getArtefactsByType('finance')}
              onUpload={(files) => handleFileUpload(files, 'finance')}
              onDelete={handleDeleteArtefact}
              uploading={uploading}
            />
          )}

          {activeTab === 'productivity' && (
            <ArtefactSection
              title="Productivity Reports"
              type="productivity"
              artefacts={getArtefactsByType('productivity')}
              onUpload={(files) => handleFileUpload(files, 'productivity')}
              onDelete={handleDeleteArtefact}
              uploading={uploading}
            />
          )}

          {activeTab === 'minutes' && (
            <ArtefactSection
              title="Meeting Minutes"
              type="minutes"
              artefacts={getArtefactsByType('minutes')}
              onUpload={(files) => handleFileUpload(files, 'minutes')}
              onDelete={handleDeleteArtefact}
              uploading={uploading}
            />
          )}

          {activeTab === 'agenda' && (
            <AgendaEditor periodId={periodId} />
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
          <div className="preview-panel">
            <div className="preview-panel-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              AI EXTRACTION PREVIEW
            </div>
            <div className="preview-panel-content">
              {artefacts.length === 0 ? (
                <p style={{ color: '#9ca3af' }}>Upload documents to see AI-extracted insights.</p>
              ) : (
                <>
                  <p>&quot;Revenue increased by <span className="preview-highlight">15% YoY</span> due to strong enterprise adoption.&quot;</p>
                  <p>&quot;Operating expenses remained flat despite headcount growth.&quot;</p>
                </>
              )}
            </div>
          </div>

          <div className="actions-panel">
            <div className="preview-panel-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              REQUIRED ACTIONS
            </div>
            {artefacts.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '14px' }}>No pending actions.</p>
            ) : (
              <div>
                <div className="action-item-row">
                  <div className="action-item-indicator required" />
                  <div className="action-item-content">
                    <h4>Missing Q4 Cash Flow Statement</h4>
                    <p>Required for Financial Review section</p>
                  </div>
                </div>
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
  type,
  artefacts,
  onUpload,
  onDelete,
  uploading,
}: {
  title: string;
  type: ArtefactType;
  artefacts: Artefact[];
  onUpload: (files: FileList) => void;
  onDelete: (id: string) => void;
  uploading: boolean;
}) {
  const [dragover, setDragover] = useState(false);

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
        {artefacts.length > 0 && (
          <div className="artefact-search">
            <svg className="artefact-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Search files..." />
          </div>
        )}
      </div>

      {artefacts.length > 0 && (
        <div className="artefact-list">
          {artefacts.map((artefact) => (
            <div key={artefact.id} className="artefact-item">
              <div className="artefact-item-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="artefact-item-info">
                <div className="artefact-item-name">{artefact.filename || 'Note'}</div>
                <div className="artefact-item-meta">
                  {artefact.fileSize ? `${Math.round(artefact.fileSize / 1024)} KB` : 'Text note'} &middot;{' '}
                  {new Date(artefact.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="artefact-item-actions">
                <button className="btn btn-ghost" onClick={() => onDelete(artefact.id)}>
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
          accept=".pdf,.docx,.doc"
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
        <p>Drag & drop PDF or DOCX files here. Our AI will automatically extract key metrics and create agenda items.</p>
      </div>
    </div>
  );
}

function AgendaEditor({ periodId }: { periodId: string }) {
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
        <p>Upload documents and click &quot;Generate Agenda&quot; to create an AI-powered draft agenda.</p>
      </div>
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
        <form onSubmit={handleCreateAction} style={{ marginBottom: '20px', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: '12px' }}>
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
            <div className="form-group" style={{ marginBottom: '12px' }}>
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
          <div style={{ display: 'flex', gap: '8px' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {carryOverActions.length > 0 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginTop: '8px', marginBottom: '4px' }}>
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
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginTop: '16px', marginBottom: '4px' }}>
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
          borderRadius: '6px',
          border: '1px solid #e5e7eb',
          fontSize: '12px',
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
          {isCarryOver && ` • From ${formatPeriodLabel(action.periodIdCreated)}`}
          {action.dueDate && ` • Due ${new Date(action.dueDate).toLocaleDateString()}`}
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
