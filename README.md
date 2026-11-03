# SplitEase — Expense Splitter (Next.js + MongoDB)

Website for the **Personal Expense Splitting App** DBMS project. It reads and writes the
same MongoDB database (`expense_splitter`) that `expense_splitter.js` creates.

## Run it (Mac)

```bash
brew install node                        # once: installs Node.js and npm
brew services start mongodb-community    # start the database
cd ~/Desktop/dbms-project/expense-app
npm install                              # once: downloads Next.js etc.
npm run seed                             # loads the sample data (resets the database)
npm run dev                              # start the website
```

Open **http://localhost:3000**. Stop the website with **Control + C**.

## Pages

| Page | What it shows | Project query |
| --- | --- | --- |
| Dashboard `/` | Totals, all groups, unsettled balances, create a group | Query 1, Query 4a |
| Group `/groups/[id]` | Expenses and total, spending by category, balances, settle-up suggestions, record a payment, payment history, add an expense (equal or custom split), add a member | Queries 1, 2, 4 |
| People `/users` | Everyone, add a person | — |
| Person `/users/[id]` | Expense history, contribution per group, payments | Query 3 |

## Code map

| File | Purpose |
| --- | --- |
| `lib/mongodb.js` | One shared connection to MongoDB (`mongodb://127.0.0.1:27017`) |
| `lib/queries.js` | The read queries — the same aggregation pipelines as `expense_splitter.js` |
| `app/actions.js` | Server Actions for every write, with the same business rules |
| `components/Forms.jsx` | Interactive forms (live split preview, error messages) |
| `app/**/page.js` | The pages |

To use another database (e.g. MongoDB Atlas), create `.env.local` with
`MONGODB_URI=...` and optionally `MONGODB_DB=...`.
