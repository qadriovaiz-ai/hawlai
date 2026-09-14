// The visual marketing email: brand header, product photo, a short
// scannable message, one bold button, a footer — as HTML every mainstream
// inbox renders, plus the plain-text version sent alongside it.
//
// WHY: every email Hawlai sent was plain text — five or six paragraphs
// that read like a letter, with the call to action as a bare link.
//
// Email HTML is not web HTML. Gmail strips <style> blocks in some views
// and Outlook renders with Word's engine, so: tables for layout, every
// style inline, a 600px column, no web fonts, no background images, and
// a button built from a table cell so it stays a solid, clickable block
// everywhere. Everything the business or the AI wrote is escaped; only
// https links and images are used.

export type EmailDesign = {
  brandName: string;
  logoUrl: string | null;
  /** The brand colour the header rule and button use. */
  accent: string;
  /** Hidden preview line inbox lists show after the subject. */
  preheader: string;
  headline: string;
  paragraphs: string[];
  bullets: string[];
  sections: { heading: string; body: string }[];
  image: { url: string; alt: string } | null;
  cta: { label: string; url: string } | null;
  footer: {
    /** Why the person is getting this email. */
    reason: string;
    address: string | null;
    unsubscribeUrl: string | null;
  };
};

export const DEFAULT_ACCENT = "#374151";

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** An https URL safe to put in an attribute, or null. */
export function safeUrl(url: string | null | undefined): string | null {
  const s = String(url ?? "").trim();
  if (!/^https:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black — whichever reads better on the button colour. */
export function textOn(background: string): string {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111111") ? "#ffffff" : "#111111";
}

/**
 * The brand colour to build with: the kit's primary (else its first
 * colour), as long as it's a real hex that stands out against the white
 * email — a pale cream "primary" would make an invisible button.
 */
export function pickAccent(colors: { hex: string; role?: string }[] | null | undefined): string {
  const valid = (colors ?? []).filter((c) => hexToRgb(c?.hex));
  const ordered = [...valid.filter((c) => /primary/i.test(c.role ?? "")), ...valid];
  const usable = ordered.find((c) => contrastRatio(c.hex, "#ffffff") >= 3);
  if (!usable) return DEFAULT_ACCENT;
  const rgb = hexToRgb(usable.hex)!;
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = "#1f2328";
const MUTED = "#5f6670";
const PAGE = "#f3f4f6";

export function renderEmailHtml(d: EmailDesign): string {
  const accent = hexToRgb(d.accent) ? d.accent : DEFAULT_ACCENT;
  const onAccent = textOn(accent);
  const logo = safeUrl(d.logoUrl);
  const image = d.image ? safeUrl(d.image.url) : null;
  const ctaUrl = d.cta ? safeUrl(d.cta.url) : null;
  const unsubscribe = safeUrl(d.footer.unsubscribeUrl);
  const p = (text: string) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">${escapeHtml(text)}</p>`;

  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(d.brandName)}" height="48" style="display:block;height:48px;width:auto;max-width:240px;border:0;outline:none;">`
    : `<span style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:0.2px;color:${INK};">${escapeHtml(d.brandName)}</span>`;

  const imageRow = image
    ? `<tr><td style="padding:0;"><img src="${escapeHtml(image)}" alt="${escapeHtml(d.image!.alt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;"></td></tr>`
    : "";

  const bullets = d.bullets.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">${d.bullets
        .map(
          (b) =>
            `<tr><td valign="top" width="20" style="font-family:${FONT};font-size:16px;line-height:1.6;color:${accent};">&#8226;</td><td style="font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};padding:0 0 6px;">${escapeHtml(b)}</td></tr>`
        )
        .join("")}</table>`
    : "";

  const sections = d.sections
    .map(
      (s) =>
        `<h2 style="margin:8px 0 6px;font-family:${FONT};font-size:18px;line-height:1.35;font-weight:700;color:${INK};">${escapeHtml(s.heading)}</h2>${p(s.body)}`
    )
    .join("");

  const button =
    d.cta && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr><td align="center" bgcolor="${accent}" style="border-radius:6px;background:${accent};"><a href="${escapeHtml(ctaUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:${onAccent};text-decoration:none;border-radius:6px;">${escapeHtml(d.cta.label)}</a></td></tr></table>`
      : "";

  const footerLines = [
    `<p style="margin:0 0 6px;">${escapeHtml(d.footer.reason)}</p>`,
    d.footer.address ? `<p style="margin:0 0 6px;">${escapeHtml(d.brandName)} · ${escapeHtml(d.footer.address)}</p>` : `<p style="margin:0 0 6px;">${escapeHtml(d.brandName)}</p>`,
    unsubscribe ? `<p style="margin:0;"><a href="${escapeHtml(unsubscribe)}" target="_blank" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a></p>` : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(d.headline)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(d.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE}" style="background:${PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:24px 32px 20px;border-top:4px solid ${accent};">${header}</td></tr>
${imageRow}
<tr><td style="padding:28px 32px 24px;">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;color:${INK};">${escapeHtml(d.headline)}</h1>
${d.paragraphs.map(p).join("")}${bullets}${sections}${button}
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid #e5e7eb;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">${footerLines}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The plain-text part: same message, same link, same footer — for inboxes that don't show HTML. */
export function renderEmailText(d: EmailDesign): string {
  const ctaUrl = d.cta ? safeUrl(d.cta.url) : null;
  const unsubscribe = safeUrl(d.footer.unsubscribeUrl);
  const parts = [
    d.headline,
    ...d.paragraphs,
    d.bullets.length ? d.bullets.map((b) => `• ${b}`).join("\n") : "",
    ...d.sections.map((s) => `${s.heading}\n${s.body}`),
    d.cta && ctaUrl ? `${d.cta.label}: ${ctaUrl}` : "",
    "—",
    d.footer.reason,
    d.footer.address ? `${d.brandName} · ${d.footer.address}` : d.brandName,
    unsubscribe ? `Unsubscribe: ${unsubscribe}` : "",
  ];
  return parts.filter((x) => x && x.trim()).join("\n\n");
}
