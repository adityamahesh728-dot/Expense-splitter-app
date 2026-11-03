import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "SplitEase — Expense Splitter",
  description: "Track shared expenses, balances and settlements (MongoDB DBMS project)",
};

// Every page reads live data from MongoDB, so never pre-render at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="wrap topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">₹</span>
              SplitEase
            </Link>
            <nav className="nav">
              <Link href="/">Dashboard</Link>
              <Link href="/users">People</Link>
            </nav>
          </div>
        </header>
        <main className="wrap main">{children}</main>
        <footer className="wrap foot">
          Personal Expense Splitting App · Next.js + MongoDB (database <code>expense_splitter</code>)
        </footer>
      </body>
    </html>
  );
}
