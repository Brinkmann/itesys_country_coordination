'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getCurrentPeriods, createPeriod, getExistingPeriodIds } from '@/lib/actions/periods';
import { PeriodWithStats, getCurrentNZPeriod, formatPeriodLabel } from '@/lib/types';

export default function PeriodsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodWithStats[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
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
        getCurrentPeriods(),
        getExistingPeriodIds(),
      ]);
      setPeriods(data);
      setExistingIds(ids);
    } catch (error) {
      console.error('Error loading periods:', error);
    }
  };

  const handleCreateCurrentPeriod = async () => {
    if (!user) return;

    const currentPeriodId = getCurrentNZPeriod();
    if (existingIds.includes(currentPeriodId)) {
      router.push(`/periods/${currentPeriodId}`);
      return;
    }

    setCreating(true);
    try {
      const result = await createPeriod(
        {
          id: currentPeriodId,
          label: formatPeriodLabel(currentPeriodId),
          isHistorical: false,
        },
        user.uid
      );

      if (result.success) {
        router.push(`/periods/${currentPeriodId}`);
      } else {
        alert(result.error || 'Failed to create period');
      }
    } catch (error) {
      console.error('Error creating period:', error);
    } finally {
      setCreating(false);
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

  const currentPeriodId = getCurrentNZPeriod();
  const hasCurrentPeriod = existingIds.includes(currentPeriodId);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1>Periods</h1>
          <p>Manage monthly board meeting preparation and agendas.</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateCurrentPeriod} disabled={creating}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {hasCurrentPeriod ? 'Open Current Month' : 'Create Current Month'}
        </button>
      </div>

      {periods.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <h3>No periods yet</h3>
            <p>Create your first period to start preparing board meeting materials.</p>
            <button
              className="btn btn-primary"
              onClick={handleCreateCurrentPeriod}
              disabled={creating}
              style={{ marginTop: '16px' }}
            >
              Create {formatPeriodLabel(currentPeriodId)}
            </button>
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
                {period.id === currentPeriodId && (
                  <span className="badge badge-current">Current</span>
                )}
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
                {period.hasFinalAgenda ? (
                  <span className="badge badge-final">Final Agenda</span>
                ) : period.hasAgenda ? (
                  <span className="badge badge-draft">Draft Agenda</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CreatePeriodModal
          existingIds={existingIds}
          userId={user.uid}
          onClose={() => setShowModal(false)}
          onCreated={(periodId) => {
            setShowModal(false);
            router.push(`/periods/${periodId}`);
          }}
        />
      )}
    </div>
  );
}

function CreatePeriodModal({
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (existingIds.includes(periodId)) {
      setError('This period already exists');
      return;
    }

    setCreating(true);
    try {
      const result = await createPeriod(
        { id: periodId, label, isHistorical: false },
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
            <h2>Create Period</h2>
            <p>Add a new period for board meeting preparation.</p>
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
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Period ID (YYYY-MM)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="2026-01"
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
                  placeholder="January 2026"
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
