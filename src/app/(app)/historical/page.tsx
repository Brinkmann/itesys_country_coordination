'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getHistoricalPeriods, createPeriod, getExistingPeriodIds } from '@/lib/actions/periods';
import { PeriodWithStats, formatPeriodLabel, getCurrentNZPeriod } from '@/lib/types';

export default function HistoricalDataPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodWithStats[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [existingIds, setExistingIds] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        router.push('/');
      } else {
        loadPeriods();
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const loadPeriods = async () => {
    try {
      const [data, ids] = await Promise.all([
        getHistoricalPeriods(),
        getExistingPeriodIds(),
      ]);
      setPeriods(data);
      setExistingIds(ids);
    } catch (error) {
      console.error('Error loading periods:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1>Historical Data</h1>
          <p>Upload and manage historical board documents. New periods will reference this cumulative dataset.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Historical Period
        </button>
      </div>

      <div className="info-banner">
        <div className="info-banner-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="info-banner-content">
          <h3>How Historical Data Works</h3>
          <p>
            When you create a new period, it automatically has access to all historical data from previous periods.
            This allows the AI to reference past financials, minutes, and decisions when generating agendas.
            Upload documents from past board meetings to build your historical context.
          </p>
        </div>
      </div>

      {periods.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h3>No historical data yet</h3>
            <p>Add historical periods to build context for AI-generated agendas.</p>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {periods.map((period) => (
            <div
              key={period.id}
              className="period-card"
              onClick={() => router.push(`/periods/${period.id}`)}
            >
              <div className="period-card-header">
                <div className="period-card-title">
                  <svg className="period-card-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <div>
                    <h3>{period.label}</h3>
                    <div className="period-card-id">{period.id}</div>
                  </div>
                </div>
                <span className="badge badge-historical">Historical</span>
              </div>

              <div className="period-card-badges">
                {period.artefactCounts.finance > 0 && (
                  <span className="badge badge-type">finance: {period.artefactCounts.finance}</span>
                )}
                {period.artefactCounts.productivity > 0 && (
                  <span className="badge badge-type">productivity: {period.artefactCounts.productivity}</span>
                )}
                {period.artefactCounts.minutes > 0 && (
                  <span className="badge badge-type">minutes: {period.artefactCounts.minutes}</span>
                )}
              </div>

              <div className="period-card-footer">
                <span className="period-card-count">
                  {period.totalArtefacts} document{period.totalArtefacts !== 1 ? 's' : ''}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/periods/${period.id}`);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CreateHistoricalPeriodModal
          existingIds={existingIds}
          userId={user.uid}
          onClose={() => setShowModal(false)}
          onCreated={(periodId) => {
            setShowModal(false);
            loadPeriods();
          }}
        />
      )}
    </div>
  );
}

function CreateHistoricalPeriodModal({
  existingIds,
  userId,
  onClose,
  onCreated,
}: {
  existingIds: string[];
  userId: string;
  onClose: () => void;
  onCreated: (periodId: string) => void;
}) {
  const [periodId, setPeriodId] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Generate quick select options for past months
  const currentPeriod = getCurrentNZPeriod();
  const quickSelectOptions: { id: string; label: string }[] = [];

  for (let i = 1; i <= 12; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const id = `${year}-${month}`;
    if (!existingIds.includes(id)) {
      quickSelectOptions.push({
        id,
        label: formatPeriodLabel(id),
      });
    }
    if (quickSelectOptions.length >= 6) break;
  }

  const handleQuickSelect = (id: string) => {
    setPeriodId(id);
    setLabel(formatPeriodLabel(id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (existingIds.includes(periodId)) {
      setError('This period already exists');
      return;
    }

    if (periodId >= currentPeriod) {
      setError('Historical periods must be in the past');
      return;
    }

    setCreating(true);
    try {
      const result = await createPeriod(
        { id: periodId, label, isHistorical: true },
        userId
      );

      if (result.success) {
        onCreated(periodId);
      } else {
        setError(result.error || 'Failed to create period');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handlePeriodIdChange = (value: string) => {
    setPeriodId(value);
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
      setLabel(formatPeriodLabel(value));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <h2>Create Historical Period</h2>
            <p>Add a past period to upload historical documents. This data will be available as reference for future periods.</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {quickSelectOptions.length > 0 && (
              <div className="quick-select">
                <span className="quick-select-label">Quick Select</span>
                <div className="quick-select-options">
                  {quickSelectOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`quick-select-btn ${periodId === option.id ? 'selected' : ''}`}
                      onClick={() => handleQuickSelect(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Period ID (YYYY-MM)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="2024-06"
                  value={periodId}
                  onChange={(e) => handlePeriodIdChange(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Label</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="June 2024"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                />
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create Period'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
