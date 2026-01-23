'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getCurrentPeriods, createPeriod, getExistingPeriodIds, updatePeriodHistorical } from '@/lib/actions/periods';
import { PeriodWithStats, formatPeriodLabel } from '@/lib/types';

export default function PeriodsPage() {
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
        getCurrentPeriods(),
        getExistingPeriodIds(),
      ]);
      setPeriods(data);
      setExistingIds(ids);
    } catch (error) {
      console.error('Error loading periods:', error);
    }
  };

  const handleMoveToHistorical = async (periodId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Move ${periodId} to Historical Data?`)) return;

    const result = await updatePeriodHistorical(periodId, true);
    if (result.success) {
      loadPeriods();
    } else {
      alert(result.error || 'Failed to move period');
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
          <h1>Periods</h1>
          <p>Manage monthly board meeting preparation and agendas.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Period
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
              onClick={() => setShowModal(true)}
              style={{ marginTop: '16px' }}
            >
              Add Period
            </button>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {periods.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              onMove={handleMoveToHistorical}
              onClick={() => router.push(`/periods/${period.id}`)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreatePeriodModal
          existingIds={existingIds}
          userId={user.uid}
          isHistorical={false}
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

function PeriodCard({
  period,
  onMove,
  onClick,
}: {
  period: PeriodWithStats;
  onMove: (periodId: string, e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="period-card" onClick={onClick}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              style={{ padding: 4 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {showMenu && (
              <div
                className="dropdown-menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 10,
                  minWidth: 160,
                }}
              >
                <button
                  onClick={(e) => {
                    setShowMenu(false);
                    onMove(period.id, e);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                    textAlign: 'left',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3v18h18" />
                    <path d="M7 16l4-4 4 4 6-6" />
                  </svg>
                  Move to Historical
                </button>
              </div>
            )}
          </div>
        </div>
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
  );
}

function CreatePeriodModal({
  existingIds,
  userId,
  isHistorical,
  onClose,
  onCreated,
}: {
  existingIds: string[];
  userId: string;
  isHistorical: boolean;
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
        { id: periodId, label, isHistorical },
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
            <h2>Add Period</h2>
            <p>Create a new {isHistorical ? 'historical ' : ''}period for board meeting preparation.</p>
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
