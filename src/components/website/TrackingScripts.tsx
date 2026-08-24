"use client";

import Script from "next/script";
import { useState, useEffect } from "react";
import { readConsent } from "@/lib/consent";

// Third-party tracking tags — CONSENT-GATED (retargeting piece 2/7).
//
// Previously these rendered unconditionally, meaning Meta and Google
// received a PageView from every visitor before anyone was asked.
// Under DPDP that's non-essential processing without a lawful basis.
//
// Now a client component that renders nothing until consent is
// actually granted. That does cost the server-rendered <Script>
// placement, but the alternative — rendering tags server-side and
// hoping a client script suppresses them in time — would fire the
// pixel first and ask afterwards, which is the exact problem.
export default function TrackingScripts({
  gaId,
  metaPixelId,
  gtmId,
  googleAdsConversionId,
}: {
  gaId?: string | null;
  metaPixelId?: string | null;
  gtmId?: string | null;
  /** 'AW-XXXXXXXXX' — enables Google Ads remarketing + conversions (piece 4). */
  googleAdsConversionId?: string | null;
}) {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(readConsent() === "granted");
  }, []);

  if (!consented) return null;

  // GA4 and Google Ads share ONE gtag script — loading it twice would
  // double-fire every event. So the tag loads if EITHER is configured,
  // and each destination gets its own config line.
  const googleTagId = gaId || googleAdsConversionId;

  return (
    <>
      {googleTagId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`} strategy="afterInteractive" />
          <Script id="google-tag-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              ${gaId ? `gtag('config', '${gaId}');` : ""}
              ${googleAdsConversionId ? `gtag('config', '${googleAdsConversionId}');` : ""}`}
          </Script>
        </>
      )}
      {metaPixelId && (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
            fbq('track', 'PageView');`}
        </Script>
      )}
      {gtmId && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      )}
    </>
  );
}
