"use client";

// The growth report, when the owner asks for it — R3.
//
// THE DAILY EMAIL STOPPED IN R2b. The founder's decision was that the
// agent keeps working in the background and the report is something he
// asks for, shown on the screen, with emailing it as a separate click.
//
// NOTHING IS SENT BY ASKING. The button below builds the report and
// shows it. "Email it to me as well" is its own button, and it only
// appears once there is a report to send.

import { useState } from "react";
import { Loader2, FileText, Mail, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

type Counted = { label: string; value: number; source?: string };
type Block = Record<string, any> & { kind: string };
type Report = { subject: string; day: string; blocks: Block[] };
type LeftOut = { title?: string; figure?: string };

export default function GrowthReportPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [leftOut, setLeftOut] = useState<LeftOut[]>([]);
  const [building, setBuilding] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setBuilding(true);
    setError(null);
    setSentTo(null);
    try {
      const res = await fetch("/api/growth/report", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "The report could not be built just now.");
      } else {
        setReport(data.report ?? null);
        setLeftOut(Array.isArray(data.leftOut) ? data.leftOut : []);
      }
    } catch {
      setError("The report could not be built just now.");
    }
    setBuilding(false);
  }

  async function email() {
    if (!report) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/growth/report/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      const data = await res.json();
      // SAYS WHERE IT WENT, or why it did not. A button that always
      // reads "sent" is a button nobody believes the third time.
      if (!res.ok || !data?.sent) setError(data?.error ?? "It could not be sent just now.");
      else setSentTo(data.to ?? null);
    } catch {
      setError("It could not be sent just now.");
    }
    setSending(false);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          <h3 className="font-medium text-slate-900">Growth report</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={build} disabled={building}>
            {building ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {building ? "Looking…" : report ? "Check again" : "Show me where I stand"}
          </Button>
          {/* ONLY ONCE THERE IS SOMETHING TO SEND, and never by default. */}
          {report && (
            <Button variant="secondary" onClick={email} disabled={sending}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {sending ? "Sending…" : "Email it to me as well"}
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-500 mt-2">
        The agent keeps checking and fixing in the background. This builds a report from what it
        found, now — nothing is emailed unless you ask for it.
      </p>

      {error && (
        <p className="text-sm text-amber-500 mt-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {sentTo && (
        <p className="text-sm text-slate-600 mt-3 flex items-center gap-2">
          <Check className="w-4 h-4" /> Sent to {sentTo}.
        </p>
      )}

      {report && (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <p className="font-medium text-slate-900">{report.subject}</p>
          <p className="text-xs text-slate-500 mt-0.5">For {report.day}</p>

          <div className="mt-4 space-y-4">
            {report.blocks.map((block, i) => (
              <ReportBlock key={i} block={block} />
            ))}
          </div>

          {/* WHAT WAS LEFT OUT, AND OVER WHICH FIGURE. The email has said
              "I left 1 thing out" since 3 November and the answer to
              "which thing" lived only in a log line. */}
          {leftOut.length > 0 && (
            <p className="text-xs text-slate-500 mt-5">
              {leftOut.length === 1 ? "One block was" : `${leftOut.length} blocks were`} left out, because a
              figure in {leftOut.length === 1 ? "it" : "them"} did not trace back to anything counted
              {leftOut.some((b) => b.title) ? `: ${leftOut.map((b) => b.title).filter(Boolean).join("; ")}` : ""}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One block, in the same shape the email prints it. */
function ReportBlock({ block }: { block: Block }) {
  const numbers: Counted[] = Array.isArray(block.numbers) ? block.numbers : [];

  if (block.kind === "stat" && block.number) {
    return (
      <p className="text-sm text-slate-700">
        <span className="text-slate-500">{block.number.label}:</span>{" "}
        <span className="font-medium tabular-nums">{block.number.value}</span>
      </p>
    );
  }

  const title = typeof block.title === "string" ? block.title : null;
  const text = typeof block.text === "string" ? block.text : null;
  const detail = typeof block.detail === "string" ? block.detail : null;

  return (
    <div>
      {title && <p className="text-sm font-medium text-slate-900">{title}</p>}
      {text && <p className="text-sm text-slate-700">{text}</p>}
      {detail && <p className="text-sm text-slate-600 mt-1">{detail}</p>}
      {numbers.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {numbers.map((n, i) => (
            <li key={i} className="text-xs text-slate-500">
              {n.label}: <span className="tabular-nums text-slate-700">{n.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
