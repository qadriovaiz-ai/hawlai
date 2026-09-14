// Client-safe: the CSV upload screen imports this in the browser, so it
// must not pull in consent.ts (which uses node:crypto).

/** Where CSV-uploaded leads' consent came from — the owner picks one before uploading. */
export const CSV_CONSENT_SOURCES: Record<string, string> = {
  signup: "They signed up on my website or store",
  purchase: "They bought from me",
  enquiry: "They enquired — by call, WhatsApp, form or visit",
  event: "They gave me their details at an event or in my shop",
};
