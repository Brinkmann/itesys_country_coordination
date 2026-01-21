"use client";

import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth, firebaseReady } from "@/lib/firebase/client";

export default function AuthStatus() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auth) {
      return;
    }

    const unsubscribe = auth.onAuthStateChanged((nextUser) => {
      setUser(nextUser);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!auth) {
        throw new Error("Firebase is not configured for the browser.");
      }
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to sign in.");
      }
    } finally {
      setLoading(false);
    }
  };

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
    <div className="card">
      <header className="header">
        <p className="helper">GovernanceOS baseline setup</p>
        <h1>Country Coordination Workspace</h1>
        <p className="helper">
          Firebase Auth, Firestore, and Storage are ready. Use email/password to
          sign in and confirm connectivity.
        </p>
      </header>

      <section className="status">
        <span>Status</span>
        <span>
          {user
            ? `Signed in as ${user.email ?? "user"}`
            : firebaseReady
              ? "Signed out"
              : "Missing Firebase config"}
        </span>
      </section>

      <section className="form">
        <label>
          Email
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            disabled={!firebaseReady}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={!firebaseReady}
          />
        </label>
      </section>

      <div className="actions">
        <button
          className="primary"
          type="button"
          onClick={handleSignIn}
          disabled={loading || !firebaseReady}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={handleSignOut}
          disabled={loading || !firebaseReady}
        >
          Sign out
        </button>
      </div>

      {error ? <p className="helper">{error}</p> : null}
    </div>
  );
}
