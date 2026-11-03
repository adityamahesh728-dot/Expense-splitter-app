"use server";
// All writes to the database. Each one applies the same business rules as the
// helper functions in expense_splitter.js; MongoDB's $jsonSchema validators
// are a second line of defence.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, oid } from "@/lib/mongodb";
import { getGroupBalances, r2 } from "@/lib/queries";

const CATEGORIES = ["Rent", "Utilities", "Food", "Groceries", "Travel", "Stay", "Entertainment", "Services", "Other"];
const METHODS = ["UPI", "Cash", "Bank Transfer", "Card", "Other"];

const fail = (error) => ({ ok: false, error });
const done = (message) => ({ ok: true, message, at: Date.now() });

function dbError(e) {
  if (e?.code === 11000) return "That email is already registered.";
  if (e?.code === 121) return "MongoDB rejected the data (Document failed validation).";
  if (e?.name?.startsWith("MongoServerSelection")) return "Cannot reach MongoDB. Is it running?";
  return e?.message || "Something went wrong.";
}

async function isMember(db, groupId, userId) {
  return (await db.collection("groups").countDocuments({ _id: groupId, "members.userId": userId })) === 1;
}

/** Equal split in paise so the shares always add up exactly. */
function equalShares(amount, userIds) {
  const paise = Math.round(amount * 100);
  const base = Math.floor(paise / userIds.length);
  let extra = paise - base * userIds.length;
  return userIds.map((userId) => ({ userId, share: (base + (extra-- > 0 ? 1 : 0)) / 100 }));
}

/* ---------------- Users ---------------- */

export async function createUser(_prev, form) {
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const phone = String(form.get("phone") || "").trim();
  if (name.length < 2) return fail("Name must be at least 2 characters.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address.");
  if (phone && !/^[0-9+\- ]{7,15}$/.test(phone)) return fail("Phone must be 7–15 digits.");
  try {
    const db = await getDb();
    const doc = { name, email, createdAt: new Date() };
    if (phone) doc.phone = phone;
    await db.collection("users").insertOne(doc);
  } catch (e) { return fail(dbError(e)); }
  revalidatePath("/", "layout");
  return done(`${name} was added.`);
}

/* ---------------- Groups ---------------- */

export async function createGroup(_prev, form) {
  const name = String(form.get("name") || "").trim();
  const description = String(form.get("description") || "").trim();
  const creator = oid(form.get("createdBy"));
  const memberIds = form.getAll("members").map(oid).filter(Boolean);
  if (!name) return fail("Give the group a name.");
  if (!creator) return fail("Choose who is creating the group.");
  let groupId;
  try {
    const db = await getDb();
    const now = new Date();
    const ids = [creator, ...memberIds.filter((m) => !m.equals(creator))];
    const members = ids.map((userId, i) => ({ userId, role: i === 0 ? "admin" : "member", joinedAt: now }));
    const doc = { name, currency: "INR", createdBy: creator, members, createdAt: now };
    if (description) doc.description = description;
    groupId = (await db.collection("groups").insertOne(doc)).insertedId.toString();
  } catch (e) { return fail(dbError(e)); }
  revalidatePath("/", "layout");
  redirect(`/groups/${groupId}`);
}

export async function addMember(_prev, form) {
  const groupId = oid(form.get("groupId"));
  const userId = oid(form.get("userId"));
  if (!groupId || !userId) return fail("Choose a person to add.");
  try {
    const db = await getDb();
    const r = await db.collection("groups").updateOne(
      { _id: groupId, "members.userId": { $ne: userId } },
      { $push: { members: { userId, role: "member", joinedAt: new Date() } } });
    if (!r.modifiedCount) return fail("That person is already in the group.");
  } catch (e) { return fail(dbError(e)); }
  revalidatePath("/", "layout");
  return done("Member added.");
}

/* ---------------- Expenses ---------------- */

export async function addExpense(_prev, form) {
  const groupId = oid(form.get("groupId"));
  const paidBy = oid(form.get("paidBy"));
  const description = String(form.get("description") || "").trim();
  const category = String(form.get("category") || "Other");
  const amount = r2(Number(form.get("amount")));
  const splitType = form.get("splitType") === "EXACT" ? "EXACT" : "EQUAL";
  const dateStr = String(form.get("expenseDate") || "");
  const included = form.getAll("participants").map(oid).filter(Boolean);

  if (!description) return fail("Enter what the expense was for.");
  if (!(amount >= 0.01)) return fail("Amount must be at least ₹0.01.");
  if (!paidBy) return fail("Choose who paid.");
  if (!CATEGORIES.includes(category)) return fail("Choose a category.");
  if (!included.length) return fail("Tick at least one person to share the expense.");

  let participants;
  if (splitType === "EQUAL") {
    participants = equalShares(amount, included);
  } else {
    participants = included.map((userId) => ({ userId, share: r2(Number(form.get(`share_${userId}`) || 0)) }));
    if (participants.some((p) => !(p.share >= 0))) return fail("Shares cannot be negative.");
    const total = r2(participants.reduce((s, p) => s + p.share, 0));
    if (Math.abs(total - amount) > 0.001)
      return fail(`Custom shares add up to ₹${total.toFixed(2)}, but the expense is ₹${amount.toFixed(2)}.`);
  }

  try {
    const db = await getDb();
    if (!(await isMember(db, groupId, paidBy))) return fail("The payer is not in this group.");
    for (const p of participants)
      if (!(await isMember(db, groupId, p.userId))) return fail("Everyone sharing must be in this group.");
    const expenseDate = dateStr ? new Date(`${dateStr}T12:00:00Z`) : new Date();
    await db.collection("expenses").insertOne({
      groupId, description, category, amount, paidBy, splitType, participants,
      expenseDate, createdAt: new Date(),
    });
  } catch (e) { return fail(dbError(e)); }
  revalidatePath("/", "layout");
  return done(`Added “${description}” (₹${amount.toFixed(2)}).`);
}

export async function deleteExpense(form) {
  const expenseId = oid(form.get("expenseId"));
  if (!expenseId) return;
  const db = await getDb();
  await db.collection("expenses").deleteOne({ _id: expenseId });
  revalidatePath("/", "layout");
}

/* ---------------- Settlements ---------------- */

export async function recordSettlement(_prev, form) {
  const groupId = oid(form.get("groupId"));
  const from = oid(form.get("paidBy"));
  const to = oid(form.get("paidTo"));
  const amount = r2(Number(form.get("amount")));
  const method = METHODS.includes(form.get("method")) ? form.get("method") : "UPI";
  const note = String(form.get("note") || "").trim();

  if (!groupId || !from || !to) return fail("Choose who paid and who received.");
  if (from.equals(to)) return fail("Someone cannot pay themselves.");
  if (!(amount >= 0.01)) return fail("Amount must be at least ₹0.01.");

  try {
    const db = await getDb();
    if (!(await isMember(db, groupId, from)) || !(await isMember(db, groupId, to)))
      return fail("Both people must be members of the group.");
    const bal = Object.fromEntries((await getGroupBalances(groupId.toString())).map((b) => [b.userId, b.net]));
    const owes = -(bal[from.toString()] || 0);
    const isOwed = bal[to.toString()] || 0;
    if (!(owes > 0.009)) return fail("The payer does not owe anything in this group.");
    if (!(isOwed > 0.009)) return fail("The receiver is not owed anything in this group.");
    const max = r2(Math.min(owes, isOwed));
    if (amount > max + 0.001) return fail(`That is more than is outstanding. The most allowed is ₹${max.toFixed(2)}.`);
    await db.collection("settlements").insertOne({
      groupId, paidBy: from, paidTo: to, amount, method, note, settledAt: new Date(),
    });
  } catch (e) { return fail(dbError(e)); }
  revalidatePath("/", "layout");
  return done(`Payment of ₹${amount.toFixed(2)} recorded.`);
}
