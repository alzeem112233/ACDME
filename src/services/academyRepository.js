import { isSupabaseConfigured, supabase } from "./supabaseClient";

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const remoteStatusByArabic = {
  "قيد المراجعة": "pending",
  "مقبول": "approved",
  "مرفوض": "rejected",
  "ظ‚ظٹط¯ ط§ظ„ظ…ط±ط§ط¬ط¹ط©": "pending",
  "ظ…ظ‚ط¨ظˆظ„": "approved",
  "ظ…ط±ظپظˆط¶": "rejected",
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
};

const arabicStatusByRemote = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};

function toArabicStatus(status) {
  if (!status) return "قيد المراجعة";
  if (arabicStatusByRemote[status]) return arabicStatusByRemote[status];
  if (remoteStatusByArabic[status]) return arabicStatusByRemote[remoteStatusByArabic[status]];
  return status;
}

function toRemoteStatus(status) {
  return remoteStatusByArabic[status] || "pending";
}

function normalizePlatformStatus(status) {
  if (!status || status === "active" || status === "نشط" || status === "ظ†ط´ط·") return "نشط";
  if (status === "disabled" || status === "معطل") return "معطل";
  return status;
}

function mapRegistrationRequest(row) {
  return {
    id: row.id,
    academyName: row.academy_name,
    ownerName: row.owner_name,
    contact: row.contact || row.phone,
    phone: row.phone || row.contact,
    academyId: row.academy_id || "",
    passwordHash: row.password_hash || "",
    city: row.city || "",
    status: toArabicStatus(row.status),
    createdAt: row.created_at ? row.created_at.slice(0, 10) : "",
  };
}

function mapPlatformAccount(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    academyId: row.academy_id,
    academyName: row.academy_name,
    permissions: row.permissions || "",
    passwordHash: row.password_hash || "",
    passwordStatus: row.password_status || "مشفرة",
    passwordUpdatedAt: row.password_updated_at || "",
    status: normalizePlatformStatus(row.status),
  };
}

function mapAcademyCloudData(row) {
  return {
    academyId: row.academy_id,
    data: row.payload || {},
    updatedAt: row.updated_at || "",
  };
}

function platformAccountPayload(account) {
  return {
    id: account.id || `account-${String(account.phone || "").replace(/\W/g, "")}`,
    name: account.name,
    phone: account.phone,
    role: account.role,
    academy_id: account.academyId,
    academy_name: account.academyName,
    permissions: account.permissions,
    password_hash: account.passwordHash,
    password_status: account.passwordStatus || "مشفرة",
    password_updated_at: account.passwordUpdatedAt || new Date().toISOString().slice(0, 10),
    status: account.status || "نشط",
    updated_at: new Date().toISOString(),
  };
}

export async function getRemoteAcademyData(academyId) {
  if (!isSupabaseConfigured || !academyId || isOffline()) return null;

  const { data, error } = await supabase
    .from("academy_cloud_data")
    .select("*")
    .eq("academy_id", academyId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapAcademyCloudData(data) : null;
}

export async function listRemoteAcademyData() {
  if (!isSupabaseConfigured || isOffline()) return [];

  const { data, error } = await supabase
    .from("academy_cloud_data")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data.map(mapAcademyCloudData);
}

export async function upsertRemoteAcademyData(academyId, academyData) {
  if (!isSupabaseConfigured || !academyId || isOffline()) return null;

  const { data, error } = await supabase
    .from("academy_cloud_data")
    .upsert(
      {
        academy_id: academyId,
        payload: academyData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "academy_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return mapAcademyCloudData(data);
}

export async function deleteRemoteAcademyData(academyId) {
  if (!isSupabaseConfigured || isOffline() || !academyId) return null;

  const { error } = await supabase
    .from("academy_cloud_data")
    .delete()
    .eq("academy_id", academyId);

  if (error) throw error;
  return true;
}

export async function listPlayers() {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase
    .from("players")
    .select("*, teams(name)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createPlayer(player) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase.from("players").insert(player).select().single();
  if (error) throw error;
  return data;
}

export async function recordRemoteAttendance(attendance) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase
    .from("attendance")
    .upsert(attendance, { onConflict: "player_id,attendance_date" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createPayment(payment) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase.from("payments").insert(payment).select().single();
  if (error) throw error;
  return data;
}

export async function listRegistrationRequests() {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase
    .from("registration_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map(mapRegistrationRequest);
}

export async function listPlatformAccounts() {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase
    .from("platform_accounts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map(mapPlatformAccount);
}

export async function upsertPlatformAccount(account) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase
    .from("platform_accounts")
    .upsert(platformAccountPayload(account), { onConflict: "phone" })
    .select()
    .single();

  if (error) throw error;
  return mapPlatformAccount(data);
}

export async function deleteRemotePlatformAccount(phone) {
  if (!isSupabaseConfigured || isOffline() || !phone) return null;

  const { error } = await supabase
    .from("platform_accounts")
    .delete()
    .eq("phone", phone);

  if (error) throw error;
  return true;
}

export async function createRegistrationRequest(request) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const legacyPayload = {
    academy_name: request.academyName,
    owner_name: request.ownerName,
    contact: request.contact || request.phone,
    city: request.city,
    status: toRemoteStatus(request.status),
  };

  const payload = {
    ...legacyPayload,
    phone: request.phone,
    academy_id: request.academyId,
    password_hash: request.passwordHash,
  };

  let { data, error } = await supabase
    .from("registration_requests")
    .insert(payload)
    .select()
    .single();

  if (error && String(error.message || "").includes("column")) {
    const fallback = await supabase
      .from("registration_requests")
      .insert(legacyPayload)
      .select()
      .single();

    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  return mapRegistrationRequest(data);
}

export async function updateRemoteRegistrationRequest(requestId, status) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase
    .from("registration_requests")
    .update({
      status: toRemoteStatus(status),
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select()
    .single();

  if (error) throw error;
  return mapRegistrationRequest(data);
}

export async function deleteRemoteRegistrationRequestsByPhone(phone, academyId = "") {
  if (!isSupabaseConfigured || isOffline() || !phone) return null;

  let { error } = await supabase
    .from("registration_requests")
    .delete()
    .eq("phone", phone);

  if (error && String(error.message || "").includes("column")) {
    const fallback = await supabase
      .from("registration_requests")
      .delete()
      .eq("contact", phone);
    error = fallback.error;
  }

  if (error) throw error;

  const contactDelete = await supabase
    .from("registration_requests")
    .delete()
    .eq("contact", phone);

  if (contactDelete.error && !String(contactDelete.error.message || "").includes("column")) {
    throw contactDelete.error;
  }

  if (academyId) {
    const academyDelete = await supabase
      .from("registration_requests")
      .delete()
      .eq("academy_id", academyId);

    if (academyDelete.error && !String(academyDelete.error.message || "").includes("column")) {
      throw academyDelete.error;
    }
  }

  return true;
}

export async function updateRemoteRegistrationPassword(phone, passwordHash) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const updatePayload = {
    password_hash: passwordHash,
    reviewed_at: new Date().toISOString(),
  };

  let { data, error } = await supabase
    .from("registration_requests")
    .update(updatePayload)
    .eq("phone", phone)
    .select();

  if (error) throw error;

  if (!data?.length) {
    const fallback = await supabase
      .from("registration_requests")
      .update(updatePayload)
      .eq("contact", phone)
      .select();

    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  return data?.map(mapRegistrationRequest) || [];
}

export async function updateRemotePlatformAccountPassword(phone, passwordHash) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase
    .from("platform_accounts")
    .update({
      password_hash: passwordHash,
      password_status: "تم إعادة التعيين",
      password_updated_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq("phone", phone)
    .select();

  if (error) throw error;
  return data.map(mapPlatformAccount);
}

export async function updateRemotePlatformAccountStatus(phone, status) {
  if (!isSupabaseConfigured || isOffline()) return null;

  const { data, error } = await supabase
    .from("platform_accounts")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("phone", phone)
    .select();

  if (error) throw error;
  return data.map(mapPlatformAccount);
}
