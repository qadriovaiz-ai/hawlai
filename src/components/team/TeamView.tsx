"use client";

import { useState, useEffect } from "react";
import { Loader2, UserPlus, Check, Copy, X, Crown } from "lucide-react";

interface Member {
  id: string;
  email: string;
  role: string;
  status: "invited" | "active" | "removed";
  invited_at: string;
  joined_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  marketing_manager: "Marketing Manager",
  designer: "Designer",
  content_writer: "Content Writer",
  sales: "Sales",
  viewer: "Viewer",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Everything except billing",
  marketing_manager: "Strategy, content, ads, analytics — can assign tasks",
  designer: "Only sees design tasks assigned to them",
  content_writer: "Only sees writing tasks assigned to them",
  sales: "Only sees leads assigned to them",
  viewer: "Read-only — reports and analytics",
};

export default function TeamView() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "designer" });
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/team").then((r) => r.json()).then((d) => setMembers(d.members ?? [])).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function sendInvite() {
    setInviting(true);
    setError(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send invite");
      setInviteLink(data.inviteUrl);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(id: string, role: string) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    await fetch(`/api/team/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
  }

  async function removeMember(id: string) {
    if (!confirm("Remove this person from the team?")) return;
    await fetch(`/api/team/${id}`, { method: "DELETE" });
    load();
  }

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="card p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
          <Crown className="w-4 h-4 text-purple-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">You (Owner)</p>
          <p className="text-xs text-slate-400">Full access</p>
        </div>
      </div>

      {members.map((m) => (
        <div key={m.id} className="card p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-sm">
            {m.email[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{m.email}</p>
            <p className="text-xs text-slate-400">{m.status === "invited" ? "Invite pending" : "Active"}</p>
          </div>
          <select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700">
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button onClick={() => removeMember(m.id)} className="text-slate-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      {!showInvite ? (
        <button onClick={() => setShowInvite(true)} className="w-full text-sm border border-dashed border-slate-300 hover:border-purple-400 text-slate-500 hover:text-purple-600 rounded-lg py-3 flex items-center justify-center gap-2">
          <UserPlus className="w-4 h-4" /> Invite a team member
        </button>
      ) : (
        <div className="card p-4 space-y-3">
          {!inviteLink ? (
            <>
              <input
                type="email"
                placeholder="Email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2"
              />
              <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2">
                {Object.entries(ROLE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400">{ROLE_DESCRIPTIONS[inviteForm.role]}</p>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button onClick={sendInvite} disabled={inviting || !inviteForm.email} className="flex-1 text-sm bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {inviting && <Loader2 className="w-4 h-4 animate-spin" />} Send Invite
                </button>
                <button onClick={() => setShowInvite(false)} className="text-sm text-slate-500 px-3">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700">Invite created. Share this link with them:</p>
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-600 truncate flex-1">{inviteLink}</p>
                <button onClick={copyLink} className="text-slate-400 hover:text-purple-600 shrink-0">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <button onClick={() => { setShowInvite(false); setInviteLink(null); setInviteForm({ email: "", role: "designer" }); }} className="text-sm text-purple-600">
                Done
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
