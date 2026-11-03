"use client";

export default function Error({ error, reset }) {
  const dbDown = /ECONNREFUSED|Server selection|connect/i.test(error?.message || "");
  return (
    <div className="callout">
      <h1>{dbDown ? "Can’t connect to MongoDB" : "Something went wrong"}</h1>
      <p>The most common cause is that MongoDB is not running. Start it in Terminal:</p>
      <pre>brew services start mongodb-community</pre>
      <p>If the database is empty, load the sample data with <code>npm run seed</code>.</p>
      {!dbDown && error?.message && <p className="muted small">Details: {error.message}</p>}
      <button className="btn" onClick={() => reset()}>Try again</button>
    </div>
  );
}
