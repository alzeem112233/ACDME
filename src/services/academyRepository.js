import { isSupabaseConfigured, supabase } from "./supabaseClient";

const NETWORK_RETRY_DELAYS = [1200, 2800, 5500, 9000];

function wait(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function isRetryableNetworkError(error) {
  const message = String(error?.message || error || "");
  return /failed to fetch|fetch failed|network|timeout|load failed|abort/i.test(message);
}

async function withWeakNetworkRetry(operation) {
  let lastError = null;

  for (let attempt = 0; attempt <= NETWORK_RETRY_DELAYS.length; attempt += 1) {
    try {
      const result = await operation();
      if (result?.error && isRetryableNetworkError(result.error) && attempt < NETWORK_RETRY_DELAYS.length) {
        lastError = result.error;
        await wait(NETWORK_RETRY_DELAYS[attempt]);
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === NETWORK_RETRY_DELAYS.length) {
        throw error;
      }

      await wait(NETWORK_RETRY_DELAYS[attempt]);
    }
  }

  throw lastError;
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

function normalizeDigits(value = "") {
  return String(value)
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizePhoneForRemote(value = "") {
  const compact = normalizeDigits(value).trim().replace(/[()\-\s._/\\]+/g, "");
  const raw = compact.startsWith("+")
    ? `+${compact.slice(1).replace(/\D/g, "")}`
    : compact.replace(/\D/g, "");
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("00")) return `+${raw.slice(2)}`;
  if (raw.startsWith("967")) return `+${raw}`;
  if (raw.startsWith("0")) return `+967${raw.slice(1)}`;
  if (raw.startsWith("7")) return `+967${raw}`;
  return raw;
}

function legacyPhoneForRemote(value = "") {
  return normalizePhoneForRemote(value).replace(/^\+/, "");
}

function normalizePlatformStatus(status) {
  if (!status || status === "active" || status === "نشط" || status === "ظ†ط´ط·") return "نشط";
  if (status === "disabled" || status === "معطل" || status === "ظ…ط¹ط·ظ„") return "معطل";
  return status;
}

function mapRegistrationRequest(row) {
  const phone = normalizePhoneForRemote(row.phone_e164 || row.phone || row.contact);
  return {
    id: row.id,
    academyName: row.academy_name,
    ownerName: row.owner_name,
    contact: phone,
    phone,
    academyId: row.academy_id || "",
    roleKey: row.role_key || "academy_owner",
    authProvider: row.auth_provider || "",
    passwordHash: "",
    city: row.city || "",
    status: toArabicStatus(row.status),
    createdAt: row.created_at ? row.created_at.slice(0, 10) : "",
  };
}

function mapPlatformAccount(row) {
  return {
    id: row.id,
    name: row.name,
    phone: normalizePhoneForRemote(row.phone_e164 || row.phone),
    role: row.role,
    roleKey: row.role_key || "",
    academyId: row.academy_id,
    academyName: row.academy_name,
    permissions: row.permissions || "",
    authProvider: row.auth_provider || "",
    passwordHash: "",
    passwordStatus: row.password_status || "مشفرة",
    passwordUpdatedAt: row.password_updated_at || "",
    status: normalizePlatformStatus(row.status),
  };
}

function mapPasswordResetRequest(row) {
  return {
    id: row.id,
    phone: normalizePhoneForRemote(row.phone_e164),
    status: row.status || "pending",
    deliveryChannel: row.delivery_channel || "manual",
    note: row.note || "",
    createdAt: row.created_at ? row.created_at.slice(0, 16).replace("T", " ") : "",
    handledAt: row.handled_at || "",
  };
}

function mapAcademyCloudData(row) {
  return {
    academyId: row.academy_id,
    data: stripFrontendSecrets(row.payload || {}),
    updatedAt: row.updated_at || "",
  };
}

function stripFrontendSecrets(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value, (key, fieldValue) => {
    if (key === "password" || key === "passwordHash" || key === "password_hash") return undefined;
    return fieldValue;
  }));
}

function platformAccountPayload(account) {
  const phone = normalizePhoneForRemote(account.phone);
  return {
    id: account.id || `account-${phone.replace(/\W/g, "")}`,
    name: account.name,
    phone,
    phone_e164: phone,
    role: account.role,
    academy_id: account.academyId,
    academy_name: account.academyName,
    permissions: account.permissions,
    password_hash: account.passwordHash,
    password_status: account.passwordStatus || "مشفرة",
    password_updated_at: account.passwordUpdatedAt || new Date().toISOString().slice(0, 10),
    status: normalizePlatformStatus(account.status),
    updated_at: new Date().toISOString(),
  };
}

export async function getRemoteAcademyData(academyId) {
  if (!isSupabaseConfigured || !academyId) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("academy_cloud_data")
      .select("*")
      .eq("academy_id", academyId)
      .maybeSingle(),
  );

  if (error) throw error;
  return data ? mapAcademyCloudData(data) : null;
}

export async function authenticateRemoteAccount(phone, password) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase.functions.invoke("qz-auth", {
      body: {
        action: "login",
        phone,
        password,
      },
    }),
  );

  if (error) throw error;
  if (!data?.ok) {
    throw new Error(data?.message || "تعذر تسجيل الدخول.");
  }

  return data.account || null;
}

export async function requestPasswordResetOtp(phone) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase.functions.invoke("qz-auth", {
      body: {
        action: "request-password-otp",
        phone,
      },
    }),
  );

  if (error) throw error;
  if (!data?.ok) {
    throw new Error(data?.message || "تعذر إرسال رمز التحقق.");
  }

  return data;
}

export async function listPasswordResetRequests() {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("password_reset_requests")
      .select("id,phone_e164,status,delivery_channel,note,created_at,handled_at,updated_at")
      .order("created_at", { ascending: false }),
  );

  if (error) {
    if (error.code === "42P01" || String(error.message || "").includes("password_reset_requests")) return [];
    throw error;
  }

  return data.map(mapPasswordResetRequest);
}

export async function updatePasswordResetRequest(requestId, status) {
  if (!isSupabaseConfigured || !requestId) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("password_reset_requests")
      .update({
        status,
        handled_at: status === "pending" ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("id,phone_e164,status,delivery_channel,note,created_at,handled_at,updated_at")
      .single(),
  );

  if (error) {
    if (error.code === "42P01" || String(error.message || "").includes("password_reset_requests")) return null;
    throw error;
  }

  return mapPasswordResetRequest(data);
}

export async function listRemoteAcademyData() {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("academy_cloud_data")
      .select("*")
      .order("updated_at", { ascending: false }),
  );

  if (error) throw error;
  return data.map(mapAcademyCloudData);
}

export async function upsertRemoteAcademyData(academyId, academyData) {
  if (!isSupabaseConfigured || !academyId) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
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
      .single(),
  );

  if (error) throw error;
  return mapAcademyCloudData(data);
}

export async function deleteRemoteAcademyData(academyId) {
  if (!isSupabaseConfigured || !academyId) return null;

  const { error } = await withWeakNetworkRetry(() =>
    supabase
      .from("academy_cloud_data")
      .delete()
      .eq("academy_id", academyId),
  );

  if (error) throw error;
  return true;
}

export async function listPlayers() {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("players")
      .select("*, teams(name)")
      .order("created_at", { ascending: false }),
  );

  if (error) throw error;
  return data;
}

export async function createPlayer(player) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.from("players").insert(player).select().single();
  if (error) throw error;
  return data;
}

export async function recordRemoteAttendance(attendance) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from("attendance")
    .upsert(attendance, { onConflict: "player_id,attendance_date" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createPayment(payment) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.from("payments").insert(payment).select().single();
  if (error) throw error;
  return data;
}

export async function listRegistrationRequests() {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("registration_requests")
      .select("id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at")
      .order("created_at", { ascending: false }),
  );

  if (error) throw error;
  return data.map(mapRegistrationRequest);
}

export async function getRemoteRegistrationRequestByPhone(phone) {
  if (!isSupabaseConfigured || !phone) return null;

  const normalizedPhone = normalizePhoneForRemote(phone);
  const legacyPhone = legacyPhoneForRemote(normalizedPhone);
  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("registration_requests")
      .select("id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at")
      .or(`phone_e164.eq.${normalizedPhone},phone.eq.${normalizedPhone},contact.eq.${normalizedPhone},phone.eq.${legacyPhone},contact.eq.${legacyPhone}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  if (error) throw error;
  return data ? mapRegistrationRequest(data) : null;
}

export async function listPlatformAccounts() {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("platform_accounts")
      .select("id,name,phone,phone_e164,role,role_key,auth_provider,academy_id,academy_name,permissions,password_status,password_updated_at,status,created_at,updated_at")
      .order("created_at", { ascending: false }),
  );

  if (error) throw error;
  return data.map(mapPlatformAccount);
}

export async function getRemotePlatformAccountByPhone(phone) {
  if (!isSupabaseConfigured || !phone) return null;

  const normalizedPhone = normalizePhoneForRemote(phone);
  const legacyPhone = legacyPhoneForRemote(normalizedPhone);
  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("platform_accounts")
      .select("id,name,phone,phone_e164,role,role_key,auth_provider,academy_id,academy_name,permissions,password_status,password_updated_at,status,created_at,updated_at")
      .or(`phone_e164.eq.${normalizedPhone},phone.eq.${normalizedPhone},phone.eq.${legacyPhone}`)
      .limit(1)
      .maybeSingle(),
  );

  if (error) throw error;
  return data ? mapPlatformAccount(data) : null;
}

export async function upsertPlatformAccount(account) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("platform_accounts")
      .upsert(platformAccountPayload(account), { onConflict: "phone" })
      .select("id,name,phone,phone_e164,role,role_key,auth_provider,academy_id,academy_name,permissions,password_status,password_updated_at,status,created_at,updated_at")
      .single(),
  );

  if (error) throw error;
  return mapPlatformAccount(data);
}

export async function deleteRemotePlatformAccount(phone) {
  if (!isSupabaseConfigured || !phone) return null;

  const normalizedPhone = normalizePhoneForRemote(phone);
  const legacyPhone = legacyPhoneForRemote(normalizedPhone);
  const { error } = await withWeakNetworkRetry(() =>
    supabase
      .from("platform_accounts")
      .delete()
      .or(`phone_e164.eq.${normalizedPhone},phone.eq.${normalizedPhone},phone.eq.${legacyPhone}`),
  );

  if (error) throw error;
  return true;
}

export async function createRegistrationRequest(request) {
  if (!isSupabaseConfigured) return null;

  const phone = normalizePhoneForRemote(request.phone || request.contact);
  const legacyPhone = legacyPhoneForRemote(phone);
  const legacyPayload = {
    academy_name: request.academyName,
    owner_name: request.ownerName,
    contact: phone,
    city: request.city,
    status: toRemoteStatus(request.status),
  };

  const payload = {
    ...legacyPayload,
    phone,
    phone_e164: phone,
    academy_id: request.academyId,
    password_hash: request.passwordHash,
  };

  let { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("registration_requests")
      .insert(payload)
      .select("id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at")
      .single(),
  );

  if (error && String(error.message || "").includes("column")) {
    const fallback = await withWeakNetworkRetry(() =>
      supabase
        .from("registration_requests")
        .insert(legacyPayload)
        .select("id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at")
        .single(),
    );

    data = fallback.data;
    error = fallback.error;
  }

  if (error && (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"))) {
    const updatePayload = {
      ...payload,
      status: "pending",
      reviewed_at: null,
    };
    const candidates = [
      `phone.eq.${phone}`,
      `phone_e164.eq.${phone}`,
      `contact.eq.${phone}`,
      `phone.eq.${legacyPhone}`,
      `contact.eq.${legacyPhone}`,
      request.academyId ? `academy_id.eq.${request.academyId}` : "",
    ].filter(Boolean).join(",");

    const updated = await withWeakNetworkRetry(() =>
      supabase
        .from("registration_requests")
        .update(updatePayload)
        .or(candidates)
        .select("id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at"),
    );

    data = updated.data?.[0] || null;
    error = updated.error;
  }

  if (error) throw error;
  if (!data) throw new Error("تعذر تأكيد حفظ طلب التسجيل في السحابة.");
  return mapRegistrationRequest(data);
}

export async function updateRemoteRegistrationRequest(requestId, status) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("registration_requests")
      .update({
        status: toRemoteStatus(status),
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at")
      .single(),
  );

  if (error) throw error;
  return mapRegistrationRequest(data);
}

export async function deleteRemoteRegistrationRequestsByPhone(phone, academyId = "") {
  if (!isSupabaseConfigured || !phone) return null;

  const normalizedPhone = normalizePhoneForRemote(phone);
  const legacyPhone = legacyPhoneForRemote(normalizedPhone);
  let { error } = await withWeakNetworkRetry(() =>
    supabase
      .from("registration_requests")
      .delete()
      .or(`phone_e164.eq.${normalizedPhone},phone.eq.${normalizedPhone},contact.eq.${normalizedPhone},phone.eq.${legacyPhone},contact.eq.${legacyPhone}`),
  );

  if (error) throw error;

  if (academyId) {
    const academyDelete = await withWeakNetworkRetry(() =>
      supabase
        .from("registration_requests")
        .delete()
        .eq("academy_id", academyId),
    );

    if (academyDelete.error && !String(academyDelete.error.message || "").includes("column")) {
      throw academyDelete.error;
    }
  }

  return true;
}

export async function updateRemoteRegistrationPassword(phone, passwordHash) {
  if (!isSupabaseConfigured) return null;

  const normalizedPhone = normalizePhoneForRemote(phone);
  const legacyPhone = legacyPhoneForRemote(normalizedPhone);
  const updatePayload = {
    password_hash: passwordHash,
    reviewed_at: new Date().toISOString(),
  };

  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("registration_requests")
      .update(updatePayload)
      .or(`phone_e164.eq.${normalizedPhone},phone.eq.${normalizedPhone},contact.eq.${normalizedPhone},phone.eq.${legacyPhone},contact.eq.${legacyPhone}`)
      .select("id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at"),
  );

  if (error) throw error;
  return data?.map(mapRegistrationRequest) || [];
}

export async function updateRemotePlatformAccountPassword(phone, passwordHash) {
  if (!isSupabaseConfigured) return null;

  const normalizedPhone = normalizePhoneForRemote(phone);
  const legacyPhone = legacyPhoneForRemote(normalizedPhone);
  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("platform_accounts")
      .update({
      password_hash: passwordHash,
      password_status: "تم إعادة التعيين",
      password_updated_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
      })
      .or(`phone_e164.eq.${normalizedPhone},phone.eq.${normalizedPhone},phone.eq.${legacyPhone}`)
      .select("id,name,phone,phone_e164,role,role_key,auth_provider,academy_id,academy_name,permissions,password_status,password_updated_at,status,created_at,updated_at"),
  );

  if (error) throw error;
  return data.map(mapPlatformAccount);
}

export async function updateRemotePlatformAccountStatus(phone, status) {
  if (!isSupabaseConfigured) return null;

  const normalizedPhone = normalizePhoneForRemote(phone);
  const legacyPhone = legacyPhoneForRemote(normalizedPhone);
  const { data, error } = await withWeakNetworkRetry(() =>
    supabase
      .from("platform_accounts")
      .update({
      status: normalizePlatformStatus(status),
      updated_at: new Date().toISOString(),
      })
      .or(`phone_e164.eq.${normalizedPhone},phone.eq.${normalizedPhone},phone.eq.${legacyPhone}`)
      .select("id,name,phone,phone_e164,role,role_key,auth_provider,academy_id,academy_name,permissions,password_status,password_updated_at,status,created_at,updated_at"),
  );

  if (error) throw error;
  return data.map(mapPlatformAccount);
}
