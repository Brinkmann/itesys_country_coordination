"use client";

import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db, firebaseReady } from "@/lib/firebase/client";

type PeriodStatus = "current" | "historical";
type NavSection = "periods" | "historical" | "settings";

type PeriodRecord = {
  id: string;
  label: string;
  status: PeriodStatus;
  createdAt?: Timestamp | null;
};

const getCurrentPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const toMonthLabel = (periodId: string) => {
  const [year, month] = periodId.split("-");
  if (!year || !month) return periodId;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-NZ", { month: "long", year: "numeric" });
};

export default function WorkspacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PeriodRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [periodId, setPeriodId] = useState(getCurrentPeriod());
  const [periodLabel, setPeriodLabel] = useState(toMonthLabel(getCurrentPeriod()));
  const [activeSection, setActiveSection] = useState<NavSection>("periods");

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

    const periodsQuery = query(
      collection(db, "periods"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      periodsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<PeriodRecord, "id">;
          return {
            id: docSnap.id,
            label: data.label,
            status: data.status,
            createdAt: data.createdAt ?? null,
          };
        });
        setPeriods(items);
      },
      (err) => {
        setError(err.message);
      },
    );

    return () => unsubscribe();
  }, [firebaseReady]);

  const currentPeriods = useMemo(
    () => periods.filter((period) => period.status === "current"),
    [periods],
  );
  const historicalPeriods = useMemo(
    () => periods.filter((period) => period.status === "historical"),
    [periods],
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
        status: "current",
        createdAt: serverTimestamp(),
      });
      setShowCreate(false);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to create period.");
      }
    }
  };

  const handleToggleStatus = async (period: PeriodRecord) => {
    if (!db) {
      setError("Firestore is not configured.");
      return;
    }

    try {
      await updateDoc(doc(db, "periods", period.id), {
        status: period.status === "current" ? "historical" : "current",
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to update period.");
      }
    }
  };

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="brand">
          <span className="brand-mark">I</span>
          <div>
            <p className="brand-title">Itesys</p>
            <p className="brand-subtitle">Country coordination</p>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={activeSection === "periods" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => setActiveSection("periods")}
          >
            Periods
          </button>
          <button
            className={activeSection === "historical" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => setActiveSection("historical")}
          >
            Historical Data
          </button>
          <button
            className={activeSection === "settings" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => setActiveSection("settings")}
          >
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
            <p className="helper">
              {activeSection === "historical" ? "Historical data" : "Periods"}
            </p>
            <h1>{activeSection === "historical" ? "Historical periods" : "Periods"}</h1>
            <p className="helper">
              {activeSection === "historical"
                ? "Past cycles kept for reference and trend analysis."
                : "Manage board cycles and governance artefacts for the current financial year."}
            </p>
          </div>
          {activeSection !== "settings" ? (
            <button className="primary" type="button" onClick={() => setShowCreate(true)}>
              + Start New Period
            </button>
          ) : null}
        </header>

        {activeSection === "settings" ? (
          <section className="panel">
            <p className="helper">Settings will be configured in a later slice.</p>
          </section>
        ) : (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>
                  {activeSection === "historical" ? "Historical periods" : "Current periods"}
                </h2>
                <p className="helper">
                  {activeSection === "historical"
                    ? "Past cycles kept for reference and trend analysis."
                    : "Active months that feed into the current governance cycle."}
                </p>
              </div>
            </div>

            <div className="period-grid">
              {(activeSection === "historical" ? historicalPeriods : currentPeriods).length ===
              0 ? (
                <p className="helper">
                  {activeSection === "historical"
                    ? "No historical periods yet."
                    : "No current periods yet."}
                </p>
              ) : (
                (activeSection === "historical" ? historicalPeriods : currentPeriods).map(
                  (period) => (
                    <div className="period-card" key={period.id}>
                      <div className="period-card-header">
                        <div>
                          <p className="period-title">{period.label}</p>
                          <p className="helper">{period.label}</p>
                        </div>
                      </div>
                      <div className="period-meta">
                        <span className="helper">Period</span>
                        <span className="period-id">{period.id}</span>
                      </div>
                      <div className="period-actions">
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => handleToggleStatus(period)}
                        >
                          {period.status === "current"
                            ? "Move to historical"
                            : "Move to current"}
                        </button>
                        <Link
                          className="ghost-link"
                          href={`/workspace/periods/${period.id}`}
                        >
                          Open workspace →
                        </Link>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          </section>
        )}

        {error ? <p className="helper">{error}</p> : null}
      </main>

      {showCreate ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal">
            <div className="modal-header">
              <h3>Create new period</h3>
              <button className="ghost" type="button" onClick={() => setShowCreate(false)}>
                ✕
              </button>
            </div>
            <p className="helper">
              Add a monthly period for the current governance cycle.
            </p>
            <div className="form-grid">
              <label>
                Period ID (YYYY-MM)
                <input
                  type="text"
                  value={periodId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setPeriodId(next);
                    setPeriodLabel(toMonthLabel(next));
                  }}
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
              <button className="secondary" type="button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="primary" type="button" onClick={handleCreatePeriod}>
                Create period
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
