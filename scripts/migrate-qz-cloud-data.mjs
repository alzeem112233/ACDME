import { createClient } from "@supabase/supabase-js";

const requiredEnvironment = [
  "QZ_SOURCE_SUPABASE_URL",
  "QZ_SOURCE_SERVICE_KEY",
  "QZ_TARGET_SUPABASE_URL",
  "QZ_TARGET_SERVICE_KEY",
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const source = createClient(process.env.QZ_SOURCE_SUPABASE_URL, process.env.QZ_SOURCE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const target = createClient(process.env.QZ_TARGET_SUPABASE_URL, process.env.QZ_TARGET_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = 500;

async function readAll(client, table, columns = "*") {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function upsertBatches(table, rows, onConflict) {
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const { error } = await target.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table} write failed: ${error.message}`);
  }
}

function pick(row, columns) {
  return Object.fromEntries(columns.filter((column) => column in row).map((column) => [column, row[column]]));
}

function phoneKey(row = {}) {
  const value = String(row.phone_e164 || row.phone || row.contact || "")
    .replace(/[^0-9+]/g, "")
    .replace(/^00/, "+");
  if (value.startsWith("+")) return value;
  if (value.startsWith("967")) return `+${value}`;
  if (value.startsWith("0")) return `+967${value.slice(1)}`;
  if (value.startsWith("7")) return `+967${value}`;
  return value;
}

function academyNameKey(row = {}) {
  return String(row.academy_name || "").trim().toLocaleLowerCase("ar");
}

const accountColumns = [
  "id", "name", "phone", "phone_e164", "role", "role_key", "auth_provider",
  "legacy_auth_migrated_at", "auth_migration_note", "academy_id", "academy_name",
  "permissions", "permissions_json", "password_hash", "password_status",
  "password_updated_at", "status", "created_at", "updated_at",
];
const requestColumns = [
  "id", "academy_name", "owner_name", "contact", "phone", "phone_e164", "academy_id",
  "city", "status", "role_key", "auth_provider", "legacy_auth_migrated_at",
  "auth_migration_note", "password_hash", "reviewed_by", "reviewed_at", "created_at",
];
const matchColumns = [
  "id", "academy_id", "academy_name", "captain_name", "venue", "location_url",
  "category_ids", "category_names", "match_date", "start_time", "end_time", "status",
  "accepted_by_academy_id", "accepted_by_academy_name", "accepted_by_captain_name",
  "accepted_at", "score_a", "score_b", "result_note", "result_recorded_by_academy_id",
  "result_recorded_by_academy_name", "result_recorded_at", "created_at", "updated_at",
];
const resetColumns = [
  "id", "phone_e164", "academy_id", "status", "delivery_channel", "note",
  "handled_at", "created_at", "updated_at",
];

const sourceAccounts = (await readAll(source, "platform_accounts")).map((row) => pick(row, accountColumns));
await upsertBatches("platform_accounts", sourceAccounts, "phone");

const sourceCloudRows = await readAll(source, "academy_cloud_data", "academy_id,payload,created_at,updated_at");
await upsertBatches("academy_cloud_data", sourceCloudRows, "academy_id");

const targetRequests = await readAll(target, "registration_requests", "id,phone,phone_e164,contact,academy_id,academy_name,status");
const targetRequestByPhone = new Map(targetRequests.map((row) => [phoneKey(row), row]));
const targetRequestByAcademy = new Map(targetRequests.map((row) => [academyNameKey(row), row]));
const latestSourceRequestByPhone = new Map();
for (const row of await readAll(source, "registration_requests")) {
  const key = phoneKey(row) || `id:${row.id}`;
  const current = latestSourceRequestByPhone.get(key);
  if (!current || String(row.created_at || "") > String(current.created_at || "")) {
    latestSourceRequestByPhone.set(key, row);
  }
}
const sourceRequests = [...latestSourceRequestByPhone.values()].map((row) => {
  const payload = pick(row, requestColumns);
  const existing = targetRequestByPhone.get(phoneKey(payload))
    || (payload.status !== "rejected" ? targetRequestByAcademy.get(academyNameKey(payload)) : null);
  return existing ? { ...payload, id: existing.id } : payload;
});
await upsertBatches("registration_requests", sourceRequests, "id");

const sourceMatches = (await readAll(source, "public_match_requests")).map((row) => pick(row, matchColumns));
await upsertBatches("public_match_requests", sourceMatches, "id");

const sourceResetRequests = (await readAll(source, "password_reset_requests")).map((row) => pick(row, resetColumns));
await upsertBatches("password_reset_requests", sourceResetRequests, "id");

const verification = {
  platformAccounts: (await readAll(target, "platform_accounts", "id")).length,
  registrationRequests: (await readAll(target, "registration_requests", "id")).length,
  academyCloudData: (await readAll(target, "academy_cloud_data", "academy_id")).length,
  publicMatchRequests: (await readAll(target, "public_match_requests", "id")).length,
  passwordResetRequests: (await readAll(target, "password_reset_requests", "id")).length,
};

console.log(JSON.stringify({ migrated: true, verification }));
