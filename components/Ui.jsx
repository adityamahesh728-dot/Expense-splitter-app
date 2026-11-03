import Link from "next/link";
import { initials, hue } from "@/lib/format";

export function Avatar({ name, size = 32 }) {
  return (
    <span className="avatar" style={{ "--h": hue(name), width: size, height: size, fontSize: size * 0.4 }}
          aria-hidden="true">{initials(name)}</span>
  );
}

export function Person({ id, name, size }) {
  return (
    <Link href={`/users/${id}`} className="person">
      <Avatar name={name} size={size} /><span>{name}</span>
    </Link>
  );
}

/** Small tag that shows which project query a section answers (handy in a demo). */
export function QueryTag({ n }) {
  return <span className="qtag" title={`This section is Query ${n} from the project`}>Query {n}</span>;
}

export function Section({ title, query, actions, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <h2>{title}</h2>
        <div className="card-head-right">{actions}{query && <QueryTag n={query} />}</div>
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}
