"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Check, Facebook, Building2, CreditCard, Link2 } from "lucide-react";

const STEPS = [
  {
    icon: Facebook,
    title: "Create a Facebook Page",
    detail: "This is your business's public presence — required before you can run ads. Skip this if you already have one.",
    href: "https://www.facebook.com/pages/create",
    linkLabel: "Create Page",
  },
  {
    icon: Building2,
    title: "Create a Meta Business Account",
    detail: "This is where your Ad Account lives. Meta usually creates one automatically the first time you set up ads — if not, create it here.",
    href: "https://business.facebook.com/overview",
    linkLabel: "Open Business Manager",
  },
  {
    icon: CreditCard,
    title: "Add a payment method",
    detail: "Card or UPI, inside Meta's own billing page — Hawlai can never see or touch this, by design. This is the only step Meta requires you to do directly.",
    href: "https://business.facebook.com/billing_hub/payment_settings",
    linkLabel: "Open Payment Settings",
  },
  {
    icon: Link2,
    title: "Come back here and connect",
    detail: "Once the above is done, hit \"Connect Facebook Page\" below — Hawlai takes over from there.",
    href: null,
    linkLabel: null,
  },
];

export default function FacebookSetupGuide() {
  const [open, setOpen] = useState(true);

  return (
    <div className="card p-5 space-y-3 bg-blue-500/5 border-blue-700/30">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-semibold text-blue-300">New to Facebook Ads? Start here</span>
        {open ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />}
      </button>
      {open && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-slate-400">
            These 3 steps happen on Facebook's own site — no tool, including Hawlai, is allowed to create a Page, an Ad Account, or add a card on your behalf. It's a Meta security rule, not a Hawlai limitation. Takes about 5-10 minutes total.
          </p>
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-3 bg-slate-100 rounded-lg p-3">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 text-xs font-bold text-blue-300">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                  <step.icon className="w-3.5 h-3.5 text-slate-400" /> {step.title}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{step.detail}</p>
              </div>
              {step.href && (
                <a
                  href={step.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs shrink-0"
                >
                  {step.linkLabel} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
