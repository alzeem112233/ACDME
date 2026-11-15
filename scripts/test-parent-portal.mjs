import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.QZ_TARGET_SUPABASE_URL;
const anonKey = process.env.QZ_TARGET_ANON_KEY;
const serviceKey = process.env.QZ_TARGET_SERVICE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Missing target Supabase test configuration");

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = Date.now().toString().slice(-8);
const academyId = `parent-test-${suffix}`;
const ownerId = `parent-test-owner-${suffix}`;
const parentId = `parent-test-user-${suffix}`;
const playerId = `parent-test-player-${suffix}`;
const ownerPhone = `+96771${suffix}`;
const parentPhone = `+96772${suffix}`;
const ownerPassword = "654321";
const parentPassword = "123456";

function passwordHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function qzAuth(body, sessionToken = "") {
  const response = await fetch(`${url}/functions/v1/qz-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      ...(sessionToken ? { "x-qz-session": sessionToken } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message || `qz-auth HTTP ${response.status}`);
  return data;
}

async function removeTestRows() {
  await service.from("parent_player_links").delete().eq("academy_id", academyId);
  await service.from("parent_player_snapshots").delete().eq("academy_id", academyId);
  await service.from("qz_app_sessions").delete().eq("academy_id", academyId);
  await service.from("platform_accounts").delete().in("id", [ownerId, parentId]);
}

try {
  const { error: ownerError } = await service.from("platform_accounts").insert({
    id: ownerId,
    name: "اختبار إدارة الأكاديمية",
    phone: ownerPhone,
    phone_e164: ownerPhone,
    role: "مالك أكاديمية",
    role_key: "academy_owner",
    academy_id: academyId,
    academy_name: "أكاديمية اختبار ولي الأمر",
    permissions: "إدارة كاملة",
    permissions_json: { academy: true, accounts: true, players: true, finance: true, reports: true },
    auth_provider: "qz_auth",
    password_hash: passwordHash(ownerPassword),
    password_status: "مشفرة",
    status: "نشط",
  });
  if (ownerError) throw ownerError;

  const ownerLogin = await qzAuth({ action: "login", phone: ownerPhone, password: ownerPassword });
  const ownerToken = ownerLogin.account?.accessToken;
  if (!ownerToken) throw new Error("Owner login did not return a QZ session");

  const createdParent = await qzAuth({
    action: "create-platform-account",
    id: parentId,
    name: "ولي أمر تجريبي",
    accountPhone: parentPhone,
    password: parentPassword,
    roleKey: "parent",
    academyId,
    academyName: "أكاديمية اختبار ولي الأمر",
    permissions: "متابعة الأبناء",
    permissionsJson: { parent: true, children: true, readOnly: true },
  }, ownerToken);
  if (createdParent.account?.role_key !== "parent") throw new Error("Parent role was not created correctly");

  const ownerClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-qz-session": ownerToken } },
  });
  const { error: linkError } = await ownerClient.from("parent_player_links").insert({
    id: randomUUID(),
    academy_id: academyId,
    parent_account_id: parentId,
    parent_phone_e164: parentPhone,
    player_id: playerId,
    relation: "الأب",
  });
  if (linkError) throw linkError;

  const { error: snapshotError } = await ownerClient.from("parent_player_snapshots").insert({
    id: randomUUID(),
    academy_id: academyId,
    player_id: playerId,
    payload: { player: { name: "لاعب تجريبي" }, attendance: { present: 3, absent: 1 }, finance: { totalPaid: 1000 } },
  });
  if (snapshotError) throw snapshotError;

  const parentLogin = await qzAuth({ action: "login", phone: parentPhone, password: parentPassword });
  if (parentLogin.account?.roleKey !== "parent") throw new Error("Parent login returned the wrong role");

  const parentClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-qz-session": parentLogin.account.accessToken } },
  });
  const { data: snapshots, error: readError } = await parentClient
    .from("parent_player_snapshots")
    .select("academy_id,player_id,payload");
  if (readError || snapshots?.length !== 1 || snapshots[0].player_id !== playerId) {
    throw readError || new Error("Parent could not read exactly the linked child snapshot");
  }

  const { data: cloudRows, error: cloudReadError } = await parentClient.from("academy_cloud_data").select("academy_id");
  if (cloudReadError) throw cloudReadError;
  if ((cloudRows || []).length !== 0) throw new Error("Parent session could read academy cloud data");

  const { error: forbiddenWriteError } = await parentClient.from("parent_player_snapshots").insert({
    academy_id: academyId,
    player_id: `${playerId}-forbidden`,
    payload: {},
  });
  if (!forbiddenWriteError) throw new Error("Parent session unexpectedly wrote a child snapshot");

  console.log(JSON.stringify({
    ok: true,
    ownerLogin: true,
    parentCreated: true,
    parentLogin: true,
    linkedChildrenVisible: snapshots.length,
    academyDataHidden: true,
    parentWriteBlocked: true,
  }));
} finally {
  await removeTestRows();
}
