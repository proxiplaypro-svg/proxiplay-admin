"use client";

import { useEffect, useState } from "react";

type OpenAppRedirectProps = {
  androidIntentUrl: string;
  secureAppUrl?: string;
};

export default function OpenAppRedirect({ androidIntentUrl, secureAppUrl }: OpenAppRedirectProps) {
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAndroid = userAgent.includes("android");

    if (!isAndroid) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setAttempted(true);
      window.location.replace(androidIntentUrl);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [androidIntentUrl]);

  if (!attempted) {
    return (
      <>
      <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
        Ouverture de l application Proxiplay...
      </p>
      {secureAppUrl && <a href={secureAppUrl} className="rounded-2xl bg-indigo-600 px-5 py-3 text-center font-semibold text-white">Ouvrir dans l’application</a>}
      </>
    );
  }

  return (
    <>
    <p className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
      Si rien ne s ouvre, utilise le bouton &quot;Ouvrir dans l application&quot;.
    </p>
    {secureAppUrl && <a href={androidIntentUrl} className="rounded-2xl bg-indigo-600 px-5 py-3 text-center font-semibold text-white">Ouvrir dans l’application</a>}
    </>
  );
}
