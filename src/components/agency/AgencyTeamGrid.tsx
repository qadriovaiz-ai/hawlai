"use client";

import { useState, useEffect } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

const ROLES = ["admin", "marketing_manager", "designer", "content_writer", "sales", "viewer"];

interface Business { id: string; name: string }
interface Membership { id: string; role: string; status: string }
interface Person { email: string; memberships: Record<string, Membership> }

export default function AgencyTeamGrid() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState(ROLES[ROLES.length - 1]);
  const [inviteBusinessId, setInviteBusinessId] = useState("");

  function load() {
    fetch("/api/agency/team")
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) {
          setBusinesses(d.businesses ?? []);
          setPeople(d.people ?? []);
          if (!inviteBusinessId && d.businesses?.length) setInviteBusinessId(d.businesses[0].id);
        }
      })
      .catch(() => {});
  }
  useEffect(load, []);

  async function call(body: any, method: "POST" | "PATCH", key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/agency/team", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Something went wrong");
      load();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function invite() {
    if (!inviteEmail.trim() || !inviteBusinessId) return;
    const ok = await call({ email: inviteEmail.trim(), role: inviteRole, dealershipId: inviteBusinessId }, "POST", "invite");
    if (ok) {
      setInviteEmail("");
      setShowInvite(false);
    }
  }

  if (people === null) return <div className="card p-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading team...</div>;
  if (businesses.length === 0) return <p className="text-sm text-slate-400 text-center py-12">No businesses found.</p>;

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-700">Who has access to what</p>
            <p className="text-xs text-slate-400 mt-0.5">One row per person, one column per business. A different role per business is normal.</p>
          </div>
          <Button size="sm" onClick={() => setShowInvite(!showInvite)}>
            {showInvite ? <X className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />} {showInvite ? "Cancel" : "Give access"}
          </Button>
        </div>

        {showInvite && (
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="their@email.com"
              className="input text-sm"
            />
            <div className="flex gap-2">
              <select value={inviteBusinessId} onChange={(e) => setInviteBusinessId(e.target.value)} className="input text-xs flex-1">
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input text-xs flex-1">
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <Button size="sm" onClick={invite} loading={busy === "invite"} disabled={!inviteEmail.trim()} className="w-full justify-center">
              Send invite
            </Button>
            <p className="text-[10.5px] text-slate-400">Grants access to one business. Add them again for each additional business they should reach.</p>
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        {people.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Nobody has been given access yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left font-medium text-slate-400 py-2 pr-3 whitespace-nowrap">Person</th>
                  {businesses.map((b) => (
                    <th key={b.id} className="text-left font-medium text-slate-400 py-2 px-2 whitespace-nowrap">{b.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.email} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">{p.email}</td>
                    {businesses.map((b) => {
                      const m = p.memberships[b.id];
                      const key = `${p.email}:${b.id}`;
                      return (
                        <td key={b.id} className="py-2 px-2">
                          {m ? (
                            <div className="flex items-center gap-1">
                              <select
                                value={m.role}
                                onChange={(e) => call({ memberId: m.id, role: e.target.value }, "PATCH", key)}
                                disabled={busy !== null}
                                className="text-[11px] bg-slate-100 border border-slate-300 rounded px-1.5 py-1 disabled:opacity-50"
                              >
                                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                              </select>
                              <button
                                onClick={() => call({ memberId: m.id, revoke: true }, "PATCH", key)}
                                disabled={busy !== null}
                                title="Revoke access"
                                className="text-slate-300 hover:text-red-400 disabled:opacity-50"
                              >
                                {busy === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                              </button>
                              {m.status === "invited" && <span className="text-[9px] text-amber-500">pending</span>}
                            </div>
                          ) : (
                            <button
                              onClick={() => call({ email: p.email, role: "viewer", dealershipId: b.id }, "POST", key)}
                              disabled={busy !== null}
                              className="text-[11px] text-brand-500 hover:text-brand-400 disabled:opacity-50"
                            >
                              {busy === key ? "..." : "+ grant"}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
