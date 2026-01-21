'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { onAuthStateChanged, User } from 'firebase/auth';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Settings state
  const [defaultLanguage, setDefaultLanguage] = useState('en');
  const [factsOnly, setFactsOnly] = useState(true);
  const [sectionOrder, setSectionOrder] = useState([
    'people',
    'finance',
    'hot_topics',
    'decisions',
    'actions',
  ]);

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
          <h1>Settings</h1>
          <p>Configure default options for agenda generation and templates.</p>
        </div>
      </div>

      <div style={{ maxWidth: '640px' }}>
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>Agenda Defaults</h2>

          <div className="form-group">
            <label className="form-label">Default Language</label>
            <select
              className="form-input"
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="de">German</option>
            </select>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              The language used for AI-generated agenda content.
            </p>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={factsOnly}
                onChange={(e) => setFactsOnly(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              <div>
                <span className="form-label" style={{ marginBottom: 0 }}>Facts Only Mode</span>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  When enabled, the AI will avoid speculative wording and question marks.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>Agenda Section Order</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Drag to reorder sections in the generated agenda.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sectionOrder.map((section, index) => (
              <div
                key={section}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                }}
              >
                <span style={{ color: '#9ca3af', fontWeight: '500' }}>{index + 1}</span>
                <span style={{ flex: 1, fontWeight: '500', textTransform: 'capitalize' }}>
                  {section.replace('_', ' ')}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>Account</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                background: '#f3f4f6',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: '500' }}>{user.displayName || user.email?.split('@')[0]}</div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>{user.email}</div>
            </div>
          </div>

          <div style={{ paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
              Role: <strong>Owner</strong>
            </p>
            <p style={{ fontSize: '12px', color: '#9ca3af' }}>
              Owners have full access to upload, generate, edit, and export agendas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
