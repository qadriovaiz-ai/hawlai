"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, CheckCircle2 } from "lucide-react";
import { use } from "react";

export default function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function acceptInvite() {
    const res = await fetch("/api/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't accept the invite");
    return data;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { error: signupError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { full_name: form.fullName } },
        });
        if (signupError) throw signupError;
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (loginError) throw loginError;
      }
      await acceptInvite();
      setSuccess(true);
      setTimeout(() => router.push("/team-tasks"), 1500);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
          <p className="text-slate-700 font-semibold">You're in! Taking you to your tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">You've been invited to join a Hawlai team</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === "signup" ? "Create your account to accept." : "Sign in to accept."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input required placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2" />
          )}
          <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2" />
          <input required type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2" />

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "signup" ? "Create account & join" : "Sign in & join"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          {mode === "signup" ? "Already have a Hawlai account? " : "Need to create an account? "}
          <button onClick={() => setMode(mode === "signup" ? "login" : "signup")} className="text-purple-600 font-medium">
            {mode === "signup" ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </div>
  );
}
