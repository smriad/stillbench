import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as unknown as { stillbenchMongo?: Promise<Db> };

export function mongoEnabled() {
  return Boolean(process.env.MONGODB_URI);
}

export function mongo(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");
  globalForMongo.stillbenchMongo ??= new MongoClient(uri, {
    appName: "stillbench",
    serverSelectionTimeoutMS: 8_000,
  })
    .connect()
    .then((client) => client.db(process.env.MONGODB_DB ?? "stillbench"));
  return globalForMongo.stillbenchMongo;
}
