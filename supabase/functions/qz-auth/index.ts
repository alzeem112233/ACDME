import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qz-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SESSION_DURATION_MS = 29 * 24 * 60 * 60 * 1000;

const STATUS_APPROVED_VALUES = new Set(["approved", "مقبول", "ظ…ظ‚ط¨ظˆظ„"]);
const STATUS_DISABLED_VALUES = new Set(["disabled", "معطل", "ظ…ط¹ط·ظ„"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeDigits(value = "") {
  return String(value)
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizePhone(value = "") {
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

function legacyPhone(value = "") {
  return normalizePhone(value).replace(/^\+/, "");
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createOtp() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1000000).padStart(6, "0");
}

function otpMessage(code: string) {
  return `QZ ACADEMY password reset code: ${code}. It expires in 10 minutes.`;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function roleKey(row: Record<string, any>, fallback = "coach") {
  const key = String(row.role_key || row.roleKey || "").trim();
  if (["super_admin", "academy_owner", "admin", "coach"].includes(key)) return key;

  const role = String(row.role || fallback).trim().toLowerCase();
  if (role.includes("super") || row.role === "سوبر أدمين") return "super_admin";
  if (role.includes("owner") || row.role === "مالك أكاديمية") return "academy_owner";
  if (role.includes("admin")) return "admin";
  return fallback;
}

function permissionsJson(row: Record<string, any>, key = roleKey(row)) {
  if (row.permissions_json && typeof row.permissions_json === "object") return row.permissions_json;
  if (row.permissionsJson && typeof row.permissionsJson === "object") return row.permissionsJson;
  if (key === "super_admin") return { all: true };
  if (key === "academy_owner") return { academy: true, accounts: true, players: true, finance: true, reports: true };
  if (key === "admin") return { players: true, attendance: true, finance: true, reports: true };
  return { players: true, attendance: true };
}

async function issueSession(supabase: any, account: Record<string, any>) {
  const token = randomToken();
  const key = roleKey(account, "academy_owner");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  const { error } = await supabase
    .from("qz_app_sessions")
    .insert({
      token_hash: await sha256Hex(token),
      account_id: String(account.id || ""),
      phone_e164: normalizePhone(account.phone_e164 || account.phone || account.contact || ""),
      role_key: key,
      academy_id: key === "super_admin" ? "platform" : String(account.academy_id || account.academyId || ""),
      permissions: permissionsJson(account, key),
      expires_at: expiresAt,
    });

  if (error) throw error;
  return { token, expiresAt, roleKey: key, permissions: permissionsJson(account, key) };
}

async function findActiveSession(supabase: any, token = "", options: Record<string, boolean> = {}) {
  if (!token) return null;

  const { data, error } = await supabase
    .from("qz_app_sessions")
    .select("account_id,phone_e164,role_key,academy_id,permissions,expires_at")
    .eq("token_hash", await sha256Hex(token))
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const isExpired = Date.parse(data.expires_at || "") <= Date.now();
  if (!isExpired) return data;

  if (options.renewExpiredSuperAdmin && data.role_key === "super_admin") {
    const renewedExpiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    const { error: renewError } = await supabase
      .from("qz_app_sessions")
      .update({ expires_at: renewedExpiresAt })
      .eq("token_hash", await sha256Hex(token));

    if (renewError) throw renewError;
    return { ...data, expires_at: renewedExpiresAt };
  }

  return null;
}

function accountAcademyId(account: Record<string, any>) {
  const key = roleKey(account, "academy_owner");
  if (key === "super_admin") return "platform";
  return String(account.academy_id || account.academyId || "");
}

async function sendWhatsAppOtp(phone: string, code: string) {
  const message = otpMessage(code);
  const customApiUrl = Deno.env.get("QZ_WHATSAPP_API_URL") || "";
  const customApiToken = Deno.env.get("QZ_WHATSAPP_API_TOKEN") || "";

  if (customApiUrl) {
    const response = await fetch(customApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(customApiToken ? { Authorization: `Bearer ${customApiToken}` } : {}),
      },
      body: JSON.stringify({
        to: phone,
        code,
        message,
        channel: "whatsapp",
      }),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp provider failed with ${response.status}`);
    }

    return true;
  }

  const phoneNumberId = Deno.env.get("QZ_WHATSAPP_PHONE_NUMBER_ID") || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
  const accessToken = Deno.env.get("QZ_WHATSAPP_ACCESS_TOKEN") || Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
  if (!phoneNumberId || !accessToken) {
    return false;
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone.replace(/^\+/, ""),
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp Cloud API failed with ${response.status}`);
  }

  return true;
}

async function queueManualPasswordReset(supabase: any, phone: string, note = "", academyId = "") {
  const { error } = await supabase
    .from("password_reset_requests")
    .insert({
      phone_e164: phone,
      academy_id: academyId || null,
      status: "pending",
      delivery_channel: "manual",
      note,
      updated_at: new Date().toISOString(),
    });

  if (error && error.code !== "42P01" && error.code !== "23505") {
    throw error;
  }
}

async function verifyLegacyPassword(password: string, storedHash = "") {
  if (!storedHash) return false;
  const normalizedPassword = normalizeDigits(password).trim();
  const enteredHash = await sha256Hex(password);
  if (enteredHash === storedHash) return true;
  if (normalizedPassword !== password) {
    return (await sha256Hex(normalizedPassword)) === storedHash;
  }
  return false;
}

async function findApprovedAccount(supabase: any, phone: string, phoneWithoutPlus: string) {
  const { data: accountRow, error: accountError } = await supabase
    .from("platform_accounts")
    .select("*")
    .or(`phone_e164.eq.${phone},phone.eq.${phone},phone.eq.${phoneWithoutPlus}`)
    .limit(1)
    .maybeSingle();

  if (accountError) throw accountError;
  if (accountRow && !STATUS_DISABLED_VALUES.has(accountRow.status)) {
    return accountRow;
  }

  const { data: requestRow, error: requestError } = await supabase
    .from("registration_requests")
    .select("*")
    .or(`phone_e164.eq.${phone},phone.eq.${phone},contact.eq.${phone},phone.eq.${phoneWithoutPlus},contact.eq.${phoneWithoutPlus}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (requestError) throw requestError;
  if (requestRow && STATUS_APPROVED_VALUES.has(requestRow.status)) {
    return requestRow;
  }

  const { data: cloudRows, error: cloudError } = await supabase
    .from("academy_cloud_data")
    .select("academy_id,payload")
    .order("updated_at", { ascending: false });

  if (cloudError) throw cloudError;

  for (const row of cloudRows || []) {
    const academyData = row.payload || {};
    const candidates = [
      ...((academyData.users || []).map((user: Record<string, any>) => accountFromCloudUser(user, academyData, row.academy_id))),
      ...((academyData.coaches || []).map((coach: Record<string, any>) => accountFromCloudCoach(coach, academyData, row.academy_id))),
    ].filter(Boolean) as Record<string, any>[];

    const matched = candidates.find((candidate) => normalizePhone(candidate.phone) === phone);
    if (matched) return matched;
  }

  return null;
}

async function findSuperAdminPlatformAccount(supabase: any, phone: string, phoneWithoutPlus: string) {
  const { data, error } = await supabase
    .from("platform_accounts")
    .select("*")
    .eq("role_key", "super_admin")
    .or(`phone_e164.eq.${phone},phone.eq.${phone},phone.eq.${phoneWithoutPlus}`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function refreshSuperAdminPlatformAccount(supabase: any, phone: string, passwordHash = "") {
  if (!passwordHash) return;

  const { error } = await supabase
    .from("platform_accounts")
    .upsert(
      {
        id: "super-admin",
        name: "Super Admin",
        phone,
        phone_e164: phone,
        role: "Super Admin",
        role_key: "super_admin",
        academy_id: "platform",
        academy_name: "QZ ACADEMY",
        permissions: "Full system access",
        permissions_json: { all: true },
        password_hash: passwordHash,
        password_status: "encrypted",
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" },
    );

  if (error) {
    console.warn("Unable to refresh super admin platform account", error);
  }
}

function publicAccount(row: Record<string, any>, fallback: Record<string, any> = {}) {
  const phone = normalizePhone(row.phone_e164 || row.phone || row.contact || fallback.phone || "");
  const key = roleKey({ ...fallback, ...row }, fallback.roleKey || "academy_owner");
  return {
    id: row.id || fallback.id || `account-${phone.replace(/\W/g, "")}`,
    name: row.name || row.owner_name || fallback.name || "",
    phone,
    role: row.role || fallback.role || "مالك أكاديمية",
    roleKey: key,
    academyId: row.academy_id || fallback.academyId || "",
    academyName: row.academy_name || fallback.academyName || "",
    academyNameEn: row.academy_name_en || fallback.academyNameEn || "",
    academyLogo: row.academy_logo || fallback.academyLogo || "",
    city: row.city || fallback.city || "",
    permissionsJson: permissionsJson(row, key),
    permissions: row.permissions || fallback.permissions || "إدارة كاملة",
    status: row.status || fallback.status || "نشط",
  };
}

async function loginResponse(supabase: any, row: Record<string, any>, fallback: Record<string, any> = {}) {
  const account = publicAccount(row, fallback);
  const session = await issueSession(supabase, {
    ...fallback,
    ...row,
    id: account.id,
    phone: account.phone,
    role_key: account.roleKey,
    academy_id: account.academyId,
    permissions_json: account.permissionsJson,
  });

  return jsonResponse({
    ok: true,
    account: {
      ...account,
      accessToken: session.token,
      accessTokenExpiresAt: session.expiresAt,
      roleKey: session.roleKey,
      permissionsJson: session.permissions,
    },
  });
}

function accountFromCloudUser(user: Record<string, any>, academyData: Record<string, any>, academyId: string) {
  if (!user?.phone || !user?.passwordHash || user.status === "معطل") return null;
  return {
    id: user.id || `cloud-user-${academyId}-${normalizePhone(user.phone).replace(/\D/g, "")}`,
    name: user.name || academyData.coach?.name || "",
    phone: normalizePhone(user.phone),
    role: user.role || "مدرب",
    academy_id: academyId,
    academy_name: academyData.academy?.name || "",
    academy_name_en: academyData.academy?.nameEn || "",
    academy_logo: academyData.academy?.logo || "",
    permissions: user.permissions || "الحضور واللاعبين",
    password_hash: user.passwordHash,
    status: user.status || "نشط",
  };
}

function accountFromCloudCoach(coach: Record<string, any>, academyData: Record<string, any>, academyId: string) {
  if (!coach?.phone || !coach?.passwordHash || coach.status === "معطل") return null;
  return {
    id: coach.id || `cloud-coach-${academyId}-${normalizePhone(coach.phone).replace(/\D/g, "")}`,
    name: coach.name || "",
    phone: normalizePhone(coach.phone),
    role: coach.role || "مدرب",
    academy_id: academyId,
    academy_name: academyData.academy?.name || "",
    academy_name_en: academyData.academy?.nameEn || "",
    academy_logo: academyData.academy?.logo || "",
    permissions: coach.permissions || "الحضور واللاعبين",
    password_hash: coach.passwordHash,
    status: coach.status || "نشط",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, message: "طريقة الطلب غير مدعومة." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("QZ_SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, message: "إعدادات المصادقة غير مكتملة في الخادم." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await request.json();
    const action = String(body.action || "login");
    if (!["login", "register", "list-registration-requests", "review-registration-request", "request-password-otp", "request-password-reset"].includes(action)) {
      return jsonResponse({ ok: false, message: "الإجراء غير مدعوم." });
    }

    const phone = normalizePhone(body.phone || "");
    const phoneWithoutPlus = legacyPhone(phone);
    const password = String(body.password || "");
    const superAdminPhone = normalizePhone(Deno.env.get("QZ_SUPER_ADMIN_PHONE") || "");
    const superAdminPasswordHash = Deno.env.get("QZ_SUPER_ADMIN_PASSWORD_HASH") || "";

    if (action === "list-registration-requests") {
      const sessionToken = request.headers.get("x-qz-session") || String(body.qzSessionToken || body.sessionToken || "");
      const qzSession = await findActiveSession(supabase, sessionToken, { renewExpiredSuperAdmin: true });
      if (!qzSession) {
        return jsonResponse({ ok: false, message: "Unauthorized." }, 401);
      }

      const selectedColumns = "id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at";
      let query = supabase
        .from("registration_requests")
        .select(selectedColumns)
        .order("created_at", { ascending: false });

      if (qzSession.role_key !== "super_admin") {
        const sessionPhone = normalizePhone(qzSession.phone_e164 || "");
        const sessionLegacyPhone = legacyPhone(sessionPhone);
        const sessionAcademyId = String(qzSession.academy_id || "");
        const candidates = [
          sessionAcademyId ? `academy_id.eq.${sessionAcademyId}` : "",
          sessionPhone ? `phone_e164.eq.${sessionPhone}` : "",
          sessionPhone ? `phone.eq.${sessionPhone}` : "",
          sessionPhone ? `contact.eq.${sessionPhone}` : "",
          sessionLegacyPhone ? `phone.eq.${sessionLegacyPhone}` : "",
          sessionLegacyPhone ? `contact.eq.${sessionLegacyPhone}` : "",
        ].filter(Boolean).join(",");

        if (!candidates) {
          return jsonResponse({ ok: true, requests: [] });
        }

        query = query.or(candidates);
      }

      const { data: requests, error: requestsError } = await query;
      if (requestsError) throw requestsError;

      return jsonResponse({ ok: true, requests: requests || [] });
    }

    if (action === "review-registration-request") {
      const sessionToken = request.headers.get("x-qz-session") || String(body.qzSessionToken || body.sessionToken || "");
      const qzSession = await findActiveSession(supabase, sessionToken, { renewExpiredSuperAdmin: true });
      if (!qzSession || qzSession.role_key !== "super_admin") {
        return jsonResponse({ ok: false, message: "Unauthorized." }, 401);
      }

      const requestId = String(body.requestId || body.id || "").trim();
      const reviewStatus = String(body.status || "pending").trim();
      if (!requestId || !["pending", "approved", "rejected"].includes(reviewStatus)) {
        return jsonResponse({ ok: false, message: "Invalid review request." }, 400);
      }

      const selectedRequestColumns = "id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at";
      const { data: reviewedRequest, error: reviewError } = await supabase
        .from("registration_requests")
        .update({
          status: reviewStatus,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select("*")
        .single();

      if (reviewError) throw reviewError;

      let approvedAccount = null;
      if (reviewStatus === "approved") {
        const accountPhone = normalizePhone(reviewedRequest.phone_e164 || reviewedRequest.phone || reviewedRequest.contact || "");
        const academyId = String(reviewedRequest.academy_id || `academy-${accountPhone.replace(/\D/g, "")}`);
        const { data: accountRow, error: accountError } = await supabase
          .from("platform_accounts")
          .upsert(
            {
              id: `user-${reviewedRequest.id}`,
              name: reviewedRequest.owner_name || reviewedRequest.academy_name || "Academy Owner",
              phone: accountPhone,
              phone_e164: accountPhone,
              role: "مالك أكاديمية",
              role_key: "academy_owner",
              academy_id: academyId,
              academy_name: reviewedRequest.academy_name || "",
              permissions: "إدارة كاملة",
              permissions_json: { academy: true, accounts: true, players: true, finance: true, reports: true },
              password_hash: reviewedRequest.password_hash || "",
              password_status: "مشفرة",
              password_updated_at: new Date().toISOString().slice(0, 10),
              status: "نشط",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "phone" },
          )
          .select("id,name,phone,phone_e164,role,role_key,auth_provider,academy_id,academy_name,permissions,permissions_json,password_status,password_updated_at,status,created_at,updated_at")
          .single();

        if (accountError) throw accountError;
        approvedAccount = accountRow;
      }

      const publicRequest = Object.fromEntries(
        selectedRequestColumns.split(",").map((column) => [column, reviewedRequest[column]]),
      );

      return jsonResponse({
        ok: true,
        request: publicRequest,
        account: approvedAccount,
      });
    }

    if (action === "register") {
      const academyName = String(body.academyName || body.academy_name || "").trim();
      const ownerName = String(body.ownerName || body.owner_name || "").trim();
      const academyId = String(body.academyId || body.academy_id || `academy-${phone.replace(/\D/g, "")}`).trim();
      const city = String(body.city || "").trim();
      const passwordHash = String(body.passwordHash || body.password_hash || "").trim();

      if (phone.length < 8 || !academyName || !ownerName || !academyId || !passwordHash) {
        return jsonResponse({ ok: false, message: "Registration request is incomplete." });
      }

      const selectedColumns = "id,academy_name,owner_name,contact,phone,phone_e164,academy_id,city,status,role_key,auth_provider,created_at";
      const registrationPayload = {
        academy_name: academyName,
        owner_name: ownerName,
        contact: phone,
        phone,
        phone_e164: phone,
        academy_id: academyId,
        city,
        status: "pending",
        role_key: "academy_owner",
        auth_provider: "qz_auth",
        password_hash: passwordHash,
      };

      let { data: requestRow, error: requestError } = await supabase
        .from("registration_requests")
        .insert(registrationPayload)
        .select(selectedColumns)
        .single();

      if (requestError && (requestError.code === "23505" || String(requestError.message || "").toLowerCase().includes("duplicate"))) {
        const candidates = [
          `phone_e164.eq.${phone}`,
          `phone.eq.${phone}`,
          `contact.eq.${phone}`,
          `phone.eq.${phoneWithoutPlus}`,
          `contact.eq.${phoneWithoutPlus}`,
          `academy_id.eq.${academyId}`,
        ].join(",");

        const updated = await supabase
          .from("registration_requests")
          .update({
            ...registrationPayload,
            reviewed_at: null,
          })
          .or(candidates)
          .select(selectedColumns)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        requestRow = updated.data;
        requestError = updated.error;
      }

      if (requestError) throw requestError;
      if (!requestRow) {
        return jsonResponse({ ok: false, message: "Registration request could not be confirmed." }, 500);
      }

      return jsonResponse({
        ok: true,
        message: "Registration request was sent to the dashboard.",
        request: requestRow,
      });
    }

    if (action === "request-password-reset") {
      if (phone.length < 8) {
        return jsonResponse({ ok: false, message: "Invalid phone number." });
      }

      const genericResponse = {
        ok: true,
        message: "If this phone belongs to an approved account, a password reset request will be sent to the platform dashboard.",
        fallback: "manual_admin_reset",
      };
      const account = superAdminPhone && phone === superAdminPhone
        ? { id: "super-admin", phone, role_key: "super_admin", academy_id: "platform" }
        : await findApprovedAccount(supabase, phone, phoneWithoutPlus);

      if (!account) {
        return jsonResponse(genericResponse);
      }

      await queueManualPasswordReset(
        supabase,
        phone,
        "User requested password reset from the login page.",
        accountAcademyId(account),
      );
      return jsonResponse(genericResponse);
    }

    if (action === "request-password-otp") {
      if (phone.length < 8) {
        return jsonResponse({ ok: false, message: "Invalid phone number." });
      }

      const genericResponse = {
        ok: true,
        message: "If this phone belongs to an approved account, a verification code will be sent by WhatsApp.",
      };
      const account = superAdminPhone && phone === superAdminPhone
        ? { id: "super-admin", phone, role_key: "super_admin", academy_id: "platform" }
        : await findApprovedAccount(supabase, phone, phoneWithoutPlus);

      if (!account) {
        return jsonResponse(genericResponse);
      }

      const recentWindow = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recentOtp, error: recentError } = await supabase
        .from("password_reset_otps")
        .select("id")
        .eq("phone_e164", phone)
        .gte("created_at", recentWindow)
        .is("consumed_at", null)
        .limit(1)
        .maybeSingle();

      if (recentError) throw recentError;
      if (recentOtp) {
        return jsonResponse(genericResponse);
      }

      const otp = createOtp();
      const otpHash = await sha256Hex(`${phone}:${otp}:${Deno.env.get("QZ_OTP_PEPPER") || serviceRoleKey}`);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const academyId = accountAcademyId(account);

      const { error: insertOtpError } = await supabase
        .from("password_reset_otps")
        .insert({
          phone_e164: phone,
          academy_id: academyId || null,
          otp_hash: otpHash,
          channel: "whatsapp",
          purpose: "password_reset",
          expires_at: expiresAt,
        });

      if (insertOtpError) throw insertOtpError;

      const sent = await sendWhatsAppOtp(phone, otp);
      if (!sent) {
        console.warn("WhatsApp OTP provider is not configured.");
        await queueManualPasswordReset(
          supabase,
          phone,
          "WhatsApp provider is not configured; manual password reset is required.",
          academyId,
        );
      }

      return jsonResponse({
        ...genericResponse,
        deliveryConfigured: sent,
        fallback: sent ? null : "manual_admin_reset",
      });
    }

    if (phone.length < 8 || !password) {
      return jsonResponse({ ok: false, message: "أدخل رقم الهاتف وكلمة السر للمتابعة." });
    }

    if (superAdminPhone && phone === superAdminPhone) {
      const superAdminAccountRow = await findSuperAdminPlatformAccount(supabase, phone, phoneWithoutPlus);
      const passwordOk = (await verifyLegacyPassword(password, superAdminPasswordHash)) ||
        (superAdminAccountRow ? await verifyLegacyPassword(password, superAdminAccountRow.password_hash || "") : false);
      if (!passwordOk) {
        return jsonResponse({ ok: false, message: "رقم الهاتف أو كلمة السر غير صحيحة." });
      }

      await refreshSuperAdminPlatformAccount(supabase, phone, superAdminPasswordHash);

      return await loginResponse(supabase, superAdminAccountRow || {
          id: "super-admin",
          name: "مدير المنصة",
          phone,
          role: "سوبر أدمين",
          academyId: "platform",
          academyName: "إدارة المنصة",
          permissions: "إدارة كاملة",
          status: "نشط",
        phone_e164: phone,
        role_key: "super_admin",
        academy_id: "platform",
        academy_name: "QZ ACADEMY",
        permissions_json: { all: true },
      });
    }

    const { data: accountRow, error: accountError } = await supabase
      .from("platform_accounts")
      .select("*")
      .or(`phone_e164.eq.${phone},phone.eq.${phone},phone.eq.${phoneWithoutPlus}`)
      .limit(1)
      .maybeSingle();

    if (accountError) throw accountError;

    if (accountRow) {
      if (STATUS_DISABLED_VALUES.has(accountRow.status)) {
        return jsonResponse({ ok: false, message: "تم تعطيل هذا الحساب من إدارة الأكاديمية." });
      }

      const passwordOk = await verifyLegacyPassword(password, accountRow.password_hash || "");
      if (!passwordOk) {
        return jsonResponse({ ok: false, message: "رقم الهاتف أو كلمة السر غير صحيحة." });
      }

      return await loginResponse(supabase, accountRow);
    }

    const { data: requestRow, error: requestError } = await supabase
      .from("registration_requests")
      .select("*")
      .or(`phone_e164.eq.${phone},phone.eq.${phone},contact.eq.${phone},phone.eq.${phoneWithoutPlus},contact.eq.${phoneWithoutPlus}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (requestError) throw requestError;

    if (requestRow) {
      if (!STATUS_APPROVED_VALUES.has(requestRow.status)) {
        return jsonResponse({ ok: false, message: "طلب التسجيل لهذا الرقم ما زال بانتظار موافقة إدارة المنصة." });
      }

      const passwordOk = await verifyLegacyPassword(password, requestRow.password_hash || "");
      if (!passwordOk) {
        return jsonResponse({ ok: false, message: "رقم الهاتف أو كلمة السر غير صحيحة." });
      }

      return await loginResponse(supabase, requestRow, {
          id: `request-${requestRow.id}`,
          role: "مالك أكاديمية",
          academyId: requestRow.academy_id || `academy-${phone.replace(/\D/g, "")}`,
          academyName: requestRow.academy_name || "",
          permissions: "إدارة كاملة",
          roleKey: "academy_owner",
        });
    }

    const { data: cloudRows, error: cloudError } = await supabase
      .from("academy_cloud_data")
      .select("academy_id,payload")
      .order("updated_at", { ascending: false });

    if (cloudError) throw cloudError;

    for (const row of cloudRows || []) {
      const academyData = row.payload || {};
      const candidates = [
        ...((academyData.users || []).map((user: Record<string, any>) => accountFromCloudUser(user, academyData, row.academy_id))),
        ...((academyData.coaches || []).map((coach: Record<string, any>) => accountFromCloudCoach(coach, academyData, row.academy_id))),
      ].filter(Boolean) as Record<string, any>[];

      const matched = candidates.find((candidate) => normalizePhone(candidate.phone) === phone);
      if (!matched) continue;

      const passwordOk = await verifyLegacyPassword(password, matched.password_hash || "");
      if (!passwordOk) {
        return jsonResponse({ ok: false, message: "رقم الهاتف أو كلمة السر غير صحيحة." });
      }

      return await loginResponse(supabase, matched);
    }

    return jsonResponse({ ok: false, message: "هذا الرقم غير مسجل كحساب معتمد." });
  } catch (error) {
    console.error("qz-auth login failed", error);
    return jsonResponse({ ok: false, message: "تعذر تسجيل الدخول الآن. يرجى المحاولة مرة أخرى." }, 500);
  }
});
