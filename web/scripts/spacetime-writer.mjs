#!/usr/bin/env node
// Mints the Next server's own SpacetimeDB identity and allowlists it as a writer.
//
//   node scripts/spacetime-writer.mjs --server local|maincloud [--db geoswarm] [--out <file>]
//
// 1. POST {host}/v1/identity → { identity, token } (a token signed by that host).
// 2. `spacetime call <db> add_writer "<identity>"` as YOU (the database owner, who `init` seeded
//    as the first writer).
// 3. Writes { identity, token } to --out (default ~/.config/geoswarm/spacetime-<server>-<db>.json,
//    mode 600). Put the token in SPACETIME_TOKEN; never commit it.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const server = arg("server", "local");
const db = arg("db", process.env.SPACETIME_DB || "geoswarm");
const host = arg("host", server === "local" ? "http://127.0.0.1:3000" : server === "maincloud" ? "https://maincloud.spacetimedb.com" : server);
const out = arg("out", join(homedir(), ".config", "geoswarm", `spacetime-${server.replace(/[^a-z0-9]+/gi, "_")}-${db}.json`));
const bin = process.env.SPACETIME_BIN || "spacetime";

const res = await fetch(`${host}/v1/identity`, { method: "POST" });
if (!res.ok) throw new Error(`POST /v1/identity → ${res.status} ${await res.text()}`);
const { identity, token } = await res.json();

execFileSync(bin, ["call", "--server", server, db, "add_writer", JSON.stringify(identity)], { stdio: "inherit" });

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ server, host, db, identity, token }, null, 2), { mode: 0o600 });
console.log(`writer ${identity} allowlisted on ${server}/${db}; token saved to ${out}`);
