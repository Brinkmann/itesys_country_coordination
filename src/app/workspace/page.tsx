"use client";

import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, firebaseReady, storage } from "@/lib/firebase/client";

type ArtefactType = "finance" | "productivity" | "minutes";

type ArtefactRecord = {
  id: string;
  filename: string;
  storagePath: string;
  downloadUrl?: string;
  periodId: string;
  type: ArtefactType;
  uploadedBy?: string;
  size?: number;
  contentType?: string;
  tags?: string[];
  createdAt?: Timestamp | null;
};

const formatFileSize = (size?: number) => {
  if (!size) return "–";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getCurrentPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export default function WorkspacePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "finance" | "productivity" | "minutes" | "agenda" | "actions"
  >("finance");
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [periodId, setPeriodId] = useState(getCurrentPeriod());
  const [periodLabel, setPeriodLabel] = useState("January 2026");
  const [tagsInput, setTagsInput] = useState("");
  const [uploads, setUploads] = useState<ArtefactRecord[]>([]);

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

  useEffect(() => {
    if (!db || !firebaseReady) {
      return;
    }

    if (activeTab === "agenda" || activeTab === "actions") {
      setUploads([]);
      return;
    }

    const artefactQuery = query(
      collection(db, "artefacts"),
      where("periodId", "==", periodId),
      where("type", "==", activeTab),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      artefactQuery,
      async (snapshot) => {
        const items = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const data = doc.data() as Omit<ArtefactRecord, "id">;
            let downloadUrl: string | undefined;
            if (storage && data.storagePath) {
              try {
                downloadUrl = await getDownloadURL(ref(storage, data.storagePath));
              } catch {
                downloadUrl = undefined;
              }
            }
            return { id: doc.id, ...data, downloadUrl };
          }),
        );
        setUploads(items);
      },
      (err) => {
        setError(err.message);
      },
    );

    return () => unsubscribe();
  }, [activeTab, db, firebaseReady, periodId]);

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

  const handleUpload = async (type: ArtefactType) => {
    setError(null);
    if (!auth || !storage || !db) {
      setError("Firebase is not configured for uploads.");
      return;
    }

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    setUploading(true);
    try {
      const artefactId = crypto.randomUUID();
      const path = `artefacts/${periodId}/${type}/${artefactId}/${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);

      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      await addDoc(collection(db, "artefacts"), {
        periodId,
        type,
        filename: file.name,
        storagePath: path,
        uploadedBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
        size: file.size,
        contentType: file.type,
        tags,
      });

      setTagsInput("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Upload failed. Try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleCreatePeriod = async () => {
    setError(null);
    if (!db) {
      setError("Firestore is not configured.");
      return;
    }
    if (!periodId.trim()) {
      setError("Enter a period ID (YYYY-MM).");
      return;
    }

    try {
      await setDoc(doc(db, "periods", periodId.trim()), {
        label: periodLabel.trim() || periodId.trim(),
        createdAt: serverTimestamp(),
      });
      setShowCreatePeriod(false);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to create period.");
      }
    }
  };

  const activeUploadType: ArtefactType | null =
    activeTab === "finance" || activeTab === "productivity" || activeTab === "minutes"
      ? activeTab
      : null;

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
            <p className="helper">Periods / {periodLabel}</p>
            <h1>{periodLabel} Workspace</h1>
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
              {activeUploadType && (
                <div className="content-grid">
                  <div className="upload-card">
                    <h3>
                      {activeUploadType === "finance"
                        ? "Financial Artefacts"
                        : activeUploadType === "productivity"
                          ? "Productivity Reports"
                          : "Meeting Minutes"}
                    </h3>
                    <p className="helper">
                      {activeUploadType === "minutes"
                        ? "Upload minutes or transcripts to populate decisions and action items."
                        : "Upload PDF, DOCX, DOC, or TXT files. We will extract key metrics automatically."}
                    </p>

                    <div className="upload-zone">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                      />
                      <span>Choose a file to upload</span>
                    </div>

                    <label className="field">
                      Tags (comma-separated)
                      <input
                        type="text"
                        placeholder="e.g. revenue, staffing"
                        value={tagsInput}
                        onChange={(event) => setTagsInput(event.target.value)}
                      />
                    </label>

                    <div className="inline-actions">
                      <button
                        className="primary"
                        type="button"
                        onClick={() => handleUpload(activeUploadType)}
                        disabled={uploading || !firebaseReady}
                      >
                        {uploading ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </div>

                  <div className="insight-card">
                    <p className="helper">Recent uploads ({periodId})</p>
                    {uploads.length === 0 ? (
                      <p className="helper">No files uploaded yet.</p>
                    ) : (
                      <ul className="upload-list">
                        {uploads.map((upload) => (
                          <li key={upload.id}>
                            <div>
                              <p className="upload-name">{upload.filename}</p>
                              <p className="helper">
                                {formatFileSize(upload.size)} ·{" "}
                                {upload.createdAt?.toDate
                                  ? upload.createdAt.toDate().toLocaleString()
                                  : "Just now"}
                              </p>
                              {upload.tags && upload.tags.length > 0 ? (
                                <div className="tag-row">
                                  {upload.tags.map((tag) => (
                                    <span className="tag" key={`${upload.id}-${tag}`}>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {upload.downloadUrl ? (
                              <a className="ghost-link" href={upload.downloadUrl}>
                                View
                              </a>
                            ) : (
                              <span className="helper">Processing</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
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
                { label: "December 2025", id: "2025-12" },
                { label: "June 2025", id: "2025-06" },
                { label: "May 2025", id: "2025-05" },
                { label: "April 2025", id: "2025-04" },
                { label: "March 2025", id: "2025-03" },
                { label: "February 2025", id: "2025-02" },
              ].map((item) => (
                <button
                  className="ghost"
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setPeriodId(item.id);
                    setPeriodLabel(item.label);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Period ID (YYYY-MM)
                <input
                  type="text"
                  value={periodId}
                  onChange={(event) => setPeriodId(event.target.value)}
                />
              </label>
              <label>
                Label
                <input
                  type="text"
                  value={periodLabel}
                  onChange={(event) => setPeriodLabel(event.target.value)}
                />
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
              <button className="primary" type="button" onClick={handleCreatePeriod}>
                Create Period
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
