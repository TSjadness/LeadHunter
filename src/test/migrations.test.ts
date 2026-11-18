// @vitest-environment node
// Applies every Supabase migration to a clean in-memory Postgres (PGlite) and checks
// idempotency, integrity rules, status history and per-user isolation (RLS).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const dir = path.resolve(__dirname, "../../supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Minimal stand-in for what Supabase provides before user migrations run.
const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    user
      ? `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${user}"}', false);`
      : "set role anon;",
  );
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
  }
}

const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of files) await db.exec(readFileSync(path.join(dir, f), "utf8"));
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@test'), ('${B}', 'b@test');`,
  );
}, 60000);

describe("supabase migrations", () => {
  it("are idempotent (re-applying every file succeeds)", async () => {
    for (const f of files) await db.exec(readFileSync(path.join(dir, f), "utf8"));
    const pol = await rows<{ n: number }>(
      "select count(*)::int as n from pg_policies where tablename = 'interactions'",
    );
    expect(pol[0]!.n).toBe(4); // legacy permissive policy was not re-added
  });

  it("records status history and status_changed_at", async () => {
    const id = await as(A, async () => {
      const [lead] = await rows<{ id: string }>(
        "insert into leads (name) values ('Padaria Sol') returning id",
      );
      await db.query("update leads set status = 'contato' where id = $1", [lead!.id]);
      await db.query("update leads set status = 'ganho' where id = $1", [lead!.id]);
      return lead!.id;
    });
    const ev = await as(A, () =>
      rows<{ from_status: string | null; to_status: string }>(
        "select from_status, to_status from lead_status_events where lead_id = $1 order by id",
        [id],
      ),
    );
    expect(ev.map((e) => `${e.from_status}>${e.to_status}`)).toEqual([
      "null>novo",
      "novo>contato",
      "contato>ganho",
    ]);
    const dash = await as(A, () =>
      rows<{ d: { total: number; weekly: { won: number }[] } }>("select lead_dashboard(4) as d"),
    );
    expect(dash[0]!.d.total).toBe(1);
    expect(dash[0]!.d.weekly).toHaveLength(4);
    expect(dash[0]!.d.weekly.at(-1)!.won).toBe(1);
  });

  it("users never see or write history directly", async () => {
    await expect(
      as(A, () =>
        db.query(
          `insert into lead_status_events (user_id, lead_id, to_status) select '${A}', id, 'ganho' from leads limit 1`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects invalid status and CNPJ on new rows", async () => {
    await expect(
      as(A, () => db.query("insert into leads (name, status) values ('X', 'prospect')")),
    ).rejects.toThrow(/leads_status_check/);
    await expect(
      as(A, () => db.query("insert into leads (name, cnpj) values ('X', '123')")),
    ).rejects.toThrow(/leads_cnpj_check/);
  });

  it("isolates users: B cannot read, update or reference A's data", async () => {
    const [aLead] = await as(A, () => rows<{ id: string }>("select id from leads limit 1"));
    expect(await as(B, () => rows("select * from leads"))).toHaveLength(0);
    await as(B, () => db.query("update leads set name = 'hacked' where id = $1", [aLead!.id]));
    expect(
      (
        await as(A, () =>
          rows<{ name: string }>("select name from leads where id = $1", [aLead!.id]),
        )
      )[0]!.name,
    ).toBe("Padaria Sol");

    // Interaction pointing at someone else's lead is refused.
    await expect(
      as(B, () =>
        db.query("insert into interactions (lead_id, content) values ($1, 'oi')", [aLead!.id]),
      ),
    ).rejects.toThrow(/row-level security/);

    // Own collection + foreign lead is refused.
    const [bCol] = await as(B, () =>
      rows<{ id: string }>("insert into collections (name) values ('Minha') returning id"),
    );
    await expect(
      as(B, () =>
        db.query("insert into collection_leads (collection_id, lead_id) values ($1, $2)", [
          bCol!.id,
          aLead!.id,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);

    // Spoofing user_id is refused.
    await expect(
      as(B, () => db.query(`insert into leads (user_id, name) values ('${A}', 'spoof')`)),
    ).rejects.toThrow(/row-level security/);

    // Anonymous role sees nothing.
    await expect(as(null, () => db.query("select * from leads"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("owner can link own lead to own collection and log interactions", async () => {
    await as(A, async () => {
      const [lead] = await rows<{ id: string }>("select id from leads limit 1");
      const [col] = await rows<{ id: string }>(
        "insert into collections (name) values ('Clientes') returning id",
      );
      await db.query("insert into collection_leads (collection_id, lead_id) values ($1, $2)", [
        col!.id,
        lead!.id,
      ]);
      await db.query(
        "insert into interactions (lead_id, kind, content) values ($1, 'ligação', 'retornar')",
        [lead!.id],
      );
    });
    const counts = await as(A, () =>
      rows<{ n: number }>("select count(*)::int as n from collection_leads"),
    );
    expect(counts[0]!.n).toBe(1);
  });

  it("rate limit is enforced per user and the table is not readable", async () => {
    const results = await as(A, async () => {
      const out: boolean[] = [];
      for (let i = 0; i < 4; i++)
        out.push(
          (await rows<{ ok: boolean }>("select consume_rate_limit('search', 3, 60) as ok"))[0]!.ok,
        );
      return out;
    });
    expect(results).toEqual([true, true, true, false]);
    expect(
      (
        await as(B, () => rows<{ ok: boolean }>("select consume_rate_limit('search', 3, 60) as ok"))
      )[0]!.ok,
    ).toBe(true);
    await expect(as(A, () => db.query("select * from rate_limit_hits"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as(A, () => db.query("select consume_rate_limit('anything', 3, 60)")),
    ).rejects.toThrow(/invalid rate limit/);
  });

  it("provider slots pace calls globally", async () => {
    const waits = await as(A, async () => [
      (await rows<{ w: number }>("select acquire_provider_slot('nominatim', 1000) as w"))[0]!.w,
      (await rows<{ w: number }>("select acquire_provider_slot('nominatim', 1000) as w"))[0]!.w,
    ]);
    expect(waits[0]).toBe(0);
    expect(waits[1]).toBeGreaterThan(800);
  });

  it("priority defaults to média (2), accepts 1–3 and stays private", async () => {
    const id = await as(A, async () => {
      const [lead] = await rows<{ id: string; priority: number }>(
        "insert into leads (name) values ('Clínica Prioridade') returning id, priority",
      );
      expect(lead!.priority).toBe(2);
      await rows("update leads set priority = 3 where id = $1", [lead!.id]);
      await expect(rows("update leads set priority = 4 where id = $1", [lead!.id])).rejects.toThrow(
        /leads_priority_check/,
      );
      await expect(rows("update leads set priority = 0 where id = $1", [lead!.id])).rejects.toThrow(
        /leads_priority_check/,
      );
      return lead!.id;
    });
    const mine = await as(A, () =>
      rows<{ priority: number }>("select priority from leads where id = $1", [id]),
    );
    expect(mine[0]!.priority).toBe(3);
    // B can neither see nor change A's priority.
    const seen = await as(B, () => rows("select priority from leads where id = $1", [id]));
    expect(seen).toHaveLength(0);
    await as(B, () => rows("update leads set priority = 1 where id = $1", [id]));
    const still = await rows<{ priority: number }>("select priority from leads where id = $1", [
      id,
    ]);
    expect(still[0]!.priority).toBe(3);
  });

  it("user_settings are private per user", async () => {
    await as(A, () => db.query("insert into user_settings (default_uf) values ('SP')"));
    expect(await as(B, () => rows("select * from user_settings"))).toHaveLength(0);
  });
});

describe("v2 migration on a legacy (pre-v2) database", () => {
  it("keeps every legacy row, even ones that break the new rules", async () => {
    const legacy = new PGlite();
    await legacy.exec(SUPABASE_STUB);
    await legacy.exec(readFileSync(path.join(dir, files[0]!), "utf8")); // base schema only
    await legacy.exec(`
      insert into auth.users (id) values ('${A}');
      insert into leads (user_id, name, status, cnpj, updated_at) values
        ('${A}', 'Antigo 1', 'prospect', '11222333000181', now() - interval '20 days'),
        ('${A}', 'Antigo 2', 'ganho',    '11222333000181', now() - interval '3 days');
    `);
    const before = (
      await legacy.query<{ updated_at: string }>("select updated_at from leads order by name")
    ).rows;
    for (const f of files.slice(1)) await legacy.exec(readFileSync(path.join(dir, f), "utf8"));
    const after = await legacy.query<{
      name: string;
      status: string;
      updated_at: string;
      status_changed_at: string;
    }>("select name, status, updated_at, status_changed_at from leads order by name");
    expect(after.rows.map((r) => r.status)).toEqual(["prospect", "ganho"]);
    expect(after.rows.map((r) => String(r.updated_at))).toEqual(
      before.map((r) => String(r.updated_at)),
    );
    expect(after.rows.every((r) => r.status_changed_at)).toBe(true);
    const ev = await legacy.query<{ n: number }>(
      "select count(*)::int as n from lead_status_events where backfilled",
    );
    expect(ev.rows[0]!.n).toBe(2);
    const idx = await legacy.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename = 'leads'",
    );
    expect(idx.rows.map((r) => r.indexname)).toContain("leads_user_cnpj"); // non-unique fallback
    await legacy.close();
  }, 60000);
});

describe("rollback script", () => {
  it("reverts lead priority and it can be re-applied", async () => {
    const d = new PGlite();
    await d.exec(SUPABASE_STUB);
    for (const f of files) await d.exec(readFileSync(path.join(dir, f), "utf8"));
    await d.exec(
      `insert into auth.users (id, email) values ('${A}', 'a@test');
       insert into leads (name, user_id) values ('Legado', '${A}');`,
    );
    await d.exec(
      readFileSync(path.resolve(dir, "../rollback/20261118000100_lead_priority.down.sql"), "utf8"),
    );
    const col = await d.query<{ n: number }>(
      "select count(*)::int as n from information_schema.columns where table_name = 'leads' and column_name = 'priority'",
    );
    expect(col.rows[0]!.n).toBe(0);
    await d.exec(readFileSync(path.join(dir, "20261118000100_lead_priority.sql"), "utf8"));
    const r = await d.query<{ priority: number }>("select priority from leads");
    expect(r.rows.every((x) => x.priority === 2)).toBe(true); // existing rows become média
    await d.close();
  }, 60000);

  it("reverts v2 cleanly and v2 can be re-applied afterwards", async () => {
    const d = new PGlite();
    await d.exec(SUPABASE_STUB);
    for (const f of files) await d.exec(readFileSync(path.join(dir, f), "utf8"));
    await d.exec(
      readFileSync(path.resolve(dir, "../rollback/20261117000200_v2_hardening.down.sql"), "utf8"),
    );
    const t = await d.query<{ n: number }>(
      "select count(*)::int as n from pg_tables where tablename = 'lead_status_events'",
    );
    expect(t.rows[0]!.n).toBe(0);
    for (const f of files.slice(1)) await d.exec(readFileSync(path.join(dir, f), "utf8"));
    const p = await d.query<{ n: number }>(
      "select count(*)::int as n from pg_policies where tablename = 'interactions'",
    );
    expect(p.rows[0]!.n).toBe(4);
    await d.close();
  }, 60000);
});
