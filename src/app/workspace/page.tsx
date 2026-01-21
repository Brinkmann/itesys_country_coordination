"use client";

import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, firebaseReady } from "@/lib/firebase/client";

export default function WorkspacePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <main className="container">
      <section className="card">
        <header className="header">
          <p className="helper">GovernanceOS baseline setup</p>
          <h1>Workspace</h1>
          <p className="helper">
            You are signed in. This is the workspace landing page for the app.
          </p>
        </header>

        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={handleSignOut}
            disabled={loading || !firebaseReady}
          >
            {loading ? "Signing out..." : "Sign out"}
          </button>
        </div>

        {error ? <p className="helper">{error}</p> : null}
      </section>
    </main>
  );
}
