'use client';

import Script from 'next/script';

export default function OpenReplayTracker() {
    const projectKey =
        process.env.NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY || 'RPvj17FQ3rJhQrjzZWmJ';

    return (
        <Script
            id="openreplay-tracker"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
                __html: `
          (function(A,s){
            var t=A.OpenReplay||function(){(A.OpenReplay.q=A.OpenReplay.q||[]).push(arguments)};
            A.OpenReplay=t;
            var e=s.createElement("script");
            e.async=1;
            e.src="https://static.openreplay.com/tracker/v14/openreplay.js";
            s.getElementsByTagName("head")[0].appendChild(e);
            t("init", { projectKey: ${JSON.stringify(projectKey)}, capturePerformance: true });
            t("start");
          })(window,document);
        `,
            }}
        />
    );
}
