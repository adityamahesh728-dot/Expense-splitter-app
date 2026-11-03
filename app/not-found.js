import Link from "next/link";

export default function NotFound() {
  return (
    <div className="callout">
      <h1>Not found</h1>
      <p className="muted">That group or person doesn’t exist. If you re-ran the seed script, the old links changed.</p>
      <Link href="/" className="btn">Back to dashboard</Link>
    </div>
  );
}
