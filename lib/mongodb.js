import { MongoClient, ObjectId } from "mongodb";

// 127.0.0.1 (not "localhost") so Node never tries IPv6 ::1, which mongod
// does not listen on by default on a Mac.
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "expense_splitter";

// Re-use one connection across requests (and across hot reloads in dev).
function connect() {
  const p = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 }).connect();
  p.catch(() => { globalThis._mongoClientPromise = undefined; }); // retry next time
  return p;
}

export async function getDb() {
  if (!globalThis._mongoClientPromise) globalThis._mongoClientPromise = connect();
  const client = await globalThis._mongoClientPromise;
  return client.db(dbName);
}

/** Turn a URL/form string into an ObjectId, or null if it is not a valid id. */
export function oid(id) {
  return ObjectId.isValid(id) && String(id).length === 24 ? new ObjectId(String(id)) : null;
}
