"use client";

import { signOut } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, firebaseReady } from "@/lib/firebase/client";

export default function WorkspacePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "finance" | "productivity" | "minutes" | "agenda" | "actions"
  >("finance");
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);

  useEffect(() => {
    if (!auth) {
      return;
    }

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const periodCards = useMemo(
    () => [
      {
        label: "November 2025",
        id: "2025-11",
        tags: ["productivity: 1", "finance: 1"],
        docs: 2,
      },
      {
        label: "October 2025",
        id: "2025-10",
        tags: ["finance: 1", "productivity: 1"],
        docs: 2,
      },
      {
        label: "September 2025",
        id: "2025-09",
        tags: ["productivity: 1", "finance: 1"],
        docs: 2,
      },
      {
        label: "August 2025",
        id: "2025-08",
        tags: ["finance: 2", "minutes: 1"],
        docs: 3,
      },
      {
        label: "July 2025",
        id: "2025-07",
        tags: ["productivity: 1", "minutes: 1"],
        docs: 2,
      },
    ],
    [],
  );

  const handleSignOut = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!auth) {
        throw new Error("Firebase is not configured for the browser.");
      }
      await signOut(auth);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to sign out.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="brand">
          <span className="brand-mark">G</span>
          <div>
            <p className="brand-title">GovernanceOS</p>
            <p className="brand-subtitle">Country coordination</p>
          </div>
        </div>

        <nav className="nav-list">
          <button className="nav-item active" type="button">
            Periods
          </button>
          <button className="nav-item" type="button">
            Historical Data
          </button>
          <button className="nav-item" type="button">
            Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">J</div>
            <div>
              <p className="user-name">Jane Owner</p>
              <p className="user-role">Admin</p>
            </div>
          </div>
          <button
            className="secondary"
            type="button"
            onClick={handleSignOut}
            disabled={loading || !firebaseReady}
          >
            {loading ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <p className="helper">Periods / January 2026</p>
            <h1>January 2026 Workspace</h1>
          </div>
          <div className="top-actions">
            <button className="ghost" type="button">
              2/5 Tasks
            </button>
            <button className="ghost" type="button">
              Export Package
            </button>
            <button className="primary" type="button">
              Generate Agenda
            </button>
          </div>
        </header>

        <section className="workspace-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Historical Data</h2>
                <p className="helper">
                  Upload and manage historical board documents. New periods will
                  reference this cumulative dataset.
                </p>
              </div>
              <button
                className="primary"
                type="button"
                onClick={() => setShowCreatePeriod(true)}
              >
                + Add Historical Period
              </button>
            </div>

            <div className="info-callout">
              <p className="info-title">How Historical Data Works</p>
              <p className="helper">
                When you create a new period, it automatically has access to all
                historical data from previous periods. Upload past board meeting
                documents to enrich the AI agenda and context.
              </p>
            </div>

            <div className="period-grid">
              {periodCards.map((card) => (
                <div className="period-card" key={card.id}>
                  <div className="period-card-header">
                    <div>
                      <p className="period-title">{card.label}</p>
                      <p className="helper">{card.id}</p>
                    </div>
                    <span className="badge">Historical</span>
                  </div>
                  <div className="tag-row">
                    {card.tags.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="period-footer">
                    <span className="helper">{card.docs} documents</span>
                    <button className="ghost" type="button">
                      Upload
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="tab-row">
              {[
                { key: "finance", label: "Finance" },
                { key: "productivity", label: "Productivity" },
                { key: "minutes", label: "Minutes" },
                { key: "agenda", label: "Agenda Editor" },
                { key: "actions", label: "Actions" },
              ].map((tab) => (
                <button
                  className={activeTab === tab.key ? "tab active" : "tab"}
                  type="button"
                  key={tab.key}
                  onClick={() =>
                    setActiveTab(
                      tab.key as
                        | "finance"
                        | "productivity"
                        | "minutes"
                        | "agenda"
                        | "actions",
                    )
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="panel-body">
              {activeTab === "finance" && (
                <div className="content-grid">
                  <div className="upload-card">
                    <h3>Financial Artefacts</h3>
                    <p className="helper">
                      Drag & drop PDF or DOCX files here. We will extract key
                      metrics automatically.
                    </p>
                    <div className="upload-zone">Upload Financial Documents</div>
                    <div className="inline-actions">
                      <button className="ghost" type="button">
                        Search files
                      </button>
                      <button className="primary" type="button">
                        Upload
                      </button>
                    </div>
                  </div>
                  <div className="insight-card">
                    <p className="helper">AI extraction preview</p>
                    <ul>
                      <li>
                        Revenue increased by <strong>15% YoY</strong> driven by
                        enterprise expansion.
                      </li>
                      <li>
                        Operating expenses remained flat despite headcount
                        growth.
                      </li>
                    </ul>
                    <div className="alert">
                      Missing Q4 cash-flow statement for final review.
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "productivity" && (
                <div className="content-grid">
                  <div className="upload-card">
                    <h3>Productivity Reports</h3>
                    <p className="helper">
                      Upload delivery metrics, sprint summaries, and pipeline
                      status notes.
                    </p>
                    <div className="upload-zone">Upload Productivity Reports</div>
                    <div className="inline-actions">
                      <button className="ghost" type="button">
                        Browse artefacts
                      </button>
                      <button className="primary" type="button">
                        Upload
                      </button>
                    </div>
                  </div>
                  <div className="insight-card">
                    <p className="helper">Signals to watch</p>
                    <ul>
                      <li>Cycle time improved 8% month-over-month.</li>
                      <li>Top blocker: procurement approvals.</li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === "minutes" && (
                <div className="content-grid">
                  <div className="upload-card">
                    <h3>Meeting Minutes</h3>
                    <p className="helper">
                      Upload minutes or transcripts to populate decisions and
                      action items.
                    </p>
                    <div className="upload-zone">Upload Meeting Minutes</div>
                    <div className="inline-actions">
                      <button className="ghost" type="button">
                        Paste notes
                      </button>
                      <button className="primary" type="button">
                        Upload
                      </button>
                    </div>
                  </div>
                  <div className="insight-card">
                    <p className="helper">Decision highlights</p>
                    <ul>
                      <li>Approve the 2026 hiring plan draft.</li>
                      <li>Confirm market entry timeline for Q2.</li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === "agenda" && (
                <div className="agenda-grid">
                  <div className="agenda-card">
                    <div className="agenda-header">
                      <span className="pill">Draft v1</span>
                      <div className="pill-row">
                        <span className="pill">Facts only</span>
                        <span className="pill">EN / DE</span>
                      </div>
                      <span className="helper">Last saved 3:03 PM</span>
                    </div>
                    <h3>Board Meeting Agenda</h3>
                    <div className="agenda-section">
                      <h4>01 Finance Highlights</h4>
                      <p className="helper">Add bullets or regenerate.</p>
                    </div>
                    <div className="agenda-section">
                      <h4>02 People & HR</h4>
                      <p className="helper">Pending minutes ingestion.</p>
                    </div>
                  </div>
                  <div className="insight-card">
                    <p className="helper">Editing tools</p>
                    <ul>
                      <li>Condense bullets</li>
                      <li>Regenerate this section</li>
                      <li>Mark as key topic</li>
                    </ul>
                    <button className="primary" type="button">
                      Open Agenda Editor
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "actions" && (
                <div className="actions-panel">
                  <div className="actions-header">
                    <h3>Action Items Log</h3>
                    <div className="inline-actions">
                      <button className="ghost" type="button">
                        Show Completed
                      </button>
                      <button className="primary" type="button">
                        Assign New Action
                      </button>
                    </div>
                  </div>
                  <div className="actions-table">
                    <div className="table-row header">
                      <span>Action Item</span>
                      <span>Owner</span>
                      <span>Status</span>
                      <span>Due Date</span>
                      <span>Origin</span>
                    </div>
                    <div className="table-row">
                      <span>Finalize Q1 vendor renewal</span>
                      <span>J. Owner</span>
                      <span>In progress</span>
                      <span>Feb 15</span>
                      <span>Finance review</span>
                    </div>
                    <div className="table-row">
                      <span>Publish updated travel policy</span>
                      <span>M. Lee</span>
                      <span>Open</span>
                      <span>Mar 03</span>
                      <span>People & HR</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {error ? <p className="helper">{error}</p> : null}
      </main>

      {showCreatePeriod ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal">
            <div className="modal-header">
              <h3>Create Historical Period</h3>
              <button
                className="ghost"
                type="button"
                onClick={() => setShowCreatePeriod(false)}
              >
                ✕
              </button>
            </div>
            <p className="helper">
              Add a past period to upload historical documents. This data will
              be available as reference for future periods.
            </p>
            <div className="quick-select">
              {[
                "December 2025",
                "June 2025",
                "May 2025",
                "April 2025",
                "March 2025",
                "February 2025",
              ].map((label) => (
                <button className="ghost" type="button" key={label}>
                  {label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Period ID (YYYY-MM)
                <input type="text" defaultValue="2024-06" />
              </label>
              <label>
                Label
                <input type="text" defaultValue="June 2024" />
              </label>
            </div>
            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setShowCreatePeriod(false)}
              >
                Cancel
              </button>
              <button className="primary" type="button">
                Create Period
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
