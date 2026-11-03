"use client";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { addExpense, addMember, createGroup, createUser, recordSettlement } from "@/app/actions";

const CATEGORIES = ["Food", "Groceries", "Rent", "Utilities", "Travel", "Stay", "Entertainment", "Services", "Other"];
const METHODS = ["UPI", "Cash", "Bank Transfer", "Card", "Other"];
const fmt = (n) => "₹" + (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd, local

function Submit({ children, pending, className = "btn" }) {
  return <button className={className} disabled={pending}>{pending ? "Saving…" : children}</button>;
}

function Message({ state }) {
  if (!state) return null;
  return <p className={`msg ${state.ok ? "ok" : "err"}`} role={state.ok ? "status" : "alert"}>
    {state.ok ? state.message : state.error}</p>;
}

/**
 * Run a server action from a form. Unlike <form action={...}>, this keeps what
 * the user typed when the server returns an error, and clears the form only
 * after a successful save.
 */
function useForm(serverAction, onReset) {
  const [state, run, pending] = useActionState(serverAction, null);
  const ref = useRef(null);
  useEffect(() => {
    if (state?.ok) { ref.current?.reset(); onReset?.(); }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSubmit = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => run(data));
  };
  return { state, pending, ref, onSubmit };
}

/* ---------------- People ---------------- */

export function AddUserForm() {
  const { state, pending, ref, onSubmit } = useForm(createUser);
  return (
    <form onSubmit={onSubmit} ref={ref} className="form">
      <label className="field"><span>Full name</span><input name="name" required minLength={2} placeholder="e.g. Ananya Gupta" /></label>
      <label className="field"><span>Email</span><input name="email" type="email" required placeholder="ananya@example.com" /></label>
      <label className="field"><span>Phone (optional)</span><input name="phone" placeholder="9876500007" /></label>
      <Message state={state} />
      <Submit pending={pending}>Add person</Submit>
    </form>
  );
}

/* ---------------- Groups ---------------- */

export function CreateGroupForm({ users }) {
  const { state, pending, ref, onSubmit } = useForm(createGroup);
  if (!users.length) return <p className="empty">Add some people first.</p>;
  return (
    <form onSubmit={onSubmit} ref={ref} className="form">
      <label className="field"><span>Group name</span><input name="name" required placeholder="e.g. Manali Trip" /></label>
      <label className="field"><span>Description (optional)</span><input name="description" placeholder="What is this group for?" /></label>
      <label className="field"><span>Created by (becomes admin)</span>
        <select name="createdBy" required defaultValue="">
          <option value="" disabled>Choose a person</option>
          {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </select>
      </label>
      <div className="field"><span className="label">Members</span>
        <div className="check-grid">
          {users.map((u) => (
            <label key={u._id} className="check"><input type="checkbox" name="members" value={u._id} />{u.name}</label>
          ))}
        </div>
      </div>
      <Message state={state} />
      <Submit pending={pending}>Create group</Submit>
    </form>
  );
}

export function AddMemberForm({ groupId, people }) {
  const { state, pending, ref, onSubmit } = useForm(addMember);
  if (!people.length) return <p className="empty">Everyone is already in this group.</p>;
  return (
    <form onSubmit={onSubmit} ref={ref} className="form">
      <input type="hidden" name="groupId" value={groupId} />
      <label className="field"><span>Person</span>
        <select name="userId" required defaultValue="">
          <option value="" disabled>Choose a person</option>
          {people.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </select>
      </label>
      <Message state={state} />
      <Submit pending={pending} className="btn ghost">Add to group</Submit>
    </form>
  );
}

/* ---------------- Expenses ---------------- */

export function AddExpenseForm({ groupId, members }) {
  const allIds = members.map((m) => m.userId);
  const [splitType, setSplitType] = useState("EQUAL");
  const [amount, setAmount] = useState("");
  const [included, setIncluded] = useState(allIds);
  const [shares, setShares] = useState({});
  const reset = () => { setSplitType("EQUAL"); setAmount(""); setIncluded(allIds); setShares({}); };
  const { state, pending, ref, onSubmit } = useForm(addExpense, reset);

  const amt = Number(amount) || 0;
  const equalEach = included.length ? amt / included.length : 0;
  const customTotal = useMemo(
    () => included.reduce((s, id) => s + (Number(shares[id]) || 0), 0), [included, shares]);
  const diff = Math.round((amt - customTotal) * 100) / 100;
  const toggle = (id) => setIncluded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <form onSubmit={onSubmit} ref={ref} className="form">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="splitType" value={splitType} />
      <label className="field"><span>Description</span><input name="description" required placeholder="e.g. Dinner at Toit" /></label>
      <div className="row-2">
        <label className="field"><span>Amount (₹)</span>
          <input name="amount" type="number" step="0.01" min="0.01" required value={amount}
                 onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label className="field"><span>Date</span><input name="expenseDate" type="date" defaultValue={today()} /></label>
      </div>
      <div className="row-2">
        <label className="field"><span>Paid by</span>
          <select name="paidBy" required defaultValue={allIds[0]}>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select></label>
        <label className="field"><span>Category</span>
          <select name="category" defaultValue="Food">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select></label>
      </div>
      <div className="field">
        <span className="label">Split</span>
        <div className="seg" role="group" aria-label="Split type">
          <button type="button" className={splitType === "EQUAL" ? "on" : ""} onClick={() => setSplitType("EQUAL")}>Equally</button>
          <button type="button" className={splitType === "EXACT" ? "on" : ""} onClick={() => setSplitType("EXACT")}>Custom amounts</button>
        </div>
      </div>
      <div className="split-list">
        {members.map((m) => {
          const on = included.includes(m.userId);
          return (
            <div className="split-item" key={m.userId}>
              <input type="checkbox" name="participants" value={m.userId} checked={on}
                     onChange={() => toggle(m.userId)} aria-label={`Include ${m.name}`} />
              <span>{m.name}</span>
              {splitType === "EQUAL" ? (
                <span className="share">{on ? fmt(equalEach) : "—"}</span>
              ) : (
                <input type="number" step="0.01" min="0" name={`share_${m.userId}`} disabled={!on}
                       value={on ? (shares[m.userId] ?? "") : ""} placeholder="0.00"
                       onChange={(e) => setShares((s) => ({ ...s, [m.userId]: e.target.value }))}
                       aria-label={`${m.name}'s share`} />
              )}
            </div>
          );
        })}
      </div>
      {splitType === "EXACT" && amt > 0 && (
        <div className="split-total">
          <span className="muted">Shares total {fmt(customTotal)} of {fmt(amt)}</span>
          <span className={Math.abs(diff) < 0.005 ? "ok-text" : "err-text"}>
            {Math.abs(diff) < 0.005 ? "Adds up ✓" : diff > 0 ? `${fmt(diff)} left` : `${fmt(-diff)} too much`}</span>
        </div>
      )}
      <Message state={state} />
      <Submit pending={pending}>Add expense</Submit>
    </form>
  );
}

/* ---------------- Settlements ---------------- */

export function RecordPaymentForm({ groupId, members, debtors, creditors }) {
  const { state, pending, ref, onSubmit } = useForm(recordSettlement);
  const from = debtors.length ? debtors : members;
  const to = creditors.length ? creditors : members;
  return (
    <form onSubmit={onSubmit} ref={ref} className="form">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="row-2">
        <label className="field"><span>Who paid</span>
          <select name="paidBy" required defaultValue="">
            <option value="" disabled>Choose</option>
            {from.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select></label>
        <label className="field"><span>Paid to</span>
          <select name="paidTo" required defaultValue="">
            <option value="" disabled>Choose</option>
            {to.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select></label>
      </div>
      <div className="row-2">
        <label className="field"><span>Amount (₹)</span><input name="amount" type="number" step="0.01" min="0.01" required placeholder="0.00" /></label>
        <label className="field"><span>Method</span>
          <select name="method" defaultValue="UPI">{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
      </div>
      <label className="field"><span>Note (optional)</span><input name="note" placeholder="e.g. Rent share" /></label>
      <Message state={state} />
      <Submit pending={pending}>Record payment</Submit>
    </form>
  );
}

/** One-click "Record" button next to a suggested settle-up payment. */
export function SettleButton({ groupId, fromId, toId, amount }) {
  const { state, pending, onSubmit } = useForm(recordSettlement);
  return (
    <form onSubmit={onSubmit} style={{ display: "contents" }}>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="paidBy" value={fromId} />
      <input type="hidden" name="paidTo" value={toId} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="method" value="UPI" />
      <input type="hidden" name="note" value="Settle-up" />
      {state && !state.ok && <span className="err-text small">{state.error}</span>}
      <Submit pending={pending} className="btn small">Mark as paid</Submit>
    </form>
  );
}

/** Delete button that asks before removing an expense. */
export function DeleteExpenseButton({ action, expenseId, label }) {
  const confirmFirst = (e) => {
    if (!window.confirm(`Delete “${label}”? Balances will be recalculated.`)) e.preventDefault();
  };
  return (
    <form action={action}>
      <input type="hidden" name="expenseId" value={expenseId} />
      <button className="btn danger" onClick={confirmFirst} title="Delete expense" aria-label={`Delete ${label}`}>✕</button>
    </form>
  );
}
