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
          var initOpts = { projectKey: "${projectKey}", capturePerformance: true };
          var startOpts = { userID: "" };
          (function(A,s,a,y,e,r){
            r=window.OpenReplay=[e,r,y,[s-1, e]];
            s=document.createElement('script');s.src=A;s.async=!0;
            document.getElementsByTagName('head')[0].appendChild(s);
            r.start=function(v){r.push([0])};
            r.stop=function(v){r.push([1])};
            r.setUserID=function(id){r.push([2,id])};
            r.setUserAnonymousID=function(id){r.push([3,id])};
            r.setMetadata=function(k,v){r.push([4,k,v])};
            r.event=function(k,v){r.push([5,k,v])};
            r.issue=function(k,v){r.push([6,k,v])};
            r.isActive=function(){return !1};
            r.init=function(i){initOpts=i};
            r.startOpts=function(s){startOpts=s};
          })("https://static.openreplay.com/tracker/v14/openreplay.js", 1, 0, [0,0], 0, 0);

          window.OpenReplay.start();
        `,
            }}
        />
    );
}
