"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth, firebaseReady } from "@/lib/firebase/client";

const formatAuthError = (err: unknown) => {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof err.code === "string"
  ) {
    switch (err.code) {
      case "auth/configuration-not-found":
        return [
          "Email/password auth is not enabled for this Firebase project.",
          "Enable it in Firebase Console → Authentication → Sign-in method → Email/Password.",
        ].join(" ");
      case "auth/user-not-found":
        return "No user found for that email. Use Sign up to create one.";
      case "auth/wrong-password":
        return "Incorrect password. Try again or sign up.";
      case "auth/invalid-email":
        return "Invalid email address. Check the address and try again.";
      case "auth/email-already-in-use":
        return "An account already exists for that email. Use Sign in instead.";
      case "auth/weak-password":
        return "Password is too weak. Use at least 6 characters.";
      default:
        return `Firebase error: ${err.code}`;
    }
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Unable to authenticate.";
};

export default function AuthStatus() {
  const router = useRouter();
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

  useEffect(() => {
    if (user) {
      router.push("/workspace");
    }
  }, [router, user]);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!auth) {
        throw new Error("Firebase is not configured for the browser.");
      }
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!auth) {
        throw new Error("Firebase is not configured for the browser.");
      }
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(formatAuthError(err));
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
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <header className="header">
        <p className="helper">Itesys - Country Coordination baseline setup</p>
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
          onClick={handleSignUp}
          disabled={loading || !firebaseReady}
        >
          Sign up
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
