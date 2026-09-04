"use client";

import { useState } from "react";

export default function AdminSeedKnowledgePage() {
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function seed() {
    if (!secret.trim()) return;
    setLoading(true);
    setResult(null);
    setErrorText(null);
    try {
      const res = await fetch("/api/admin/seed-knowledge", {
        method: "POST",
        headers: { "x-seed-secret": secret },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorText(data.error ?? "Unknown error");
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setErrorText("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "60px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Seed Marketing Knowledge Base</h1>
      <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
        Sign in as a platform admin first — the secret alone is no longer enough. Then enter your ADMIN_SEED_SECRET
        (the one set in Vercel env vars) and click the button. Only needs to run once.
      </p>
      <input
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="ADMIN_SEED_SECRET"
        style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }}
      />
      <button
        onClick={seed}
        disabled={loading}
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#4f46e5", color: "white", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}
      >
        {loading ? "Seeding..." : "Seed Knowledge Base"}
      </button>

      {errorText && (
        <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 13, whiteSpace: "pre-wrap" }}>
          {errorText}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: "#dcfce7", color: "#166534", fontSize: 13, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(result, null, 2)}
        </div>
      )}
    </div>
  );
}
