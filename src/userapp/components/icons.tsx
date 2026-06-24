import React from "react";

type P = { size?: number };
const s = (n = 18) => ({ width: n, height: n, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const Shield = ({ size = 18 }: P) => (
  <svg {...s(size)} stroke="#fff"><path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" fill="rgba(255,255,255,.12)" /><path d="M9 12l2 2 4-5" /></svg>
);
export const Send = ({ size = 18 }: P) => (
  <svg {...s(size)} stroke="#fff"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
);
export const Wallet = ({ size = 18 }: P) => (
  <svg {...s(size)}><path d="M3 7h16a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><path d="M3 7l2-3h12l2 3" /><circle cx="17" cy="13" r="1.4" /></svg>
);
export const Receipt = ({ size = 18 }: P) => (
  <svg {...s(size)}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" /><path d="M9 7h6M9 11h6M9 15h4" /></svg>
);
export const DocSearch = ({ size = 18 }: P) => (
  <svg {...s(size)}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h7" /><path d="M14 2v6h6" /><circle cx="17" cy="16" r="3" /><path d="M21.5 20.5L19 18" /></svg>
);
export const Globe = ({ size = 18 }: P) => (
  <svg {...s(size)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>
);
export const Close = ({ size = 18 }: P) => (
  <svg {...s(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
