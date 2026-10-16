"use client";

import { useState } from "react";

export default function CopyField({ value, secret = false }: { value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard can be blocked on non-https pages; fall back to selecting the text.
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="copyfield">
      <code>{shown ? value : value.replace(/[^/:.]/g, (c, i) => (i > value.lastIndexOf("/") ? "•" : c))}</code>
      {secret && (
        <button type="button" className="ghost sm" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Show"}
        </button>
      )}
      <button type="button" className="sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
    </div>
  );
}
