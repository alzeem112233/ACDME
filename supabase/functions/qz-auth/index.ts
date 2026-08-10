import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

async function queueManualPasswordReset(supabase: any, phone: string, note = "") {
  const { error } = await supabase
    .from("password_reset_requests")
    .insert({
      phone_e164: phone,
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

function publicAccount(row: Record<string, any>, fallback: Record<string, any> = {}) {
  const phone = normalizePhone(row.phone_e164 || row.phone || row.contact || fallback.phone || "");
  return {
    id: row.id || fallback.id || `account-${phone.replace(/\W/g, "")}`,
    name: row.name || row.owner_name || fallback.name || "",
    phone,
    role: row.role || fallback.role || "مالك أكاديمية",
    academyId: row.academy_id || fallback.academyId || "",
    academyName: row.academy_name || fallback.academyName || "",
    academyNameEn: row.academy_name_en || fallback.academyNameEn || "",
    academyLogo: row.academy_logo || fallback.academyLogo || "",
    permissions: row.permissions || fallback.permissions || "إدارة كاملة",
    status: row.status || fallback.status || "نشط",
  };
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
    if (!["login", "request-password-otp", "request-password-reset"].includes(action)) {
      return jsonResponse({ ok: false, message: "الإجراء غير مدعوم." });
    }

    const phone = normalizePhone(body.phone || "");
    const phoneWithoutPlus = legacyPhone(phone);
    const password = String(body.password || "");
    const superAdminPhone = normalizePhone(Deno.env.get("QZ_SUPER_ADMIN_PHONE") || "");
    const superAdminPasswordHash = Deno.env.get("QZ_SUPER_ADMIN_PASSWORD_HASH") || "";
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
        ? { id: "super-admin", phone }
        : await findApprovedAccount(supabase, phone, phoneWithoutPlus);

      if (!account) {
        return jsonResponse(genericResponse);
      }

      await queueManualPasswordReset(supabase, phone, "User requested password reset from the login page.");
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
        ? { id: "super-admin", phone }
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

      const { error: insertOtpError } = await supabase
        .from("password_reset_otps")
        .insert({
          phone_e164: phone,
          otp_hash: otpHash,
          channel: "whatsapp",
          purpose: "password_reset",
          expires_at: expiresAt,
        });

      if (insertOtpError) throw insertOtpError;

      const sent = await sendWhatsAppOtp(phone, otp);
      if (!sent) {
        console.warn("WhatsApp OTP provider is not configured.");
        await queueManualPasswordReset(supabase, phone, "WhatsApp provider is not configured; manual password reset is required.");
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
      const passwordOk = await verifyLegacyPassword(password, superAdminPasswordHash);
      if (!passwordOk) {
        return jsonResponse({ ok: false, message: "رقم الهاتف أو كلمة السر غير صحيحة." });
      }

      return jsonResponse({
        ok: true,
        account: {
          id: "super-admin",
          name: "مدير المنصة",
          phone,
          role: "سوبر أدمين",
          academyId: "platform",
          academyName: "إدارة المنصة",
          permissions: "إدارة كاملة",
          status: "نشط",
        },
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

      return jsonResponse({ ok: true, account: publicAccount(accountRow) });
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

      return jsonResponse({
        ok: true,
        account: publicAccount(requestRow, {
          id: `request-${requestRow.id}`,
          role: "مالك أكاديمية",
          academyId: requestRow.academy_id || `academy-${phone.replace(/\D/g, "")}`,
          academyName: requestRow.academy_name || "",
          permissions: "إدارة كاملة",
        }),
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

      return jsonResponse({ ok: true, account: publicAccount(matched) });
    }

    return jsonResponse({ ok: false, message: "هذا الرقم غير مسجل كحساب معتمد." });
  } catch (error) {
    console.error("qz-auth login failed", error);
    return jsonResponse({ ok: false, message: "تعذر تسجيل الدخول الآن. يرجى المحاولة مرة أخرى." }, 500);
  }
});
