"use client";

import Script from "next/script";
import VisualEditsMessenger from "./VisualEditsMessenger";
import { useEffect, useState } from "react";

export default function VisualEditsMount() {
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    // Only enable the visual edits tooling when app is embedded in an iframe
    setIsIframe(typeof window !== "undefined" && window.self !== window.top);
  }, []);

  if (!isIframe) return null;

  return (
    <>
      <Script
        src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts//route-messenger.js"
        strategy="afterInteractive"
        data-target-origin="*"
        data-message-type="ROUTE_CHANGE"
        data-include-search-params="true"
        data-only-in-iframe="true"
        data-debug="true"
        data-custom-data='{"appName": "YourApp", "version": "1.0.0", "greeting": "hi"}'
      />
      <VisualEditsMessenger />
    </>
  );
}
