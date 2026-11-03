/*
 * =====================================================================
 *  PERSONAL EXPENSE SPLITTING APP  —  MongoDB Database Implementation
 *  DBMS Mini Project
 * =====================================================================
 *  Run with:   mongosh expense_splitter.js
 *          or: mongosh "mongodb://localhost:27017" expense_splitter.js
 *  Target:     MongoDB 6.0+ (uses $jsonSchema, $unionWith, $facet, $lookup)
 *
 *  Sections
 *    1. Database & collections with schema validation
 *    2. Indexes
 *    3. Helper functions (add user/group/expense, equal & custom split)
 *    4. Sample data
 *    5. Query 1 – All expenses and total spending of a group
 *    6. Query 2 – How much each member owes / is owed
 *    7. Query 3 – Expense history & contributions of one user
 *    8. Query 4 – Unsettled balances + recording a settlement payment
 * =====================================================================
 */

const DB_NAME = "expense_splitter";
db = db.getSiblingDB(DB_NAME);

/* --------------------------------------------------------------------
 * Small printing helpers (only for readable console output)
 * ------------------------------------------------------------------ */
function heading(t) {
  print("\n" + "=".repeat(72));
  print("  " + t);
  print("=".repeat(72));
}
function table(rows, cols) {
  if (!rows.length) { print("  (no rows)"); return; }
  cols = cols || Object.keys(rows[0]);
  const money = /amount|paid|share|net|spent|settled|effect/i;    // 2-decimal columns
  const fmt = (v, c) => (v instanceof Date ? v.toISOString().slice(0, 10)
                    : typeof v === "number" ? (money.test(c) ? v.toFixed(2) : String(v))
                    : String(v ?? ""));
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => fmt(r[c], c).length)));
  const line = (vals) => "  " + vals.map((v, i) => v.padEnd(w[i])).join(" | ");
  print(line(cols));
  print("  " + w.map((n) => "-".repeat(n)).join("-+-"));
  rows.forEach((r) => print(line(cols.map((c) => fmt(r[c], c)))));
}
const r2 = (x) => Math.round(x * 100) / 100;

/* ====================================================================
 * 1. DATABASE & COLLECTIONS (with $jsonSchema validation)
 * ================================================================== */
heading("1. Creating collections with schema validation");

db.dropDatabase();   // start clean every run

// ---- USERS ---------------------------------------------------------
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      title: "User",
      required: ["name", "email", "createdAt"],
      properties: {
        name:      { bsonType: "string", minLength: 2, maxLength: 60 },
        email:     { bsonType: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
        phone:     { bsonType: "string", pattern: "^[0-9+\\- ]{7,15}$" },
        createdAt: { bsonType: "date" }
      }
    }
  },
  validationAction: "error"
});

// ---- GROUPS (members embedded: a group has a small, bounded member list)
db.createCollection("groups", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      title: "Group",
      required: ["name", "createdBy", "members", "createdAt"],
      properties: {
        name:        { bsonType: "string", minLength: 1, maxLength: 80 },
        description: { bsonType: "string" },
        createdBy:   { bsonType: "objectId" },
        currency:    { enum: ["INR", "USD", "EUR"] },
        members: {
          bsonType: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            bsonType: "object",
            required: ["userId", "role", "joinedAt"],
            properties: {
              userId:   { bsonType: "objectId" },
              role:     { enum: ["admin", "member"] },
              joinedAt: { bsonType: "date" }
            }
          }
        },
        createdAt: { bsonType: "date" }
      }
    }
  }
});

// ---- EXPENSES (Expense Participants embedded as the `participants` array)
db.createCollection("expenses", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      title: "Expense",
      required: ["groupId", "description", "amount", "paidBy",
                 "splitType", "participants", "expenseDate", "createdAt"],
      properties: {
        groupId:     { bsonType: "objectId" },
        description: { bsonType: "string", minLength: 1 },
        category:    { enum: ["Rent", "Utilities", "Food", "Groceries", "Travel",
                              "Stay", "Entertainment", "Services", "Other"] },
        amount:      { bsonType: ["double", "int", "decimal"], minimum: 0.01 },
        paidBy:      { bsonType: "objectId" },
        splitType:   { enum: ["EQUAL", "EXACT"] },
        participants: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["userId", "share"],
            properties: {
              userId: { bsonType: "objectId" },
              share:  { bsonType: ["double", "int", "decimal"], minimum: 0 }
            }
          }
        },
        expenseDate: { bsonType: "date" },
        createdAt:   { bsonType: "date" }
      }
    }
  }
});

// ---- SETTLEMENTS / PAYMENTS -----------------------------------------
db.createCollection("settlements", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      title: "Settlement",
      required: ["groupId", "paidBy", "paidTo", "amount", "settledAt"],
      properties: {
        groupId:   { bsonType: "objectId" },
        paidBy:    { bsonType: "objectId" },     // debtor who pays
        paidTo:    { bsonType: "objectId" },     // creditor who receives
        amount:    { bsonType: ["double", "int", "decimal"], minimum: 0.01 },
        method:    { enum: ["UPI", "Cash", "Bank Transfer", "Card", "Other"] },
        note:      { bsonType: "string" },
        settledAt: { bsonType: "date" }
      }
    }
  }
});

print("  Collections: " + db.getCollectionNames().sort().join(", "));

/* ====================================================================
 * 2. INDEXES
 * ================================================================== */
heading("2. Creating indexes");

db.users.createIndex({ email: 1 }, { unique: true, name: "uniq_email" });
db.groups.createIndex({ "members.userId": 1 }, { name: "groups_by_member" });
db.expenses.createIndex({ groupId: 1, expenseDate: -1 }, { name: "group_expenses_by_date" });
db.expenses.createIndex({ paidBy: 1 }, { name: "expenses_by_payer" });
db.expenses.createIndex({ "participants.userId": 1 }, { name: "expenses_by_participant" });
db.settlements.createIndex({ groupId: 1, settledAt: -1 }, { name: "group_settlements" });
db.settlements.createIndex({ paidBy: 1, paidTo: 1 }, { name: "settlement_parties" });

["users", "groups", "expenses", "settlements"].forEach((c) =>
  print("  " + c.padEnd(12) + ": " + db[c].getIndexes().map((i) => i.name).join(", ")));

/* ====================================================================
 * 3. HELPER FUNCTIONS  (application-level business rules)
 * ================================================================== */

function addUser(name, email, phone) {
  return db.users.insertOne({ name, email, phone, createdAt: new Date() }).insertedId;
}

function createGroup(name, description, creatorId, memberIds) {
  const now = new Date();
  const members = [creatorId, ...memberIds.filter((m) => !m.equals(creatorId))]
    .map((id, i) => ({ userId: id, role: i === 0 ? "admin" : "member", joinedAt: now }));
  return db.groups.insertOne({ name, description, currency: "INR",
    createdBy: creatorId, members, createdAt: now }).insertedId;
}

function joinGroup(groupId, userId) {
  return db.groups.updateOne(
    { _id: groupId, "members.userId": { $ne: userId } },
    { $push: { members: { userId, role: "member", joinedAt: new Date() } } });
}

function isMember(groupId, userId) {
  return db.groups.countDocuments({ _id: groupId, "members.userId": userId }) === 1;
}

/** Equal split done in paise so the shares always add up exactly. */
function equalShares(amount, userIds) {
  const paise = Math.round(amount * 100);
  const base = Math.floor(paise / userIds.length);
  let extra = paise - base * userIds.length;        // leftover paise
  return userIds.map((id) => ({ userId: id, share: (base + (extra-- > 0 ? 1 : 0)) / 100 }));
}

/**
 * Add an expense.
 *   split = { type: "EQUAL", among: [userIds] }
 *        or { type: "EXACT", shares: [[userId, amount], ...] }
 */
function addExpense(groupId, description, category, amount, paidBy, split, date) {
  if (!isMember(groupId, paidBy)) throw new Error("Payer is not a member of the group");

  const participants = split.type === "EQUAL"
    ? equalShares(amount, split.among)
    : split.shares.map(([userId, share]) => ({ userId, share }));

  participants.forEach((p) => {
    if (!isMember(groupId, p.userId)) throw new Error("Participant not in group: " + p.userId);
  });
  const total = r2(participants.reduce((s, p) => s + p.share, 0));
  if (Math.abs(total - amount) > 0.001)
    throw new Error(`Shares (${total}) do not add up to amount (${amount})`);

  return db.expenses.insertOne({
    groupId, description, category, amount, paidBy,
    splitType: split.type, participants,
    expenseDate: date || new Date(), createdAt: new Date()
  }).insertedId;
}

/* ====================================================================
 * 4. SAMPLE DATA
 * ================================================================== */
heading("4. Inserting sample data");

const aarav   = addUser("Aarav Sharma",  "aarav@example.com",   "9876500001");
const priya   = addUser("Priya Nair",    "priya@example.com",   "9876500002");
const rohan   = addUser("Rohan Mehta",   "rohan@example.com",   "9876500003");
const sneha   = addUser("Sneha Reddy",   "sneha@example.com",   "9876500004");
const karthik = addUser("Karthik Rao",   "karthik@example.com", "9876500005");
const meera   = addUser("Meera Iyer",    "meera@example.com",   "9876500006");

// A user can be in multiple groups (Aarav and Rohan are in both).
const flat = createGroup("Flat 302 - Koramangala", "Monthly flat expenses",
                         aarav, [priya, rohan, sneha]);
const goa  = createGroup("Goa Trip 2026", "4-day trip, October 2026",
                         karthik, [aarav, meera]);
joinGroup(goa, rohan);                      // Rohan joins later

const D = (s) => new Date(s + "T12:00:00Z");
const ALL_FLAT = [aarav, priya, rohan, sneha];
const ALL_GOA  = [karthik, aarav, meera, rohan];

// Flat 302
addExpense(flat, "October rent",        "Rent",      40000, aarav, { type: "EQUAL", among: ALL_FLAT }, D("2026-10-01"));
addExpense(flat, "Electricity bill",    "Utilities",  2350, priya, { type: "EQUAL", among: ALL_FLAT }, D("2026-10-05"));
addExpense(flat, "Groceries (Sneha away)", "Groceries", 1849, rohan, { type: "EQUAL", among: [aarav, priya, rohan] }, D("2026-10-08"));
addExpense(flat, "Wi-Fi recharge",      "Utilities",   999, sneha, { type: "EQUAL", among: ALL_FLAT }, D("2026-10-10"));
addExpense(flat, "Pizza night",         "Food",       1600, priya,
           { type: "EXACT", shares: [[aarav, 500], [priya, 300], [rohan, 500], [sneha, 300]] }, D("2026-10-12"));
addExpense(flat, "Deep cleaning service","Services",  1200, aarav, { type: "EQUAL", among: ALL_FLAT }, D("2026-10-15"));

// Goa trip
addExpense(goa, "Beach resort (3 nights)", "Stay",   18000, karthik, { type: "EQUAL", among: ALL_GOA }, D("2026-10-17"));
addExpense(goa, "Scooter rental",       "Travel",     2400, meera,
           { type: "EXACT", shares: [[karthik, 600], [meera, 600], [rohan, 1200]] }, D("2026-10-17"));
addExpense(goa, "Dinner at beach shack","Food",       3260, rohan,   { type: "EQUAL", among: ALL_GOA }, D("2026-10-18"));
addExpense(goa, "Water sports",         "Entertainment", 6000, aarav,
           { type: "EXACT", shares: [[aarav, 2000], [karthik, 2000], [meera, 2000]] }, D("2026-10-19"));

// Some payments already made
db.settlements.insertMany([
  { groupId: flat, paidBy: sneha, paidTo: aarav,   amount: 5000, method: "UPI",
    note: "Part of rent", settledAt: D("2026-10-16") },
  { groupId: goa,  paidBy: rohan, paidTo: karthik, amount: 2000, method: "Cash",
    note: "Hotel share (partial)", settledAt: D("2026-10-20") }
]);

["users", "groups", "expenses", "settlements"].forEach((c) =>
  print("  " + c.padEnd(12) + ": " + db[c].countDocuments() + " documents"));

// ---- Validation demo: an invalid document is rejected by the database
try {
  db.expenses.insertOne({ groupId: flat, description: "Bad", amount: -50,
    paidBy: aarav, splitType: "HALF", participants: [], expenseDate: new Date(), createdAt: new Date() });
} catch (e) {
  print("  Validation check: invalid expense rejected -> " + (e.codeName || e.message));
}
try { addUser("Duplicate", "aarav@example.com"); }
catch (e) { print("  Unique index check: duplicate email rejected -> " + (e.codeName || "E11000")); }

/* ====================================================================
 * 5. QUERY 1 — All expenses and total spending for a selected group
 * ================================================================== */
function groupExpenseReport(groupId) {
  return db.expenses.aggregate([
    { $match: { groupId: groupId } },
    { $lookup: { from: "users", localField: "paidBy", foreignField: "_id", as: "payer" } },
    { $set: { paidByName: { $arrayElemAt: ["$payer.name", 0] },
              splitAmong: { $size: "$participants" } } },
    { $sort: { expenseDate: 1 } },
    { $facet: {
        expenses: [
          { $project: { _id: 0, date: "$expenseDate", description: 1, category: 1,
                        amount: 1, paidByName: 1, splitType: 1, splitAmong: 1 } }
        ],
        total: [
          { $group: { _id: null, totalSpending: { $sum: "$amount" },
                      expenseCount: { $sum: 1 }, avgExpense: { $avg: "$amount" } } },
          { $project: { _id: 0, totalSpending: { $round: ["$totalSpending", 2] },
                        expenseCount: 1, avgExpense: { $round: ["$avgExpense", 2] } } }
        ],
        byCategory: [
          { $group: { _id: "$category", spent: { $sum: "$amount" }, count: { $sum: 1 } } },
          { $sort: { spent: -1 } },
          { $project: { _id: 0, category: "$_id", spent: 1, count: 1 } }
        ]
    } }
  ]).toArray()[0];
}

heading("QUERY 1: All expenses & total spending — group 'Flat 302 - Koramangala'");
const q1 = groupExpenseReport(flat);
table(q1.expenses, ["date", "description", "category", "amount", "paidByName", "splitType", "splitAmong"]);
print("");
print(`  TOTAL SPENDING: Rs ${q1.total[0].totalSpending.toFixed(2)}  ` +
      `(${q1.total[0].expenseCount} expenses, average Rs ${q1.total[0].avgExpense.toFixed(2)})`);
print("\n  Spending by category:");
table(q1.byCategory, ["category", "count", "spent"]);

/* ====================================================================
 * 6. QUERY 2 — How much each member owes or is owed (net balance)
 *
 *   net = (paid for expenses) − (own share of expenses)
 *       + (settlements paid)  − (settlements received)
 *   net > 0  → the group owes this member
 *   net < 0  → this member owes the group
 * ================================================================== */
function getGroupBalances(groupId) {
  return db.expenses.aggregate([
    { $match: { groupId: groupId } },
    // one "ledger entry" per payer and per participant
    { $project: { _id: 0, entries: { $concatArrays: [
        [ { userId: "$paidBy", paid: "$amount", share: 0, sent: 0, received: 0 } ],
        { $map: { input: "$participants", as: "p",
                  in: { userId: "$$p.userId", paid: 0, share: "$$p.share", sent: 0, received: 0 } } }
    ] } } },
    { $unwind: "$entries" },
    { $replaceWith: "$entries" },
    // add ledger entries from settlement payments
    { $unionWith: { coll: "settlements", pipeline: [
        { $match: { groupId: groupId } },
        { $project: { _id: 0, entries: [
            { userId: "$paidBy", paid: 0, share: 0, sent: "$amount", received: 0 },
            { userId: "$paidTo", paid: 0, share: 0, sent: 0, received: "$amount" } ] } },
        { $unwind: "$entries" },
        { $replaceWith: "$entries" }
    ] } },
    { $group: { _id: "$userId",
                totalPaid: { $sum: "$paid" }, totalShare: { $sum: "$share" },
                settledOut: { $sum: "$sent" }, settledIn: { $sum: "$received" } } },
    { $set: { net: { $round: [ { $subtract: [
                { $add: ["$totalPaid", "$settledOut"] },
                { $add: ["$totalShare", "$settledIn"] } ] }, 2 ] } } },
    // make sure members with no activity still appear
    { $unionWith: { coll: "groups", pipeline: [
        { $match: { _id: groupId } }, { $unwind: "$members" },
        { $project: { _id: "$members.userId", totalPaid: { $literal: 0 }, totalShare: { $literal: 0 },
                      settledOut: { $literal: 0 }, settledIn: { $literal: 0 }, net: { $literal: 0 } } } ] } },
    { $group: { _id: "$_id", totalPaid: { $sum: "$totalPaid" }, totalShare: { $sum: "$totalShare" },
                settledOut: { $sum: "$settledOut" }, settledIn: { $sum: "$settledIn" }, net: { $sum: "$net" } } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
    { $project: { _id: 0, userId: "$_id", name: { $arrayElemAt: ["$u.name", 0] },
                  totalPaid: { $round: ["$totalPaid", 2] }, totalShare: { $round: ["$totalShare", 2] },
                  settledOut: 1, settledIn: 1, net: 1,
                  status: { $switch: { branches: [
                      { case: { $gt: ["$net",  0.009] }, then: "gets back" },
                      { case: { $lt: ["$net", -0.009] }, then: "owes" } ],
                    default: "settled up" } } } },
    { $sort: { net: -1 } }
  ]).toArray();
}

function showBalances(groupId, label) {
  const b = getGroupBalances(groupId);
  heading("QUERY 2: Member balances — " + label);
  table(b.map((x) => ({ ...x, "amount": Math.abs(x.net) })),
        ["name", "totalPaid", "totalShare", "settledOut", "settledIn", "net", "status", "amount"]);
  print("  Check: sum of all net balances = " + r2(b.reduce((s, x) => s + x.net, 0)).toFixed(2) +
        " (must be 0.00)");
  return b;
}

showBalances(flat, "Flat 302 - Koramangala");
showBalances(goa,  "Goa Trip 2026");

/* ====================================================================
 * 7. QUERY 3 — Expense history and contributions of a particular user
 * ================================================================== */
function userHistory(userId) {
  return db.expenses.aggregate([
    { $match: { $or: [ { paidBy: userId }, { "participants.userId": userId } ] } },
    { $set: {
        myShare: { $sum: { $map: {
          input: { $filter: { input: "$participants", as: "p", cond: { $eq: ["$$p.userId", userId] } } },
          as: "p", in: "$$p.share" } } },
        iPaid: { $cond: [ { $eq: ["$paidBy", userId] }, "$amount", 0 ] } } },
    { $set: { netEffect: { $round: [ { $subtract: ["$iPaid", "$myShare"] }, 2 ] } } },
    { $lookup: { from: "groups", localField: "groupId", foreignField: "_id", as: "g" } },
    { $lookup: { from: "users",  localField: "paidBy",  foreignField: "_id", as: "payer" } },
    { $set: { group: { $arrayElemAt: ["$g.name", 0] }, paidByName: { $arrayElemAt: ["$payer.name", 0] } } },
    { $sort: { expenseDate: 1 } },
    { $facet: {
        history: [
          { $project: { _id: 0, date: "$expenseDate", group: 1, description: 1, amount: 1,
                        paidByName: 1, iPaid: 1, myShare: 1, netEffect: 1 } } ],
        perGroup: [
          { $group: { _id: "$group", expenses: { $sum: 1 }, totalPaid: { $sum: "$iPaid" },
                      totalShare: { $sum: "$myShare" } } },
          { $project: { _id: 0, group: "$_id", expenses: 1, totalPaid: { $round: ["$totalPaid", 2] },
                        totalShare: { $round: ["$totalShare", 2] } } },
          { $sort: { group: 1 } } ],
        overall: [
          { $group: { _id: null, expensesInvolved: { $sum: 1 },
                      expensesPaidFor: { $sum: { $cond: [ { $gt: ["$iPaid", 0] }, 1, 0 ] } },
                      totalPaid: { $sum: "$iPaid" }, totalShare: { $sum: "$myShare" } } },
          { $project: { _id: 0, expensesInvolved: 1, expensesPaidFor: 1,
                        totalPaid: { $round: ["$totalPaid", 2] }, totalShare: { $round: ["$totalShare", 2] } } } ]
    } }
  ]).toArray()[0];
}

function userSettlements(userId) {
  return db.settlements.aggregate([
    { $match: { $or: [ { paidBy: userId }, { paidTo: userId } ] } },
    { $lookup: { from: "users", localField: "paidBy", foreignField: "_id", as: "f" } },
    { $lookup: { from: "users", localField: "paidTo", foreignField: "_id", as: "t" } },
    { $lookup: { from: "groups", localField: "groupId", foreignField: "_id", as: "g" } },
    { $sort: { settledAt: 1 } },
    { $project: { _id: 0, date: "$settledAt", group: { $arrayElemAt: ["$g.name", 0] },
                  from: { $arrayElemAt: ["$f.name", 0] }, to: { $arrayElemAt: ["$t.name", 0] },
                  amount: 1, method: 1,
                  direction: { $cond: [ { $eq: ["$paidBy", userId] }, "paid", "received" ] } } }
  ]).toArray();
}

heading("QUERY 3: Expense history & contributions — Aarav Sharma");
const q3 = userHistory(aarav);
table(q3.history, ["date", "group", "description", "amount", "paidByName", "iPaid", "myShare", "netEffect"]);
print("\n  Contribution per group:");
table(q3.perGroup, ["group", "expenses", "totalPaid", "totalShare"]);
const o = q3.overall[0];
print(`\n  Overall: involved in ${o.expensesInvolved} expenses, paid for ${o.expensesPaidFor}; ` +
      `paid Rs ${o.totalPaid.toFixed(2)}, own share Rs ${o.totalShare.toFixed(2)}`);
print("\n  Settlement payments involving Aarav:");
table(userSettlements(aarav), ["date", "group", "from", "to", "amount", "method", "direction"]);

/* ====================================================================
 * 8. QUERY 4 — Unsettled balances & recording settlement payments
 * ================================================================== */

/** All non-zero balances across every group. */
function unsettledBalances() {
  const out = [];
  db.groups.find({}, { name: 1 }).forEach((g) =>
    getGroupBalances(g._id).filter((b) => Math.abs(b.net) > 0.009)
      .forEach((b) => out.push({ group: g.name, name: b.name, net: b.net, status: b.status })));
  return out;
}

/**
 * Turn net balances into the minimum list of "X pays Y" transfers
 * (greedy: largest debtor pays largest creditor).
 */
function suggestSettlements(groupId) {
  const bal = getGroupBalances(groupId);
  const debtors   = bal.filter((b) => b.net < -0.009).map((b) => ({ ...b, left: -b.net }))
                       .sort((a, b) => b.left - a.left);
  const creditors = bal.filter((b) => b.net >  0.009).map((b) => ({ ...b, left: b.net }))
                       .sort((a, b) => b.left - a.left);
  const plan = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = r2(Math.min(debtors[i].left, creditors[j].left));
    plan.push({ from: debtors[i].name, fromId: debtors[i].userId,
                to: creditors[j].name, toId: creditors[j].userId, amount: amt });
    debtors[i].left = r2(debtors[i].left - amt);
    creditors[j].left = r2(creditors[j].left - amt);
    if (debtors[i].left < 0.01) i++;
    if (creditors[j].left < 0.01) j++;
  }
  return plan;
}

/** Record a payment from a debtor to a creditor, with business-rule checks. */
function recordSettlement(groupId, fromId, toId, amount, method, note) {
  if (fromId.equals(toId)) throw new Error("Cannot pay yourself");
  if (!isMember(groupId, fromId) || !isMember(groupId, toId))
    throw new Error("Both users must be members of the group");
  const bal = Object.fromEntries(getGroupBalances(groupId).map((b) => [b.userId.toString(), b.net]));
  const owes = -bal[fromId.toString()], isOwed = bal[toId.toString()];
  if (!(owes > 0.009) || !(isOwed > 0.009))
    throw new Error("Payer must owe money and receiver must be owed money");
  if (amount > r2(Math.min(owes, isOwed)) + 0.001)
    throw new Error(`Amount exceeds outstanding balance (max ${r2(Math.min(owes, isOwed))})`);
  return db.settlements.insertOne({ groupId, paidBy: fromId, paidTo: toId,
    amount: r2(amount), method: method || "UPI", note: note || "", settledAt: new Date() }).insertedId;
}

heading("QUERY 4a: Unsettled balances across all groups");
table(unsettledBalances(), ["group", "name", "net", "status"]);

heading("QUERY 4b: Suggested payments to settle 'Goa Trip 2026'");
const plan = suggestSettlements(goa);
table(plan, ["from", "to", "amount"]);

heading("QUERY 4c: Recording the suggested settlement payments for 'Goa Trip 2026'");
plan.forEach((p) => {
  recordSettlement(goa, p.fromId, p.toId, p.amount, "UPI", "Trip settle-up");
  print(`  Recorded: ${p.from} paid Rs ${p.amount.toFixed(2)} to ${p.to}`);
});
try {
  recordSettlement(goa, rohan, karthik, 100, "UPI");
} catch (e) { print("  Rule check: extra payment rejected -> " + e.message); }

showBalances(goa, "Goa Trip 2026 (after settlement)");

heading("QUERY 4d: Settlement history — Goa Trip 2026");
table(db.settlements.aggregate([
  { $match: { groupId: goa } },
  { $lookup: { from: "users", localField: "paidBy", foreignField: "_id", as: "f" } },
  { $lookup: { from: "users", localField: "paidTo", foreignField: "_id", as: "t" } },
  { $sort: { settledAt: 1 } },
  { $project: { _id: 0, date: "$settledAt", from: { $arrayElemAt: ["$f.name", 0] },
                to: { $arrayElemAt: ["$t.name", 0] }, amount: 1, method: 1, note: 1 } }
]).toArray(), ["date", "from", "to", "amount", "method", "note"]);

heading("Remaining unsettled balances (all groups)");
table(unsettledBalances(), ["group", "name", "net", "status"]);

print("\nDone. Database '" + DB_NAME + "' is ready.\n");
