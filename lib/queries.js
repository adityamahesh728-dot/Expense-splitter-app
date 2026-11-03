// All read queries used by the pages.
// Each one is the same aggregation pipeline as in expense_splitter.js,
// so the website shows exactly what the project queries return.
import { getDb, oid } from "./mongodb";

export const r2 = (x) => Math.round(x * 100) / 100;
const id = (v) => (v ? v.toString() : null);

/* ---------------- Dashboard ---------------- */

export async function getStats() {
  const db = await getDb();
  const [users, groups, expenses, settlements, spent] = await Promise.all([
    db.collection("users").countDocuments(),
    db.collection("groups").countDocuments(),
    db.collection("expenses").countDocuments(),
    db.collection("settlements").countDocuments(),
    db.collection("expenses").aggregate([{ $group: { _id: null, t: { $sum: "$amount" } } }]).toArray(),
  ]);
  return { users, groups, expenses, settlements, totalSpent: spent[0]?.t || 0 };
}

export async function listGroups() {
  const db = await getDb();
  const rows = await db.collection("groups").aggregate([
    { $lookup: { from: "expenses", localField: "_id", foreignField: "groupId", as: "ex" } },
    { $project: { name: 1, description: 1, createdAt: 1,
                  memberCount: { $size: "$members" },
                  expenseCount: { $size: "$ex" },
                  totalSpent: { $sum: "$ex.amount" } } },
    { $sort: { createdAt: 1 } },
  ]).toArray();
  return rows.map((g) => ({ ...g, _id: id(g._id) }));
}

export async function listUsers() {
  const db = await getDb();
  const rows = await db.collection("users").aggregate([
    { $lookup: { from: "groups", localField: "_id", foreignField: "members.userId", as: "g" } },
    { $project: { name: 1, email: 1, phone: 1, groupCount: { $size: "$g" } } },
    { $sort: { name: 1 } },
  ]).toArray();
  return rows.map((u) => ({ ...u, _id: id(u._id) }));
}

/* ---------------- Group ---------------- */

export async function getGroup(groupId) {
  const db = await getDb();
  const _id = oid(groupId);
  if (!_id) return null;
  const [g] = await db.collection("groups").aggregate([
    { $match: { _id } },
    { $lookup: { from: "users", localField: "members.userId", foreignField: "_id", as: "users" } },
  ]).toArray();
  if (!g) return null;
  const names = Object.fromEntries(g.users.map((u) => [id(u._id), u.name]));
  return {
    _id: id(g._id), name: g.name, description: g.description || "", currency: g.currency || "INR",
    members: g.members.map((m) => ({ userId: id(m.userId), name: names[id(m.userId)] || "Unknown",
                                     role: m.role, joinedAt: m.joinedAt })),
  };
}

/** QUERY 1 — all expenses and total spending for a group. */
export async function groupExpenseReport(groupId) {
  const db = await getDb();
  const [res] = await db.collection("expenses").aggregate([
    { $match: { groupId: oid(groupId) } },
    { $lookup: { from: "users", localField: "paidBy", foreignField: "_id", as: "payer" } },
    { $lookup: { from: "users", localField: "participants.userId", foreignField: "_id", as: "people" } },
    { $set: { paidByName: { $arrayElemAt: ["$payer.name", 0] }, splitAmong: { $size: "$participants" } } },
    { $sort: { expenseDate: -1, createdAt: -1 } },
    { $facet: {
        expenses: [{ $project: { payer: 0 } }],
        total: [{ $group: { _id: null, totalSpending: { $sum: "$amount" }, expenseCount: { $sum: 1 },
                            avgExpense: { $avg: "$amount" } } }],
        byCategory: [{ $group: { _id: "$category", spent: { $sum: "$amount" }, count: { $sum: 1 } } },
                     { $sort: { spent: -1 } }],
    } },
  ]).toArray();
  const names = (people) => Object.fromEntries(people.map((u) => [id(u._id), u.name]));
  return {
    expenses: res.expenses.map((e) => {
      const n = names(e.people);
      return {
        _id: id(e._id), description: e.description, category: e.category || "Other",
        amount: e.amount, paidBy: id(e.paidBy), paidByName: e.paidByName, splitType: e.splitType,
        splitAmong: e.splitAmong, expenseDate: e.expenseDate,
        participants: e.participants.map((p) => ({ userId: id(p.userId), name: n[id(p.userId)], share: p.share })),
      };
    }),
    total: res.total[0] || { totalSpending: 0, expenseCount: 0, avgExpense: 0 },
    byCategory: res.byCategory.map((c) => ({ category: c._id || "Other", spent: c.spent, count: c.count })),
  };
}

/**
 * QUERY 2 — how much each member owes or is owed.
 *   net = (paid for expenses + settlements paid) − (own share + settlements received)
 *   net > 0 → gets money back · net < 0 → owes
 */
export async function getGroupBalances(groupId) {
  const db = await getDb();
  const g = oid(groupId);
  const rows = await db.collection("expenses").aggregate([
    { $match: { groupId: g } },
    { $project: { _id: 0, entries: { $concatArrays: [
        [{ userId: "$paidBy", paid: "$amount", share: 0, sent: 0, received: 0 }],
        { $map: { input: "$participants", as: "p",
                  in: { userId: "$$p.userId", paid: 0, share: "$$p.share", sent: 0, received: 0 } } },
    ] } } },
    { $unwind: "$entries" },
    { $replaceWith: "$entries" },
    { $unionWith: { coll: "settlements", pipeline: [
        { $match: { groupId: g } },
        { $project: { _id: 0, entries: [
            { userId: "$paidBy", paid: 0, share: 0, sent: "$amount", received: 0 },
            { userId: "$paidTo", paid: 0, share: 0, sent: 0, received: "$amount" }] } },
        { $unwind: "$entries" },
        { $replaceWith: "$entries" },
    ] } },
    // every member appears, even with no activity yet
    { $unionWith: { coll: "groups", pipeline: [
        { $match: { _id: g } }, { $unwind: "$members" },
        { $project: { _id: 0, userId: "$members.userId", paid: { $literal: 0 }, share: { $literal: 0 },
                      sent: { $literal: 0 }, received: { $literal: 0 } } }] } },
    { $group: { _id: "$userId", totalPaid: { $sum: "$paid" }, totalShare: { $sum: "$share" },
                settledOut: { $sum: "$sent" }, settledIn: { $sum: "$received" } } },
    { $set: { net: { $round: [{ $subtract: [{ $add: ["$totalPaid", "$settledOut"] },
                                            { $add: ["$totalShare", "$settledIn"] }] }, 2] } } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
    { $project: { _id: 0, userId: "$_id", name: { $arrayElemAt: ["$u.name", 0] }, totalPaid: 1,
                  totalShare: 1, settledOut: 1, settledIn: 1, net: 1 } },
    { $sort: { net: -1, name: 1 } },
  ]).toArray();
  return rows.map((b) => ({
    ...b, userId: id(b.userId), totalPaid: r2(b.totalPaid), totalShare: r2(b.totalShare),
    status: b.net > 0.009 ? "gets back" : b.net < -0.009 ? "owes" : "settled up",
  }));
}

/** QUERY 4b — fewest "X pays Y" transfers that settle a group (largest debtor ↔ largest creditor). */
export function suggestSettlements(balances) {
  const debtors = balances.filter((b) => b.net < -0.009).map((b) => ({ ...b, left: -b.net }))
    .sort((a, b) => b.left - a.left);
  const creditors = balances.filter((b) => b.net > 0.009).map((b) => ({ ...b, left: b.net }))
    .sort((a, b) => b.left - a.left);
  const plan = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = r2(Math.min(debtors[i].left, creditors[j].left));
    plan.push({ fromId: debtors[i].userId, from: debtors[i].name, toId: creditors[j].userId,
                to: creditors[j].name, amount });
    debtors[i].left = r2(debtors[i].left - amount);
    creditors[j].left = r2(creditors[j].left - amount);
    if (debtors[i].left < 0.01) i++;
    if (creditors[j].left < 0.01) j++;
  }
  return plan;
}

/** QUERY 4d — settlement history of a group. */
export async function groupSettlements(groupId) {
  const db = await getDb();
  const rows = await db.collection("settlements").aggregate([
    { $match: { groupId: oid(groupId) } },
    { $lookup: { from: "users", localField: "paidBy", foreignField: "_id", as: "f" } },
    { $lookup: { from: "users", localField: "paidTo", foreignField: "_id", as: "t" } },
    { $sort: { settledAt: -1 } },
    { $project: { settledAt: 1, amount: 1, method: 1, note: 1,
                  from: { $arrayElemAt: ["$f.name", 0] }, to: { $arrayElemAt: ["$t.name", 0] } } },
  ]).toArray();
  return rows.map((s) => ({ ...s, _id: id(s._id) }));
}

/** QUERY 4a — every non-zero balance in every group. */
export async function unsettledBalances() {
  const db = await getDb();
  const groups = await db.collection("groups").find({}, { projection: { name: 1 } })
    .sort({ createdAt: 1 }).toArray();
  const out = [];
  for (const g of groups) {
    const bal = await getGroupBalances(g._id.toString());
    bal.filter((b) => Math.abs(b.net) > 0.009)
      .forEach((b) => out.push({ groupId: id(g._id), group: g.name, ...b }));
  }
  return out;
}

/* ---------------- User ---------------- */

export async function getUser(userId) {
  const db = await getDb();
  const _id = oid(userId);
  if (!_id) return null;
  const u = await db.collection("users").findOne({ _id });
  if (!u) return null;
  const groups = await db.collection("groups").find({ "members.userId": _id }, { projection: { name: 1 } }).toArray();
  return { _id: id(u._id), name: u.name, email: u.email, phone: u.phone || "",
           groups: groups.map((g) => ({ _id: id(g._id), name: g.name })) };
}

/** QUERY 3 — expense history and contributions of one user. */
export async function userHistory(userId) {
  const db = await getDb();
  const u = oid(userId);
  const [res] = await db.collection("expenses").aggregate([
    { $match: { $or: [{ paidBy: u }, { "participants.userId": u }] } },
    { $set: {
        myShare: { $sum: { $map: {
          input: { $filter: { input: "$participants", as: "p", cond: { $eq: ["$$p.userId", u] } } },
          as: "p", in: "$$p.share" } } },
        iPaid: { $cond: [{ $eq: ["$paidBy", u] }, "$amount", 0] } } },
    { $set: { netEffect: { $round: [{ $subtract: ["$iPaid", "$myShare"] }, 2] } } },
    { $lookup: { from: "groups", localField: "groupId", foreignField: "_id", as: "g" } },
    { $lookup: { from: "users", localField: "paidBy", foreignField: "_id", as: "payer" } },
    { $set: { group: { $arrayElemAt: ["$g.name", 0] }, paidByName: { $arrayElemAt: ["$payer.name", 0] } } },
    { $sort: { expenseDate: -1 } },
    { $facet: {
        history: [{ $project: { expenseDate: 1, group: 1, groupId: 1, description: 1, category: 1, amount: 1,
                                paidByName: 1, iPaid: 1, myShare: 1, netEffect: 1 } }],
        perGroup: [{ $group: { _id: { id: "$groupId", name: "$group" }, expenses: { $sum: 1 },
                               totalPaid: { $sum: "$iPaid" }, totalShare: { $sum: "$myShare" } } },
                   { $sort: { "_id.name": 1 } }],
        overall: [{ $group: { _id: null, expensesInvolved: { $sum: 1 },
                              expensesPaidFor: { $sum: { $cond: [{ $gt: ["$iPaid", 0] }, 1, 0] } },
                              totalPaid: { $sum: "$iPaid" }, totalShare: { $sum: "$myShare" } } }],
    } },
  ]).toArray();
  const settlements = await db.collection("settlements").aggregate([
    { $match: { $or: [{ paidBy: u }, { paidTo: u }] } },
    { $lookup: { from: "users", localField: "paidBy", foreignField: "_id", as: "f" } },
    { $lookup: { from: "users", localField: "paidTo", foreignField: "_id", as: "t" } },
    { $lookup: { from: "groups", localField: "groupId", foreignField: "_id", as: "g" } },
    { $sort: { settledAt: -1 } },
    { $project: { settledAt: 1, amount: 1, method: 1, groupId: 1,
                  group: { $arrayElemAt: ["$g.name", 0] },
                  from: { $arrayElemAt: ["$f.name", 0] }, to: { $arrayElemAt: ["$t.name", 0] },
                  direction: { $cond: [{ $eq: ["$paidBy", u] }, "paid", "received"] } } },
  ]).toArray();
  return {
    history: res.history.map((h) => ({ ...h, _id: id(h._id), groupId: id(h.groupId) })),
    perGroup: res.perGroup.map((p) => ({ groupId: id(p._id.id), group: p._id.name, expenses: p.expenses,
                                         totalPaid: r2(p.totalPaid), totalShare: r2(p.totalShare) })),
    overall: res.overall[0] || { expensesInvolved: 0, expensesPaidFor: 0, totalPaid: 0, totalShare: 0 },
    settlements: settlements.map((s) => ({ ...s, _id: id(s._id), groupId: id(s.groupId) })),
  };
}
