const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
export const inr = (n) => inrFmt.format(n || 0);
export const inrSigned = (n) => (n > 0.009 ? "+" : n < -0.009 ? "−" : "") + inrFmt.format(Math.abs(n || 0));

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";

export const initials = (name = "?") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

const HUES = [152, 205, 262, 330, 28, 45, 185, 12];
export const hue = (s = "") => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
