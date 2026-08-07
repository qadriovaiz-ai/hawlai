"use client";

interface Props {
  planLabel: string;
  isCurrent: boolean;
  isFree: boolean;
}

// Real subscription billing (Hawlai charging a business automatically each
// month) needs Hawlai's own Razorpay merchant account wired up first — that
// hasn't happened yet. Rather than fake a checkout button that doesn't
// actually charge anyone, this opens WhatsApp to Hawlai directly so an
// upgrade can be handled manually until automated billing exists.
const HAWLAI_WHATSAPP_NUMBER = "918931001490";

export default function UpgradeCta({ planLabel, isCurrent, isFree }: Props) {
  if (isCurrent) {
    return (
      <div className="w-full text-center text-xs font-medium text-slate-500 bg-slate-200/60 rounded-lg py-2">
        Your current plan
      </div>
    );
  }

  if (isFree) {
    return (
      <button
        disabled
        className="w-full text-xs font-medium text-slate-400 bg-slate-200/40 rounded-lg py-2 cursor-not-allowed"
      >
        Downgrade — contact support
      </button>
    );
  }

  const message = encodeURIComponent(`Hi, I'd like to upgrade my Hawlai plan to ${planLabel}.`);
  const href = `https://wa.me/${HAWLAI_WHATSAPP_NUMBER}?text=${message}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full text-center text-xs font-semibold text-white bg-gradient-to-b from-brand-600 to-brand-700 rounded-lg py-2 shadow-sm shadow-brand-600/20 hover:brightness-110 active:scale-[0.98] transition-all"
    >
      Upgrade to {planLabel}
    </a>
  );
}
