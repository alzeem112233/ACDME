import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownAZ,
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarCheck,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Copy,
  Trash2,
  Download,
  Dumbbell,
  Eye,
  EyeOff,
  FileCheck2,
  FolderOpen,
  ImageDown,
  KeyRound,
  Layers,
  LockKeyhole,
  MapPin,
  Medal,
  MessageSquare,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  Sun,
  Swords,
  Trophy,
  Upload,
  UserCircle,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { registerServiceWorker } from "./registerServiceWorker";
import { readLocalData, writeLocalData } from "./services/localRepository";
import {
  createRegistrationRequest,
  deleteRemoteAcademyData,
  deleteRemotePlatformAccount,
  deleteRemoteRegistrationRequestsByPhone,
  getRemoteAcademyData,
  listRemoteAcademyData,
  listPlatformAccounts,
  listRegistrationRequests,
  updateRemotePlatformAccountPassword,
  updateRemotePlatformAccountStatus,
  updateRemoteRegistrationPassword,
  updateRemoteRegistrationRequest,
  upsertRemoteAcademyData,
  upsertPlatformAccount,
} from "./services/academyRepository";
import "./styles.css";

registerServiceWorker();

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

const today = currentDateKey();
const SUPER_ADMIN_PHONE = "+967772227092";
const SUPER_ADMIN_PASSWORD = "772227092";
const STATUS_PENDING = "قيد المراجعة";
const STATUS_APPROVED = "مقبول";
const STATUS_REJECTED = "مرفوض";
const ROLE_SUPER_ADMIN = "سوبر أدمين";
const ROLE_OWNER = "مالك أكاديمية";
const ROLE_COACH = "مدرب";
const PERMISSION_FULL = "إدارة كاملة";
const PERMISSION_ATTENDANCE_PLAYERS = "الحضور واللاعبين";
const PERMISSION_TEAM_FOLLOW = "متابعة فريق محدد";
const PERMISSION_READ_ONLY = "قراءة فقط";
const MAX_ACADEMY_ACCOUNTS = 3;
const LOCAL_ONLY_ACADEMY_KEYS = ["players", "attendance", "payments", "expenses", "matches", "badges"];
const DEFAULT_ATTENDANCE_PAYMENT = 500;
const RENEWAL_PERIOD_DAYS = 29;
const footballPositionOptions = [
  { value: "حارس", label: "حارس" },
  { value: "مدافع", label: "مدافع" },
  { value: "وسط", label: "وسط" },
  { value: "مهاجم", label: "مهاجم" },
];
const ageGroupPresets = [
  { key: "hope", name: "الأمل", years: "2014-now", from: 2014, to: new Date().getFullYear() },
  { key: "buds", name: "البراعم", years: "2012-2013", from: 2012, to: 2013 },
  { key: "cubs", name: "الأشبال", years: "2010-2011", from: 2010, to: 2011 },
  { key: "juniors", name: "الناشئين", years: "2008-2009", from: 2008, to: 2009 },
  { key: "youth", name: "الشباب", years: "2006-2007", from: 2006, to: 2007 },
];
const trainingDayOptions = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

function normalizePhone(value = "") {
  const raw = String(value).trim().replace(/\s+/g, "");
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("00")) return `+${raw.slice(2)}`;
  if (raw.startsWith("967")) return `+${raw}`;
  if (raw.startsWith("0")) return `+967${raw.slice(1)}`;
  if (raw.startsWith("7")) return `+967${raw}`;
  return raw;
}

function normalizeText(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function isSuperAdminSession(session) {
  return session?.role === ROLE_SUPER_ADMIN && normalizePhone(session?.phone) === SUPER_ADMIN_PHONE;
}

function accountCountForAcademy(users = [], academyId = "") {
  return users.filter((user) => user.academyId === academyId && user.status !== "معطل").length;
}

async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fileToDataUrl(file) {
  if (!file || !file.size) return "";
  const fallback = () => readFileAsDataUrl(file);

  if (!file.type?.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return fallback();
  }

  let objectUrl = "";
  try {
    objectUrl = URL.createObjectURL(file);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });
    const sourceWidth = image.naturalWidth || image.width || 1;
    const sourceHeight = image.naturalHeight || image.height || 1;
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return fallback();

    context.drawImage(image, 0, 0, width, height);
    let compressed = canvas.toDataURL("image/webp", 0.78);
    if (!compressed.startsWith("data:image/webp")) {
      compressed = canvas.toDataURL("image/jpeg", 0.82);
    }

    return compressed.length < file.size * 1.45 ? compressed : fallback();
  } catch {
    return fallback();
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function imageFileFromForm(form, name) {
  return form.getAll(name).find((file) => file && file.size) || null;
}

function mergeRegistrationRequests(remoteRequests, localRequests = []) {
  const localByPhone = new Map(
    localRequests
      .filter((request) => request.phone || request.contact)
      .map((request) => [normalizePhone(request.phone || request.contact), request]),
  );
  const remotePhones = new Set(remoteRequests.map((request) => normalizePhone(request.phone || request.contact)));
  const mergedRemote = remoteRequests.map((request) => {
    const localRequest = localByPhone.get(normalizePhone(request.phone || request.contact));
    return {
      ...request,
      academyId: request.academyId || localRequest?.academyId || makeAcademyId(request.phone || localRequest?.phone || request.contact, request.id),
      passwordHash: request.passwordHash || localRequest?.passwordHash || "",
      phone: request.phone || localRequest?.phone || request.contact,
    };
  });
  const localOnly = localRequests.filter((request) => !remotePhones.has(normalizePhone(request.phone || request.contact)));

  return [...mergedRemote, ...localOnly];
}

async function syncMissingRemoteRegistrationRequests(remoteRequests = [], localRequests = []) {
  const remotePhones = new Set(remoteRequests.map((request) => normalizePhone(request.phone || request.contact)));
  const localRequestsToSync = localRequests.filter((request) => {
    const phone = normalizePhone(request.phone || request.contact);
    return phone && request.passwordHash && !remotePhones.has(phone) && request.status !== STATUS_REJECTED;
  });

  if (!localRequestsToSync.length) return remoteRequests;

  const syncedRequests = [];
  for (const request of localRequestsToSync) {
    try {
      const remoteRequest = await createRegistrationRequest({
        ...request,
        phone: normalizePhone(request.phone || request.contact),
        contact: normalizePhone(request.phone || request.contact),
        academyId: requestAcademyId(request),
      });

      if (remoteRequest) {
        syncedRequests.push({
          ...remoteRequest,
          academyId: remoteRequest.academyId || requestAcademyId(request),
          passwordHash: remoteRequest.passwordHash || request.passwordHash,
          status: remoteRequest.status || request.status,
        });
      }
    } catch {
      // The local request stays available and can be synced on the next visit.
    }
  }

  return [...syncedRequests, ...remoteRequests];
}

function mergePlatformUsers(remoteUsers = [], localUsers = []) {
  const usersByPhone = new Map();

  localUsers.forEach((user) => {
    const phone = normalizePhone(user.phone);
    if (phone) usersByPhone.set(phone, { ...user, phone });
  });

  remoteUsers.forEach((user) => {
    const phone = normalizePhone(user.phone);
    if (!phone) return;
    const localUser = usersByPhone.get(phone);
    usersByPhone.set(phone, {
      ...localUser,
      ...user,
      phone,
      passwordHash: user.passwordHash || localUser?.passwordHash || "",
    });
  });

  return Array.from(usersByPhone.values());
}

async function syncMissingRemotePlatformAccounts(remoteUsers = [], localUsers = []) {
  const remotePhones = new Set(remoteUsers.map((user) => normalizePhone(user.phone)));
  const localUsersToSync = localUsers.filter((user) => {
    const phone = normalizePhone(user.phone);
    return phone && user.passwordHash && user.academyId && !remotePhones.has(phone) && user.status !== "معطل";
  });

  if (!localUsersToSync.length) return remoteUsers;

  const syncedUsers = [];
  for (const user of localUsersToSync) {
    try {
      const remoteUser = await upsertPlatformAccount({ ...user, phone: normalizePhone(user.phone) });
      if (remoteUser) syncedUsers.push(remoteUser);
    } catch {
      // Local accounts stay available and can be synced on the next visit.
    }
  }

  return [...syncedUsers, ...remoteUsers];
}

const seedData = {
  coach: {
    name: "",
    birthDate: "",
    phone: "",
    nationality: "",
    bio: "",
    photo: "",
  },
  coaches: [],
  academy: {
    name: "",
    nameEn: "",
    field: "",
    location: "",
    logo: "",
    plan: "",
    ownerPhone: "",
    gpsLocation: "",
    renewalLastAt: today,
    renewalExpiresAt: addDays(today, RENEWAL_PERIOD_DAYS),
    renewalStartedAtIso: new Date().toISOString(),
    renewalExpiresAtIso: addDaysIso(new Date(), RENEWAL_PERIOD_DAYS),
  },
  users: [],
  ageGroups: [],
  teams: [],
  players: [],
  attendance: [],
  payments: [],
  expenses: [],
  matches: [],
  badges: [],
  notifications: [],
  posts: [],
  registrationRequests: [],
  cloudSummary: {},
};

const platformSeedData = {
  users: [],
  registrationRequests: [],
};

function makeAcademyId(phone, fallback = "") {
  const digits = normalizePhone(phone).replace(/\D/g, "");
  return `academy-${digits || fallback || "new"}`;
}

function requestAcademyId(request) {
  return request?.academyId || makeAcademyId(request?.phone || request?.contact, request?.id);
}

function accountFromApprovedRequest(request) {
  if (!request || request.status !== STATUS_APPROVED || !request.passwordHash) return null;
  const phone = normalizePhone(request.phone || request.contact);
  if (!phone) return null;

  return {
    id: `user-${request.id}`,
    name: request.ownerName,
    phone,
    role: ROLE_OWNER,
    academyId: requestAcademyId(request),
    academyName: request.academyName,
    passwordHash: request.passwordHash,
    passwordStatus: request.passwordStatus || "مشفرة",
    passwordUpdatedAt: request.passwordUpdatedAt || today,
    permissions: PERMISSION_FULL,
    status: "نشط",
  };
}

function accountFromAcademyCloudUser(user, academyData, academyId) {
  if (!user?.phone || !user?.passwordHash || user.status === "معطل") return null;

  return {
    id: user.id || `cloud-user-${academyId}-${normalizePhone(user.phone).replace(/\D/g, "")}`,
    name: user.name,
    phone: normalizePhone(user.phone),
    role: user.role || ROLE_COACH,
    academyId,
    academyName: user.academyName || academyData.academy?.name || "الأكاديمية",
    academyNameEn: user.academyNameEn || academyData.academy?.nameEn || "",
    academyLogo: user.academyLogo || academyData.academy?.logo || "",
    permissions: user.permissions || PERMISSION_ATTENDANCE_PLAYERS,
    passwordHash: user.passwordHash,
    status: user.status || "نشط",
  };
}

function accountFromAcademyCloudCoach(coach, academyData, academyId) {
  if (!coach?.phone || !coach?.passwordHash || coach.status === "معطل") return null;

  return {
    id: coach.id || `cloud-coach-${academyId}-${normalizePhone(coach.phone).replace(/\D/g, "")}`,
    name: coach.name,
    phone: normalizePhone(coach.phone),
    role: coach.role || ROLE_COACH,
    academyId,
    academyName: academyData.academy?.name || "الأكاديمية",
    academyNameEn: academyData.academy?.nameEn || "",
    academyLogo: academyData.academy?.logo || "",
    permissions: coach.permissions || PERMISSION_ATTENDANCE_PLAYERS,
    passwordHash: coach.passwordHash,
    status: coach.status || "نشط",
  };
}

function generateTemporaryPassword() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const numericPart = Array.from(bytes)
    .map((byte) => String(byte % 10))
    .join("");
  return `QZ-${numericPart}`;
}

function normalizeAcademyData(value = {}, account = {}) {
  return {
    ...seedData,
    ...value,
    coach: {
      ...seedData.coach,
      ...(value.coach || {}),
      name: value.coach?.name || account.name || seedData.coach.name,
      phone: value.coach?.phone || account.phone || seedData.coach.phone,
    },
    academy: {
      ...seedData.academy,
      ...(value.academy || {}),
      name: value.academy?.name || account.academyName || seedData.academy.name,
      nameEn: value.academy?.nameEn || account.academyNameEn || seedData.academy.nameEn,
      ownerPhone: value.academy?.ownerPhone || account.phone || seedData.academy.ownerPhone,
      logo: value.academy?.logo || account.academyLogo || seedData.academy.logo,
    },
    coaches: Array.isArray(value.coaches) ? value.coaches : [],
    users: Array.isArray(value.users) ? value.users : [],
    ageGroups: Array.isArray(value.ageGroups) ? value.ageGroups : [],
    teams: Array.isArray(value.teams) ? value.teams : [],
    players: Array.isArray(value.players) ? value.players : [],
    attendance: Array.isArray(value.attendance) ? value.attendance : [],
    payments: Array.isArray(value.payments) ? value.payments : [],
    expenses: Array.isArray(value.expenses) ? value.expenses : [],
    matches: Array.isArray(value.matches) ? value.matches : [],
    badges: Array.isArray(value.badges) ? value.badges : [],
    notifications: Array.isArray(value.notifications) ? value.notifications : [],
    posts: Array.isArray(value.posts) ? value.posts : [],
    registrationRequests: [],
    cloudSummary: value.cloudSummary || {},
  };
}

function buildAcademyCloudSummary(value = {}) {
  const data = normalizeAcademyData(value);
  const hasLocalPlayerDetails = data.players.length || data.payments.length || data.attendance.length || data.expenses.length;
  if (!hasLocalPlayerDetails && data.cloudSummary?.dataMode) {
    return {
      ...data.cloudSummary,
      updatedAt: data.cloudSummary.updatedAt || new Date().toISOString(),
    };
  }

  const paidByPlayer = data.payments.reduce((map, payment) => {
    map[payment.playerId] = (map[payment.playerId] || 0) + Number(payment.amount || 0);
    return map;
  }, {});
  const activePlayers = data.players.filter((player) => player.status !== "منقطع");
  const expectedRevenue = data.players.reduce((sum, player) => sum + Number(player.monthlyFee || 0), 0);
  const collectedRevenue = data.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalExpenses = data.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const remainingRevenue = data.players.reduce((sum, player) => {
    const due = Number(player.monthlyFee || 0);
    const paid = paidByPlayer[player.id] || 0;
    return sum + Math.max(due - paid, 0);
  }, 0);
  const sortedPaymentDates = data.payments.map((payment) => payment.date).filter(Boolean).sort();

  return {
    dataMode: "local-player-details",
    updatedAt: new Date().toISOString(),
    playersCount: data.players.length,
    activePlayers: activePlayers.length,
    stoppedPlayers: data.players.length - activePlayers.length,
    freePlayers: data.players.filter((player) => Number(player.monthlyFee || 0) === 0 || player.subscriptionType === "مجاني").length,
    teamsCount: data.teams.length,
    ageGroupsCount: data.ageGroups.length,
    coachesCount: (data.coaches || []).length + (data.coach?.name || data.coach?.phone ? 1 : 0),
    expectedRevenue,
    collectedRevenue,
    totalExpenses,
    netRevenue: collectedRevenue - totalExpenses,
    remainingRevenue,
    paymentsCount: data.payments.length,
    expensesCount: data.expenses.length,
    attendanceCount: data.attendance.length,
    presentCount: data.attendance.filter((row) => row.status === "حاضر").length,
    lateCount: data.attendance.filter((row) => row.status === "متأخر").length,
    absentCount: data.attendance.filter((row) => row.status === "غائب").length,
    lastPaymentDate: sortedPaymentDates[sortedPaymentDates.length - 1] || "",
  };
}

function toCloudAcademyData(value = {}, account = {}) {
  const data = normalizeAcademyData(value, account);
  const cloudData = {
    ...data,
    cloudSummary: buildAcademyCloudSummary(data),
  };

  LOCAL_ONLY_ACADEMY_KEYS.forEach((key) => {
    cloudData[key] = [];
  });

  return cloudData;
}

function mergeAcademyLocalAndRemote(localValue = {}, remoteValue = {}, account = {}) {
  const localData = normalizeAcademyData(localValue, account);
  const remoteData = normalizeAcademyData(remoteValue, account);
  const merged = {
    ...localData,
    ...remoteData,
    coach: {
      ...localData.coach,
      ...remoteData.coach,
    },
    academy: {
      ...localData.academy,
      ...remoteData.academy,
    },
  };

  LOCAL_ONLY_ACADEMY_KEYS.forEach((key) => {
    const localRows = Array.isArray(localData[key]) ? localData[key] : [];
    const legacyRemoteRows = Array.isArray(remoteData[key]) ? remoteData[key] : [];
    merged[key] = localRows.length ? localRows : legacyRemoteRows;
  });

  return normalizeAcademyData(merged, account);
}

function hasAcademyContent(value = {}) {
  return Boolean(
    value.coach?.name ||
      value.academy?.name ||
      value.academy?.logo ||
      value.ageGroups?.length ||
      value.teams?.length ||
      value.players?.length ||
      value.attendance?.length ||
      value.payments?.length ||
      value.expenses?.length ||
      value.coaches?.length ||
      value.users?.length ||
      value.cloudSummary?.playersCount,
  );
}

function getUserPermission(session) {
  if (!session) return PERMISSION_READ_ONLY;
  if (isSuperAdminSession(session) || session.role === ROLE_OWNER) return PERMISSION_FULL;
  return session.permissions || PERMISSION_ATTENDANCE_PLAYERS;
}

function canAccessView(viewId, session) {
  if (!session?.verified) return false;
  if (isSuperAdminSession(session)) return true;
  if (viewId === "accountProfile") return true;
  if (viewId === "platformDashboard" || viewId === "platformReports") return false;

  const permission = getUserPermission(session);
  if (permission === PERMISSION_FULL) return true;

  const attendanceAndPlayers = new Set(["home", "players", "playerProfile", "attendance", "teamProfile", "reports"]);
  const teamFollow = new Set(["home", "teamProfile", "players", "playerProfile", "attendance", "reports"]);
  const readOnly = new Set(["home", "teamProfile", "playerProfile", "reports"]);

  if (permission === PERMISSION_ATTENDANCE_PLAYERS) return attendanceAndPlayers.has(viewId);
  if (permission === PERMISSION_TEAM_FOLLOW) return teamFollow.has(viewId);
  if (permission === PERMISSION_READ_ONLY) return readOnly.has(viewId);

  return viewId === "home";
}

const navItems = [
  { id: "platformDashboard", label: "لوحة المنصة", icon: ClipboardCheck },
  { id: "platformReports", label: "تقارير الأكاديميات", icon: ClipboardList },
  { id: "home", label: "الرئيسية", icon: Activity },
  { id: "coachSetup", label: "إعداد المدرب", icon: UserRound },
  { id: "coaches", label: "إدارة المدربين", icon: Users },
  { id: "settings", label: "إعدادات الأكاديمية", icon: Settings },
  { id: "ageGroups", label: "إدارة الفئات العمرية", icon: Layers },
  { id: "teams", label: "إدارة الفرق", icon: ShieldCheck },
  { id: "players", label: "إدارة اللاعبين", icon: Users },
  { id: "attendance", label: "التحضير", icon: CalendarCheck },
  { id: "playerProfile", label: "ملف اللاعب", icon: UserCircle },
  { id: "teamProfile", label: "ملف الفريق", icon: Trophy },
  { id: "reports", label: "التقارير المالية", icon: Wallet },
  { id: "accountProfile", label: "الملف الشخصي", icon: UserCircle },
  { id: "notifications", label: "التنبيهات", icon: Bell },
];
const setupNavIds = new Set(["coachSetup", "coaches", "settings", "ageGroups", "teams", "accountProfile"]);

const pageGuides = {
  platformDashboard: {
    title: "لوحة التحكم",
    text: "راجع الحسابات والطلبات، ثم وافق أو عطّل المستخدمين من نفس المكان.",
    primaryView: "platformReports",
    primaryLabel: "تقارير الأكاديميات",
  },
  platformReports: {
    title: "التقارير العامة",
    text: "ملخص سريع للأكاديميات والمدربين واللاعبين والتحصيل المالي.",
    primaryView: "platformDashboard",
    primaryLabel: "الحسابات",
  },
  home: {
    title: "الرئيسية",
    text: "ابدأ من إضافة لاعب، التحضير، أو مراجعة الوضع المالي. البحث والفلاتر هنا تعمل مباشرة.",
    primaryView: "players",
    primaryLabel: "إضافة لاعب",
    secondaryView: "attendance",
    secondaryLabel: "التحضير",
  },
  players: {
    title: "إدارة اللاعبين",
    text: "ابحث، صف حسب الفئة، أضف لاعبًا، ثم افتح ملفه بضغطة واحدة من البطاقة.",
    primaryView: "attendance",
    primaryLabel: "التحضير",
    secondaryView: "playerProfile",
    secondaryLabel: "ملف اللاعب",
  },
  attendance: {
    title: "التحضير",
    text: "اختر التاريخ والفئة. الحضور أو التأخر يفتح الدفع، والغياب يحفظ مباشرة.",
    primaryView: "reports",
    primaryLabel: "التقارير",
    secondaryView: "players",
    secondaryLabel: "اللاعبون",
  },
  playerProfile: {
    title: "ملف اللاعب",
    text: "عدّل البيانات، راجع الحضور والمدفوعات، واحفظ بطاقة اللاعب أو شاركها.",
    primaryView: "players",
    primaryLabel: "إدارة اللاعبين",
    secondaryView: "reports",
    secondaryLabel: "المالية",
  },
  teamProfile: {
    title: "ملف الفريق",
    text: "تابع لاعبي الفريق وبياناته المختصرة من صفحة واحدة.",
    primaryView: "players",
    primaryLabel: "اللاعبون",
  },
  reports: {
    title: "التقارير المالية",
    text: "راجع التحصيل والمصروفات والمتأخرات، ثم اطبع التقارير عند الحاجة.",
    primaryView: "attendance",
    primaryLabel: "التحضير",
    secondaryView: "players",
    secondaryLabel: "اللاعبون",
  },
  notifications: {
    title: "التنبيهات",
    text: "تابع الحالات التي تحتاج إجراء، ثم ارجع للصفحة المناسبة للمعالجة.",
    primaryView: "reports",
    primaryLabel: "التقارير",
  },
  accountProfile: {
    title: "الملف الشخصي",
    text: "حدّث صورتك واسمك وكلمة السر، ثم ارجع للقائمة الرئيسية.",
    primaryView: "home",
    primaryLabel: "الرئيسية",
  },
};

function useLocalState(key, initialValue) {
  const [value, setValue] = useState(() => readLocalData(key, initialValue));

  const update = (nextValue) => {
    const resolved = typeof nextValue === "function" ? nextValue(value) : nextValue;
    setValue(resolved);
    writeLocalData(key, resolved);
  };

  return [value, update];
}

function readAppLocalSnapshot() {
  if (typeof localStorage === "undefined") return {};

  return Object.fromEntries(
    Object.keys(localStorage)
      .filter((key) => key.startsWith("acdme-"))
      .map((key) => [key, readLocalData(key, null)]),
  );
}

function restoreAppLocalSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") return;

  Object.entries(snapshot).forEach(([key, value]) => {
    if (key.startsWith("acdme-")) {
      writeLocalData(key, value);
    }
  });
}

function currency(value) {
  return new Intl.NumberFormat("ar-YE").format(Number(value || 0)) + " ريال";
}

function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (character) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[character]
  ));
}

function reportTable(title, headers, rows, emptyText = "لا توجد بيانات مطابقة لهذا التقرير.") {
  const tableRows = rows.length
    ? rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")
    : `<tr><td colspan="${headers.length}" class="empty-cell">${escapeHtml(emptyText)}</td></tr>`;

  return `
    <section class="report-section">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>
  `;
}

function buildPrintReportHtml({ title, subtitle, academyName, logo, cards = [], sections = [], note = "" }) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f4f6fb;
        color: #151b2d;
        font-family: Tahoma, Arial, sans-serif;
        direction: rtl;
      }
      .report-page {
        width: 100%;
        max-width: 980px;
        margin: 0 auto;
        padding: 18px;
      }
      .report-hero {
        min-height: 128px;
        border-radius: 22px;
        background: linear-gradient(135deg, #101947, #17207c 62%, #15644a);
        color: #fff;
        padding: 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
      }
      .report-hero span, .report-hero p {
        color: rgba(255, 255, 255, 0.76);
        font-size: 12px;
        font-weight: 800;
      }
      .report-hero h1 {
        margin: 7px 0;
        font-size: 26px;
        line-height: 1.35;
      }
      .report-logo {
        width: 72px;
        height: 72px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.3);
        display: grid;
        place-items: center;
        overflow: hidden;
        color: #ffd75f;
        font-weight: 900;
        flex: 0 0 auto;
      }
      .report-logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .report-cards {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin: 14px 0;
      }
      .report-card {
        border: 1px solid #e7ebf2;
        border-radius: 16px;
        background: #fff;
        padding: 13px;
        display: grid;
        gap: 5px;
      }
      .report-card span {
        color: #6b7280;
        font-size: 11px;
        font-weight: 800;
      }
      .report-card strong {
        color: #111a79;
        font-size: 17px;
        line-height: 1.35;
      }
      .report-section {
        border: 1px solid #e7ebf2;
        border-radius: 18px;
        background: #fff;
        padding: 14px;
        margin-top: 12px;
        page-break-inside: avoid;
      }
      .report-section h2 {
        color: #111a4f;
        font-size: 17px;
        margin: 0 0 10px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
        border-radius: 13px;
        font-size: 11px;
      }
      th {
        background: #111a79;
        color: #fff;
        padding: 9px 7px;
        text-align: right;
        white-space: nowrap;
      }
      td {
        border-bottom: 1px solid #eef1f5;
        padding: 8px 7px;
        color: #25304a;
        vertical-align: top;
      }
      tbody tr:nth-child(even) td {
        background: #f8fafb;
      }
      .empty-cell {
        text-align: center;
        color: #6b7280;
        padding: 18px;
      }
      .report-note {
        border-radius: 14px;
        background: #fff8dc;
        color: #735100;
        padding: 12px 14px;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.7;
        margin-top: 12px;
      }
      .report-footer {
        margin-top: 16px;
        color: #6b7280;
        text-align: center;
        font-size: 11px;
      }
      @media print {
        body { background: #fff; }
        .report-page { max-width: none; padding: 0; }
        .report-section, .report-card { box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <main class="report-page">
      <header class="report-hero">
        <div>
          <span>${escapeHtml(academyName || "الأكاديمية الرياضية")}</span>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="report-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="" />` : "PDF"}</div>
      </header>
      <section class="report-cards">
        ${cards.map((card) => `
          <article class="report-card">
            <span>${escapeHtml(card.label)}</span>
            <strong>${escapeHtml(card.value)}</strong>
          </article>
        `).join("")}
      </section>
      ${sections.join("")}
      ${note ? `<div class="report-note">${escapeHtml(note)}</div>` : ""}
      <footer class="report-footer">تم إنشاء التقرير من منصة إدارة الأكاديمية - ${escapeHtml(new Date().toLocaleDateString("ar-YE"))}</footer>
    </main>
  </body>
</html>`;
}

function printReportHtml(html) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.inset = "auto 0 0 auto";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    frame.remove();
    return false;
  }

  printDocument.open();
  printDocument.write(html);
  printDocument.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => frame.remove(), 1200);
  }, 450);
  return true;
}

async function gzipText(text) {
  if (!("CompressionStream" in window)) {
    return new Blob([text], { type: "application/json" });
  }

  const stream = new Blob([text], { type: "application/json" }).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

async function readBackupText(file) {
  if (!file) return "";
  if ("DecompressionStream" in window && (file.name.endsWith(".gz") || file.type.includes("gzip"))) {
    const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  return file.text();
}

async function sha256Text(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyBackupBlob(blob, filename) {
  try {
    const text = await readBackupText(new File([blob], filename, { type: blob.type || "application/gzip" }));
    const backup = JSON.parse(text);
    if (!backup.data || !backup.appState || backup.backupType !== "full-app") {
      return { ok: false, message: "تم إيقاف الحفظ: محتوى النسخة الاحتياطية غير مكتمل." };
    }
    if (backup.security?.checksum) {
      const { security, ...coreBackupPayload } = backup;
      const checksum = await sha256Text(JSON.stringify(coreBackupPayload));
      if (checksum !== backup.security.checksum) {
        return { ok: false, message: "تم إيقاف الحفظ: بصمة النسخة الاحتياطية غير مطابقة." };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "تم إيقاف الحفظ: تعذر اختبار ملف النسخة الاحتياطية قبل الحفظ." };
  }
}

async function saveBlobFile(blob, filename, description = "ملف") {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description,
            accept: {
              [blob.type || "application/octet-stream"]: [`.${filename.split(".").pop()}`],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { ok: true, method: "picker", filename: handle.name || filename, location: "المسار الذي اخترته من نافذة الحفظ" };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { ok: false, cancelled: true, filename };
      }
    }
  }

  downloadBlob(blob, filename);
  return { ok: true, method: "download", filename, location: "مجلد التنزيلات في الجهاز أو المسار الافتراضي للمتصفح" };
}

async function saveGeneratedBlobFile(filename, description, createBlob, verifyBlob) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description,
            accept: {
              "application/gzip": [".gz"],
              "application/json": [".json"],
            },
          },
        ],
      });
      const blob = await createBlob();
      if (verifyBlob) {
        const verification = await verifyBlob(blob, filename);
        if (!verification.ok) return verification;
      }
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { ok: true, method: "picker", filename: handle.name || filename, location: "المسار الذي اخترته قبل إنشاء النسخة" };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { ok: false, cancelled: true, filename };
      }
      return { ok: false, message: "تعذر حفظ الملف في المسار المختار." };
    }
  }

  const blob = await createBlob();
  if (verifyBlob) {
    const verification = await verifyBlob(blob, filename);
    if (!verification.ok) return verification;
  }
  downloadBlob(blob, filename);
  return { ok: true, method: "download", filename, location: "مجلد التنزيلات في الجهاز أو المسار الافتراضي للمتصفح" };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyInlineStyles(source, target) {
  const computed = window.getComputedStyle(source);
  target.setAttribute("style", Array.from(computed).map((key) => `${key}:${computed.getPropertyValue(key)};`).join(""));

  Array.from(source.children).forEach((child, index) => {
    if (target.children[index]) {
      applyInlineStyles(child, target.children[index]);
    }
  });
}

async function elementToPngBlob(element, scale = 2) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  if (!width || !height) return null;

  const clone = element.cloneNode(true);
  applyInlineStyles(element, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">${serialized}</foreignObject>
    </svg>
  `;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function ageFromDate(date) {
  if (!date) return "-";
  const birth = new Date(date);
  const diff = Date.now() - birth.getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

function addDays(date, days) {
  const parsedDate = new Date(`${date || currentDateKey()}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return currentDateKey();
  parsedDate.setDate(parsedDate.getDate() + days);
  return parsedDate.toISOString().slice(0, 10);
}

function addDaysIso(date = new Date(), days = 0) {
  const parsedDate = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return new Date().toISOString();
  parsedDate.setDate(parsedDate.getDate() + days);
  return parsedDate.toISOString();
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate || today}T00:00:00`);
  const end = new Date(`${endDate || today}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function academyRenewalInfo(academy = {}, localTimer = {}) {
  const now = new Date();
  const lastRenewedAt = localTimer.renewalLastAt || academy.renewalLastAt || currentDateKey();
  const expiresAt = localTimer.renewalExpiresAt || academy.renewalExpiresAt || addDays(lastRenewedAt, RENEWAL_PERIOD_DAYS);
  const expiresAtMs =
    Date.parse(localTimer.renewalExpiresAtIso || "") ||
    Date.parse(`${expiresAt}T23:59:59`);
  const remainingMs = Number.isFinite(expiresAtMs) ? expiresAtMs - now.getTime() : 0;
  const remainingDays = Math.ceil(remainingMs / 86400000);
  return {
    lastRenewedAt,
    expiresAt,
    remainingDays: Math.max(remainingDays, 0),
    isExpired: remainingMs <= 0,
  };
}

function comparePlayersBySortMode(firstPlayer, secondPlayer, sortMode) {
  if (sortMode === "name") {
    return String(firstPlayer.name || "").localeCompare(String(secondPlayer.name || ""), "ar");
  }

  const firstBirth = firstPlayer.birthDate ? new Date(`${firstPlayer.birthDate}T00:00:00`).getTime() : Number.NaN;
  const secondBirth = secondPlayer.birthDate ? new Date(`${secondPlayer.birthDate}T00:00:00`).getTime() : Number.NaN;
  const firstHasBirth = Number.isFinite(firstBirth);
  const secondHasBirth = Number.isFinite(secondBirth);

  if (firstHasBirth && secondHasBirth && firstBirth !== secondBirth) {
    return secondBirth - firstBirth;
  }

  if (firstHasBirth !== secondHasBirth) return firstHasBirth ? -1 : 1;
  return String(firstPlayer.name || "").localeCompare(String(secondPlayer.name || ""), "ar");
}

function SortModeButton({ sortMode, onToggle }) {
  return (
    <button
      className="list-sort-toggle"
      type="button"
      onClick={onToggle}
      aria-label={sortMode === "age" ? "الترتيب من الأصغر إلى الأكبر" : "الترتيب الأبجدي"}
      title={sortMode === "age" ? "الأصغر للأكبر" : "أبجدي"}
    >
      <ArrowDownAZ size={17} />
      <span>{sortMode === "age" ? "العمر" : "أبجدي"}</span>
    </button>
  );
}

function exactAgeFromDate(date) {
  if (!date) return "";
  const birth = new Date(`${date}T00:00:00`);
  const now = new Date();
  if (Number.isNaN(birth.getTime()) || birth > now) return "";

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return `${years} سنة، ${months} شهر، ${days} يوم`;
}

function ageGroupPresetFromBirthDate(date) {
  if (!date) return null;
  const birthYear = new Date(`${date}T00:00:00`).getFullYear();
  if (!Number.isFinite(birthYear)) return null;
  return ageGroupPresets.find((preset) => birthYear >= preset.from && birthYear <= preset.to) || null;
}

function readableDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("ar-YE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function weekdayFromDate(date) {
  if (!date) return "";
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return "";
  return ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][parsedDate.getDay()];
}

function normalizeManualDate(value = "") {
  const cleaned = String(value).trim().replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  const parts = cleaned.split(/[/-]/).filter(Boolean);
  if (parts.length === 3) {
    const [first, second, third] = parts;
    if (first.length === 4) return `${first.padStart(4, "0")}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`;
    return `${third.padStart(4, "0")}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 8) {
    const startsWithYear = Number(digits.slice(0, 4)) > 1900;
    return startsWithYear
      ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
      : `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  }

  return "";
}

function trainingDaysForGroup(group) {
  return trainingDayOptions.filter((day) => (group?.days || "").includes(day));
}

function positionListFromValue(value = "") {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/[،,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function positionTextFromForm(form) {
  return form.getAll("position").filter(Boolean).join("، ");
}

function BirthDateFields({ value, onChange, required = false }) {
  const [manualValue, setManualValue] = useState(value || "");

  useEffect(() => {
    setManualValue(value || "");
  }, [value]);

  const updateManualDate = (event) => {
    const normalized = normalizeManualDate(event.target.value);
    if (normalized) {
      setManualValue(normalized);
      onChange(normalized);
    }
  };
  const updateCalendarDate = (nextValue) => {
    setManualValue(nextValue);
    onChange(nextValue);
  };

  return (
    <div className="birth-date-fields">
      <input name="birthDate" type="hidden" value={value || ""} />
      <div className="field-with-icon">
        <CalendarCheck size={17} />
        <input
          type="date"
          value={value || ""}
          onChange={(event) => updateCalendarDate(event.target.value)}
          required={required}
        />
      </div>
      <input
        dir="ltr"
        inputMode="numeric"
        placeholder="اكتب التاريخ: 20052012"
        value={manualValue}
        onChange={(event) => setManualValue(event.target.value)}
        onBlur={updateManualDate}
      />
    </div>
  );
}

function App() {
  const [activeView, setActiveView] = useLocalState("acdme-active-view-v1", "platformDashboard");
  const [session, setSession] = useLocalState("acdme-session-v5", null);
  const [onboardingState, setOnboardingState] = useLocalState("acdme-onboarding-v4", {});
  const [platformData, setPlatformData] = useLocalState("acdme-platform-data-v1", platformSeedData);
  const [academyDataById, setAcademyDataById] = useLocalState("acdme-academy-data-by-id-v1", {});
  const [renewalTimers, setRenewalTimers] = useLocalState("acdme-renewal-timers-v1", {});
  const [themeMode, setThemeMode] = useLocalState("acdme-theme-v1", "light");
  const [cloudSyncState, setCloudSyncState] = useState({ academyId: "", loaded: false, saving: false, error: "", syncedAt: "" });
  const lastCloudPayloadRef = useRef("");
  const bottomNavRef = useRef(null);
  const [query, setQuery] = useState("");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [onlineSyncTick, setOnlineSyncTick] = useState(0);
  const [renewalClockTick, setRenewalClockTick] = useState(() => Date.now());
  const [lastView, setLastView] = useState("");
  const isSuperAdmin = isSuperAdminSession(session);
  const currentAcademyId = session?.academyId || "";
  const data = useMemo(() => {
    if (!session?.verified || isSuperAdmin || !currentAcademyId) return seedData;
    return normalizeAcademyData(academyDataById[currentAcademyId], session);
  }, [academyDataById, currentAcademyId, isSuperAdmin, session]);
  const setData = (nextValue) => {
    if (!currentAcademyId || isSuperAdmin) return;

    setAcademyDataById((prev) => {
      const currentData = normalizeAcademyData(prev[currentAcademyId], session);
      const resolved = typeof nextValue === "function" ? nextValue(currentData) : nextValue;
      return {
        ...prev,
        [currentAcademyId]: normalizeAcademyData(resolved, session),
      };
    });
  };
  const [selectedPlayerId, setSelectedPlayerId] = useState(data.players[0]?.id);
  const [selectedTeamId, setSelectedTeamId] = useState(data.teams[0]?.id);
  const platformUsers = platformData.users || [];
  const platformRegistrationRequests = platformData.registrationRequests || platformSeedData.registrationRequests;

  useEffect(() => {
    const nextTheme = themeMode === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
    const themeColor = nextTheme === "dark" ? "#071020" : "#111a4f";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  }, [themeMode]);

  const toggleThemeMode = () => {
    setThemeMode((mode) => (mode === "dark" ? "light" : "dark"));
  };

  const navigateToView = (viewId, options = {}) => {
    if (!viewId || viewId === activeView) return;
    if (!options.replace) {
      setLastView(activeView);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    setActiveView(viewId);
  };

  const isPhoneRegisteredAnywhere = (phone, excludedPhone = "") => {
    const normalizedPhone = normalizePhone(phone);
    const normalizedExcluded = normalizePhone(excludedPhone);
    if (!normalizedPhone || normalizedPhone === normalizedExcluded) return false;

    return [
      ...platformUsers,
      ...platformRegistrationRequests,
    ].some((item) => normalizePhone(item?.phone || item?.contact) === normalizedPhone);
  };

  const isAcademyNameTaken = (academyName, excludedAcademyId = "") => {
    const normalizedName = normalizeText(academyName);
    if (!normalizedName) return false;

    const usersMatch = platformUsers.some(
      (user) => user.academyId !== excludedAcademyId && normalizeText(user.academyName) === normalizedName,
    );
    const requestsMatch = platformRegistrationRequests.some(
      (request) =>
        requestAcademyId(request) !== excludedAcademyId &&
        request.status !== STATUS_REJECTED &&
        normalizeText(request.academyName) === normalizedName,
    );

    return usersMatch || requestsMatch;
  };

  useEffect(() => {
    if (!data.players.some((player) => player.id === selectedPlayerId)) {
      setSelectedPlayerId(data.players[0]?.id);
    }

    if (!data.teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(data.teams[0]?.id);
    }
  }, [currentAcademyId, data.players, data.teams, selectedPlayerId, selectedTeamId]);

  const helpers = useMemo(() => {
    const teamById = Object.fromEntries(data.teams.map((team) => [team.id, team]));
    const groupById = Object.fromEntries(data.ageGroups.map((group) => [group.id, group]));
    const playerById = Object.fromEntries(data.players.map((player) => [player.id, player]));
    const paymentsByPlayer = data.payments.reduce((map, payment) => {
      map[payment.playerId] = (map[payment.playerId] || 0) + Number(payment.amount || 0);
      return map;
    }, {});
    return { teamById, groupById, playerById, paymentsByPlayer };
  }, [data]);

  const stats = useMemo(() => {
    const present = data.attendance.filter((row) => row.status === "حاضر").length;
    const late = data.attendance.filter((row) => row.status === "متأخر").length;
    const absent = data.attendance.filter((row) => row.status === "غائب").length;
    const revenue = data.payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expected = data.players.reduce((sum, row) => sum + Number(row.monthlyFee || 0), 0);
    return { present, late, absent, revenue, expected };
  }, [data]);

  const filteredPlayers = data.players.filter((player) => {
    const team = helpers.teamById[player.teamId]?.name || "";
    return `${player.name} ${player.position} ${team}`.toLowerCase().includes(query.toLowerCase());
  });

  const registrationRequests = platformRegistrationRequests;

  useEffect(() => {
    const renewalTimer = window.setInterval(() => {
      setRenewalClockTick(Date.now());
    }, 30000);

    return () => window.clearInterval(renewalTimer);
  }, []);

  useEffect(() => {
    if (!session?.verified || isSuperAdmin || !currentAcademyId) return;

    const localTimer = renewalTimers[currentAcademyId];
    if (localTimer?.renewalExpiresAt) return;

    const rawAcademy = academyDataById[currentAcademyId]?.academy || {};
    const renewalLastAt = rawAcademy.renewalLastAt || currentDateKey();
    const renewalExpiresAt = rawAcademy.renewalExpiresAt || addDays(renewalLastAt, RENEWAL_PERIOD_DAYS);
    const renewalExpiresAtIso = rawAcademy.renewalExpiresAtIso || addDaysIso(new Date(`${renewalLastAt}T00:00:00`), RENEWAL_PERIOD_DAYS);

    setRenewalTimers((prev) => ({
      ...prev,
      [currentAcademyId]: {
        renewalLastAt,
        renewalExpiresAt,
        renewalExpiresAtIso,
        createdAt: new Date().toISOString(),
      },
    }));

    if (!rawAcademy.renewalLastAt || !rawAcademy.renewalExpiresAt) {
      setAcademyDataById((prev) => {
        const currentData = normalizeAcademyData(prev[currentAcademyId], session);
        return {
          ...prev,
          [currentAcademyId]: {
            ...currentData,
            academy: {
              ...currentData.academy,
              renewalLastAt,
              renewalExpiresAt,
              renewalExpiresAtIso,
            },
          },
        };
      });
    }
  }, [academyDataById, currentAcademyId, isSuperAdmin, renewalTimers, session?.verified]);

  useEffect(() => {
    const updateConnectionState = () => {
      const nextOnline = typeof navigator === "undefined" ? true : navigator.onLine;
      setIsOnline(nextOnline);
      if (nextOnline) {
        setOnlineSyncTick((value) => value + 1);
      }
    };

    window.addEventListener("online", updateConnectionState);
    window.addEventListener("offline", updateConnectionState);
    updateConnectionState();

    return () => {
      window.removeEventListener("online", updateConnectionState);
      window.removeEventListener("offline", updateConnectionState);
    };
  }, []);

  const refreshPlatformUsers = async () => {
    try {
      const accounts = await listPlatformAccounts();
      if (Array.isArray(accounts)) {
        const remoteUsers = await syncMissingRemotePlatformAccounts(accounts, platformUsers || []);
        const mergedUsers = mergePlatformUsers(remoteUsers, platformUsers || []);
        setPlatformData((prev) => ({
          ...prev,
          users: mergePlatformUsers(remoteUsers, prev.users || []),
        }));
        return mergedUsers;
      }
    } catch {
      // The local copy keeps existing sessions usable if the remote account table is not ready yet.
    }

    return platformUsers || [];
  };

  const refreshRegistrationRequests = async () => {
    try {
      const requests = await listRegistrationRequests();
      if (Array.isArray(requests)) {
        const remoteRequests = await syncMissingRemoteRegistrationRequests(requests, platformRegistrationRequests || []);
        const accountsFromRequests = remoteRequests.map(accountFromApprovedRequest).filter(Boolean);
        const syncedAccounts = [];
        for (const account of accountsFromRequests) {
          try {
            const syncedAccount = await upsertPlatformAccount(account);
            if (syncedAccount) syncedAccounts.push(syncedAccount);
          } catch {
            syncedAccounts.push(account);
          }
        }
        const mergedForLogin = mergeRegistrationRequests(remoteRequests, platformRegistrationRequests || []);
        setPlatformData((prev) => ({
          ...prev,
          users: mergePlatformUsers(syncedAccounts, prev.users || []),
          registrationRequests: mergeRegistrationRequests(remoteRequests, prev.registrationRequests || []),
        }));
        return mergedForLogin;
      }
    } catch {
      // Keep the local copy available if the remote table is temporarily unreachable.
    }

    return platformRegistrationRequests || [];
  };

  const syncAcademyPlatformAccounts = async (usersToSync = [], academySnapshot = data) => {
    if (!isOnline || !currentAcademyId || isSuperAdmin) return [];

    const academy = academySnapshot?.academy || data.academy || {};
    const accounts = (usersToSync || [])
      .filter((user) => user.academyId === currentAcademyId && normalizePhone(user.phone))
      .map((user) => ({
        ...user,
        phone: normalizePhone(user.phone),
        academyName: academy.name || user.academyName || session?.academyName || "",
        academyNameEn: academy.nameEn || user.academyNameEn || session?.academyNameEn || "",
        academyLogo: academy.logo || user.academyLogo || session?.academyLogo || "",
      }));

    const syncedAccounts = [];
    for (const account of accounts) {
      try {
        const syncedAccount = await upsertPlatformAccount(account);
        if (syncedAccount) syncedAccounts.push(syncedAccount);
      } catch {
        // Account metadata will sync again on the next automatic or manual sync.
      }
    }

    return syncedAccounts;
  };

  const syncCurrentAcademyNow = async () => {
    if (!currentAcademyId || isSuperAdmin) {
      return { ok: false, message: "المزامنة متاحة داخل حساب الأكاديمية فقط." };
    }

    if (!isOnline) {
      setCloudSyncState((prev) => ({
        ...prev,
        loaded: true,
        saving: false,
        error: "لا يوجد اتصال الآن. بياناتك محفوظة على الهاتف وستُرفع تلقائيًا عند عودة الإنترنت.",
      }));
      return { ok: false, message: "لا يوجد اتصال الآن. سيتم الرفع تلقائيًا عند عودة الإنترنت." };
    }

    const academyData = normalizeAcademyData(academyDataById[currentAcademyId], session);
    const academyPayload = toCloudAcademyData(academyData, session);
    if (!hasAcademyContent(academyPayload)) {
      return { ok: false, message: "أكمل بيانات الأكاديمية أولًا ثم أعد المزامنة." };
    }

    const nextSignature = JSON.stringify(academyPayload);
    setCloudSyncState((prev) => ({ ...prev, academyId: currentAcademyId, loaded: true, saving: true, error: "" }));

    try {
      await upsertRemoteAcademyData(currentAcademyId, academyPayload);
      const remoteCheck = await getRemoteAcademyData(currentAcademyId);
      if (!remoteCheck?.data) {
        throw new Error("تمت محاولة الرفع، لكن لم يتم تأكيد وجود بيانات الأكاديمية في السحابة.");
      }
      const syncedAccounts = await syncAcademyPlatformAccounts(platformData.users || [], academyData);
      if (syncedAccounts.length) {
        setPlatformData((prev) => ({
          ...prev,
          users: mergePlatformUsers(syncedAccounts, prev.users || []),
        }));
      }
      lastCloudPayloadRef.current = nextSignature;
      setCloudSyncState((prev) => ({ ...prev, saving: false, error: "", syncedAt: new Date().toISOString() }));
      return { ok: true, message: "تم رفع البيانات والتحقق من وجودها في السحابة." };
    } catch (error) {
      const message = error.message || "تعذر رفع البيانات الآن. سيتم إعادة المحاولة تلقائيًا.";
      setCloudSyncState((prev) => ({ ...prev, saving: false, error: message }));
      return { ok: false, message };
    }
  };

  const renewAcademyAccess = async () => {
    if (!currentAcademyId || isSuperAdmin) {
      return { ok: false, message: "التجديد متاح داخل حساب الأكاديمية فقط." };
    }

    if (session?.role !== ROLE_OWNER) {
      return { ok: false, message: "يجب التجديد من الحساب الرئيسي للأكاديمية." };
    }

    const renewalStartedAtIso = new Date().toISOString();
    const renewalLastAt = currentDateKey();
    const renewalExpiresAt = addDays(renewalLastAt, RENEWAL_PERIOD_DAYS);
    const renewalExpiresAtIso = addDaysIso(renewalStartedAtIso, RENEWAL_PERIOD_DAYS);
    const nextAcademyData = normalizeAcademyData(
      {
        ...data,
        academy: {
          ...data.academy,
          renewalLastAt,
          renewalExpiresAt,
          renewalStartedAtIso,
          renewalExpiresAtIso,
        },
      },
      session,
    );

    setAcademyDataById((prev) => ({
      ...prev,
      [currentAcademyId]: nextAcademyData,
    }));
    setRenewalTimers((prev) => ({
      ...prev,
      [currentAcademyId]: {
        renewalLastAt,
        renewalExpiresAt,
        renewalStartedAtIso,
        renewalExpiresAtIso,
        renewedAt: new Date().toISOString(),
      },
    }));

    if (isOnline) {
      try {
        await upsertRemoteAcademyData(currentAcademyId, toCloudAcademyData(nextAcademyData, session));
        lastCloudPayloadRef.current = JSON.stringify(toCloudAcademyData(nextAcademyData, session));
        setCloudSyncState((prev) => ({ ...prev, academyId: currentAcademyId, loaded: true, saving: false, error: "", syncedAt: new Date().toISOString() }));
      } catch (error) {
        setCloudSyncState((prev) => ({
          ...prev,
          academyId: currentAcademyId,
          loaded: true,
          saving: false,
          error: error.message || "تم التجديد على هذا الجهاز، وسيُرفع عند عودة الاتصال.",
        }));
      }
    }

    return { ok: true, message: `تم التجديد حتى ${renewalExpiresAt}.` };
  };

  useEffect(() => {
    let isMounted = true;

    if (!isOnline) {
      return () => {
        isMounted = false;
      };
    }

    listPlatformAccounts()
      .then(async (accounts) => {
        if (isMounted && Array.isArray(accounts)) {
          const remoteUsers = await syncMissingRemotePlatformAccounts(accounts, platformUsers || []);
          if (!isMounted) return;

          setPlatformData((prev) => ({
            ...prev,
            users: mergePlatformUsers(remoteUsers, prev.users || []),
          }));
        }
      })
      .catch(() => {
        // The local copy keeps the app usable if the remote account table is not ready yet.
      });

    listRegistrationRequests()
      .then(async (requests) => {
        if (isMounted && Array.isArray(requests)) {
          const remoteRequests = await syncMissingRemoteRegistrationRequests(requests, platformRegistrationRequests || []);
          const accountsFromRequests = remoteRequests.map(accountFromApprovedRequest).filter(Boolean);
          const syncedAccounts = [];
          for (const account of accountsFromRequests) {
            try {
              const syncedAccount = await upsertPlatformAccount(account);
              if (syncedAccount) syncedAccounts.push(syncedAccount);
            } catch {
              syncedAccounts.push(account);
            }
          }
          if (!isMounted) return;

          setPlatformData((prev) => ({
            ...prev,
            users: mergePlatformUsers(syncedAccounts, prev.users || []),
            registrationRequests: mergeRegistrationRequests(remoteRequests, prev.registrationRequests || []),
          }));
        }
      })
      .catch(() => {
        // The local copy keeps the app usable if the remote table is not ready yet.
      });

    return () => {
      isMounted = false;
    };
  }, [isOnline, onlineSyncTick]);

  useEffect(() => {
    let isCancelled = false;

    if (!session?.verified) {
      lastCloudPayloadRef.current = "";
      setCloudSyncState({ academyId: "", loaded: false, saving: false, error: "", syncedAt: "" });
      return () => {
        isCancelled = true;
      };
    }

    if (isSuperAdmin) {
      setCloudSyncState({ academyId: "platform", loaded: false, saving: false, error: "", syncedAt: "" });
      if (!isOnline) {
        setCloudSyncState({ academyId: "platform", loaded: true, saving: false, error: "أنت تعمل بدون إنترنت. سيتم تحديث بيانات السحابة عند عودة الاتصال.", syncedAt: "" });
        return () => {
          isCancelled = true;
        };
      }

      listRemoteAcademyData()
        .then((rows) => {
          if (isCancelled) return;
          if (rows.length) {
            setAcademyDataById((prev) => {
              const next = { ...prev };
              rows.forEach((row) => {
                if (row.academyId) {
                  next[row.academyId] = normalizeAcademyData(row.data);
                }
              });
              return next;
            });
          }
          setCloudSyncState({ academyId: "platform", loaded: true, saving: false, error: "", syncedAt: new Date().toISOString() });
        })
        .catch((error) => {
          if (!isCancelled) {
            setCloudSyncState({ academyId: "platform", loaded: true, saving: false, error: error.message || "تعذر تحميل بيانات السحابة.", syncedAt: "" });
          }
        });

      return () => {
        isCancelled = true;
      };
    }

    if (!currentAcademyId) return () => {
      isCancelled = true;
    };

    setCloudSyncState({ academyId: currentAcademyId, loaded: false, saving: false, error: "", syncedAt: "" });
    if (!isOnline) {
      lastCloudPayloadRef.current = JSON.stringify(toCloudAcademyData(academyDataById[currentAcademyId], session));
      setCloudSyncState({ academyId: currentAcademyId, loaded: true, saving: false, error: "أنت تعمل بدون إنترنت. بياناتك محفوظة على الهاتف وستتزامن عند عودة الاتصال.", syncedAt: "" });
      return () => {
        isCancelled = true;
      };
    }

    getRemoteAcademyData(currentAcademyId)
      .then(async (row) => {
        if (isCancelled) return;
        const localData = normalizeAcademyData(academyDataById[currentAcademyId], session);

        if (row?.data && hasAcademyContent(row.data)) {
          const remoteData = normalizeAcademyData(row.data, session);
          const mergedData = mergeAcademyLocalAndRemote(localData, remoteData, session);
          const cloudPayload = toCloudAcademyData(mergedData, session);
          lastCloudPayloadRef.current = JSON.stringify(cloudPayload);
          setAcademyDataById((prev) => ({ ...prev, [currentAcademyId]: mergedData }));

          if (JSON.stringify(toCloudAcademyData(remoteData, session)) !== lastCloudPayloadRef.current) {
            await upsertRemoteAcademyData(currentAcademyId, cloudPayload);
          }

          if (session?.isFirstLogin) {
            const onboardingKey = currentAcademyId || normalizePhone(session.phone);
            setOnboardingState((prev) => ({ ...prev, [onboardingKey]: { completed: true, completedAt: new Date().toISOString() } }));
            setSession((prev) => (prev ? { ...prev, isFirstLogin: false } : prev));
            setActiveView("home");
          }
        } else if (hasAcademyContent(localData)) {
          const cloudPayload = toCloudAcademyData(localData, session);
          lastCloudPayloadRef.current = JSON.stringify(cloudPayload);
          await upsertRemoteAcademyData(currentAcademyId, cloudPayload);
        } else {
          lastCloudPayloadRef.current = JSON.stringify(toCloudAcademyData(localData, session));
        }

        if (!isCancelled) {
          setCloudSyncState({ academyId: currentAcademyId, loaded: true, saving: false, error: "", syncedAt: new Date().toISOString() });
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setCloudSyncState({ academyId: currentAcademyId, loaded: true, saving: false, error: error.message || "تعذر تحميل بيانات الأكاديمية من السحابة.", syncedAt: "" });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [session?.verified, currentAcademyId, isSuperAdmin, isOnline, onlineSyncTick]);

  useEffect(() => {
    if (
      !session?.verified ||
      isSuperAdmin ||
      !currentAcademyId ||
      !cloudSyncState.loaded ||
      cloudSyncState.academyId !== currentAcademyId
    ) {
      return undefined;
    }

    if (!isOnline) {
      return undefined;
    }

    const academyPayload = toCloudAcademyData(academyDataById[currentAcademyId], session);
    if (!hasAcademyContent(academyPayload)) return undefined;

    const nextSignature = JSON.stringify(academyPayload);
    if (nextSignature === lastCloudPayloadRef.current) return undefined;

    const saveTimer = window.setTimeout(() => {
      setCloudSyncState((prev) => ({ ...prev, saving: true, error: "" }));
      upsertRemoteAcademyData(currentAcademyId, academyPayload)
        .then(() => {
          lastCloudPayloadRef.current = nextSignature;
          setCloudSyncState((prev) => ({ ...prev, saving: false, error: "", syncedAt: new Date().toISOString() }));
        })
        .catch((error) => {
          setCloudSyncState((prev) => ({ ...prev, saving: false, error: error.message || "تعذر حفظ بيانات الأكاديمية في السحابة." }));
        });
    }, 900);

    return () => window.clearTimeout(saveTimer);
  }, [academyDataById, currentAcademyId, session, isSuperAdmin, cloudSyncState.loaded, cloudSyncState.academyId, isOnline, onlineSyncTick]);

  const addAgeGroup = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submitAction = event.nativeEvent.submitter?.value || "finish";
    const presetKey = form.get("preset");
    const preset = ageGroupPresets.find((item) => item.key === presetKey) || ageGroupPresets[0];
    const selectedDays = trainingDayOptions.filter((day) => form.getAll("days").includes(day));
    const group = {
      id: crypto.randomUUID(),
      presetKey: preset.key,
      name: preset.name,
      from: Number(preset.from),
      to: Number(preset.to),
      years: preset.years,
      days: selectedDays.join("، "),
      timeFrom: form.get("timeFrom"),
      timeTo: form.get("timeTo"),
    };
    setData((prev) => ({ ...prev, ageGroups: [group, ...prev.ageGroups] }));
    event.currentTarget.reset();

    if (session?.isFirstLogin && submitAction === "finish") {
      const onboardingKey = session.academyId || normalizePhone(session.phone);
      setOnboardingState((prev) => ({ ...prev, [onboardingKey]: { completed: true, completedAt: new Date().toISOString() } }));
      setSession((prev) => ({ ...prev, isFirstLogin: false }));
      setActiveView("home");
    } else if (!session?.isFirstLogin && submitAction === "finish") {
      setActiveView("home");
    }

    return group;
  };

  const updateAgeGroup = (groupId, updates, options = {}) => {
    setData((prev) => ({
      ...prev,
      ageGroups: prev.ageGroups.map((group) => (group.id === groupId ? { ...group, ...updates } : group)),
    }));

    if (!session?.isFirstLogin && !options.stay) {
      setActiveView("home");
    }
  };

  const removeAgeGroup = (groupId, options = {}) => {
    setData((prev) => ({
      ...prev,
      ageGroups: prev.ageGroups.filter((group) => group.id !== groupId),
    }));

    if (!session?.isFirstLogin && !options.stay) {
      setActiveView("home");
    }
  };

  const finishOnboarding = () => {
    if (session?.isFirstLogin) {
      const onboardingKey = session.academyId || normalizePhone(session.phone);
      setOnboardingState((prev) => ({ ...prev, [onboardingKey]: { completed: true, completedAt: new Date().toISOString() } }));
      setSession((prev) => ({ ...prev, isFirstLogin: false }));
    }

    setActiveView("home");
  };

  const addAcademyCoach = async (coachInput) => {
    const normalizedPhone = normalizePhone(coachInput.phone);
    if (!session?.academyId) {
      return { ok: false, message: "لا يمكن إضافة مدرب قبل ربط الحساب بأكاديمية واضحة." };
    }

    if (!normalizedPhone) {
      return { ok: false, message: "أدخل رقم هاتف صحيح لإنشاء الحساب." };
    }

    const latestUsers = await refreshPlatformUsers();
    const latestRequests = await refreshRegistrationRequests();
    const currentPlatformUsers = mergePlatformUsers(latestUsers || [], platformUsers || []);
    const currentRegistrationRequests = mergeRegistrationRequests(latestRequests || [], registrationRequests || []);

    const existingPhone = [
      data.coach,
      ...(data.coaches || []),
      ...currentPlatformUsers,
      ...currentRegistrationRequests,
    ].some((item) => normalizePhone(item?.phone || item?.contact) === normalizedPhone);

    if (existingPhone) {
      return { ok: false, message: "هذا الرقم مرتبط مسبقًا بحساب أو طلب تسجيل، ولا يمكن ربط الحساب بأكثر من أكاديمية." };
    }

    const academyAccountPhones = new Set(
      [
        ...currentPlatformUsers
          .filter((user) => user.academyId === session.academyId && user.status !== "معطل")
          .map((user) => normalizePhone(user.phone)),
        normalizePhone(data.coach?.phone || session.phone),
        ...(data.coaches || [])
          .filter((coach) => coach.status !== "معطل")
          .map((coach) => normalizePhone(coach.phone)),
      ].filter(Boolean),
    );

    if (academyAccountPhones.size >= MAX_ACADEMY_ACCOUNTS) {
      return { ok: false, message: `لا يمكن ربط أكثر من ${MAX_ACADEMY_ACCOUNTS} حسابات بهذه الأكاديمية.` };
    }

    if (!coachInput.password || coachInput.password.length < 6) {
      return { ok: false, message: "كلمة السر المؤقتة يجب أن تكون 6 أحرف أو أرقام على الأقل." };
    }

    const passwordHash = await hashPassword(coachInput.password);
    const coachRole = coachInput.role || ROLE_COACH;
    const academyName = data.academy.name || session.academyName || "الأكاديمية";
    const academyNameEn = data.academy.nameEn || session.academyNameEn || "";
    const academyLogo = data.academy.logo || session.academyLogo || "";
    const coach = {
      id: crypto.randomUUID(),
      name: coachInput.name,
      phone: normalizedPhone,
      role: coachRole,
      permissions: coachInput.permissions,
      status: "نشط",
      joinedAt: today,
      passwordHash,
      passwordStatus: "مشفرة",
      passwordUpdatedAt: today,
    };
    const coachAccount = {
      id: `coach-user-${session.academyId}-${normalizedPhone.replace(/\D/g, "")}`,
      name: coach.name,
      phone: coach.phone,
      role: coachRole,
      academyId: session.academyId,
      academyName,
      academyNameEn,
      academyLogo,
      permissions: coach.permissions,
      passwordHash,
      passwordStatus: "مشفرة",
      passwordUpdatedAt: today,
      status: "نشط",
    };
    const nextAcademyData = normalizeAcademyData(
      {
        ...data,
        coaches: [coach, ...(data.coaches || []).filter((item) => normalizePhone(item.phone) !== coach.phone)],
        users: [
          { ...coachAccount, academyName: data.academy.name || academyName },
          ...(data.users || []).filter((user) => normalizePhone(user.phone) !== coach.phone),
        ],
      },
      session,
    );

    try {
      const syncedAccount = await upsertPlatformAccount(coachAccount);
      if (!syncedAccount) {
        throw new Error("تعذر الوصول إلى قاعدة الحسابات.");
      }
      setData(nextAcademyData);
      setPlatformData((prev) => ({
        ...prev,
        users: [
          syncedAccount || coachAccount,
          ...(prev.users || []).filter((user) => normalizePhone(user.phone) !== coach.phone),
        ],
      }));
      if (syncedAccount) {
        setPlatformData((prev) => ({
          ...prev,
          users: mergePlatformUsers([syncedAccount], prev.users || []),
        }));
      }
      upsertRemoteAcademyData(session.academyId, toCloudAcademyData(nextAcademyData, session)).catch(() => {
        // The login account is ready; the public academy summary can sync on the next save.
      });
    } catch (error) {
      return {
        ok: false,
        message: error.message || "تعذر إنشاء حساب دخول المدرب في السحابة. تحقق من الاتصال ثم أعد المحاولة.",
      };
    }

    if (!session?.isFirstLogin && activeView === "coaches") {
      setActiveView("home");
    }

    return { ok: true, message: "تم إنشاء حساب المستخدم مباشرة وربطه بالأكاديمية. يمكنه الدخول برقم الهاتف وكلمة السر المؤقتة." };
  };

  const toggleAcademyCoachStatus = (coachId) => {
    const targetCoach = (data.coaches || []).find((coach) => coach.id === coachId);
    const nextCoachStatus = targetCoach?.status === "نشط" ? "معطل" : "نشط";

    setData((prev) => {
      const target = (prev.coaches || []).find((coach) => coach.id === coachId);
      if (!target || target.id === "coach-primary") return prev;

      const nextStatus = target.status === "نشط" ? "معطل" : "نشط";

      return {
        ...prev,
        coaches: (prev.coaches || []).map((coach) =>
          coach.id === coachId ? { ...coach, status: nextStatus } : coach,
        ),
        users: (prev.users || []).map((user) =>
          normalizePhone(user.phone) === normalizePhone(target.phone) ? { ...user, status: nextStatus } : user,
        ),
      };
    });

    setPlatformData((prev) => ({
      ...prev,
      users: (prev.users || []).map((user) =>
        normalizePhone(user.phone) === normalizePhone(targetCoach?.phone)
          ? { ...user, status: nextCoachStatus }
          : user,
      ),
    }));

    updateRemotePlatformAccountStatus(normalizePhone(targetCoach?.phone), nextCoachStatus).catch(() => {
      // The local status stays visible if the remote table is temporarily unavailable.
    });

    if (!session?.isFirstLogin && activeView === "coaches") {
      setActiveView("home");
    }
  };

  const togglePlatformUserStatus = (targetUser) => {
    if (!isSuperAdmin) {
      window.alert("هذا الإجراء مخصص للحساب الرئيسي فقط.");
      return;
    }

    const normalizedPhone = normalizePhone(targetUser?.phone);
    const nextStatus = targetUser?.status === "معطل" ? "نشط" : "معطل";

    setPlatformData((prev) => ({
      ...prev,
      users: (prev.users || []).map((user) =>
        normalizePhone(user.phone) === normalizedPhone ? { ...user, status: nextStatus } : user,
      ),
    }));

    setAcademyDataById((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((academyId) => {
        const academyData = normalizeAcademyData(next[academyId]);
        next[academyId] = {
          ...academyData,
          users: (academyData.users || []).map((user) =>
            normalizePhone(user.phone) === normalizedPhone ? { ...user, status: nextStatus } : user,
          ),
          coaches: (academyData.coaches || []).map((coach) =>
            normalizePhone(coach.phone) === normalizedPhone ? { ...coach, status: nextStatus } : coach,
          ),
        };
      });
      return next;
    });

    updateRemotePlatformAccountStatus(normalizedPhone, nextStatus).catch(() => {
      // The local state stays available and can sync again on a later visit.
    });
  };

  const deletePlatformUser = (targetUser) => {
    if (!isSuperAdmin) {
      window.alert("هذا الإجراء مخصص للحساب الرئيسي فقط.");
      return;
    }

    const normalizedPhone = normalizePhone(targetUser?.phone);
    if (!normalizedPhone) return;
    const targetAcademyId = targetUser?.academyId || "";
    const remainingAcademyUsers = (platformUsers || []).filter(
      (user) => user.academyId === targetAcademyId && normalizePhone(user.phone) !== normalizedPhone,
    );
    const shouldDeleteAcademyData = Boolean(targetAcademyId && remainingAcademyUsers.length === 0);

    const ok = window.confirm(`هل تريد حذف حساب ${targetUser?.name || normalizedPhone} نهائيًا من لوحة المنصة؟`);
    if (!ok) return;

    setPlatformData((prev) => ({
      ...prev,
      users: (prev.users || []).filter((user) => normalizePhone(user.phone) !== normalizedPhone),
      registrationRequests: (prev.registrationRequests || []).filter(
        (request) => normalizePhone(request.phone || request.contact) !== normalizedPhone,
      ),
    }));

    setAcademyDataById((prev) => {
      const next = { ...prev };
      if (shouldDeleteAcademyData) {
        delete next[targetAcademyId];
        return next;
      }

      Object.keys(next).forEach((academyId) => {
        const academyData = normalizeAcademyData(next[academyId]);
        next[academyId] = {
          ...academyData,
          users: (academyData.users || []).filter((user) => normalizePhone(user.phone) !== normalizedPhone),
          coaches: (academyData.coaches || []).filter((coach) => normalizePhone(coach.phone) !== normalizedPhone),
        };
      });
      return next;
    });

    Promise.allSettled([
      deleteRemotePlatformAccount(normalizedPhone),
      deleteRemoteRegistrationRequestsByPhone(normalizedPhone, targetAcademyId),
      shouldDeleteAcademyData ? deleteRemoteAcademyData(targetAcademyId) : Promise.resolve(null),
    ]).catch(() => {
      // The local cleanup stays visible; remote cleanup can be retried manually if the network is unavailable.
    });
  };

  const togglePlayerStatus = (playerId) => {
    setData((prev) => ({
      ...prev,
      players: (prev.players || []).map((player) =>
        player.id === playerId
          ? {
              ...player,
              status: player.status === "منقطع" ? "نشط" : "منقطع",
              statusUpdatedAt: today,
            }
          : player,
      ),
    }));
  };

  const updatePlayerCard = (playerId, values = {}) => {
    setData((prev) => ({
      ...prev,
      players: (prev.players || []).map((player) =>
        player.id === playerId
          ? {
              ...player,
              playerCard: {
                ...(player.playerCard || {}),
                ...values,
              },
            }
          : player,
      ),
    }));
  };

  const updatePlayerDetails = (playerId, values = {}) => {
    setData((prev) => ({
      ...prev,
      players: (prev.players || []).map((player) =>
        player.id === playerId
          ? {
              ...player,
              ...values,
              ageText: values.birthDate ? exactAgeFromDate(values.birthDate) : player.ageText,
            }
          : player,
      ),
    }));
  };

  const addPlayer = async (event) => {
    event.preventDefault();
    const submitAction = event.nativeEvent.submitter?.value || "save";
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const photo = await fileToDataUrl(imageFileFromForm(form, "playerPhoto"));
    const player = {
      id: crypto.randomUUID(),
      name: form.get("name"),
      photo,
      birthDate: form.get("birthDate"),
      position: positionTextFromForm(form),
      jersey: form.get("jersey"),
      playerNumber: form.get("playerNumber"),
      guardianPhone: form.get("guardianPhone"),
      teamId: form.get("teamId"),
      ageGroupPreset: form.get("ageGroupPreset") || "",
      ageText: exactAgeFromDate(form.get("birthDate")),
      monthlyFee: Number(form.get("monthlyFee")),
      subscriptionType: form.get("subscriptionType"),
      subscriptionPaidFull: false,
      kitFee: Number(helpers.teamById[form.get("teamId")]?.kitFee || 0),
      kitPaid: false,
      status: "نشط",
      xp: 0,
      level: 1,
      rating: 70,
      skill: 70,
      fitness: 70,
      commitment: 70,
      badges: [],
    };
    setSelectedPlayerId(player.id);
    setData((prev) => ({ ...prev, players: [player, ...prev.players] }));
    formElement.reset();

    if (session?.isFirstLogin && submitAction === "save") {
      const onboardingKey = session.academyId || normalizePhone(session.phone);
      setOnboardingState((prev) => ({ ...prev, [onboardingKey]: { completed: true, completedAt: new Date().toISOString() } }));
      setSession((prev) => ({ ...prev, isFirstLogin: false }));
      setActiveView("home");
    }
  };

  const addTeam = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const team = {
      id: crypto.randomUUID(),
      name: form.get("name"),
      ageGroupId: form.get("ageGroupId"),
      coach: form.get("coach"),
      kitFee: Number(form.get("kitFee") || 0),
      wins: 0,
      losses: 0,
      draws: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    };
    setSelectedTeamId(team.id);
    setData((prev) => ({ ...prev, teams: [team, ...prev.teams] }));
    event.currentTarget.reset();
  };

  const updateTeamKitFee = (teamId, kitFee) => {
    const fee = Number(kitFee || 0);
    setData((prev) => ({
      ...prev,
      teams: (prev.teams || []).map((team) => (team.id === teamId ? { ...team, kitFee: fee } : team)),
      players: (prev.players || []).map((player) => (player.teamId === teamId ? { ...player, kitFee: Number(player.kitFee || fee) } : player)),
    }));
  };

  const recordAttendance = (playerId, status, date = today, note = "") => {
    setData((prev) => ({
      ...prev,
      attendance: [
        { id: crypto.randomUUID(), playerId, date, status, note, source: "attendance" },
        ...prev.attendance.filter((row) => !(row.playerId === playerId && row.date === date)),
      ],
    }));
  };

  const addPayment = (eventOrPayment) => {
    const isFormEvent = typeof eventOrPayment?.preventDefault === "function";
    let payment;

    if (isFormEvent) {
      eventOrPayment.preventDefault();
      const form = new FormData(eventOrPayment.currentTarget);
      payment = {
        id: crypto.randomUUID(),
        playerId: form.get("playerId"),
        amount: Number(form.get("amount")),
        date: form.get("date"),
        method: form.get("method"),
        status: form.get("status"),
        note: form.get("note"),
      };
      eventOrPayment.currentTarget.reset();
    } else {
      payment = {
        id: crypto.randomUUID(),
        method: "نقدًا",
        status: "مدفوع",
        note: "",
        ...eventOrPayment,
        amount: Number(eventOrPayment.amount || 0),
      };
    }

    setData((prev) => ({
      ...prev,
      payments: [
        payment,
        ...prev.payments.filter(
          (row) =>
            !(
              payment.source === "attendance" &&
              row.source === "attendance" &&
              row.playerId === payment.playerId &&
              row.date === payment.date
            ),
        ),
      ],
    }));
  };

  const addExpense = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expense = {
      id: crypto.randomUUID(),
      title: form.get("title"),
      category: form.get("category"),
      amount: Number(form.get("amount") || 0),
      date: form.get("date") || today,
      method: form.get("method"),
      vendor: form.get("vendor"),
      note: form.get("note"),
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, expenses: [expense, ...(prev.expenses || [])] }));
    event.currentTarget.reset();
  };

  const deleteExpense = (expenseId) => {
    setData((prev) => ({
      ...prev,
      expenses: (prev.expenses || []).filter((expense) => expense.id !== expenseId),
    }));
  };

  const addMatch = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const match = {
      id: crypto.randomUUID(),
      teamAId: form.get("teamAId"),
      teamBId: form.get("teamBId"),
      date: form.get("date"),
      scoreA: Number(form.get("scoreA")),
      scoreB: Number(form.get("scoreB")),
      mvpId: form.get("mvpId"),
      evaluation: form.get("evaluation"),
    };
    setData((prev) => ({ ...prev, matches: [match, ...prev.matches] }));
    event.currentTarget.reset();
  };

  const addBadge = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const badge = {
      id: crypto.randomUUID(),
      name: form.get("name"),
      condition: form.get("condition"),
      xp: Number(form.get("xp")),
    };
    setData((prev) => ({ ...prev, badges: [badge, ...prev.badges] }));
    event.currentTarget.reset();
  };

  const addNotification = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const notification = {
      id: crypto.randomUUID(),
      type: form.get("type"),
      target: form.get("target"),
      date: today,
      status: "جديد",
    };
    setData((prev) => ({ ...prev, notifications: [notification, ...prev.notifications] }));
    event.currentTarget.reset();
  };

  const addPost = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const post = {
      id: crypto.randomUUID(),
      title: form.get("title"),
      content: form.get("content"),
      type: form.get("type"),
      pinned: form.get("pinned") === "on",
      likes: 0,
    };
    setData((prev) => ({ ...prev, posts: [post, ...prev.posts] }));
    event.currentTarget.reset();
  };

  const updateCoach = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const photo = await fileToDataUrl(imageFileFromForm(form, "coachPhoto"));
    const coachName = form.get("coachName");

    setData((prev) => ({
      ...prev,
      coach: {
        ...(prev.coach || seedData.coach),
        name: coachName,
        birthDate: form.get("birthDate"),
        phone: form.get("phone"),
        nationality: form.get("nationality"),
        bio: form.get("bio"),
        photo: photo || prev.coach?.photo || "",
      },
    }));

    setPlatformData((prev) => ({
      ...prev,
      users: (prev.users || []).map((user) =>
        user.id === session?.userId || normalizePhone(user.phone) === normalizePhone(session?.phone)
          ? { ...user, name: coachName, photo: photo || user.photo || "" }
          : user,
      ),
    }));

    if (session?.isFirstLogin) {
      setActiveView("settings");
    } else {
      setActiveView("home");
    }
  };

  const updateAcademy = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const logo = await fileToDataUrl(imageFileFromForm(form, "academyLogo"));
    const academyName = form.get("name");
    const academyNameEn = String(form.get("nameEn") || "").trim();
    const coachName = form.get("coachName");
    const nextLogo = logo || data.academy.logo || "";

    if (isAcademyNameTaken(academyName, session?.academyId)) {
      window.alert("اسم الأكاديمية مستخدم مسبقًا. يرجى اختيار اسم مختلف قبل الحفظ.");
      return;
    }

    const nextAcademyData = {
      ...data,
      coach: {
        ...(data.coach || seedData.coach),
        name: coachName || data.coach?.name || seedData.coach.name,
      },
      academy: {
        ...data.academy,
        name: academyName,
        nameEn: academyNameEn,
        field: coachName || form.get("field") || data.academy.field,
        location: form.get("location"),
        gpsLocation: form.get("gpsLocation") || data.academy.gpsLocation || "",
        logo: nextLogo,
        ownerPhone: form.get("ownerPhone") || data.academy.ownerPhone,
        plan: form.get("plan") || data.academy.plan,
      },
      users: (data.users || []).map((user) => ({
        ...user,
        academyName,
        academyNameEn,
        academyLogo: nextLogo,
      })),
    };
    const nextPlatformUsers = (platformData.users || []).map((user) =>
        user.academyId === session?.academyId
          ? { ...user, academyName, academyNameEn, academyLogo: nextLogo }
          : user,
      );

    setData(nextAcademyData);
    setPlatformData((prev) => ({ ...prev, users: nextPlatformUsers }));
    setSession((prev) => (prev ? { ...prev, academyName, academyNameEn, academyLogo: nextLogo || prev.academyLogo || "" } : prev));

    if (isOnline) {
      syncAcademyPlatformAccounts(nextPlatformUsers, nextAcademyData).then((syncedAccounts) => {
        if (syncedAccounts.length) {
          setPlatformData((prev) => ({
            ...prev,
            users: mergePlatformUsers(syncedAccounts, prev.users || []),
          }));
        }
      });
    }

    if (session?.isFirstLogin) {
      setActiveView("ageGroups");
    } else {
      setActiveView("home");
    }
  };

  const submitRegistrationRequest = async (requestInput) => {
    const normalizedPhone = normalizePhone(requestInput.phone || requestInput.contact);
    const academyName = String(requestInput.academyName || "").trim();

    if (isPhoneRegisteredAnywhere(normalizedPhone)) {
      throw new Error("رقم الهاتف مسجل مسبقًا أو لديه طلب سابق، ولا يمكن استخدامه لإنشاء حساب جديد.");
    }

    if (isAcademyNameTaken(academyName)) {
      throw new Error("اسم الأكاديمية مستخدم مسبقًا. يرجى تغيير اسم الأكاديمية وإرسال الطلب مرة أخرى.");
    }

    const request = {
      id: crypto.randomUUID(),
      academyName,
      ownerName: requestInput.ownerName,
      contact: requestInput.contact || requestInput.phone,
      phone: normalizedPhone,
      academyId: makeAcademyId(normalizedPhone),
      passwordHash: requestInput.passwordHash,
      passwordStatus: "مشفرة",
      passwordUpdatedAt: today,
      city: requestInput.city,
      status: STATUS_PENDING,
      createdAt: today,
    };

    setPlatformData((prev) => ({
      ...prev,
      registrationRequests: [request, ...(prev.registrationRequests || [])],
    }));

    try {
      const remoteRequest = await createRegistrationRequest(request);
      if (remoteRequest) {
        setPlatformData((prev) => ({
          ...prev,
          registrationRequests: [
            { ...remoteRequest, academyId: request.academyId, passwordHash: remoteRequest.passwordHash || request.passwordHash },
            ...(prev.registrationRequests || []).filter((item) => item.id !== request.id),
          ],
        }));
        return remoteRequest;
      }
      throw new Error("تعذر تأكيد وصول الطلب إلى الحساب الرئيسي. تأكد من الاتصال ثم أعد الإرسال.");
    } catch (error) {
      setPlatformData((prev) => ({
        ...prev,
        registrationRequests: (prev.registrationRequests || []).filter((item) => item.id !== request.id),
      }));
      throw new Error(error.message || "تعذر رفع طلب التسجيل إلى السحابة.");
    }
  };

  const updateRegistrationRequest = async (requestId, status) => {
    const currentRequest = (platformData.registrationRequests || platformSeedData.registrationRequests).find((request) => request.id === requestId);
    const academyId = requestAcademyId(currentRequest);

    if (!isSuperAdmin) {
      window.alert("هذا الإجراء مخصص للحساب الرئيسي فقط.");
      return;
    }

    if (!currentRequest) return;

    if (status === STATUS_APPROVED) {
      const normalizedPhone = normalizePhone(currentRequest.phone || currentRequest.contact);
      const phoneUsed = platformUsers.some((user) => normalizePhone(user.phone) === normalizedPhone);
      const academyNameUsed = isAcademyNameTaken(currentRequest.academyName, academyId);

      if (phoneUsed) {
        window.alert("لا يمكن قبول الطلب: رقم الهاتف مسجل مسبقًا.");
        return;
      }

      if (academyNameUsed) {
        window.alert("لا يمكن قبول الطلب: اسم الأكاديمية مستخدم مسبقًا.");
        return;
      }

      if (accountCountForAcademy(platformUsers, academyId) >= MAX_ACADEMY_ACCOUNTS) {
        window.alert(`لا يمكن قبول الطلب: هذه الأكاديمية مرتبطة بالفعل بـ ${MAX_ACADEMY_ACCOUNTS} حسابات.`);
        return;
      }
    }

    const approvedAccount =
      status === STATUS_APPROVED && currentRequest?.phone
        ? {
            id: `user-${currentRequest.id}`,
            name: currentRequest.ownerName,
            phone: normalizePhone(currentRequest.phone),
            role: ROLE_OWNER,
            academyId,
            academyName: currentRequest.academyName,
            passwordHash: currentRequest.passwordHash,
            passwordStatus: "مشفرة",
            passwordUpdatedAt: currentRequest.passwordUpdatedAt || today,
            permissions: PERMISSION_FULL,
            status: "نشط",
          }
        : null;

    setPlatformData((prev) => ({
      ...prev,
      registrationRequests: (prev.registrationRequests || platformSeedData.registrationRequests).map((request) =>
        request.id === requestId ? { ...request, status } : request,
      ),
      users:
        approvedAccount
          ? [
              ...(prev.users || []).filter((user) => normalizePhone(user.phone) !== normalizePhone(currentRequest.phone)),
              approvedAccount,
            ]
          : prev.users,
    }));

    if (status === STATUS_APPROVED && currentRequest?.phone) {
      setAcademyDataById((prev) => ({
        ...prev,
        [academyId]: normalizeAcademyData(prev[academyId], {
          name: currentRequest.ownerName,
          phone: normalizePhone(currentRequest.phone),
          academyName: currentRequest.academyName,
        }),
      }));
    }

    try {
      await updateRemoteRegistrationRequest(requestId, status);
      if (approvedAccount) {
        await upsertPlatformAccount(approvedAccount);
      }
    } catch {
      // The visible dashboard state is kept locally if remote update is unavailable.
    }
  };

  const resetPlatformUserPassword = async (targetUser) => {
    if (!isSuperAdmin) {
      return { ok: false, message: "هذا الإجراء مخصص للحساب الرئيسي فقط." };
    }

    const normalizedPhone = normalizePhone(targetUser?.phone);
    if (!normalizedPhone) {
      return { ok: false, message: "لا يوجد رقم هاتف واضح لهذا الحساب." };
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    setPlatformData((prev) => ({
      ...prev,
      users: (prev.users || []).map((user) =>
        normalizePhone(user.phone) === normalizedPhone
          ? {
              ...user,
              passwordHash,
              passwordStatus: "تم إعادة التعيين",
              passwordUpdatedAt: today,
            }
          : user,
      ),
      registrationRequests: (prev.registrationRequests || []).map((request) =>
        normalizePhone(request.phone || request.contact) === normalizedPhone
          ? { ...request, passwordHash, passwordStatus: "تم إعادة التعيين", passwordUpdatedAt: today }
          : request,
      ),
    }));

    setAcademyDataById((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((academyId) => {
        const academyData = normalizeAcademyData(next[academyId]);
        next[academyId] = {
          ...academyData,
          users: (academyData.users || []).map((user) =>
            normalizePhone(user.phone) === normalizedPhone ? { ...user, passwordHash } : user,
          ),
          coaches: (academyData.coaches || []).map((coach) =>
            normalizePhone(coach.phone) === normalizedPhone ? { ...coach, passwordHash } : coach,
          ),
        };
      });
      return next;
    });

    try {
      await updateRemoteRegistrationPassword(normalizedPhone, passwordHash);
      await updateRemotePlatformAccountPassword(normalizedPhone, passwordHash);
    } catch {
      // The local dashboard still reflects the reset; the next sync can refresh the remote row.
    }

    return {
      ok: true,
      temporaryPassword,
      message: "تم إنشاء كلمة سر جديدة لهذا الحساب.",
    };
  };

  const updateAccountProfile = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextPhoto = await fileToDataUrl(imageFileFromForm(form, "accountPhoto"));
    const nextName = String(form.get("accountName") || "").trim();
    const currentPassword = String(form.get("currentPassword") || "");
    const nextPassword = String(form.get("newPassword") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    const currentPhone = normalizePhone(session?.phone);
    const currentUser = platformUsers.find(
      (user) => user.id === session?.userId || normalizePhone(user.phone) === currentPhone,
    );

    if (!nextName) {
      return { ok: false, message: "أدخل اسم المستخدم." };
    }

    let nextPasswordHash = currentUser?.passwordHash || "";
    let passwordWasChanged = false;

    if (nextPassword || confirmPassword || currentPassword) {
      if (isSuperAdmin) {
        return { ok: false, message: "كلمة سر الحساب الرئيسي ثابتة ولا يتم عرضها أو تغييرها من هنا." };
      }

      if (!currentUser?.passwordHash) {
        return { ok: false, message: "لا يمكن تغيير كلمة السر لهذا الحساب قبل مزامنة بياناته." };
      }

      if (nextPassword.length < 6) {
        return { ok: false, message: "كلمة السر الجديدة يجب أن تكون 6 أحرف أو أرقام على الأقل." };
      }

      if (nextPassword !== confirmPassword) {
        return { ok: false, message: "تأكيد كلمة السر غير مطابق." };
      }

      const currentPasswordHash = await hashPassword(currentPassword);
      if (currentPasswordHash !== currentUser.passwordHash) {
        return { ok: false, message: "كلمة السر الحالية غير صحيحة." };
      }

      nextPasswordHash = await hashPassword(nextPassword);
      passwordWasChanged = true;
    }

    if (!isSuperAdmin) {
      setPlatformData((prev) => ({
        ...prev,
        users: (prev.users || []).map((user) =>
          user.id === session?.userId || normalizePhone(user.phone) === currentPhone
            ? {
                ...user,
                name: nextName,
                photo: nextPhoto || user.photo || "",
                passwordHash: passwordWasChanged ? nextPasswordHash : user.passwordHash,
                passwordStatus: "مشفرة",
                passwordUpdatedAt: passwordWasChanged ? today : user.passwordUpdatedAt,
              }
            : user,
        ),
      }));

      setData((prev) => ({
        ...prev,
        coach:
          normalizePhone(prev.coach?.phone) === currentPhone || session?.role === ROLE_OWNER
            ? { ...(prev.coach || seedData.coach), name: nextName, photo: nextPhoto || prev.coach?.photo || "" }
            : prev.coach,
        coaches: (prev.coaches || []).map((coach) =>
          normalizePhone(coach.phone) === currentPhone
            ? { ...coach, name: nextName, photo: nextPhoto || coach.photo || "", passwordHash: passwordWasChanged ? nextPasswordHash : coach.passwordHash }
            : coach,
        ),
        users: (prev.users || []).map((user) =>
          normalizePhone(user.phone) === currentPhone
            ? { ...user, name: nextName, photo: nextPhoto || user.photo || "", passwordHash: passwordWasChanged ? nextPasswordHash : user.passwordHash }
            : user,
        ),
      }));

      if (currentUser) {
        upsertPlatformAccount({
          ...currentUser,
          name: nextName,
          photo: nextPhoto || currentUser.photo || "",
          passwordHash: passwordWasChanged ? nextPasswordHash : currentUser.passwordHash,
          passwordStatus: "مشفرة",
          passwordUpdatedAt: passwordWasChanged ? today : currentUser.passwordUpdatedAt,
        }).catch(() => {
          // Local profile updates stay in place and can sync later.
        });
      }
    }

    setSession((prev) => (prev ? { ...prev, name: nextName, photo: nextPhoto || prev.photo || "" } : prev));
    return { ok: true, message: passwordWasChanged ? "تم تحديث الاسم وكلمة السر." : "تم تحديث اسم المستخدم." };
  };

  const exportLocalBackup = async () => {
    if (!currentAcademyId || isSuperAdmin) {
      return { ok: false, message: "النسخ الاحتياطي متاح داخل حساب الأكاديمية فقط." };
    }

    const academyData = normalizeAcademyData(academyDataById[currentAcademyId], session);
    const allAcademies = {
      ...academyDataById,
      [currentAcademyId]: academyData,
    };
    const coreBackupPayload = {
      app: "QZ Academy",
      version: 4,
      backupType: "full-app",
      createdAt: new Date().toISOString(),
      academyId: currentAcademyId,
      academyName: academyData.academy.name || session?.academyName || "",
      ownerPhone: normalizePhone(session?.phone || academyData.academy.ownerPhone),
      data: academyData,
      appState: {
        activeView,
        session,
        onboardingState,
        platformData,
        academyDataById: allAcademies,
        renewalTimers,
      },
      localStorage: {
        ...readAppLocalSnapshot(),
        "acdme-active-view-v1": activeView,
        "acdme-session-v5": session,
        "acdme-onboarding-v4": onboardingState,
        "acdme-platform-data-v1": platformData,
        "acdme-academy-data-by-id-v1": allAcademies,
        "acdme-renewal-timers-v1": renewalTimers,
      },
    };
    const checksum = await sha256Text(JSON.stringify(coreBackupPayload));
    const backupPayload = {
      ...coreBackupPayload,
      security: {
        checksum,
        checksumAlgorithm: "SHA-256",
        lockedAcademyId: currentAcademyId,
        createdByPhone: normalizePhone(session?.phone || ""),
        note: "تستخدم هذه البصمة لاكتشاف تلف أو تعديل ملف النسخة الاحتياطية قبل الاسترداد.",
      },
    };
    const safeName = (backupPayload.academyName || "academy").replace(/[^\w\u0600-\u06FF-]+/g, "-");
    const filename = `${safeName}-${today}.secure-acdme-backup.json.gz`;
    const saveResult = await saveGeneratedBlobFile(
      filename,
      "نسخة احتياطية آمنة",
      () => gzipText(JSON.stringify(backupPayload)),
      verifyBackupBlob,
    );
    if (saveResult.cancelled) {
      return { ok: false, message: "تم إلغاء حفظ النسخة الاحتياطية." };
    }
    if (!saveResult.ok) {
      return { ok: false, message: saveResult.message || "تعذر إنشاء نسخة احتياطية صالحة." };
    }
    return {
      ok: true,
      message: `تم اختيار المسار ثم حفظ نسخة احتياطية فعالة: ${saveResult.filename}. المسار: ${saveResult.location}.`,
    };
  };

  const importLocalBackup = async (file) => {
    if (!currentAcademyId || isSuperAdmin) {
      return { ok: false, message: "استيراد النسخة الاحتياطية متاح داخل حساب الأكاديمية فقط." };
    }

    try {
      const text = await readBackupText(file);
      const backup = JSON.parse(text);
      if (backup.security?.checksum) {
        const { security, ...coreBackupPayload } = backup;
        const checksum = await sha256Text(JSON.stringify(coreBackupPayload));
        if (checksum !== backup.security.checksum) {
          return { ok: false, message: "تم رفض الاستيراد: بصمة النسخة الاحتياطية غير مطابقة، وقد يكون الملف تالفًا أو معدلًا." };
        }
      }

      const restoredAcademyId = backup.academyId || currentAcademyId;
      if (restoredAcademyId && restoredAcademyId !== currentAcademyId) {
        return { ok: false, message: "تم رفض الاستيراد: هذه النسخة الاحتياطية تخص أكاديمية مختلفة عن الحساب الحالي." };
      }

      const importedData =
        backup.data ||
        backup.academyData ||
        backup.appState?.academyDataById?.[backup.academyId || currentAcademyId];
      if (!importedData || typeof importedData !== "object") {
        return { ok: false, message: "ملف النسخة الاحتياطية غير صالح." };
      }

      const restoredData = normalizeAcademyData(importedData, session);
      const restoredAcademies = {
        ...academyDataById,
        [currentAcademyId]: restoredData,
      };
      const backupPlatformUsers = backup.appState?.platformData?.users || [];
      const academyBackupUsers = backupPlatformUsers.filter((user) => user.academyId === currentAcademyId);
      const nextPlatformData = {
        ...platformData,
        users: mergePlatformUsers(academyBackupUsers, platformData.users || []),
      };
      const nextOnboardingState = backup.appState?.onboardingState || onboardingState;
      const nextRenewalTimers = backup.appState?.renewalTimers || renewalTimers;
      const nextSession = session;
      const nextActiveView = backup.appState?.activeView || activeView;

      restoreAppLocalSnapshot(backup.localStorage);
      writeLocalData("acdme-active-view-v1", nextActiveView);
      writeLocalData("acdme-session-v5", nextSession);
      writeLocalData("acdme-onboarding-v4", nextOnboardingState);
      writeLocalData("acdme-platform-data-v1", nextPlatformData);
      writeLocalData("acdme-academy-data-by-id-v1", restoredAcademies);
      writeLocalData("acdme-renewal-timers-v1", nextRenewalTimers);

      setData(restoredData);
      setAcademyDataById(restoredAcademies);
      setPlatformData(nextPlatformData);
      setOnboardingState(nextOnboardingState);
      setRenewalTimers(nextRenewalTimers);
      setSession(nextSession);
      setActiveView(nextActiveView);
      upsertRemoteAcademyData(restoredAcademyId, toCloudAcademyData(restoredData, nextSession)).catch(() => {
        // Local restore succeeds even if the public cloud summary is updated later.
      });
      return {
        ok: true,
        message: backup.security?.checksum
          ? "تم التحقق من بصمة النسخة واستعادة بيانات التطبيق بأمان."
          : "تم استيراد نسخة قديمة بدون بصمة تحقق. يفضل إنشاء نسخة احتياطية جديدة الآن.",
      };
    } catch {
      return { ok: false, message: "تعذر قراءة النسخة الاحتياطية. تأكد من اختيار الملف الصحيح." };
    }
  };

  const viewProps = {
    data,
    academyDataById,
    cloudSyncState,
    isOnline,
    stats,
    helpers,
    filteredPlayers,
    platformUsers,
    registrationRequests,
    setActiveView: navigateToView,
    selectedPlayerId,
    setSelectedPlayerId,
    selectedTeamId,
    setSelectedTeamId,
    addAgeGroup,
    updateAgeGroup,
    removeAgeGroup,
    finishOnboarding,
    addAcademyCoach,
    toggleAcademyCoachStatus,
    addPlayer,
    addTeam,
    recordAttendance,
    addPayment,
    addExpense,
    deleteExpense,
    addMatch,
    addBadge,
    addNotification,
    addPost,
    updateCoach,
    updateAcademy,
    updateAccountProfile,
    exportLocalBackup,
    importLocalBackup,
    syncCurrentAcademyNow,
    refreshPlatformUsers,
    refreshRegistrationRequests,
    renewAcademyAccess,
    updateRegistrationRequest,
    resetPlatformUserPassword,
    togglePlatformUserStatus,
    deletePlatformUser,
    togglePlayerStatus,
    updatePlayerCard,
    updatePlayerDetails,
    updateTeamKitFee,
    session,
    isFirstLogin: Boolean(session?.isFirstLogin),
  };

  const fallbackView = isSuperAdmin ? "platformDashboard" : session?.isFirstLogin ? "coachSetup" : "home";
  const renewalInfo = academyRenewalInfo(data.academy, renewalTimers[currentAcademyId]);
  const isRenewalExpired = !isSuperAdmin && session?.verified && !session?.isFirstLogin && renewalInfo.isExpired;
  const visibleNavItems = isSuperAdmin
    ? navItems
    : navItems.filter((item) => canAccessView(item.id, session));
  const bottomNavItems = visibleNavItems.filter((item) => !setupNavIds.has(item.id));
  const displayedView = visibleNavItems.some((item) => item.id === activeView) ? activeView : fallbackView;
  const customScreenViews = new Set(["home", "coachSetup", "coaches", "settings", "ageGroups", "attendance", "reports", "accountProfile"]);
  const showGlobalHeader = !customScreenViews.has(displayedView);
  const showScreenTitle = !customScreenViews.has(displayedView);
  const showBottomNav = !session?.isFirstLogin && !setupNavIds.has(displayedView);
  const currentPageGuide = pageGuides[displayedView];
  const canGoBack = Boolean(lastView && visibleNavItems.some((item) => item.id === lastView));
  const goBackToPreviousView = () => {
    navigateToView(canGoBack ? lastView : fallbackView, { replace: true });
  };

  useEffect(() => {
    if (!showBottomNav) return;
    const activeItem = bottomNavRef.current?.querySelector(".bottom-nav-item.active");
    activeItem?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [displayedView, showBottomNav]);

  const handlePageRefresh = () => {
    writeLocalData("acdme-active-view-v1", displayedView);
    window.location.reload();
  };
  const sessionPhone = normalizePhone(session?.phone);
  const sessionCoach = (data.coaches || []).find((coach) => normalizePhone(coach.phone) === sessionPhone);
  const profileImage =
    session?.photo ||
    sessionCoach?.photo ||
    (session?.role === ROLE_OWNER || normalizePhone(data.coach?.phone) === sessionPhone ? data.coach?.photo : "") ||
    data.academy.logo ||
    session?.academyLogo ||
    "";
  const profileDisplayName = session?.name || sessionCoach?.name || data.coach?.name || "الملف الشخصي";
  const profileMenuItems = [
    { id: "platformDashboard", label: "لوحة المنصة", icon: ClipboardCheck },
    { id: "platformReports", label: "تقارير الأكاديميات", icon: ClipboardList },
    { id: "accountProfile", label: "الملف الشخصي", icon: UserCircle },
    { id: "coachSetup", label: "إعدادات المدرب", icon: UserRound },
    { id: "coaches", label: "إدارة المدربين", icon: Users },
    { id: "settings", label: "إعدادات الأكاديمية", icon: Settings },
    { id: "ageGroups", label: "إعدادات الفئات", icon: Layers },
    { id: "teams", label: "إدارة الفرق", icon: ShieldCheck },
  ].filter((item) => canAccessView(item.id, session));
  const handleLogout = () => {
    setIsProfileMenuOpen(false);
    setSession(null);
    setActiveView("platformDashboard");
  };
  const handleProfileHome = () => {
    navigateToView(isSuperAdmin ? "platformDashboard" : "home");
    setIsProfileMenuOpen(false);
  };

  if (!session?.verified) {
    return (
      <LoginPassword
        data={data}
        users={platformData.users || []}
        registrationRequests={registrationRequests}
        refreshPlatformUsers={refreshPlatformUsers}
        refreshRegistrationRequests={refreshRegistrationRequests}
        onRequestRegistration={submitRegistrationRequest}
        onVerified={(nextSession) => {
          const onboardingKey = nextSession.academyId || normalizePhone(nextSession.phone);
          const hasCompletedOnboarding = Boolean(onboardingState[onboardingKey]?.completed);
          const nextIsSuperAdmin = nextSession.role === ROLE_SUPER_ADMIN;
          const shouldCompleteSetup = !nextIsSuperAdmin && nextSession.role === ROLE_OWNER && !hasCompletedOnboarding;
          const nextView = nextIsSuperAdmin ? "platformDashboard" : shouldCompleteSetup ? "coachSetup" : "home";

          if (!nextIsSuperAdmin && nextSession.academyId) {
            setAcademyDataById((prev) => ({
              ...prev,
              [nextSession.academyId]: normalizeAcademyData(prev[nextSession.academyId], nextSession),
            }));
          }

          setSession({ ...nextSession, verified: true, isFirstLogin: shouldCompleteSetup });
          navigateToView(nextView);
        }}
      />
    );
  }

  if (isRenewalExpired) {
    return (
      <RenewalGate
        academyName={session.academyName || data.academy.name || "الأكاديمية"}
        renewalInfo={renewalInfo}
        canRenew={session?.role === ROLE_OWNER}
        isOnline={isOnline}
        onRenew={renewAcademyAccess}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className={[
      showBottomNav ? "app-shell" : "app-shell setup-mode",
      displayedView === "home" ? "home-view" : "",
      displayedView === "ageGroups" ? "age-groups-view" : "",
    ].filter(Boolean).join(" ")}>
      <button className="global-refresh-button" type="button" onClick={handlePageRefresh} aria-label="تحديث الصفحة">
        <RefreshCw size={18} />
      </button>
      <button className="theme-toggle-button" type="button" onClick={toggleThemeMode} aria-label={themeMode === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}>
        {themeMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {!isOnline && (
        <div className="offline-banner" role="status">
          أنت تعمل بدون إنترنت. البيانات محفوظة على الهاتف وستتزامن عند عودة الاتصال.
        </div>
      )}

      <div className="profile-menu-shell">
        <button
          className="profile-menu-button"
          type="button"
          aria-label="قائمة البروفايل"
          aria-expanded={isProfileMenuOpen}
          onClick={() => setIsProfileMenuOpen((value) => !value)}
        >
          {profileImage ? <img src={profileImage} alt="صورة البروفايل" decoding="async" /> : <UserRound size={22} />}
        </button>

        {isProfileMenuOpen && (
          <div className="profile-dropdown">
            <div className="profile-dropdown-head">
              <strong>{profileDisplayName}</strong>
              <span>{session.academyName || data.academy.name || "الأكاديمية"}</span>
            </div>
            {!session?.isFirstLogin && (
              <button className="profile-home" type="button" onClick={handleProfileHome}>
                <Activity size={17} />
                <span>القائمة الرئيسية</span>
              </button>
            )}
            {profileMenuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    navigateToView(item.id);
                    setIsProfileMenuOpen(false);
                  }}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button className="profile-logout" type="button" onClick={handleLogout}>
              <LockKeyhole size={17} />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        )}
      </div>

      {showGlobalHeader && <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <Dumbbell size={22} />
          </div>
          <div>
            <strong>Al-Qaisar Master Dashboard</strong>
            <span>{session.academyName || data.academy.name || "الأكاديمية"}</span>
          </div>
        </div>
      </header>}

      <main className="main-panel">
        <div className="view-transition" key={displayedView}>
          {!session?.isFirstLogin && currentPageGuide && (
            <PageContextBar
              guide={currentPageGuide}
              canGoBack={canGoBack}
              canAccessView={(viewId) => visibleNavItems.some((item) => item.id === viewId)}
              onBack={goBackToPreviousView}
              onNavigate={navigateToView}
            />
          )}

          {showScreenTitle && <header className="screen-titlebar">
            <div>
              <p className="eyebrow">لوحة الإدارة</p>
              <h1>{visibleNavItems.find((item) => item.id === displayedView)?.label}</h1>
            </div>
            <div className="search-box">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث عن لاعب أو فريق"
              />
            </div>
          </header>}

          {displayedView === "home" && <Dashboard {...viewProps} />}
          {displayedView === "coachSetup" && <CoachSetup {...viewProps} />}
          {displayedView === "coaches" && <CoachesSettings {...viewProps} />}
          {displayedView === "platformDashboard" && <PlatformDashboard {...viewProps} />}
          {displayedView === "platformReports" && <PlatformReports {...viewProps} />}
          {displayedView === "settings" && <AcademySettings {...viewProps} />}
          {displayedView === "ageGroups" && <AgeGroups {...viewProps} />}
          {displayedView === "teams" && <Teams {...viewProps} />}
          {displayedView === "teamProfile" && <TeamProfile {...viewProps} />}
          {displayedView === "players" && <Players {...viewProps} />}
          {displayedView === "playerProfile" && <PlayerProfile {...viewProps} />}
          {displayedView === "attendance" && <Attendance {...viewProps} />}
          {displayedView === "reports" && <Reports {...viewProps} />}
          {displayedView === "accountProfile" && <AccountProfile {...viewProps} />}
          {displayedView === "gamification" && <Gamification {...viewProps} />}
          {displayedView === "matches" && <Matches {...viewProps} />}
          {displayedView === "notifications" && <Notifications {...viewProps} />}
          {displayedView === "community" && <Community {...viewProps} />}
        </div>
      </main>

      {showBottomNav && <nav className="bottom-nav" aria-label="التنقل السفلي">
        <div className="bottom-nav-track" ref={bottomNavRef}>
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={displayedView === item.id ? "bottom-nav-item active" : "bottom-nav-item"}
                key={item.id}
                onClick={() => navigateToView(item.id)}
                title={item.label}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>}
    </div>
  );
}

function PageContextBar({ guide, canGoBack, canAccessView, onBack, onNavigate }) {
  const quickActions = [
    guide.primaryView && { viewId: guide.primaryView, label: guide.primaryLabel },
    guide.secondaryView && { viewId: guide.secondaryView, label: guide.secondaryLabel },
  ].filter(Boolean).filter((action) => canAccessView(action.viewId));

  return (
    <section className="page-context-bar" aria-label="إرشاد الصفحة">
      <button
        className="page-context-back"
        type="button"
        onClick={onBack}
        disabled={!canGoBack}
        aria-label="العودة للصفحة السابقة"
      >
        <ArrowRight size={16} />
      </button>
      <div className="page-context-copy">
        <strong>{guide.title}</strong>
        <span>{guide.text}</span>
      </div>
      {quickActions.length > 0 && (
        <div className="page-context-actions">
          {quickActions.map((action) => (
            <button key={action.viewId} type="button" onClick={() => onNavigate(action.viewId)}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function RenewalGate({ academyName, renewalInfo, canRenew, isOnline, onRenew, onLogout }) {
  const [message, setMessage] = useState("");
  const [isRenewing, setIsRenewing] = useState(false);

  const handleRenew = async () => {
    setIsRenewing(true);
    const result = await onRenew();
    setMessage(result.message);
    setIsRenewing(false);
  };

  return (
    <main className="renewal-lock-screen">
      <section className="renewal-lock-card">
        <div className="renewal-lock-icon">
          <LockKeyhole size={34} />
        </div>
        <span>انتهت مدة التجديد</span>
        <h1>{academyName}</h1>
        <p>
          يعمل التطبيق لمدة {RENEWAL_PERIOD_DAYS} يومًا. انتهت المدة في {renewalInfo.expiresAt} ويجب التجديد من الحساب الرئيسي للأكاديمية.
        </p>

        <div className="renewal-lock-details">
          <div>
            <small>آخر تجديد</small>
            <strong>{renewalInfo.lastRenewedAt}</strong>
          </div>
          <div>
            <small>تاريخ الإغلاق</small>
            <strong>{renewalInfo.expiresAt}</strong>
          </div>
        </div>

        {canRenew ? (
          <button className="renewal-primary-button" type="button" onClick={handleRenew} disabled={isRenewing}>
            <RefreshCw size={18} />
            {isRenewing ? "جاري التجديد..." : `تجديد ${RENEWAL_PERIOD_DAYS} يوم`}
          </button>
        ) : (
          <div className="renewal-owner-note">
            سجّل الدخول بالحساب الرئيسي للأكاديمية لتجديد التطبيق.
          </div>
        )}

        {!isOnline && (
          <div className="renewal-offline-note">
            لا يوجد اتصال الآن. يمكن للمالك التجديد على هذا الجهاز، وستتم المزامنة عند عودة الإنترنت.
          </div>
        )}

        {message && <p className="renewal-message">{message}</p>}

        <button className="renewal-logout-button" type="button" onClick={onLogout}>
          تسجيل الخروج
        </button>
      </section>
    </main>
  );
}

function Dashboard({ data, stats, helpers, setActiveView, setSelectedPlayerId, session }) {
  const [homeSearch, setHomeSearch] = useState("");
  const [activeHomeGroup, setActiveHomeGroup] = useState("all");
  const academyLogo = data.academy.logo || session?.academyLogo || "";
  const academyName = data.academy.name || session?.academyName || "اسم الأكاديمية";
  const academyNameEn = data.academy.nameEn || session?.academyNameEn || "Official Sports Academy";
  const activeAlerts = stats.absent + stats.late;
  const ageFilters = data.ageGroups.length ? data.ageGroups.slice(0, 4) : ageGroupPresets.slice(0, 3);
  const homePlayers = data.players
    .filter((player) => {
      const team = helpers.teamById[player.teamId];
      const group = helpers.groupById[team?.ageGroupId];
      const searchTarget = `${player.name} ${team?.name || ""} ${group?.name || ""} ${player.guardianPhone || ""}`.toLowerCase();
      const matchesSearch = searchTarget.includes(homeSearch.toLowerCase());
      const matchesGroup =
        activeHomeGroup === "all" ||
        team?.ageGroupId === activeHomeGroup ||
        group?.presetKey === activeHomeGroup ||
        group?.name === activeHomeGroup;

      return matchesSearch && matchesGroup;
    })
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 8);

  return (
    <section className="mobile-home">
      <header className="home-hero-header">
        <div className="home-brand-copy">
          <span className="home-brand-label">SPORTS ACADEMY</span>
          <strong>{academyName}</strong>
          <em>{academyNameEn}</em>
        </div>
        <div className="home-logo-mark" aria-label="شعار الأكاديمية">
          {academyLogo ? <img src={academyLogo} alt="شعار الأكاديمية" loading="lazy" decoding="async" /> : <Dumbbell size={20} />}
        </div>
        <button className="home-refresh-button" type="button" onClick={() => setActiveView("home")} aria-label="تحديث الرئيسية">
          <Activity size={16} />
        </button>
      </header>

      <div className="home-alert">
        <Bell size={16} />
        <span>{activeAlerts} متابعة تحتاج مراجعة اليوم</span>
      </div>

      <div className="home-stat-grid">
        <article>
          <span>اللاعبين</span>
          <strong>{data.players.length}</strong>
          <small>لاعب مسجل</small>
          <Users size={18} />
        </article>
        <article>
          <span>الحضور</span>
          <strong>{stats.present}</strong>
          <small>حاضر اليوم</small>
          <span className="home-live-dot" aria-hidden="true" />
        </article>
      </div>

      <section className="home-balance">
        <div>
          <span>رصيد الأكاديمية</span>
          <strong>{currency(stats.revenue)}</strong>
          <small>آخر دخل مسجل</small>
        </div>
        <div className="home-balance-icon">
          <Wallet size={23} />
        </div>
      </section>

      <div className="home-actions">
        <button type="button" onClick={() => setActiveView("reports")} aria-label="المالية">
          <Wallet size={17} />
          المالية
        </button>
        <button type="button" onClick={() => setActiveView("attendance")}>
          <CalendarCheck size={16} />
          الحضور
        </button>
        <button className="active" type="button" onClick={() => setActiveView("players")}>
          <Users size={16} />
          إضافة لاعب
        </button>
      </div>

      <label className="home-search">
        <Search size={16} />
        <input
          value={homeSearch}
          onChange={(event) => setHomeSearch(event.target.value)}
          placeholder="ابحث باسم لاعب، ولي أمر، أو فريق"
        />
      </label>

      <div className="home-chips">
        <button className={activeHomeGroup === "all" ? "active" : ""} type="button" onClick={() => setActiveHomeGroup("all")}>الكل</button>
        {ageFilters.map((group) => (
          <button
            className={activeHomeGroup === (group.id || group.key) ? "active" : ""}
            key={group.id || group.key}
            type="button"
            onClick={() => setActiveHomeGroup(group.id || group.key)}
          >
            {group.name}
          </button>
        ))}
      </div>

      <section className="home-player-list">
        <h2>قائمة اللاعبين <span>{homePlayers.length}</span></h2>
        {homePlayers.length === 0 && (
          <div className="home-empty-list">
            لا توجد نتائج مطابقة. غيّر البحث أو الفئة، أو أضف لاعبًا جديدًا.
          </div>
        )}
        {homePlayers.map((player) => (
          <button
            className="home-player-card"
            key={player.id}
            type="button"
            onClick={() => {
              setSelectedPlayerId(player.id);
              setActiveView("playerProfile");
            }}
          >
            <div className="home-player-avatar">
              {player.photo ? <img src={player.photo} alt={player.name} loading="lazy" decoding="async" /> : <UserCircle size={28} />}
            </div>
            <div>
              <strong>{player.name}</strong>
              <span>{helpers.teamById[player.teamId]?.name || "بدون فريق"}</span>
            </div>
            <b>{player.xp} XP</b>
          </button>
        ))}
      </section>
    </section>
  );
}

function PlatformDashboard({
  data,
  stats,
  platformUsers,
  registrationRequests,
  refreshPlatformUsers,
  refreshRegistrationRequests,
  updateRegistrationRequest,
  resetPlatformUserPassword,
  togglePlatformUserStatus,
  deletePlatformUser,
}) {
  const [visiblePasswordRows, setVisiblePasswordRows] = useState({});
  const [temporaryPasswords, setTemporaryPasswords] = useState({});
  const [resettingRows, setResettingRows] = useState({});
  const [passwordMessages, setPasswordMessages] = useState({});
  const [isRefreshingRequests, setIsRefreshingRequests] = useState(false);
  const [requestsRefreshMessage, setRequestsRefreshMessage] = useState("");
  const pending = registrationRequests.filter((request) => request.status === "قيد المراجعة").length;
  const approved = registrationRequests.filter((request) => request.status === "مقبول").length;
  const rejected = registrationRequests.filter((request) => request.status === "مرفوض").length;
  const approvedAccounts = platformUsers || [];

  const handlePasswordReset = async (user) => {
    const rowKey = user.id || user.phone;
    setResettingRows((prev) => ({ ...prev, [rowKey]: true }));
    setPasswordMessages((prev) => ({ ...prev, [rowKey]: "" }));

    try {
      const result = await resetPlatformUserPassword(user);
      if (result.ok) {
        setTemporaryPasswords((prev) => ({ ...prev, [rowKey]: result.temporaryPassword }));
        setVisiblePasswordRows((prev) => ({ ...prev, [rowKey]: true }));
      }
      setPasswordMessages((prev) => ({ ...prev, [rowKey]: result.message }));
    } catch (error) {
      setPasswordMessages((prev) => ({ ...prev, [rowKey]: error.message || "تعذر تغيير كلمة السر." }));
    } finally {
      setResettingRows((prev) => ({ ...prev, [rowKey]: false }));
    }
  };

  const handleRefreshRequests = async () => {
    setIsRefreshingRequests(true);
    setRequestsRefreshMessage("");
    try {
      const [requests] = await Promise.all([
        refreshRegistrationRequests?.(),
        refreshPlatformUsers?.(),
      ]);
      setRequestsRefreshMessage(`تم تحديث الطلبات: ${Array.isArray(requests) ? requests.length : registrationRequests.length} طلب.`);
    } catch (error) {
      setRequestsRefreshMessage(error.message || "تعذر تحديث الطلبات.");
    } finally {
      setIsRefreshingRequests(false);
    }
  };

  return (
    <section className="view-stack">
      <header className="platform-admin-hero">
        <div>
          <span>الحساب الرئيسي</span>
          <h1>إدارة الحسابات والطلبات</h1>
          <p>تحكم في الحسابات المعتمدة، كلمات السر، طلبات التسجيل، وتنظيف بيانات التجربة.</p>
        </div>
        <div className="platform-hero-actions">
          <button type="button" onClick={handleRefreshRequests} disabled={isRefreshingRequests}>
            <RefreshCw size={17} className={isRefreshingRequests ? "spin-icon" : ""} />
            تحديث الطلبات
          </button>
          <ShieldCheck size={34} />
        </div>
      </header>
      {requestsRefreshMessage && <p className="platform-refresh-message">{requestsRefreshMessage}</p>}

      <div className="metric-grid">
        <Metric title="طلبات بانتظار الموافقة" value={pending} icon={ClipboardCheck} tone="amber" />
        <Metric title="حسابات معتمدة" value={approvedAccounts.length} icon={BadgeCheck} tone="green" />
        <Metric title="طلبات مرفوضة" value={rejected} icon={Bell} tone="red" />
        <Metric title="إجمالي الإيرادات" value={currency(stats.revenue)} icon={CircleDollarSign} tone="blue" />
      </div>

      <div className="split-layout">
        <section className="panel">
          <PanelHead
            title="نظرة عامة على المنصة"
            text="متابعة كل البيانات التشغيلية قبل الدخول إلى تفاصيل كل أكاديمية."
            icon={Activity}
          />
          <div className="detail-grid">
            <Detail label="الأكاديميات المسجلة" value={Math.max(approved, 1)} />
            <Detail label="اللاعبون" value={data.players.length} />
            <Detail label="الفرق" value={data.teams.length} />
            <Detail label="الفئات العمرية" value={data.ageGroups.length} />
            <Detail label="حضور اليوم" value={stats.present} />
            <Detail label="مدفوعات مسجلة" value={currency(stats.revenue)} />
          </div>
        </section>

        <section className="panel">
          <PanelHead
            title="حالة الطلبات"
            text="مراجعة سريعة لحالة طلبات الانضمام."
            icon={ClipboardList}
          />
          <div className="status-row">
            <StatusPill label="قيد المراجعة" value={pending} />
            <StatusPill label="مقبول" value={approved} />
            <StatusPill label="مرفوض" value={rejected} />
          </div>
          <p className="muted platform-note">
            عند الموافقة على الطلب يتم اعتبار الأكاديمية جاهزة للتهيئة، ثم يمكن للمالك إكمال إعدادات الأكاديمية والفئات والفرق.
          </p>
        </section>
      </div>

      <section className="panel table-panel platform-table-card">
        <PanelHead
          title="الحسابات المعتمدة"
          text={`كل أكاديمية يمكن ربطها بحد أقصى ${MAX_ACADEMY_ACCOUNTS} حسابات. يمكنك حذف حسابات التجربة من هنا.`}
          icon={LockKeyhole}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>المستخدم</th>
                <th>رقم الهاتف</th>
                <th>كلمة السر</th>
                <th>الأكاديمية</th>
                <th>الدور</th>
                <th>الصلاحية</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {approvedAccounts.length === 0 && (
                <tr>
                  <td className="empty-table-cell" colSpan="8">لا توجد حسابات معتمدة بعد</td>
                </tr>
              )}
              {approvedAccounts.map((user) => {
                const rowKey = user.id || user.phone;
                const isPasswordVisible = Boolean(visiblePasswordRows[rowKey]);
                const PasswordIcon = isPasswordVisible ? EyeOff : Eye;
                const visiblePassword = temporaryPasswords[rowKey];

                return (
                <tr key={rowKey}>
                  <td>{user.name}</td>
                  <td>{user.phone}</td>
                  <td>
                    <div className="password-admin-box">
                      <div className="password-cell">
                        <span className="password-safe-pill">
                          {isPasswordVisible
                            ? visiblePassword || "الأصلية غير محفوظة كنص - عيّن كلمة جديدة"
                            : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setVisiblePasswordRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }))}
                          aria-label={isPasswordVisible ? "إخفاء كلمة السر" : "عرض كلمة السر"}
                          title={isPasswordVisible ? "إخفاء" : "عرض"}
                        >
                          <PasswordIcon size={15} />
                        </button>
                      </div>
                      <button
                        className="mini-button password-reset-button"
                        type="button"
                        onClick={() => handlePasswordReset(user)}
                        disabled={Boolean(resettingRows[rowKey])}
                      >
                        {resettingRows[rowKey] ? "جاري التعيين..." : "تعيين كلمة جديدة"}
                      </button>
                      {passwordMessages[rowKey] && <small>{passwordMessages[rowKey]}</small>}
                    </div>
                  </td>
                  <td>{user.academyName}</td>
                  <td>{user.role}</td>
                  <td>{user.permissions}</td>
                  <td>
                    <div className="account-status-actions">
                      <span className={`status-badge ${user.status === "نشط" ? "ok" : "danger"}`}>
                        {user.status || "نشط"}
                      </span>
                      <button
                        className={user.status === "معطل" ? "mini-button approve" : "mini-button reject"}
                        type="button"
                        onClick={() => togglePlatformUserStatus(user)}
                      >
                        {user.status === "معطل" ? "تفعيل" : "إيقاف"}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="platform-account-actions">
                      <button
                        className="mini-button danger"
                        type="button"
                        onClick={() => deletePlatformUser(user)}
                      >
                        <Trash2 size={14} />
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel table-panel platform-table-card">
        <PanelHead
          title="طلبات تسجيل الأكاديميات"
          text="وافق على الأكاديميات الجديدة أو ارفض الطلبات غير المكتملة."
          icon={Users}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>الأكاديمية</th>
                <th>المسؤول</th>
                <th>التواصل</th>
                <th>المدينة</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {registrationRequests.map((request) => (
                <tr key={request.id}>
                  <td>{request.academyName}</td>
                  <td>{request.ownerName}</td>
                  <td>{request.contact}</td>
                  <td>{request.city}</td>
                  <td>{request.createdAt}</td>
                  <td>
                    <span className={`status-badge ${request.status === "مقبول" ? "ok" : request.status === "مرفوض" ? "danger" : ""}`}>
                      {request.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-row">
                      <button className="mini-button approve" onClick={() => updateRegistrationRequest(request.id, "مقبول")}>
                        موافقة
                      </button>
                      <button className="mini-button reject" onClick={() => updateRegistrationRequest(request.id, "مرفوض")}>
                        رفض
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function PlatformReports({ academyDataById, platformUsers, registrationRequests }) {
  const approvedRequests = (registrationRequests || []).filter((request) => request.status === STATUS_APPROVED);
  const academyIds = new Set([
    ...Object.keys(academyDataById || {}),
    ...(platformUsers || []).map((user) => user.academyId).filter(Boolean),
    ...approvedRequests.map((request) => requestAcademyId(request)).filter(Boolean),
  ]);

  const academyRows = Array.from(academyIds).map((academyId) => {
    const accounts = (platformUsers || []).filter((user) => user.academyId === academyId);
    const ownerAccount = accounts.find((user) => user.role === ROLE_OWNER) || accounts[0] || {};
    const request = approvedRequests.find((item) => requestAcademyId(item) === academyId);
    const academyData = normalizeAcademyData(academyDataById?.[academyId], {
      name: ownerAccount.name || request?.ownerName,
      phone: ownerAccount.phone || request?.phone,
      academyName: ownerAccount.academyName || request?.academyName,
    });
    const accountsByPhone = new Map();

    [
      ...accounts,
      ...(academyData.users || []),
      ...(request
        ? [{
            name: request.ownerName,
            phone: request.phone || request.contact,
            role: ROLE_OWNER,
            academyId,
            academyName: request.academyName,
            permissions: PERMISSION_FULL,
            status: request.status === STATUS_APPROVED ? "نشط" : request.status,
          }]
        : []),
    ].forEach((account) => {
      const key = normalizePhone(account.phone) || account.id || account.name;
      if (!key) return;
      accountsByPhone.set(key, {
        name: account.name || "مستخدم",
        phone: account.phone || "",
        role: account.role || ROLE_COACH,
        permissions: account.permissions || PERMISSION_ATTENDANCE_PLAYERS,
        status: account.status || "نشط",
      });
    });

    const linkedAccounts = Array.from(accountsByPhone.values());
    const summary = academyData.cloudSummary || {};
    const hasDetailedPlayers = academyData.players.length > 0;
    const activePlayers = academyData.players.filter((player) => player.status !== "منقطع");
    const playerCount = hasDetailedPlayers ? academyData.players.length : Number(summary.playersCount || 0);
    const activePlayerCount = hasDetailedPlayers ? activePlayers.length : Number(summary.activePlayers || 0);
    const stoppedPlayers = hasDetailedPlayers ? academyData.players.length - activePlayers.length : Number(summary.stoppedPlayers || 0);
    const paidByPlayer = academyData.payments.reduce((map, payment) => {
      map[payment.playerId] = (map[payment.playerId] || 0) + Number(payment.amount || 0);
      return map;
    }, {});
    const expected = hasDetailedPlayers
      ? academyData.players.reduce((sum, player) => sum + Number(player.monthlyFee || 0), 0)
      : Number(summary.expectedRevenue || 0);
    const collected = academyData.payments.length
      ? academyData.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      : Number(summary.collectedRevenue || 0);
    const expensesTotal = academyData.expenses.length
      ? academyData.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
      : Number(summary.totalExpenses || 0);
    const remaining = hasDetailedPlayers
      ? academyData.players.reduce((sum, player) => {
          const due = Number(player.monthlyFee || 0);
          const paid = paidByPlayer[player.id] || 0;
          return sum + Math.max(due - paid, 0);
        }, 0)
      : Number(summary.remainingRevenue || 0);
    const storedCoaches = academyData.coaches || [];
    const accountCoaches = linkedAccounts.filter((user) => user.role !== ROLE_OWNER);
    const primaryCoach = academyData.coach?.name
      ? [{ name: academyData.coach.name, phone: academyData.coach.phone, role: "مدرب رئيسي", permissions: PERMISSION_FULL, status: "نشط" }]
      : [];
    const coachesByPhone = new Map();

    [...primaryCoach, ...storedCoaches, ...accountCoaches].forEach((coach) => {
      const key = normalizePhone(coach.phone) || coach.id || coach.name;
      if (!key) return;
      coachesByPhone.set(key, {
        name: coach.name || "مدرب",
        phone: coach.phone || "",
        role: coach.role || ROLE_COACH,
        permissions: coach.permissions || PERMISSION_ATTENDANCE_PLAYERS,
        status: coach.status || "نشط",
      });
    });

    const coaches = Array.from(coachesByPhone.values());
    const debtPlayers = academyData.players
      .map((player) => {
        const due = Number(player.monthlyFee || 0);
        const paid = paidByPlayer[player.id] || 0;
        return {
          ...player,
          paid,
          remaining: Math.max(due - paid, 0),
        };
      })
      .filter((player) => player.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);

    return {
      academyId,
      name: academyData.academy.name || ownerAccount.academyName || request?.academyName || "أكاديمية بدون اسم",
      owner: ownerAccount.name || request?.ownerName || academyData.coach?.name || "-",
      phone: ownerAccount.phone || request?.phone || academyData.academy.ownerPhone || "-",
      accounts: linkedAccounts,
      coaches,
      players: academyData.players,
      playerCount,
      activePlayers,
      activePlayerCount,
      stoppedPlayers,
      teams: academyData.teams,
      collected,
      expensesTotal,
      netRevenue: collected - expensesTotal,
      expected,
      remaining,
      debtPlayers,
      hasLocalDetails: hasDetailedPlayers,
      hasCloudSummary: Boolean(summary.playersCount || summary.collectedRevenue || summary.remainingRevenue),
    };
  });

  const totals = academyRows.reduce(
    (sum, academy) => ({
      academies: sum.academies + 1,
      coaches: sum.coaches + academy.coaches.length,
      players: sum.players + academy.playerCount,
      collected: sum.collected + academy.collected,
      expenses: sum.expenses + academy.expensesTotal,
      net: sum.net + academy.netRevenue,
      remaining: sum.remaining + academy.remaining,
    }),
    { academies: 0, coaches: 0, players: 0, collected: 0, expenses: 0, net: 0, remaining: 0 },
  );

  return (
    <section className="platform-report-screen">
      <div className="platform-report-hero">
        <div>
          <span>للحساب الرئيسي فقط</span>
          <h1>تقارير الأكاديميات</h1>
          <p>ملخص سريع لكل أكاديمية: المدربون، اللاعبين، المحصل، والمتبقي لدى اللاعبين.</p>
        </div>
        <ClipboardList size={34} />
      </div>

      <div className="metric-grid">
        <Metric title="الأكاديميات" value={totals.academies} icon={ShieldCheck} tone="blue" />
        <Metric title="المدربون" value={totals.coaches} icon={Users} tone="green" />
        <Metric title="اللاعبون" value={totals.players} icon={UserCircle} tone="amber" />
        <Metric title="المتبقي" value={currency(totals.remaining)} icon={Wallet} tone="red" />
      </div>

      <section className="platform-report-summary">
        <div>
          <span>إجمالي المحصل</span>
          <strong>{currency(totals.collected)}</strong>
        </div>
        <div>
          <span>إجمالي المصروفات</span>
          <strong>{currency(totals.expenses)}</strong>
        </div>
        <div>
          <span>صافي الأكاديميات</span>
          <strong>{currency(totals.net)}</strong>
        </div>
        <div>
          <span>إجمالي المتبقي</span>
          <strong>{currency(totals.remaining)}</strong>
        </div>
      </section>

      <section className="academy-report-list">
        {academyRows.length === 0 && (
          <div className="finance-empty">لا توجد أكاديميات معتمدة بعد.</div>
        )}

        {academyRows.map((academy) => (
          <article className="academy-report-card" key={academy.academyId}>
            <div className="academy-report-head">
              <div>
                <span>{academy.owner}</span>
                <h2>{academy.name}</h2>
                <small>{academy.phone}</small>
              </div>
              <b>{academy.hasLocalDetails ? "تفاصيل محلية" : academy.hasCloudSummary ? "ملخص عام" : "بيانات أساسية"}</b>
            </div>

            <div className="academy-report-kpis">
              <Detail label="المدربون" value={academy.coaches.length} />
              <Detail label="الحسابات" value={academy.accounts.length} />
              <Detail label="اللاعبون" value={academy.playerCount} />
              <Detail label="النشطون" value={academy.activePlayerCount} />
              <Detail label="المنقطعون" value={academy.stoppedPlayers} />
              <Detail label="المحصل" value={currency(academy.collected)} />
              <Detail label="المصروفات" value={currency(academy.expensesTotal)} />
              <Detail label="الصافي" value={currency(academy.netRevenue)} />
              <Detail label="المتبقي" value={currency(academy.remaining)} />
            </div>

            <div className="academy-report-mini">
              <div>
                <strong>المدربون</strong>
                {academy.coaches.length === 0 && <span>لا توجد بيانات مدربين بعد.</span>}
                {academy.coaches.slice(0, 3).map((coach) => (
                  <span key={`${academy.academyId}-${coach.phone || coach.name}`}>
                    {coach.name} - {coach.role} - {coach.permissions} - {coach.status}
                  </span>
                ))}
              </div>
              <div>
                <strong>الحسابات المرتبطة</strong>
                {academy.accounts.length === 0 && <span>لا توجد حسابات مرتبطة بعد.</span>}
                {academy.accounts.slice(0, 4).map((account) => (
                  <span className="academy-account-line" key={`${academy.academyId}-account-${account.phone || account.name}`}>
                    {account.name} - {account.phone || "بدون رقم"} - {account.role} - {account.permissions} - {account.status}
                  </span>
                ))}
              </div>
              <div>
                <strong>أعلى المتبقيات</strong>
                {!academy.hasLocalDetails && academy.hasCloudSummary && <span>تفاصيل اللاعبين محفوظة محليًا، ويظهر هنا الملخص المالي العام فقط.</span>}
                {academy.debtPlayers.length === 0 && <span>لا توجد مبالغ متبقية مسجلة.</span>}
                {academy.debtPlayers.slice(0, 3).map((player) => (
                  <span key={player.id}>{player.name}: {currency(player.remaining)}</span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel table-panel">
        <PanelHead
          title="جدول مختصر"
          text="قراءة سريعة قابلة للمقارنة بين الأكاديميات."
          icon={ClipboardList}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>الأكاديمية</th>
                <th>الحسابات</th>
                <th>المدربون</th>
                <th>اللاعبون</th>
                <th>المحصل</th>
                <th>المتبقي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {academyRows.map((academy) => (
                <tr key={`row-${academy.academyId}`}>
                  <td>{academy.name}</td>
                  <td>{academy.accounts.length}</td>
                  <td>{academy.coaches.length}</td>
                  <td>{academy.playerCount}</td>
                  <td>{currency(academy.collected)}</td>
                  <td>{currency(academy.remaining)}</td>
                  <td>{academy.hasLocalDetails ? "تفصيلي محلي" : academy.hasCloudSummary ? "ملخص عام" : "أساسي"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function PasswordField({ value, onChange, name, placeholder, required = false, minLength, autoComplete }) {
  const [isVisible, setIsVisible] = useState(false);
  const Icon = isVisible ? EyeOff : Eye;

  return (
    <div className="password-field">
      <input
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={isVisible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
        title={isVisible ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
      >
        <Icon size={17} />
      </button>
    </div>
  );
}

function ImageSourceControls({ name, onChange }) {
  return (
    <div className="image-source-controls" aria-label="اختيار مصدر الصورة">
      <label>
        <Camera size={16} />
        <span>الكاميرا</span>
        <input name={name} type="file" accept="image/*" capture="environment" onChange={onChange} />
      </label>
      <label>
        <Plus size={16} />
        <span>المعرض</span>
        <input name={name} type="file" accept="image/*" onChange={onChange} />
      </label>
    </div>
  );
}

function LoginPassword({
  data,
  users,
  registrationRequests,
  refreshPlatformUsers,
  refreshRegistrationRequests,
  onVerified,
  onRequestRegistration,
}) {
  const [mode, setMode] = useState("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [registration, setRegistration] = useState({
    academyName: "",
    ownerName: "",
    phone: "",
    password: "",
    city: "",
  });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const findRequestByPhone = (normalizedPhone, requests = registrationRequests) =>
    (requests || []).find((request) => normalizePhone(request.phone || request.contact) === normalizedPhone);

  const findAcademyByName = (academyName, requests = registrationRequests, userList = users) => {
    const normalizedName = normalizeText(academyName);
    return [
      ...(userList || []),
      ...(requests || []),
    ].find((item) => item.status !== STATUS_REJECTED && normalizeText(item.academyName) === normalizedName);
  };

  const findAccountByPhone = (normalizedPhone, requests = registrationRequests, userList = users) => {
    if (normalizedPhone === SUPER_ADMIN_PHONE) {
      return {
        id: "super-admin",
        name: "مدير المنصة",
        phone: SUPER_ADMIN_PHONE,
        password: SUPER_ADMIN_PASSWORD,
        role: ROLE_SUPER_ADMIN,
        academyId: "platform",
        academyName: "إدارة المنصة",
        permissions: PERMISSION_FULL,
        status: "نشط",
      };
    }

    const localUser = (userList || []).find((user) => normalizePhone(user.phone) === normalizedPhone);
    if (localUser) {
      return localUser.status === "معطل" ? { ...localUser, blocked: true } : localUser;
    }

    const approvedRequest = (requests || []).find(
      (request) => normalizePhone(request.phone || request.contact) === normalizedPhone && request.status === STATUS_APPROVED,
    );

    if (!approvedRequest) return null;

    return {
      id: `request-${approvedRequest.id}`,
      name: approvedRequest.ownerName,
      phone: normalizedPhone,
      academyId: requestAcademyId(approvedRequest),
      passwordHash: approvedRequest.passwordHash,
      role: ROLE_OWNER,
      academyName: approvedRequest.academyName,
      permissions: PERMISSION_FULL,
      status: "نشط",
    };
  };

  const findCloudAcademyAccountByPhone = async (normalizedPhone) => {
    const rows = await listRemoteAcademyData();
    if (!Array.isArray(rows) || !rows.length) return null;

    for (const row of rows) {
      const academyId = row.academyId;
      const academyData = normalizeAcademyData(row.data || {});
      const usersMatch = (academyData.users || [])
        .map((user) => accountFromAcademyCloudUser(user, academyData, academyId))
        .find((account) => normalizePhone(account?.phone) === normalizedPhone);

      if (usersMatch) return usersMatch;

      const coachesMatch = (academyData.coaches || [])
        .map((coach) => accountFromAcademyCloudCoach(coach, academyData, academyId))
        .find((account) => normalizePhone(account?.phone) === normalizedPhone);

      if (coachesMatch) return coachesMatch;
    }

    return null;
  };

  const passwordMatches = async (account, enteredPassword) => {
    if (account.passwordHash) {
      return (await hashPassword(enteredPassword)) === account.passwordHash;
    }

    if (!account.password) {
      return false;
    }

    return enteredPassword === account.password;
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setMessage("");

    const normalizedPhone = normalizePhone(phone);

    if (normalizedPhone.length < 8 || password.length < 1) {
      setMessage("أدخل رقم الهاتف وكلمة السر للمتابعة.");
      return;
    }

    setIsLoading(true);
    try {
      const liveRegistrationRequests = await refreshRegistrationRequests?.();
      const liveUsers = await refreshPlatformUsers?.();
      const requestsForLogin = Array.isArray(liveRegistrationRequests) ? liveRegistrationRequests : registrationRequests;
      const usersForLogin = Array.isArray(liveUsers) ? liveUsers : users;
      let account = findAccountByPhone(normalizedPhone, requestsForLogin, usersForLogin);
      const existingRequest = findRequestByPhone(normalizedPhone, requestsForLogin);

      if (!account) {
        account = await findCloudAcademyAccountByPhone(normalizedPhone);
      }

      if (!account) {
        if (existingRequest?.status === STATUS_PENDING) {
          setMessage("طلب التسجيل لهذا الرقم ما زال بانتظار موافقة إدارة المنصة.");
          return;
        }

        if (existingRequest?.status === STATUS_REJECTED) {
          setMessage("تم رفض طلب هذا الرقم سابقًا. يمكنك إرسال طلب جديد ببيانات مكتملة.");
        } else {
          setMessage("هذا الرقم غير مسجل كحساب معتمد. إذا كنت مالك أكاديمية جديدة فاضغط إنشاء حساب لإرسال طلب الموافقة.");
        }

        return;
      }

      if (account.blocked || account.status === "معطل") {
        setMessage("تم تعطيل هذا الحساب من إدارة الأكاديمية.");
        return;
      }

      const isCorrectPassword = await passwordMatches(account, password);
      if (!isCorrectPassword) {
        setMessage("كلمة السر غير صحيحة.");
        return;
      }

      if (account.passwordHash && account.academyId !== "platform") {
        upsertPlatformAccount(account).catch(() => {
          // The account was already valid for login; it can be indexed remotely on a later attempt.
        });
      }

      onVerified({
        userId: account.id,
        name: account.name,
        phone: normalizedPhone,
        role: account.role || ROLE_OWNER,
        academyId: account.academyId || makeAcademyId(normalizedPhone),
        academyName: account.academyName || data.academy.name,
        academyNameEn: account.academyNameEn || data.academy.nameEn,
        academyLogo: account.academyLogo || data.academy.logo,
        permissions: account.permissions || PERMISSION_FULL,
        signedInAt: new Date().toISOString(),
      });
    } catch (error) {
      setMessage(error.message || "تعذر تسجيل الدخول.");
    } finally {
      setIsLoading(false);
    }
  };

  const submitRegistration = async (event) => {
    event.preventDefault();
    setMessage("");

    const normalizedPhone = normalizePhone(registration.phone);
    if (normalizedPhone.length < 8) {
      setMessage("أدخل رقم هاتف صحيحًا.");
      return;
    }

    if (registration.password.length < 6) {
      setMessage("كلمة السر يجب أن تكون 6 أحرف أو أرقام على الأقل.");
      return;
    }

    setIsLoading(true);
    try {
      const liveRegistrationRequests = await refreshRegistrationRequests?.();
      const liveUsers = await refreshPlatformUsers?.();
      const requestsForRegistration = Array.isArray(liveRegistrationRequests) ? liveRegistrationRequests : registrationRequests;
      const usersForRegistration = Array.isArray(liveUsers) ? liveUsers : users;
      const existingAccount =
        findAccountByPhone(normalizedPhone, requestsForRegistration, usersForRegistration) ||
        (await findCloudAcademyAccountByPhone(normalizedPhone));
      const existingRequest = findRequestByPhone(normalizedPhone, requestsForRegistration);
      const existingAcademyName = findAcademyByName(registration.academyName, requestsForRegistration, usersForRegistration);

      if (existingAccount) {
        setMessage("هذا الرقم مسجل مسبقًا. يمكنك تسجيل الدخول مباشرة.");
        setPhone(normalizedPhone);
        setPassword("");
        setMode("login");
        return;
      }

      if (existingRequest) {
        setMessage("رقم الهاتف مسجل مسبقًا أو لديه طلب سابق، ولا يمكن استخدامه لإنشاء حساب جديد.");
        return;
      }

      if (existingAcademyName) {
        setMessage("اسم الأكاديمية مستخدم مسبقًا. يرجى تغيير اسم الأكاديمية.");
        return;
      }

      const passwordHash = await hashPassword(registration.password);
      await onRequestRegistration({
        academyName: registration.academyName,
        ownerName: registration.ownerName,
        phone: normalizedPhone,
        contact: normalizedPhone,
        passwordHash,
        city: registration.city,
      });

      setPhone(normalizedPhone);
      setPassword("");
      setRegistration({ academyName: "", ownerName: "", phone: "", password: "", city: "" });
      setMode("login");
      setMessage("تم إرسال طلب التسجيل. بعد موافقة السوبر أدمين يمكنك الدخول برقم الهاتف وكلمة السر.");
    } catch (error) {
      setMessage(error.message || "تعذر إرسال طلب التسجيل.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateRegistrationField = (field, value) => {
    setRegistration((prev) => ({ ...prev, [field]: value }));
  };

  const switchAuthMode = (nextMode) => {
    if (nextMode === mode) return;

    setMode(nextMode);
    setMessage("");

    if (nextMode === "register" && phone && !registration.phone) {
      setRegistration((prev) => ({ ...prev, phone: normalizePhone(phone) }));
    }

    if (nextMode === "login" && registration.phone && !phone) {
      setPhone(normalizePhone(registration.phone));
    }
  };

  const touchAuthMode = (event, nextMode) => {
    event.preventDefault();
    switchAuthMode(nextMode);
  };

  return (
    <main className="login-shell">
      <section className="login-hero">
        <div className="login-brand">
          <div className="brand-mark">
            <Dumbbell size={24} />
          </div>
          <div>
            <strong>Al-Qaisar Master Dashboard</strong>
            <span>منصة عامة لإدارة الأكاديميات الرياضية</span>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow">Phone & Password</p>
          <h1>ادخل إلى مساحة الأكاديمية الخاصة بك</h1>
          <p>
            كل أكاديمية تدخل برقم الهاتف وكلمة السر بعد اعتمادها من إدارة المنصة، ثم تظهر لها أدوات الإدارة الخاصة
            باللاعبين والفرق والحضور والمدفوعات.
          </p>
        </div>

        <div className="login-stats">
          <StatusPill label="أكاديميات" value="متعددة" />
          <StatusPill label="الدخول" value="كلمة سر" />
          <StatusPill label="الموافقة" value="إلزامية" />
        </div>
      </section>

      <section className="login-card">
        <div className="auth-switch" aria-label="اختيار وضع الدخول">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            aria-pressed={mode === "login"}
            onPointerDown={(event) => touchAuthMode(event, "login")}
            onClick={() => switchAuthMode("login")}
          >
            تسجيل الدخول
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            type="button"
            aria-pressed={mode === "register"}
            onPointerDown={(event) => touchAuthMode(event, "register")}
            onClick={() => switchAuthMode("register")}
          >
            إنشاء حساب
          </button>
        </div>

        {mode === "login" ? (
          <form className="form-panel" key="login-form" onSubmit={submitLogin} aria-busy={isLoading}>
            <FormTitle icon={LockKeyhole} title="تسجيل الدخول" />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="رقم الهاتف"
              inputMode="tel"
              required
            />
            <PasswordField
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="كلمة السر"
              required
              autoComplete="current-password"
            />
            <button className="primary-button" type="submit" disabled={isLoading}>
              <KeyRound size={18} />
              {isLoading ? "جاري التحقق..." : "دخول"}
            </button>
            <button className="auth-inline-switch" type="button" onPointerDown={(event) => touchAuthMode(event, "register")} onClick={() => switchAuthMode("register")}>
              إنشاء حساب جديد
            </button>
          </form>
        ) : (
          <form className="form-panel" key="register-form" onSubmit={submitRegistration} aria-busy={isLoading}>
            <FormTitle icon={Plus} title="إنشاء حساب أكاديمية" />
            <input
              value={registration.academyName}
              onChange={(event) => updateRegistrationField("academyName", event.target.value)}
              placeholder="اسم الأكاديمية"
              required
            />
            <input
              value={registration.ownerName}
              onChange={(event) => updateRegistrationField("ownerName", event.target.value)}
              placeholder="اسم المسؤول"
              required
            />
            <input
              value={registration.phone}
              onChange={(event) => updateRegistrationField("phone", event.target.value)}
              placeholder="رقم الهاتف"
              inputMode="tel"
              required
            />
            <PasswordField
              value={registration.password}
              onChange={(event) => updateRegistrationField("password", event.target.value)}
              placeholder="كلمة السر"
              required
              minLength="6"
              autoComplete="new-password"
            />
            <input
              value={registration.city}
              onChange={(event) => updateRegistrationField("city", event.target.value)}
              placeholder="المدينة"
              required
            />
            <button className="primary-button" type="submit" disabled={isLoading}>
              <Send size={18} />
              {isLoading ? "جاري إرسال الطلب..." : "إرسال الطلب للموافقة"}
            </button>
            <button className="auth-inline-switch" type="button" onPointerDown={(event) => touchAuthMode(event, "login")} onClick={() => switchAuthMode("login")}>
              لدي حساب، تسجيل الدخول
            </button>
          </form>
        )}

        {message && <p className="login-message">{message}</p>}

        <div className="login-modules">
          {navItems.slice(1, 5).map((item) => {
            const Icon = item.icon;
            return (
              <span key={item.id}>
                <Icon size={16} />
                {item.label}
              </span>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function AccountProfile({ data, session, updateAccountProfile }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const currentPhone = normalizePhone(session?.phone);
  const linkedCoach = (data.coaches || []).find((coach) => normalizePhone(coach.phone) === currentPhone);
  const primaryCoachPhoto =
    session?.role === ROLE_OWNER || normalizePhone(data.coach?.phone) === currentPhone ? data.coach?.photo || "" : "";
  const profilePhoto = session?.photo || linkedCoach?.photo || primaryCoachPhoto || "";
  const [photoPreview, setPhotoPreview] = useState(profilePhoto);
  const displayName = session?.name || data.coach?.name || "مستخدم الأكاديمية";

  useEffect(() => {
    setPhotoPreview(profilePhoto);
  }, [profilePhoto]);

  const updatePhotoPreview = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (event) => {
    setMessage("");
    setIsSaving(true);
    const result = await updateAccountProfile(event);
    setMessage(result.message);
    setIsSaving(false);

    if (result.ok) {
      event.currentTarget.elements.currentPassword.value = "";
      event.currentTarget.elements.newPassword.value = "";
      event.currentTarget.elements.confirmPassword.value = "";
    }
  };

  return (
    <section className="account-profile-screen">
      <header className="account-profile-hero">
        <div>
          <span>الملف الشخصي</span>
          <h1>{displayName}</h1>
          <p>{session?.academyName || data.academy.name || "الأكاديمية"}</p>
        </div>
        <UserCircle size={32} />
      </header>

      <section className="account-security-card">
        <div>
          <span>رقم الهاتف المسجل</span>
          <strong>{session?.phone}</strong>
        </div>
        <div>
          <span>الدور</span>
          <strong>{session?.role}</strong>
        </div>
        <div>
          <span>كلمة السر</span>
          <strong>•••••••• - مشفرة</strong>
        </div>
      </section>

      <form className="account-profile-form" onSubmit={handleSubmit}>
        <FormTitle icon={Settings} title="تعديل بيانات الحساب" />
        <div className="account-photo-block">
          <div className="account-photo-preview">
            {photoPreview ? <img src={photoPreview} alt="صورة المدرب" decoding="async" /> : <UserRound size={34} />}
          </div>
          <ImageSourceControls name="accountPhoto" onChange={updatePhotoPreview} />
        </div>
        <label>
          <span>اسم المستخدم</span>
          <input name="accountName" defaultValue={displayName} placeholder="اسم المستخدم" required />
        </label>
        <label>
          <span>كلمة السر الحالية</span>
          <PasswordField name="currentPassword" placeholder="مطلوبة عند تغيير كلمة السر فقط" autoComplete="current-password" />
        </label>
        <label>
          <span>كلمة السر الجديدة</span>
          <PasswordField name="newPassword" placeholder="اتركها فارغة إذا لا تريد التغيير" minLength="6" autoComplete="new-password" />
        </label>
        <label>
          <span>تأكيد كلمة السر الجديدة</span>
          <PasswordField name="confirmPassword" placeholder="تأكيد كلمة السر الجديدة" minLength="6" autoComplete="new-password" />
        </label>
        <button className="gold-button" type="submit" disabled={isSaving}>
          {isSaving ? "جاري الحفظ..." : "حفظ التغييرات"}
        </button>
        {message && <p className="account-profile-message">{message}</p>}
      </form>
    </section>
  );
}

function CoachSetup({ data, updateCoach }) {
  const coach = data.coach || seedData.coach;
  const [photoPreview, setPhotoPreview] = useState(coach.photo || "");
  const [formError, setFormError] = useState("");
  const updatePhotoPreview = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setPhotoPreview(URL.createObjectURL(file));
      setFormError("");
    }
  };
  const handleCoachSubmit = (event) => {
    if (!photoPreview) {
      event.preventDefault();
      setFormError("أضف صورة المدرب قبل المتابعة.");
      return;
    }

    updateCoach(event);
  };

  return (
    <section className="setup-screen coach-setup-screen">
      <header className="setup-header light">
        <span>إعداد بيانات المدرب</span>
        <span aria-hidden="true">?</span>
      </header>

      <div className="setup-intro">
        <h1>أهلًا بك في منصة الأكاديمية الرياضية</h1>
        <p>يرجى إدخال ملفك الشخصي كمدرب حتى تظهر بياناتك داخل صفحات الأكاديمية.</p>
      </div>

      <form className="setup-card coach-card" onSubmit={handleCoachSubmit}>
        <div className="coach-photo">
          {photoPreview ? <img src={photoPreview} alt="صورة المدرب" decoding="async" /> : <UserRound size={52} />}
          <span><Camera size={14} /></span>
        </div>
        <ImageSourceControls name="coachPhoto" onChange={updatePhotoPreview} />
        <strong className="coach-name">{coach.name}</strong>
        {formError && <p className="setup-error">{formError}</p>}

        <label>
          <span>اسم المدرب *</span>
          <input name="coachName" defaultValue={coach.name} placeholder="أدخل اسم المدرب" required />
        </label>

        <label>
          <span>تاريخ الميلاد *</span>
          <div className="field-with-icon">
            <CalendarCheck size={17} />
            <input name="birthDate" defaultValue={coach.birthDate} type="date" required />
          </div>
        </label>

        <label>
          <span>رقم الهاتف *</span>
          <div className="field-with-icon">
            <LockKeyhole size={17} />
            <input name="phone" defaultValue={coach.phone} inputMode="tel" placeholder="+967 770 000 000" required />
          </div>
        </label>

        <label>
          <span>الجنسية *</span>
          <select name="nationality" defaultValue={coach.nationality} required>
            <option>اليمن - الريال اليمني</option>
            <option>السعودية - الريال السعودي</option>
            <option>الإمارات - الدرهم</option>
            <option>عُمان - الريال العماني</option>
          </select>
        </label>

        <label>
          <span>نبذة مختصرة *</span>
          <textarea name="bio" defaultValue={coach.bio} placeholder="اكتب نبذة قصيرة عن خبرتك التدريبية..." required />
        </label>

        <div className="setup-note">
          <CheckCircle2 size={18} />
          <p>لن يتم مشاركة بياناتك الشخصية إلا داخل مساحة الأكاديمية.</p>
        </div>

        <button className="gold-button" type="submit">حفظ ومتابعة</button>
      </form>

      <section className="setup-help">
        <BadgeCheck size={18} />
        <div>
          <strong>هل تحتاج مساعدة؟</strong>
          <p>يمكنك تعديل بيانات المدرب لاحقًا من صفحة الإعدادات.</p>
        </div>
      </section>
    </section>
  );
}

function CoachesSettings({ data, addAcademyCoach, toggleAcademyCoachStatus }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const storedCoaches = data.coaches || [];
  const storedPrimary = storedCoaches.find((coach) => coach.id === "coach-primary");
  const hasPrimaryCoach = Boolean(storedPrimary || data.coach?.name || data.coach?.phone);
  const primaryCoach = {
    ...storedPrimary,
    id: "coach-primary",
    name: data.coach?.name || storedPrimary?.name || "المدرب الرئيسي",
    phone: normalizePhone(data.coach?.phone || storedPrimary?.phone || ""),
    role: storedPrimary?.role || "مدرب رئيسي",
    permissions: storedPrimary?.permissions || "إدارة كاملة",
    status: storedPrimary?.status || "نشط",
    joinedAt: storedPrimary?.joinedAt || today,
  };
  const coaches = [
    ...(hasPrimaryCoach ? [primaryCoach] : []),
    ...storedCoaches.filter((coach) => coach.id !== "coach-primary"),
  ];

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    const form = new FormData(event.currentTarget);
    const result = await addAcademyCoach({
      name: String(form.get("coachName") || "").trim(),
      phone: form.get("phone"),
      role: form.get("role"),
      permissions: form.get("permissions"),
      password: String(form.get("password") || ""),
    });

    setMessage(result.message);
    setIsSaving(false);

    if (result.ok) {
      event.currentTarget.reset();
    }
  };

  return (
    <section className="setup-screen coaches-setup-screen">
      <header className="setup-header dark">
        <span>إدارة المدربين</span>
        <span aria-hidden="true">?</span>
      </header>

      <form className="setup-card coach-link-card" onSubmit={handleSubmit}>
        <section className="age-hero-card">
          <span>ربط آمن</span>
          <h2>إضافة مدرب لنفس الأكاديمية</h2>
          <p>أضف رقم الهاتف وكلمة سر مؤقتة، ثم يدخل المدرب إلى نفس مساحة {data.academy.name} حسب الصلاحية المحددة له.</p>
        </section>

        <label>
          <span>اسم المدرب *</span>
          <input name="coachName" placeholder="اكتب اسم المدرب" required />
        </label>

        <label>
          <span>رقم الهاتف *</span>
          <div className="field-with-icon">
            <LockKeyhole size={17} />
            <input name="phone" inputMode="tel" placeholder="+967 7xx xxx xxx" required />
          </div>
        </label>

        <label>
          <span>الدور *</span>
          <select name="role" defaultValue="مدرب" required>
            <option>مدرب</option>
            <option>مساعد مدرب</option>
            <option>إداري فريق</option>
            <option>مدرب رئيسي</option>
          </select>
        </label>

        <label>
          <span>الصلاحية *</span>
          <select name="permissions" defaultValue="الحضور واللاعبين" required>
            <option>إدارة كاملة</option>
            <option>الحضور واللاعبين</option>
            <option>متابعة فريق محدد</option>
            <option>قراءة فقط</option>
          </select>
        </label>

        <label>
          <span>كلمة سر مؤقتة *</span>
          <div className="field-with-icon">
            <KeyRound size={17} />
            <PasswordField name="password" minLength="6" placeholder="6 أحرف أو أرقام على الأقل" autoComplete="new-password" required />
          </div>
        </label>

        {message && <p className={message.startsWith("تم") ? "setup-success" : "setup-error"}>{message}</p>}

        <button className="gold-button" type="submit" disabled={isSaving}>
          {isSaving ? "جاري الربط..." : "ربط المدرب بالأكاديمية"}
        </button>
      </form>

      <section className="coach-roster-list">
        <div className="coach-roster-head">
          <Users size={18} />
          <h2>المدربون المرتبطون</h2>
        </div>

        {coaches.map((coach) => {
          const isPrimary = coach.id === "coach-primary";
          const isDisabled = coach.status === "معطل";
          const coachAvatar = coach.photo || (isPrimary ? data.coach?.photo : "") || data.academy.logo || "";

          return (
            <article key={coach.id} className={isDisabled ? "coach-roster-card disabled" : "coach-roster-card"}>
              <div className="coach-roster-avatar">
                {coachAvatar ? <img src={coachAvatar} alt={coach.name} loading="lazy" decoding="async" /> : <UserRound size={22} />}
              </div>
              <div className="coach-roster-info">
                <strong>{coach.name}</strong>
                <span>{coach.phone || "لم يحدد رقم الهاتف"}</span>
                <small>{coach.role} - {coach.permissions}</small>
              </div>
              <div className="coach-roster-actions">
                <span className={isDisabled ? "coach-status-chip muted" : "coach-status-chip"}>
                  {coach.status}
                </span>
                {isPrimary ? (
                  <span className="coach-status-chip primary">رئيسي</span>
                ) : (
                  <button type="button" onClick={() => toggleAcademyCoachStatus(coach.id)}>
                    {isDisabled ? "تفعيل" : "تعطيل"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {coaches.length === 0 && (
          <div className="coach-roster-empty">
            لا يوجد مدربون مرتبطون بعد. أضف أول مدرب حقيقي من النموذج أعلاه.
          </div>
        )}
      </section>
    </section>
  );
}

function AcademySettings({ data, updateAcademy, exportLocalBackup, importLocalBackup, syncCurrentAcademyNow, cloudSyncState, isOnline }) {
  const [logoPreview, setLogoPreview] = useState(data.academy.logo || "");
  const [locationText, setLocationText] = useState(data.academy.location || "");
  const [gpsLocation, setGpsLocation] = useState(data.academy.gpsLocation || "");
  const [gpsMessage, setGpsMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  const updateLogoPreview = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setLogoPreview(URL.createObjectURL(file));
      setFormError("");
    }
  };

  const requestGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsMessage("خدمة GPS غير مدعومة في هذا الجهاز.");
      return;
    }

    setGpsMessage("جاري تحديد الموقع...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        setGpsLocation(nextLocation);
        setLocationText(`GPS: ${nextLocation}`);
        setGpsMessage("تم تحديد موقع الأكاديمية بنجاح.");
        setFormError("");
      },
      () => {
        setGpsMessage("تعذر تحديد الموقع. تأكد من السماح للمتصفح باستخدام GPS.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };
  const handleAcademySubmit = (event) => {
    if (!logoPreview) {
      event.preventDefault();
      setFormError("أضف شعار الأكاديمية قبل المتابعة.");
      return;
    }

    if (!gpsLocation) {
      event.preventDefault();
      setFormError("حدد موقع الأكاديمية عبر GPS قبل المتابعة.");
      return;
    }

    updateAcademy(event);
  };
  const handleBackupExport = async () => {
    setBackupMessage("");
    setIsBackupBusy(true);
    const result = await exportLocalBackup?.();
    setBackupMessage(result?.message || "تم تنفيذ العملية.");
    setIsBackupBusy(false);
  };
  const handleBackupImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBackupMessage("");
    setIsBackupBusy(true);
    const result = await importLocalBackup?.(file);
    setBackupMessage(result?.message || "تم تنفيذ العملية.");
    setIsBackupBusy(false);
    event.target.value = "";
  };
  const handleManualSync = async () => {
    setSyncMessage("");
    setIsManualSyncing(true);
    const result = await syncCurrentAcademyNow?.();
    setSyncMessage(result?.message || "تم تنفيذ المزامنة.");
    setIsManualSyncing(false);
  };
  const syncStatusText = !isOnline
    ? "بدون إنترنت: سيتم الرفع تلقائيًا عند عودة الاتصال."
    : cloudSyncState?.saving
      ? "جاري رفع البيانات العامة..."
      : cloudSyncState?.error
        ? cloudSyncState.error
        : cloudSyncState?.syncedAt
          ? `آخر مزامنة: ${new Date(cloudSyncState.syncedAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}`
          : "المزامنة التلقائية مفعلة.";

  return (
    <section className="setup-screen academy-setup-screen">
      <header className="setup-header dark">
        <span>الإعدادات والنسخ الاحتياطي</span>
        <span aria-hidden="true">?</span>
      </header>

      <section className="setup-card backup-card backup-card-prominent">
        <section className="age-hero-card">
          <span>نسخة احتياطية</span>
          <h2>حفظ آمن لكل بيانات التطبيق</h2>
          <p>اختر مكان الحفظ أولًا عند دعم الجهاز، ثم ينشئ التطبيق ملفًا مضغوطًا ويختبره قبل حفظه.</p>
        </section>

        <div className="backup-security-grid">
          <span><ShieldCheck size={16} /> بصمة تحقق SHA-256</span>
          <span><FolderOpen size={16} /> اختيار مسار الحفظ قبل إنشاء النسخة</span>
          <span><FileCheck2 size={16} /> فحص الملف قبل الحفظ وقبل الاسترداد</span>
        </div>

        <div className="backup-actions">
          <button className="yellow-button" type="button" onClick={handleBackupExport} disabled={isBackupBusy}>
            <Download size={18} />
            اختيار المسار وإنشاء نسخة
          </button>
          <label className={isBackupBusy ? "backup-import-button disabled" : "backup-import-button"}>
            <Upload size={18} />
            استيراد نسخة احتياطية
            <input type="file" accept=".gz,.json,application/gzip,application/json" onChange={handleBackupImport} disabled={isBackupBusy} />
          </label>
        </div>

        <small className="backup-path-note">
          إذا كان الجهاز يدعم اختيار المسار ستظهر نافذة الحفظ قبل إنشاء النسخة. على بعض هواتف Android يتم الحفظ تلقائيًا في التنزيلات حسب قيود النظام.
        </small>

        {backupMessage && <p className={backupMessage.startsWith("تم") ? "setup-success" : "setup-error"}>{backupMessage}</p>}
      </section>

      <form className="setup-card academy-card" onSubmit={handleAcademySubmit}>
        <div className="logo-uploader">
          {logoPreview ? <img src={logoPreview} alt="شعار الأكاديمية" decoding="async" /> : <Camera size={28} />}
          <span aria-label="تأكيد الشعار"><CheckCircle2 size={15} /></span>
        </div>
        <ImageSourceControls name="academyLogo" onChange={updateLogoPreview} />
        <p className="upload-caption">رفع شعار الأكاديمية</p>
        {formError && <p className="setup-error">{formError}</p>}

        <label>
          <span>اسم الأكاديمية *</span>
          <input name="name" defaultValue={data.academy.name} placeholder="اكتب اسم الأكاديمية" required />
        </label>

        <label>
          <span>اسم الأكاديمية بالإنجليزية</span>
          <input name="nameEn" dir="ltr" defaultValue={data.academy.nameEn} placeholder="Academy official English name" />
        </label>

        <label>
          <span>اسم المدرب *</span>
          <input name="coachName" defaultValue={data.coach?.name || data.academy.field} placeholder="اكتب اسم المدرب" required />
        </label>

        <label>
          <span>الموقع (اختياري)</span>
          <textarea
            name="location"
            value={locationText}
            onChange={(event) => setLocationText(event.target.value)}
            placeholder="أدخل تفاصيل العنوان، الشارع، والمنطقة..."
          />
        </label>
        <input name="gpsLocation" type="hidden" value={gpsLocation} />

        <div className="gps-row">
          <MapPin size={19} />
          <strong>تحديد الموقع عبر GPS</strong>
          <button type="button" onClick={requestGpsLocation}>اختيار</button>
        </div>
        {gpsMessage && <p className="gps-message">{gpsMessage}</p>}

        <div className="location-preview">
          <MapPin size={42} />
          <span>موقع الأكاديمية</span>
        </div>

        <button className="yellow-button" type="submit">
          <CheckCircle2 size={18} />
          إتمام الإعداد
        </button>
        <small className="setup-footnote">يمكنك تعديل هذه البيانات لاحقًا من قسم الإعدادات.</small>
      </form>

      <section className="setup-card sync-card">
        <section className="age-hero-card">
          <span>مزامنة</span>
          <h2>رفع الإعدادات إلى الإنترنت</h2>
          <p>زر المزامنة يرفع البيانات العامة ثم يتحقق من وجودها في السحابة. بيانات اللاعبين وصورهم تبقى محفوظة على الهاتف فقط.</p>
        </section>

        <div className={cloudSyncState?.error || !isOnline ? "sync-status warning" : "sync-status"}>
          <RefreshCw size={18} className={cloudSyncState?.saving || isManualSyncing ? "spin-icon" : ""} />
          <span>{syncStatusText}</span>
        </div>

        <button className="yellow-button" type="button" onClick={handleManualSync} disabled={!isOnline || isManualSyncing || cloudSyncState?.saving}>
          <RefreshCw size={18} className={isManualSyncing || cloudSyncState?.saving ? "spin-icon" : ""} />
          مزامنة الآن
        </button>

        {syncMessage && <p className={syncMessage.startsWith("تم") ? "setup-success" : "setup-error"}>{syncMessage}</p>}
      </section>

    </section>
  );
}

function AgeGroups({ data, addAgeGroup, updateAgeGroup, removeAgeGroup, finishOnboarding, helpers, isFirstLogin, setActiveView }) {
  const [formError, setFormError] = useState("");
  const [editingGroup, setEditingGroup] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const activePresetKey =
    editingGroup?.presetKey || ageGroupPresets.find((preset) => preset.name === editingGroup?.name)?.key || ageGroupPresets[0].key;
  const activeDays = editingGroup
    ? trainingDayOptions.filter((day) => (editingGroup.days || "").includes(day))
    : trainingDayOptions.filter((_, index) => index === 1 || index === 3);

  const readAgeGroupForm = (form) => {
    const preset = ageGroupPresets.find((item) => item.key === form.get("preset")) || ageGroupPresets[0];
    const selectedDays = trainingDayOptions.filter((day) => form.getAll("days").includes(day));

    return {
      presetKey: preset.key,
      name: preset.name,
      from: Number(preset.from),
      to: Number(preset.to),
      years: preset.years,
      days: selectedDays.join("، "),
      timeFrom: form.get("timeFrom"),
      timeTo: form.get("timeTo"),
    };
  };

  const handleAgeGroupSubmit = (event) => {
    const form = new FormData(event.currentTarget);
    const submitAction = event.nativeEvent.submitter?.value || "finish";

    if (!form.get("preset")) {
      event.preventDefault();
      setFormError("اختر الفئة العمرية قبل الحفظ.");
      return;
    }

    if (form.getAll("days").length === 0) {
      event.preventDefault();
      setFormError("اختر يوم تدريب واحدًا على الأقل.");
      return;
    }

    setFormError("");

    if (editingGroup) {
      event.preventDefault();
      const updates = readAgeGroupForm(form);
      updateAgeGroup(editingGroup.id, updates, { stay: true });
      setEditingGroup(null);
      setFormKey((value) => value + 1);
      if (submitAction === "finish") {
        finishOnboarding();
      }
      return;
    }

    const savedGroup = addAgeGroup(event);

    if (submitAction === "addAnother" && savedGroup) {
      setEditingGroup(null);
      setFormKey((value) => value + 1);
    }
  };

  const startEditingGroup = (group) => {
    setEditingGroup(group);
    setFormError("");
    setFormKey((value) => value + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditing = () => {
    setEditingGroup(null);
    setFormError("");
    setFormKey((value) => value + 1);
  };

  const deleteGroup = (group) => {
    removeAgeGroup(group.id, { stay: true });
    if (editingGroup?.id === group.id) {
      cancelEditing();
    }
  };

  return (
    <section className="setup-screen age-setup-screen">
      <header className="setup-header dark">
        <span>إعداد الفئات العمرية</span>
        <span aria-hidden="true">?</span>
      </header>

      <form className="setup-card age-card" key={formKey} onSubmit={handleAgeGroupSubmit}>
        <section className="age-hero-card">
          <span>{isFirstLogin ? "الخطوة 3" : "إدارة الفئات"}</span>
          <h2>{editingGroup ? "تعديل الفئة العمرية" : "تخصيص الفئات العمرية"}</h2>
          <p>اختر الفئة، ثم حدد أيام ومواعيد التدريب. كل الفئات المحفوظة تظهر أسفل الصفحة مباشرة.</p>
        </section>

        {editingGroup && (
          <div className="age-form-state">
            <strong>يتم تعديل: {editingGroup.name}</strong>
            <button type="button" onClick={cancelEditing}>إلغاء</button>
          </div>
        )}

        <div className="setup-section-title">
          <Layers size={17} />
          <strong>اختر الفئة</strong>
        </div>

        <div className="age-choice-grid">
          {ageGroupPresets.map((preset) => (
            <label className="age-choice" key={preset.key}>
              <input name="preset" type="radio" value={preset.key} defaultChecked={preset.key === activePresetKey} />
              <span>
                <b>{preset.name}</b>
                <small>{preset.years}</small>
              </span>
            </label>
          ))}
        </div>

        <div className="setup-section-title">
          <CalendarCheck size={17} />
          <strong>تحديد أيام التدريب</strong>
        </div>

        <div className="day-choice-grid">
          {trainingDayOptions.map((day) => (
            <label className="day-choice" key={day}>
              <input name="days" type="checkbox" value={day} defaultChecked={activeDays.includes(day)} />
              <span>{day}</span>
            </label>
          ))}
        </div>
        {formError && <p className="setup-error">{formError}</p>}

        <label>
          <span>من الساعة</span>
          <div className="field-with-icon">
            <Clock size={17} />
            <input name="timeFrom" type="time" defaultValue={editingGroup?.timeFrom || "16:00"} required />
          </div>
        </label>

        <label>
          <span>إلى الساعة</span>
          <div className="field-with-icon">
            <Clock size={17} />
            <input name="timeTo" type="time" defaultValue={editingGroup?.timeTo || "18:00"} required />
          </div>
        </label>

        <div className="training-preview">
          <span>ملعب الأكاديمية</span>
          <strong>{data.academy.location}</strong>
        </div>

        <button className="outline-gold-button" name="ageAction" value="addAnother" type="submit">
          {editingGroup ? "حفظ التعديل والبقاء هنا" : "حفظ الفئة وإضافة فئة جديدة"}
        </button>
        <button className="gold-button" name="ageAction" value="finish" type="submit">
          {editingGroup ? "حفظ التعديل والانتقال للرئيسية" : "حفظ الفئة والانتقال للرئيسية"}
        </button>
      </form>

      {data.ageGroups.length > 0 && (
        <button className="age-home-button" type="button" onClick={() => setActiveView?.("home")}>
          <ArrowRight size={17} />
          العودة إلى الشاشة الرئيسية
        </button>
      )}

      <section className="saved-age-list">
        <div className="saved-age-list-head">
          <h2>الفئات المضافة</h2>
          <span>{data.ageGroups.length} فئة</span>
        </div>
        {data.ageGroups.length === 0 && (
          <p className="saved-age-empty">لم تتم إضافة أي فئة بعد. احفظ أول فئة لتظهر هنا.</p>
        )}
        {data.ageGroups.map((group) => {
          const teams = data.teams.filter((team) => team.ageGroupId === group.id);
          const players = data.players.filter((player) => helpers.teamById[player.teamId]?.ageGroupId === group.id);
          return (
            <article key={group.id}>
              <div className="saved-age-main">
                <div>
                  <strong>{group.name}</strong>
                  <span>{group.years || `${group.from} - ${group.to}`}</span>
                </div>
                <b>{teams.length} فرق / {players.length} لاعبين</b>
              </div>
              <div className="selected-age-meta compact">
                <span><CalendarCheck size={15} /> {group.days || "لم يتم تحديد الأيام"}</span>
                <span><Clock size={15} /> {group.timeFrom && group.timeTo ? `${group.timeFrom} - ${group.timeTo}` : "لم يتم تحديد الوقت"}</span>
              </div>
              <div className="age-manage-row">
                <button className="mini-button" type="button" onClick={() => startEditingGroup(group)}>
                  تعديل
                </button>
                <button className="mini-button reject" type="button" onClick={() => deleteGroup(group)}>
                  حذف
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}

function Teams({ data, helpers, addTeam, updateTeamKitFee, setSelectedTeamId, setActiveView }) {
  return (
    <section className="view-grid">
      <form className="panel form-panel" onSubmit={addTeam}>
        <FormTitle icon={ShieldCheck} title="إنشاء فريق" />
        <input name="name" placeholder="اسم الفريق" required />
        <select name="ageGroupId" required>
          {data.ageGroups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
        <input name="coach" placeholder="المدرب المسؤول" required />
        <input name="kitFee" type="number" min="0" placeholder="قيمة الطقم الرياضي" />
        <button className="primary-button" type="submit">
          <Plus size={18} />
          إنشاء الفريق
        </button>
      </form>
      <section className="team-grid">
        {data.teams.map((team) => {
          const teamPlayers = data.players.filter((player) => player.teamId === team.id);
          return (
            <article className="team-card" key={team.id}>
              <div className="team-card-head">
                <h2>{team.name}</h2>
                <BadgeCheck size={22} />
              </div>
              <p>{helpers.groupById[team.ageGroupId]?.name} - {team.coach}</p>
              <div className="team-stats">
                <span>{teamPlayers.length} لاعب</span>
                <span>{team.wins} فوز</span>
                <span>{team.losses} خسارة</span>
                <span>الطقم {currency(team.kitFee)}</span>
              </div>
              <label className="team-kit-fee-field">
                <span>قيمة الطقم</span>
                <input
                  type="number"
                  min="0"
                  defaultValue={team.kitFee || ""}
                  onBlur={(event) => updateTeamKitFee(team.id, event.target.value)}
                  placeholder="قيمة الطقم"
                />
              </label>
              <button className="ghost-button" onClick={() => { setSelectedTeamId(team.id); setActiveView("teamProfile"); }}>
                فتح ملف الفريق
              </button>
            </article>
          );
        })}
      </section>
    </section>
  );
}

function TeamProfile({ data, helpers, selectedTeamId, setSelectedTeamId }) {
  const team = helpers.teamById[selectedTeamId] || data.teams[0];
  const players = data.players.filter((player) => player.teamId === team?.id);
  if (!team) {
    return (
      <EmptyState
        icon={Trophy}
        title="لا توجد فرق بعد"
        text="أضف الفئات العمرية ثم أنشئ أول فريق لتظهر بيانات ملف الفريق هنا."
      />
    );
  }

  const winRate = Math.round((team.wins / Math.max(team.wins + team.losses + team.draws, 1)) * 100);

  return (
    <section className="view-stack">
      <select className="compact-select" value={team?.id} onChange={(event) => setSelectedTeamId(event.target.value)}>
        {data.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="metric-grid">
        <Metric title="اللاعبون" value={players.length} icon={Users} tone="blue" />
        <Metric title="نسبة الفوز" value={`${winRate}%`} icon={Trophy} tone="green" />
        <Metric title="الأهداف المسجلة" value={team.goalsFor} icon={Activity} tone="amber" />
        <Metric title="الأهداف المستقبلة" value={team.goalsAgainst} icon={ShieldCheck} tone="red" />
      </div>
      <section className="panel table-panel">
        <PanelHead title={team.name} text={`${helpers.groupById[team.ageGroupId]?.name} - ${team.coach}`} icon={ShieldCheck} />
        <SimpleTable
          headers={["اللاعب", "المركز", "القميص", "التقييم", "XP"]}
          rows={players.map((player) => [player.name, player.position, player.jersey, `${player.rating}%`, player.xp])}
        />
      </section>
    </section>
  );
}

function Players({ data, helpers, addPlayer, togglePlayerStatus, setSelectedPlayerId, setActiveView }) {
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [activeGroupFilter, setActiveGroupFilter] = useState("all");
  const [playerPhotoPreview, setPlayerPhotoPreview] = useState("");
  const [birthDateValue, setBirthDateValue] = useState("");
  const [subscriptionChoice, setSubscriptionChoice] = useState("اشتراك شهري");
  const [monthlyFeeValue, setMonthlyFeeValue] = useState("");
  const [playerSortMode, setPlayerSortMode] = useState("age");
  const [playerFormMessage, setPlayerFormMessage] = useState("");
  const groupFilters = data.ageGroups.length ? data.ageGroups : ageGroupPresets;
  const selectedBirthYear = birthDateValue ? new Date(`${birthDateValue}T00:00:00`).getFullYear() : null;
  const selectedAgeGroupPreset = ageGroupPresetFromBirthDate(birthDateValue);
  const exactAgeText = exactAgeFromDate(birthDateValue);
  const teamsForSelectedGroup = selectedAgeGroupPreset
    ? data.teams.filter((team) => {
        const group = helpers.groupById[team.ageGroupId];
        const groupFrom = Number(group?.from);
        const groupTo = Number(group?.to || group?.from);
        const matchesSavedRange =
          Number.isFinite(selectedBirthYear) &&
          Number.isFinite(groupFrom) &&
          Number.isFinite(groupTo) &&
          selectedBirthYear >= groupFrom &&
          selectedBirthYear <= groupTo;

        return group?.presetKey === selectedAgeGroupPreset.key || group?.name === selectedAgeGroupPreset.name || matchesSavedRange;
      })
    : [];
  const expectedRevenue = data.players.reduce((sum, player) => sum + Number(player.monthlyFee || 0), 0);
  const paidRevenue = data.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const activePlayersCount = data.players.filter((player) => player.status !== "منقطع").length;
  const stoppedPlayersCount = data.players.length - activePlayersCount;
  const visiblePlayers = data.players
    .filter((player) => {
      const team = helpers.teamById[player.teamId];
      const group = helpers.groupById[team?.ageGroupId];
      const searchTarget = `${player.name} ${player.position} ${player.guardianPhone} ${team?.name || ""} ${group?.name || ""}`.toLowerCase();
      const matchesSearch = searchTarget.includes(playerSearch.toLowerCase());
      const matchesGroup =
        activeGroupFilter === "all" ||
        team?.ageGroupId === activeGroupFilter ||
        group?.presetKey === activeGroupFilter ||
        group?.name === activeGroupFilter;

      return matchesSearch && matchesGroup;
    })
    .sort((firstPlayer, secondPlayer) => comparePlayersBySortMode(firstPlayer, secondPlayer, playerSortMode));
  const updatePlayerPhotoPreview = (event) => {
    const file = event.target.files?.[0];
    setPlayerPhotoPreview(file ? URL.createObjectURL(file) : "");
  };
  const submitPlayer = async (event) => {
    const submitAction = event.nativeEvent.submitter?.value || "save";
    await addPlayer(event);
    setPlayerPhotoPreview("");
    setBirthDateValue("");
    setSubscriptionChoice("اشتراك شهري");
    setMonthlyFeeValue("");
    setPlayerFormMessage(submitAction === "save-add" ? "تم حفظ اللاعب. النموذج جاهز لإضافة لاعب جديد." : "تم حفظ اللاعب بنجاح.");
    setIsAddingPlayer(submitAction === "save-add");
  };

  return (
    <section className="players-mobile-screen">
      <header className="players-hero-card">
        <div>
          <span>إدارة اللاعبين</span>
          <h1>قائمة لاعبي الأكاديمية</h1>
          <p>{data.academy.name || "الأكاديمية"}</p>
        </div>
        <button type="button" onClick={() => setIsAddingPlayer((value) => !value)} aria-label="إضافة لاعب">
          <Plus size={21} />
        </button>
      </header>

      <div className="players-summary-grid">
        <article>
          <span>اللاعبين</span>
          <strong>{data.players.length}</strong>
          <small>مسجل</small>
        </article>
        <article>
          <span>الفرق</span>
          <strong>{activePlayersCount}</strong>
          <small>نشط</small>
        </article>
        <article>
          <span>منقطع</span>
          <strong>{stoppedPlayersCount}</strong>
          <small>موقوف</small>
        </article>
        <article>
          <span>المدفوع</span>
          <strong>{currency(paidRevenue)}</strong>
          <small>من {currency(expectedRevenue)}</small>
        </article>
      </div>

      <div className="players-toolbar">
        <label className="players-search">
          <Search size={16} />
          <input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="ابحث عن لاعب أو ولي أمر" />
        </label>
        <SortModeButton sortMode={playerSortMode} onToggle={() => setPlayerSortMode((mode) => (mode === "age" ? "name" : "age"))} />
        <button type="button" className={isAddingPlayer ? "active" : ""} onClick={() => setIsAddingPlayer((value) => !value)}>
          <Plus size={17} />
        </button>
      </div>

      <div className="players-filter-row">
        <button className={activeGroupFilter === "all" ? "active" : ""} type="button" onClick={() => setActiveGroupFilter("all")}>
          الكل
        </button>
        {groupFilters.map((group) => (
          <button
            className={activeGroupFilter === (group.id || group.key) ? "active" : ""}
            key={group.id || group.key}
            type="button"
            onClick={() => setActiveGroupFilter(group.id || group.key)}
          >
            {group.name}
          </button>
        ))}
      </div>

      {isAddingPlayer && (
        <form className="player-add-card" onSubmit={submitPlayer}>
          <div className="player-add-card-header">
            <span>إضافة لاعب جديد</span>
            <button type="button" onClick={() => setIsAddingPlayer(false)} aria-label="إغلاق النموذج">
              <X size={17} />
            </button>
          </div>
          {playerFormMessage && <p className="player-form-message">{playerFormMessage}</p>}

          <div className="player-photo-uploader">
            {playerPhotoPreview ? <img src={playerPhotoPreview} alt="صورة اللاعب" decoding="async" /> : <UserCircle size={54} />}
            <span><Plus size={18} /></span>
          </div>
          <ImageSourceControls name="playerPhoto" onChange={updatePlayerPhotoPreview} />
          <p className="player-photo-caption">صورة اللاعب</p>

          <div className="player-form-section-title">
            <Trophy size={17} />
            <strong>المعلومات الأساسية والرياضية</strong>
          </div>

          <label>
            <span>اسم اللاعب</span>
            <input name="name" placeholder="أدخل اسم اللاعب" required />
          </label>
          <label>
            <span>تاريخ الميلاد</span>
            <BirthDateFields value={birthDateValue} onChange={setBirthDateValue} required />
          </label>
          {birthDateValue && (
            <div className="player-age-result">
              <Clock size={16} />
              <span>العمر: <b>{exactAgeText || "تاريخ غير صحيح"}</b></span>
            </div>
          )}
          {selectedAgeGroupPreset && (
            <>
              <input type="hidden" name="ageGroupPreset" value={selectedAgeGroupPreset.key} />
              <div className="player-age-group-chip">
                <span>الفئة المناسبة</span>
                <strong>{selectedAgeGroupPreset.name}</strong>
                <small>{selectedAgeGroupPreset.years}</small>
              </div>
            </>
          )}
          <div className="two-cols">
            <label>
              <span>المركز</span>
              <select name="position" multiple required>
                {footballPositionOptions.map((position) => (
                  <option key={position.value} value={position.value}>{position.label}</option>
                ))}
              </select>
              <small>يمكن اختيار أكثر من مركز</small>
            </label>
            <label>
              <span>رقم القميص</span>
              <input name="jersey" placeholder="مثال: 10" required />
            </label>
          </div>
          <label>
            <span>رقم اللاعب إن وجد</span>
            <input name="playerNumber" inputMode="numeric" placeholder="اختياري" />
          </label>
          <label>
            <span>رقم ولي الأمر</span>
            <input name="guardianPhone" inputMode="tel" placeholder="رقم ولي الأمر" required />
          </label>
          <label>
            <span>الفريق</span>
            <select name="teamId" required disabled={!selectedAgeGroupPreset || !teamsForSelectedGroup.length}>
              <option value="">
                {!birthDateValue
                  ? "أدخل تاريخ الميلاد أولًا"
                  : teamsForSelectedGroup.length
                    ? `اختر فريق ${selectedAgeGroupPreset.name}`
                    : `لا يوجد فريق لفئة ${selectedAgeGroupPreset?.name || "مناسبة"}`}
              </option>
              {teamsForSelectedGroup.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          {selectedAgeGroupPreset && !teamsForSelectedGroup.length && (
            <div className="player-form-guidance">
              <Layers size={17} />
              <span>لا يوجد فريق مرتبط بفئة {selectedAgeGroupPreset.name}. أنشئ الفريق أولًا ثم ارجع لإضافة اللاعب.</span>
              <button type="button" onClick={() => setActiveView("teams")}>إدارة الفرق</button>
            </div>
          )}
          <div className="player-subscription-section">
            <span>نوع الاشتراك</span>
            <div className="player-subscription-cards" role="radiogroup" aria-label="نوع الاشتراك">
              <label className={`player-subscription-card ${subscriptionChoice === "مجاني" ? "active" : ""}`}>
                <input
                  name="subscriptionType"
                  type="radio"
                  value="مجاني"
                  checked={subscriptionChoice === "مجاني"}
                  onChange={() => setSubscriptionChoice("مجاني")}
                />
                <Wallet size={18} />
                <strong>مجاني</strong>
                <small>بدون رسوم شهرية</small>
              </label>
              <label className={`player-subscription-card ${subscriptionChoice === "اشتراك شهري" ? "active" : ""}`}>
                <input
                  name="subscriptionType"
                  type="radio"
                  value="اشتراك شهري"
                  checked={subscriptionChoice === "اشتراك شهري"}
                  onChange={() => setSubscriptionChoice("اشتراك شهري")}
                />
                <CircleDollarSign size={18} />
                <strong>اشتراك شهري</strong>
                <small>تحديد مبلغ ثابت</small>
              </label>
            </div>
          </div>
          {subscriptionChoice === "مجاني" ? (
            <input type="hidden" name="monthlyFee" value="0" />
          ) : (
            <label>
              <span>قيمة الاشتراك الشهري</span>
              <input
                name="monthlyFee"
                type="number"
                min="0"
                placeholder="قيمة الاشتراك"
                value={monthlyFeeValue}
                onChange={(event) => setMonthlyFeeValue(event.target.value)}
                required
              />
            </label>
          )}
          <div className="player-save-actions">
            <button className="outline-gold-button" type="submit" value="save-add" disabled={!teamsForSelectedGroup.length}>
              حفظ مع إضافة لاعب
            </button>
            <button className="gold-button" type="submit" value="save" disabled={!teamsForSelectedGroup.length}>
              حفظ اللاعب
            </button>
          </div>
        </form>
      )}

      <section className="players-card-list">
        <div className="players-list-title">
          <h2>اللاعبون</h2>
          <span>{visiblePlayers.length}</span>
        </div>

        {visiblePlayers.length === 0 && (
          <div className="players-empty-state">
            لا يوجد لاعبون مطابقون. أضف لاعبًا جديدًا أو غيّر الفلتر.
          </div>
        )}

        {visiblePlayers.map((player) => {
          const team = helpers.teamById[player.teamId];
          const group = helpers.groupById[team?.ageGroupId];
          const playerAgeText = player.ageText || exactAgeFromDate(player.birthDate) || `${ageFromDate(player.birthDate)} سنة`;
          const isStopped = player.status === "منقطع";
          return (
            <button
              className={isStopped ? "player-mobile-card stopped" : "player-mobile-card"}
              key={player.id}
              type="button"
              onClick={() => {
                setSelectedPlayerId(player.id);
                setActiveView("playerProfile");
              }}
            >
              <div className="player-card-avatar">
                {player.photo ? <img src={player.photo} alt={player.name} loading="lazy" decoding="async" /> : player.name.slice(0, 1)}
                <span />
              </div>
              <div className="player-card-info">
                <strong>
                  {player.name}
                  {isStopped && <em>منقطع</em>}
                </strong>
                <span>{team?.name || "بدون فريق"} {group?.name ? `• ${group.name}` : ""}</span>
                <small>{player.position} #{player.jersey} - {playerAgeText}</small>
              </div>
              <div className="player-card-meta">
                <b>{currency(player.monthlyFee)}</b>
                <small>{player.subscriptionType}</small>
                <span
                  className={isStopped ? "player-status-toggle active" : "player-status-toggle"}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePlayerStatus(player.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      togglePlayerStatus(player.id);
                    }
                  }}
                >
                  {isStopped ? "تفعيل" : "إيقاف"}
                </span>
              </div>
            </button>
          );
        })}
      </section>
    </section>
  );
}

function PlayerProfile({ data, helpers, selectedPlayerId, setSelectedPlayerId, updatePlayerCard, updatePlayerDetails }) {
  const player = helpers.playerById[selectedPlayerId] || data.players[0];
  const attendance = data.attendance.filter((row) => row.playerId === player?.id);
  const payments = data.payments.filter((row) => row.playerId === player?.id);
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const playerAgeText = player?.ageText || exactAgeFromDate(player?.birthDate) || ageFromDate(player?.birthDate);
  if (!player) {
    return (
      <EmptyState
        icon={UserCircle}
        title="لا يوجد لاعبون بعد"
        text="بعد إضافة أول لاعب ستظهر هنا بيانات الملف، التقييم، الحضور، والمدفوعات."
      />
    );
  }

  return (
    <section className="view-stack">
      <select className="compact-select" value={player?.id} onChange={(event) => setSelectedPlayerId(event.target.value)}>
        {data.players.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="profile-header player-profile-hero">
        <div className="avatar-large">
          {player.photo ? <img src={player.photo} alt={player.name} loading="lazy" decoding="async" /> : player.name.slice(0, 1)}
        </div>
        <div>
          <h2>{player.name}</h2>
          <p>{helpers.teamById[player.teamId]?.name || "بدون فريق"} - {player.position} #{player.jersey}</p>
          <span>{player.guardianPhone}{player.playerNumber ? ` - رقم اللاعب ${player.playerNumber}` : ""}</span>
        </div>
      </div>
      <PlayerDetailsEditor key={player.id} data={data} helpers={helpers} player={player} updatePlayerDetails={updatePlayerDetails} />
      <PlayerShowCard player={player} updatePlayerCard={updatePlayerCard} />
      <div className="metric-grid">
        <Metric title="العمر" value={playerAgeText} icon={UserRound} tone="blue" />
        <Metric title="التقييم العام" value={`${player.rating}%`} icon={Star} tone="green" />
        <Metric title="المستوى" value={player.level} icon={Medal} tone="amber" />
        <Metric title="المدفوع" value={currency(paid)} icon={CircleDollarSign} tone="red" />
      </div>
      <div className="split-layout">
        <section className="panel">
          <PanelHead title="التقييم الفني" text="مهارة، لياقة، والتزام." icon={ClipboardCheck} />
          <Score label="المهارة" value={player.skill} />
          <Score label="اللياقة" value={player.fitness} />
          <Score label="الالتزام" value={player.commitment} />
        </section>
        <section className="panel">
          <PanelHead title="الإنجازات" text="الأوسمة التي حصل عليها اللاعب." icon={Medal} />
          <div className="roadmap">
            {player.badges.map((badge) => <span key={badge}>{badge}</span>)}
            {player.badges.length === 0 && <span>لا توجد أوسمة بعد</span>}
          </div>
        </section>
      </div>
      <section className="panel table-panel">
        <PanelHead title="سجل النشاط" text="آخر حضور ومدفوعات لهذا اللاعب." icon={ClipboardList} />
        <SimpleTable
          headers={["النوع", "التاريخ", "الحالة", "ملاحظة"]}
          rows={[
            ...attendance.map((row) => ["حضور", row.date, row.status, row.note || "-"]),
            ...payments.map((row) => ["دفعة", row.date, currency(row.amount), row.note || row.status]),
          ]}
        />
      </section>
    </section>
  );
}

function PlayerDetailsEditor({ data, helpers, player, updatePlayerDetails }) {
  const [photoPreview, setPhotoPreview] = useState(player.photo || "");
  const [birthDateValue, setBirthDateValue] = useState(player.birthDate || "");
  const [message, setMessage] = useState("");
  const playerPositions = positionListFromValue(player.position);

  useEffect(() => {
    setPhotoPreview(player.photo || "");
    setBirthDateValue(player.birthDate || "");
    setMessage("");
  }, [player.id, player.photo, player.birthDate]);

  const updatePhotoPreview = (event) => {
    const file = event.target.files?.[0];
    setPhotoPreview(file ? URL.createObjectURL(file) : player.photo || "");
  };

  const savePlayerDetails = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const teamId = form.get("teamId");
    const teamKitFee = helpers.teamById[teamId]?.kitFee;
    const photo = await fileToDataUrl(imageFileFromForm(form, "playerProfilePhoto"));
    updatePlayerDetails?.(player.id, {
      name: form.get("name"),
      photo: photo || player.photo || "",
      birthDate: birthDateValue,
      position: positionTextFromForm(form),
      jersey: form.get("jersey"),
      playerNumber: form.get("playerNumber"),
      guardianPhone: form.get("guardianPhone"),
      teamId,
      monthlyFee: Number(form.get("monthlyFee") || 0),
      subscriptionType: form.get("subscriptionType"),
      subscriptionPaidFull: form.get("subscriptionPaidFull") === "on",
      kitFee: Number(form.get("kitFee") || teamKitFee || 0),
      kitPaid: form.get("kitPaid") === "on",
    });
    setMessage("تم حفظ بيانات اللاعب.");
  };

  return (
    <form className="panel player-details-editor" onSubmit={savePlayerDetails}>
      <PanelHead title="تعديل بيانات اللاعب" text="يمكن تعديل كل بيانات اللاعب من هنا." icon={UserCircle} />
      <div className="player-details-photo">
        {photoPreview ? <img src={photoPreview} alt={player.name} decoding="async" /> : <UserCircle size={42} />}
      </div>
      <ImageSourceControls name="playerProfilePhoto" onChange={updatePhotoPreview} />
      <div className="player-details-grid">
        <label>
          <span>اسم اللاعب</span>
          <input name="name" defaultValue={player.name} required />
        </label>
        <label>
          <span>تاريخ الميلاد</span>
          <BirthDateFields value={birthDateValue} onChange={setBirthDateValue} required />
        </label>
        <label>
          <span>المركز</span>
          <select name="position" multiple defaultValue={playerPositions} required>
            {footballPositionOptions.map((position) => (
              <option key={position.value} value={position.value}>{position.label}</option>
            ))}
          </select>
          <small>يمكن اختيار أكثر من مركز</small>
        </label>
        <label>
          <span>رقم القميص</span>
          <input name="jersey" defaultValue={player.jersey || ""} required />
        </label>
        <label>
          <span>رقم اللاعب إن وجد</span>
          <input name="playerNumber" inputMode="numeric" defaultValue={player.playerNumber || ""} placeholder="اختياري" />
        </label>
        <label>
          <span>رقم ولي الأمر</span>
          <input name="guardianPhone" inputMode="tel" defaultValue={player.guardianPhone || ""} required />
        </label>
        <label>
          <span>الفريق</span>
          <select name="teamId" defaultValue={player.teamId || ""} required>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>نوع الاشتراك</span>
          <select name="subscriptionType" defaultValue={player.subscriptionType || "اشتراك شهري"}>
            <option value="اشتراك شهري">اشتراك شهري</option>
            <option value="مجاني">مجاني</option>
          </select>
        </label>
        <label>
          <span>قيمة الاشتراك</span>
          <input name="monthlyFee" type="number" min="0" defaultValue={player.monthlyFee || 0} />
        </label>
        <label>
          <span>قيمة الطقم الرياضي</span>
          <input name="kitFee" type="number" min="0" defaultValue={player.kitFee || helpers.teamById[player.teamId]?.kitFee || 0} />
        </label>
      </div>
      <div className="player-details-flags">
        <label>
          <input name="subscriptionPaidFull" type="checkbox" defaultChecked={Boolean(player.subscriptionPaidFull)} />
          <span>اللاعب دفع الاشتراك كاملًا</span>
        </label>
        <label>
          <input name="kitPaid" type="checkbox" defaultChecked={Boolean(player.kitPaid)} />
          <span>تم دفع قيمة الطقم الرياضي</span>
        </label>
      </div>
      <button className="yellow-button" type="submit">
        <CheckCircle2 size={18} />
        حفظ بيانات اللاعب
      </button>
      {message && <p className="setup-success">{message}</p>}
    </form>
  );
}

function PlayerShowCard({ player, updatePlayerCard }) {
  const card = player.playerCard || {};
  const cardRef = useRef(null);
  const [draft, setDraft] = useState(card);
  const [cardMessage, setCardMessage] = useState("");
  const stats = [
    ["pac", "PAC"],
    ["sho", "SHO"],
    ["pas", "PAS"],
    ["dri", "DRI"],
    ["def", "DEF"],
    ["phy", "PHY"],
  ];
  const profileRows = [
    ["nationality", "الجنسية"],
    ["club", "النادي"],
    ["age", "العمر"],
    ["foot", "القدم"],
  ];

  useEffect(() => {
    setDraft(card);
    setCardMessage("");
  }, [player.id]);

  const updateDraft = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };
  const updateDraftPositions = (event) => {
    const selected = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
    updateDraft("position", selected.join("، "));
  };

  const saveCard = (event) => {
    event.preventDefault();
    updatePlayerCard?.(player.id, draft);
    setCardMessage("تم حفظ بيانات البطاقة.");
  };

  const exportCardImage = async () => {
    setCardMessage("جاري تجهيز صورة البطاقة...");
    try {
      const blob = await elementToPngBlob(cardRef.current, 2.4);
      if (!blob) {
        setCardMessage("تعذر تجهيز الصورة على هذا الجهاز.");
        return null;
      }
      return blob;
    } catch {
      setCardMessage("تعذر تجهيز صورة البطاقة.");
      return null;
    }
  };

  const saveCardImage = async () => {
    const blob = await exportCardImage();
    if (!blob) return;
    const safeName = (player.name || "player").replace(/[^\w\u0600-\u06FF-]+/g, "-");
    const result = await saveBlobFile(blob, `${safeName}-player-card.png`, "صورة بطاقة اللاعب");
    setCardMessage(result.cancelled ? "تم إلغاء حفظ البطاقة." : `تم حفظ بطاقة اللاعب: ${result.filename}. المسار: ${result.location}.`);
  };

  const shareCard = async () => {
    const safeName = (player.name || "player").replace(/[^\w\u0600-\u06FF-]+/g, "-");
    const blob = await exportCardImage();
    const shareText = `بطاقة اللاعب ${player.name} - ${cardView.overall || cardView.rating || player.rating || "--"} OVR`;
    try {
      if (blob && navigator.canShare) {
        const file = new File([blob], `${safeName}-player-card.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: `بطاقة ${player.name}`, text: shareText, files: [file] });
          setCardMessage("تم فتح نافذة مشاركة البطاقة.");
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: `بطاقة ${player.name}`, text: shareText });
        setCardMessage("تم فتح نافذة المشاركة.");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setCardMessage("تم نسخ نص البطاقة للمشاركة.");
        return;
      }
      setCardMessage("المشاركة غير مدعومة في هذا الجهاز.");
    } catch {
      setCardMessage("تم إلغاء المشاركة أو تعذر تنفيذها.");
    }
  };

  const valueOrDash = (value, fallback = "---") => String(value || "").trim() || fallback;
  const cardView = { ...card, ...draft };
  const cardPosition = valueOrDash(cardView.position || player.position, "--");
  const cardRating = valueOrDash(cardView.rating || player.rating, "--");
  const overall = valueOrDash(cardView.overall || cardView.rating || player.rating, "--");

  return (
    <section className="player-showcase-panel">
      <form className="player-card-editor panel" onSubmit={saveCard}>
        <PanelHead title="بيانات بطاقة اللاعب" text="عبئ الخانات ثم احفظها لتظهر على البطاقة." icon={ClipboardCheck} />
        <div className="player-card-editor-grid">
          <label>
            <span>التقييم</span>
            <input value={draft.rating || ""} onChange={(event) => updateDraft("rating", event.target.value)} inputMode="numeric" maxLength="2" placeholder="99" />
          </label>
          <label>
            <span>المركز</span>
            <select multiple value={positionListFromValue(draft.position)} onChange={updateDraftPositions}>
              {footballPositionOptions.map((position) => (
                <option key={position.value} value={position.value}>{position.label}</option>
              ))}
            </select>
            <small>يمكن اختيار أكثر من مركز</small>
          </label>
          <label>
            <span>الجنسية</span>
            <input value={draft.nationality || ""} onChange={(event) => updateDraft("nationality", event.target.value)} placeholder="مثال: يمني" />
          </label>
          <label>
            <span>النادي</span>
            <input value={draft.club || ""} onChange={(event) => updateDraft("club", event.target.value)} placeholder="اسم النادي" />
          </label>
          <label>
            <span>العمر</span>
            <input value={draft.age || ""} onChange={(event) => updateDraft("age", event.target.value)} inputMode="numeric" placeholder="العمر" />
          </label>
          <label>
            <span>القدم</span>
            <input value={draft.foot || ""} onChange={(event) => updateDraft("foot", event.target.value)} placeholder="يمين / يسار" />
          </label>
          <label>
            <span>الطول</span>
            <input value={draft.height || ""} onChange={(event) => updateDraft("height", event.target.value)} inputMode="numeric" placeholder="سم" />
          </label>
          <label>
            <span>الوزن</span>
            <input value={draft.weight || ""} onChange={(event) => updateDraft("weight", event.target.value)} inputMode="numeric" placeholder="كغ" />
          </label>
          <label>
            <span>الرقم</span>
            <input value={draft.number || player.playerNumber || ""} onChange={(event) => updateDraft("number", event.target.value)} inputMode="numeric" placeholder="رقم اللاعب" />
          </label>
          <label>
            <span>مركز اللعب</span>
            <input value={draft.playCenter || ""} onChange={(event) => updateDraft("playCenter", event.target.value)} placeholder="مثال: جناح" />
          </label>
          <label>
            <span>التقييم الإجمالي</span>
            <input value={draft.overall || ""} onChange={(event) => updateDraft("overall", event.target.value)} inputMode="numeric" maxLength="2" placeholder="99" />
          </label>
        </div>
        <div className="player-card-stat-editor">
          {stats.map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <input value={draft[field] || ""} onChange={(event) => updateDraft(field, event.target.value)} inputMode="numeric" maxLength="2" placeholder="99" />
            </label>
          ))}
        </div>
        <button className="yellow-button" type="submit">
          <CheckCircle2 size={18} />
          حفظ البطاقة
        </button>
        {cardMessage && <p className={cardMessage.startsWith("تم") ? "setup-success" : "setup-error"}>{cardMessage}</p>}
      </form>

      <div className="player-card-actions">
        <button type="button" onClick={saveCardImage}>
          <ImageDown size={17} />
          حفظ البطاقة
        </button>
        <button type="button" onClick={shareCard}>
          <Share2 size={17} />
          مشاركة
        </button>
        <button type="button" onClick={() => navigator.clipboard?.writeText?.(`${player.name} - ${overall} OVR`)}>
          <Copy size={17} />
          نسخ مختصر
        </button>
      </div>

      <div className="player-show-card professional" ref={cardRef} aria-label="بطاقة اللاعب">
        <div className="player-card-crest" aria-hidden="true">★ ★ ★</div>
        <div className="player-show-card-top">
          <strong>{cardRating}</strong>
          <span>{cardPosition}</span>
        </div>

        <div className="player-card-gem" aria-hidden="true" />

        <div className="player-show-photo">
          {player.photo ? <img src={player.photo} alt={player.name} loading="lazy" decoding="async" /> : <UserCircle size={86} />}
        </div>

        <div className="player-card-info-box">
          {profileRows.map(([field, label]) => (
            <div key={field}>
              <b>{valueOrDash(cardView[field], "-")}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <strong className="player-show-name">{player.name || "اسم اللاعب"}</strong>

        <div className="player-show-stats">
          {stats.map(([field, label]) => (
            <div key={field}>
              <span>{label}</span>
              <strong>{valueOrDash(cardView[field], "--")}</strong>
            </div>
          ))}
        </div>

        <div className="player-card-extra-lines">
          <span>الطول <b>{valueOrDash(cardView.height)}</b> سم</span>
          <span>الرقم <b>{valueOrDash(cardView.number || player.playerNumber)}</b></span>
          <span>الوزن <b>{valueOrDash(cardView.weight)}</b> كغ</span>
          <span>مركز اللعب <b>{valueOrDash(cardView.playCenter)}</b></span>
        </div>

        <div className="player-card-overall">
          <span>التقييم الإجمالي</span>
          <strong>{overall}</strong>
        </div>
      </div>
    </section>
  );
}

function Attendance({ data, helpers, recordAttendance, addPayment }) {
  const groupOptions = data.ageGroups;
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [selectedGroupId, setSelectedGroupId] = useState(groupOptions[0]?.id || "");
  const [activePaymentPlayerId, setActivePaymentPlayerId] = useState("");
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [attendanceSortMode, setAttendanceSortMode] = useState("age");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [lastAttendanceAction, setLastAttendanceAction] = useState("");

  useEffect(() => {
    if (!groupOptions.length) {
      setSelectedGroupId("");
      return;
    }

    if (!groupOptions.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groupOptions[0].id);
    }
  }, [groupOptions, selectedGroupId]);

  const attendanceRows = Object.fromEntries(
    data.attendance
      .filter((row) => row.date === attendanceDate && (row.source === "attendance" || !row.source))
      .map((row) => [row.playerId, row]),
  );
  const attendancePayments = Object.fromEntries(
    data.payments
      .filter((payment) => payment.date === attendanceDate && payment.source === "attendance")
      .map((payment) => [payment.playerId, payment]),
  );
  const selectedGroup = helpers.groupById[selectedGroupId];
  const selectedDateDay = weekdayFromDate(attendanceDate);
  const selectedTrainingDays = trainingDaysForGroup(selectedGroup);
  const hasTrainingDays = selectedTrainingDays.length > 0;
  const isScheduledTrainingDay = Boolean(selectedGroup && hasTrainingDays && selectedTrainingDays.includes(selectedDateDay));
  const selectedGroupPlayers = data.players
    .filter((player) => player.status !== "منقطع" && helpers.teamById[player.teamId]?.ageGroupId === selectedGroupId)
    .sort((firstPlayer, secondPlayer) => comparePlayersBySortMode(firstPlayer, secondPlayer, attendanceSortMode));
  const groupPlayers = selectedGroupPlayers.filter((player) => {
    const team = helpers.teamById[player.teamId];
    const searchTarget = `${player.name} ${team?.name || ""} ${player.position || ""} ${player.guardianPhone || ""}`.toLowerCase();
    return searchTarget.includes(attendanceSearch.toLowerCase());
  });
  const countablePlayers = isScheduledTrainingDay ? selectedGroupPlayers : [];
  const presentCount = countablePlayers.filter((player) => attendanceRows[player.id]?.status === "حاضر").length;
  const lateCount = countablePlayers.filter((player) => attendanceRows[player.id]?.status === "متأخر").length;
  const absentCount = countablePlayers.filter((player) => attendanceRows[player.id]?.status === "غائب").length;

  const updatePlayerStatus = (player, status) => {
    if (!isScheduledTrainingDay) return;
    recordAttendance(player.id, status, attendanceDate);
    setLastAttendanceAction(`تم حفظ ${status} للاعب ${player.name}`);

    if (status === "غائب") {
      setActivePaymentPlayerId((current) => (current === player.id ? "" : current));
      return;
    }

    if (player.subscriptionPaidFull || Number(player.monthlyFee || 0) === 0) {
      setActivePaymentPlayerId("");
      return;
    }

    setActivePaymentPlayerId(player.id);
    setPaymentDrafts((prev) => ({
      ...prev,
      [player.id]: prev[player.id] ?? String(DEFAULT_ATTENDANCE_PAYMENT),
    }));
  };

  const saveAttendancePayment = (event, player) => {
    event.preventDefault();
    if (!isScheduledTrainingDay) return;
    const amount = Number(paymentDrafts[player.id] || DEFAULT_ATTENDANCE_PAYMENT);
    if (amount <= 0) return;

    addPayment({
      playerId: player.id,
      amount,
      date: attendanceDate,
      method: "نقدًا",
      status: "مدفوع",
      source: "attendance",
      note: `دفعة ${attendanceRows[player.id]?.status || "حضور"} من صفحة التحضير`,
    });
    setActivePaymentPlayerId("");
    setLastAttendanceAction(`تم حفظ دفعة ${currency(amount)} للاعب ${player.name}`);
  };

  return (
    <section className="attendance-mobile-screen">
      <header className="attendance-hero">
        <div>
          <span>تحضير اللاعبين</span>
          <h1>سجل الحضور اليومي</h1>
          <p>{data.academy.name || "الأكاديمية الرياضية"}</p>
        </div>
        <CalendarCheck size={30} />
      </header>

      <section className="attendance-date-panel">
        <div>
          <Clock size={17} />
          <span>{readableDate(attendanceDate)}</span>
        </div>
        <input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
      </section>

      <section className="attendance-group-panel">
        <div className="attendance-section-title">
          <Layers size={17} />
          <span>اختر فئة واحدة</span>
        </div>
        {groupOptions.length ? (
          <div className="attendance-group-scroll" role="radiogroup" aria-label="فئة التحضير">
            {groupOptions.map((group) => (
              <button
                key={group.id}
                className={selectedGroupId === group.id ? "active" : ""}
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
              >
                <strong>{group.name}</strong>
                <small>{trainingDaysForGroup(group).join("، ") || group.years}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="attendance-empty">أضف الفئات العمرية أولًا حتى تظهر صفحة التحضير.</div>
        )}
      </section>

      {selectedGroup && (
        <section className={`attendance-schedule-note ${isScheduledTrainingDay ? "valid" : "blocked"}`}>
          <CalendarCheck size={18} />
          <div>
            <strong>
              {isScheduledTrainingDay
                ? `اليوم محسوب في تحضير ${selectedGroup.name}`
                : `اليوم غير مجدول لفئة ${selectedGroup.name}`}
            </strong>
            <span>
              {hasTrainingDays
                ? `أيام التدريب: ${selectedTrainingDays.join("، ")} - اليوم المختار: ${selectedDateDay}`
                : "لم يتم تحديد أيام تدريب لهذه الفئة"}
            </span>
          </div>
        </section>
      )}

      {lastAttendanceAction && (
        <div className="attendance-save-note" role="status">
          <CheckCircle2 size={16} />
          <span>{lastAttendanceAction}</span>
        </div>
      )}

      <div className="attendance-summary-row">
        <article>
          <span>حاضر</span>
          <strong>{presentCount}</strong>
        </article>
        <article>
          <span>متأخر</span>
          <strong>{lateCount}</strong>
        </article>
        <article>
          <span>غائب</span>
          <strong>{absentCount}</strong>
        </article>
      </div>

      <section className="attendance-player-list">
        <div className="attendance-list-head">
          <div>
            <h2>{selectedGroup?.name || "الفئة"}</h2>
            <p>{isScheduledTrainingDay ? `${groupPlayers.length} من ${selectedGroupPlayers.length} لاعب` : "التحضير مغلق لهذا اليوم"}</p>
          </div>
          <SortModeButton sortMode={attendanceSortMode} onToggle={() => setAttendanceSortMode((mode) => (mode === "age" ? "name" : "age"))} />
        </div>

        <label className="attendance-search">
          <Search size={16} />
          <input
            value={attendanceSearch}
            onChange={(event) => setAttendanceSearch(event.target.value)}
            placeholder="بحث داخل لاعبي الفئة"
          />
        </label>

        {!isScheduledTrainingDay && selectedGroup && (
          <div className="attendance-empty">اختر تاريخًا يوافق أحد أيام تدريب هذه الفئة حتى يتم احتساب التحضير.</div>
        )}

        {isScheduledTrainingDay && groupPlayers.length === 0 && (
          <div className="attendance-empty">لا يوجد لاعبون في هذه الفئة بعد.</div>
        )}

        {groupPlayers.map((player) => {
          const team = helpers.teamById[player.teamId];
          const currentStatus = isScheduledTrainingDay ? attendanceRows[player.id]?.status || "" : "";
          const payment = isScheduledTrainingDay ? attendancePayments[player.id] : null;
          const subscriptionIsComplete = Boolean(player.subscriptionPaidFull) || Number(player.monthlyFee || 0) === 0;
          const canReceivePayment = !subscriptionIsComplete && (currentStatus === "حاضر" || currentStatus === "متأخر");
          const isPaymentOpen = activePaymentPlayerId === player.id && canReceivePayment;
          const statusTone =
            currentStatus === "حاضر" ? "present" : currentStatus === "متأخر" ? "late" : currentStatus === "غائب" ? "absent" : "";

          return (
            <article className={`attendance-player-card ${currentStatus ? "marked" : ""}`} key={player.id}>
              <div className="attendance-player-head">
                <div className="attendance-player-avatar">
                  {player.photo ? <img src={player.photo} alt={player.name} loading="lazy" decoding="async" /> : player.name.slice(0, 1)}
                </div>
                <div>
                  <strong>{player.name}</strong>
                  <span>{team?.name || "بدون فريق"} - {player.position || "لاعب"}</span>
                </div>
                {currentStatus && <b className={`attendance-status-dot ${statusTone}`}>{currentStatus}</b>}
              </div>

              <div className="attendance-status-actions" aria-label={`تحضير ${player.name}`}>
                {["حاضر", "متأخر", "غائب"].map((status) => (
                  <button
                    key={status}
                    className={currentStatus === status ? "active" : ""}
                    type="button"
                    disabled={!isScheduledTrainingDay}
                    onClick={() => updatePlayerStatus(player, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>

              {canReceivePayment && (
                <form className="attendance-payment-inline" onSubmit={(event) => saveAttendancePayment(event, player)}>
                  <CircleDollarSign size={17} />
                  <input
                    inputMode="numeric"
                    min="0"
                    placeholder="المبلغ المالي"
                    type="number"
                    value={paymentDrafts[player.id] ?? String(DEFAULT_ATTENDANCE_PAYMENT)}
                    onChange={(event) =>
                      setPaymentDrafts((prev) => ({ ...prev, [player.id]: event.target.value }))
                    }
                    disabled={!isPaymentOpen && Boolean(payment)}
                  />
                  <button type="submit" disabled={!isPaymentOpen && Boolean(payment)}>
                    {payment && !isPaymentOpen ? "تم الحفظ" : payment ? "تحديث" : "حفظ"}
                  </button>
                  {payment && <small>{currency(payment.amount)}</small>}
                </form>
              )}
            </article>
          );
        })}
      </section>
    </section>
  );
}

function Reports({ data, helpers, addPayment, addExpense, deleteExpense }) {
  const currentMonth = today.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const [activeReportTab, setActiveReportTab] = useState("overview");
  const [selectedDailyDate, setSelectedDailyDate] = useState(today);
  const [reportNotice, setReportNotice] = useState("");
  const monthOptions = Array.from(
    new Set([currentMonth, ...data.payments.map((payment) => String(payment.date || "").slice(0, 7)).filter(Boolean)]),
  ).sort((a, b) => b.localeCompare(a));
  const isAllMonths = selectedMonth === "all";
  const filteredPlayers = data.players.filter((player) => {
    if (selectedGroupId === "all") return true;
    const team = helpers.teamById[player.teamId];
    return team?.ageGroupId === selectedGroupId;
  });
  const filteredPlayerIds = new Set(filteredPlayers.map((player) => player.id));
  const filteredPayments = data.payments.filter((payment) => {
    const paymentMonth = String(payment.date || "").slice(0, 7);
    return filteredPlayerIds.has(payment.playerId) && (isAllMonths || paymentMonth === selectedMonth);
  });
  const filteredAttendance = data.attendance.filter((row) => {
    const rowMonth = String(row.date || "").slice(0, 7);
    return filteredPlayerIds.has(row.playerId) && (isAllMonths || rowMonth === selectedMonth);
  });
  const filteredExpenses = (data.expenses || []).filter((expense) => {
    const expenseMonth = String(expense.date || "").slice(0, 7);
    return isAllMonths || expenseMonth === selectedMonth;
  });
  const expected = filteredPlayers.reduce((sum, player) => sum + Number(player.monthlyFee || 0), 0);
  const rawCollected = filteredPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const paidByPlayer = filteredPayments.reduce((map, payment) => {
    map[payment.playerId] = (map[payment.playerId] || 0) + Number(payment.amount || 0);
    return map;
  }, {});
  const fullSubscriptionCredit = filteredPlayers.reduce((sum, player) => {
    if (!player.subscriptionPaidFull) return sum;
    return sum + Math.max(Number(player.monthlyFee || 0) - Number(paidByPlayer[player.id] || 0), 0);
  }, 0);
  const collected = rawCollected + fullSubscriptionCredit;
  const netRevenue = collected - totalExpenses;
  const remaining = Math.max(expected - collected, 0);
  const collectionRate = Math.min(100, Math.round((collected / Math.max(expected, 1)) * 100));
  const freePlayers = filteredPlayers.filter((player) => Number(player.monthlyFee || 0) === 0 || player.subscriptionType === "مجاني").length;
  const monthlyPlayers = filteredPlayers.length - freePlayers;
  const attendanceRate = Math.round(
    (filteredAttendance.filter((row) => row.status === "حاضر").length / Math.max(filteredAttendance.length, 1)) * 100,
  );
  const playerFinanceRows = filteredPlayers
    .map((player) => {
      const due = Number(player.monthlyFee || 0);
      const paid = player.subscriptionPaidFull ? Math.max(due, paidByPlayer[player.id] || 0) : paidByPlayer[player.id] || 0;
      const playerRemaining = Math.max(due - paid, 0);
      const status = due === 0 ? "مجاني" : playerRemaining === 0 ? "مدفوع" : paid > 0 ? "جزئي" : "متأخر";
      return { ...player, paid, due, remaining: playerRemaining, status };
    })
    .sort((a, b) => b.remaining - a.remaining);
  const kitRows = filteredPlayers.map((player) => {
    const team = helpers.teamById[player.teamId];
    const group = helpers.groupById[team?.ageGroupId];
    const kitFee = Number(player.kitFee || team?.kitFee || 0);
    return {
      ...player,
      teamName: team?.name || "بدون فريق",
      groupName: group?.name || "-",
      kitFee,
      kitStatus: kitFee === 0 ? "لا توجد قيمة" : player.kitPaid ? "مدفوع" : "غير مدفوع",
    };
  });
  const kitExpected = kitRows.reduce((sum, player) => sum + Number(player.kitFee || 0), 0);
  const kitCollected = kitRows.filter((player) => player.kitPaid).reduce((sum, player) => sum + Number(player.kitFee || 0), 0);
  const kitRemaining = Math.max(kitExpected - kitCollected, 0);
  const statusSummary = [
    { label: "مدفوع", value: playerFinanceRows.filter((row) => row.status === "مدفوع").length, color: "#157347" },
    { label: "جزئي", value: playerFinanceRows.filter((row) => row.status === "جزئي").length, color: "#bd8b04" },
    { label: "متأخر", value: playerFinanceRows.filter((row) => row.status === "متأخر").length, color: "#b94a48" },
    { label: "مجاني", value: playerFinanceRows.filter((row) => row.status === "مجاني").length, color: "#17207c" },
  ];
  const monthSeries = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const key = date.toISOString().slice(0, 7);
    const value = data.payments
      .filter((payment) => filteredPlayerIds.has(payment.playerId) && String(payment.date || "").slice(0, 7) === key)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return { key, label: new Intl.DateTimeFormat("ar-YE", { month: "short" }).format(date), value };
  });
  const maxMonthValue = Math.max(...monthSeries.map((item) => item.value), 1);
  const groupRevenue = data.ageGroups.map((group) => {
    const playersInGroup = data.players.filter((player) => helpers.teamById[player.teamId]?.ageGroupId === group.id);
    const playerIds = new Set(playersInGroup.map((player) => player.id));
    const value = data.payments
      .filter((payment) => playerIds.has(payment.playerId) && (isAllMonths || String(payment.date || "").slice(0, 7) === selectedMonth))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return { name: group.name, value };
  }).filter((item) => item.value > 0);
  const maxGroupRevenue = Math.max(...groupRevenue.map((item) => item.value), 1);
  const paymentMethods = ["نقد", "نقدًا", "تحويل"];
  const methodSummary = paymentMethods
    .map((method) => ({
      label: method === "نقدًا" ? "نقد من التحضير" : method,
      value: filteredPayments
        .filter((payment) => payment.method === method)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    }))
    .filter((item) => item.value > 0);
  const maxMethodValue = Math.max(...methodSummary.map((item) => item.value), 1);
  const sourceSummary = [
    {
      label: "دفعات التحضير",
      value: filteredPayments
        .filter((payment) => payment.source === "attendance")
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      color: "#157347",
    },
    {
      label: "دفعات يدوية",
      value: filteredPayments
        .filter((payment) => payment.source !== "attendance")
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      color: "#17207c",
    },
  ].filter((item) => item.value > 0);
  const expenseCategorySummary = Object.values(filteredExpenses.reduce((map, expense) => {
    const category = expense.category || "أخرى";
    map[category] = map[category] || { label: category, value: 0 };
    map[category].value += Number(expense.amount || 0);
    return map;
  }, {})).sort((a, b) => b.value - a.value);
  const maxExpenseCategoryValue = Math.max(...expenseCategorySummary.map((item) => item.value), 1);
  const recentExpenses = [...filteredExpenses].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  const recentPayments = [...filteredPayments].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
  const latePlayers = playerFinanceRows.filter((row) => row.status === "متأخر" || row.status === "جزئي").slice(0, 6);
  const forecastDate = isAllMonths ? new Date() : new Date(`${selectedMonth}-01T00:00:00`);
  const forecastToday = new Date();
  const forecastDaysInMonth = new Date(forecastDate.getFullYear(), forecastDate.getMonth() + 1, 0).getDate();
  const isSelectedCurrentMonth =
    !isAllMonths &&
    forecastDate.getFullYear() === forecastToday.getFullYear() &&
    forecastDate.getMonth() === forecastToday.getMonth();
  const elapsedDays = isAllMonths
    ? Math.max(1, filteredPayments.length ? new Set(filteredPayments.map((payment) => payment.date)).size : 1)
    : isSelectedCurrentMonth
      ? forecastToday.getDate()
      : forecastDaysInMonth;
  const remainingDays = isAllMonths ? 0 : Math.max(forecastDaysInMonth - elapsedDays, 0);
  const dailyAverage = Math.round(collected / Math.max(elapsedDays, 1));
  const projectedCollection = isAllMonths ? collected : Math.min(expected, Math.round(dailyAverage * forecastDaysInMonth));
  const neededDailyCollection = remainingDays > 0 ? Math.ceil(remaining / remainingDays) : remaining;
  const paymentsByPlayerDate = filteredPayments.reduce((map, payment) => {
    const key = `${payment.playerId}-${payment.date}`;
    map[key] = (map[key] || 0) + Number(payment.amount || 0);
    return map;
  }, {});
  const buildDailyCollectionRows = (date) => {
    const presentPlayerIds = new Set(
      filteredAttendance
        .filter((row) => row.date === date && row.status === "حاضر")
        .map((row) => row.playerId),
    );
    return Array.from(presentPlayerIds)
      .map((playerId) => {
        const player = helpers.playerById[playerId];
        if (!player || player.subscriptionPaidFull || Number(player.monthlyFee || 0) <= 0) return null;
        const team = helpers.teamById[player.teamId];
        const group = helpers.groupById[team?.ageGroupId];
        const dailyDue = Math.round(Number(player.monthlyFee || 0) / 8);
        const paid = paymentsByPlayerDate[`${player.id}-${date}`] || 0;
        const remainingAmount = Math.max(dailyDue - paid, 0);
        const status = remainingAmount === 0 ? "مدفوع" : paid > 0 ? "جزئي" : "متأخر";
        return {
          ...player,
          teamName: team?.name || "بدون فريق",
          groupName: group?.name || "-",
          dailyDue,
          paid,
          remaining: remainingAmount,
          status,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "ar"));
  };
  const selectedDailyRows = buildDailyCollectionRows(selectedDailyDate);
  const selectedDailyExpected = selectedDailyRows.reduce((sum, player) => sum + player.dailyDue, 0);
  const selectedDailyPaid = selectedDailyRows.reduce((sum, player) => sum + player.paid, 0);
  const selectedDailyRemaining = Math.max(selectedDailyExpected - selectedDailyPaid, 0);
  const selectedDailyMissingRows = selectedDailyRows.filter((player) => player.remaining > 0);
  const dailyCollectionRows = Array.from(new Set(filteredAttendance.map((row) => row.date).filter(Boolean)))
    .sort((a, b) => String(b).localeCompare(String(a)))
    .map((date) => {
      const rows = buildDailyCollectionRows(date);
      const dailyExpected = rows.reduce((sum, player) => sum + player.dailyDue, 0);
      const dailyPaid = rows.reduce((sum, player) => sum + player.paid, 0);
      return {
        date,
        count: rows.length,
        expected: dailyExpected,
        paid: dailyPaid,
        remaining: Math.max(dailyExpected - dailyPaid, 0),
      };
    });
  const reportTabs = [
    { id: "overview", label: "الملخص" },
    { id: "daily", label: "التقرير اليومي" },
    { id: "players", label: "كشف اللاعبين" },
    { id: "debts", label: "المتأخرات" },
    { id: "payments", label: "الدفعات" },
    { id: "expenses", label: "المصروفات" },
    { id: "kits", label: "الطقم الرياضي" },
  ];
  const largestDebt = playerFinanceRows.find((player) => player.remaining > 0);
  const topRevenueGroup = groupRevenue.reduce((top, group) => (group.value > (top?.value || 0) ? group : top), null);
  const averagePayment = Math.round(collected / Math.max(filteredPayments.length, 1));
  const riskLabel = collectionRate >= 85 ? "الوضع المالي مستقر" : collectionRate >= 55 ? "التحصيل يحتاج متابعة" : "التحصيل منخفض ويحتاج إجراء سريع";
  const reportPeriodLabel = isAllMonths ? "كل الفترات" : `شهر ${selectedMonth}`;
  const reportGroupLabel = selectedGroupId === "all" ? "كل الفئات" : helpers.groupById[selectedGroupId]?.name || "فئة محددة";
  const attendancePayments = filteredPayments.filter((payment) => payment.source === "attendance");
  const attendancePaymentsByRow = attendancePayments.reduce((map, payment) => {
    const key = `${payment.playerId}-${payment.date}`;
    map[key] = (map[key] || 0) + Number(payment.amount || 0);
    return map;
  }, {});
  const attendancePresent = filteredAttendance.filter((row) => row.status === "حاضر").length;
  const attendanceLate = filteredAttendance.filter((row) => row.status === "متأخر").length;
  const attendanceAbsent = filteredAttendance.filter((row) => row.status === "غائب").length;
  const attendanceCollected = attendancePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const reportSummaryText = [
    `التقرير المالي - ${data.academy.name || "الأكاديمية الرياضية"}`,
    `الفترة: ${reportPeriodLabel}`,
    `الفئة: ${reportGroupLabel}`,
    `المحصّل: ${currency(collected)}`,
    `المصروفات: ${currency(totalExpenses)}`,
    `الصافي: ${currency(netRevenue)}`,
    `المتوقع: ${currency(expected)}`,
    `المتبقي: ${currency(remaining)}`,
    `نسبة التحصيل: ${collectionRate}%`,
    `أكبر متأخر: ${largestDebt ? `${largestDebt.name} - ${currency(largestDebt.remaining)}` : "لا يوجد"}`,
  ].join("\n");
  const showReportNotice = (message) => {
    setReportNotice(message);
    window.setTimeout(() => setReportNotice(""), 2400);
  };
  const copyFinancialSummary = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportSummaryText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = reportSummaryText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      showReportNotice("تم نسخ الملخص");
    } catch {
      showReportNotice("تعذر نسخ الملخص");
    }
  };
  const downloadFinancialCsv = () => {
    const csvRows = [
      ["اللاعب", "الفريق", "الفئة", "نوع الاشتراك", "المطلوب", "المدفوع", "المتبقي", "الحالة"],
      ...playerFinanceRows.map((player) => {
        const team = helpers.teamById[player.teamId];
        const group = helpers.groupById[team?.ageGroupId];
        return [
          player.name,
          team?.name || "بدون فريق",
          group?.name || "-",
          player.subscriptionType,
          player.due,
          player.paid,
          player.remaining,
          player.status,
        ];
      }),
    ];
    csvRows.push([]);
    csvRows.push(["المصروف", "التصنيف", "المبلغ", "التاريخ", "طريقة الدفع", "المورد", "ملاحظة"]);
    filteredExpenses.forEach((expense) => {
      csvRows.push([
        expense.title,
        expense.category,
        expense.amount,
        expense.date,
        expense.method,
        expense.vendor || "-",
        expense.note || "-",
      ]);
    });
    const csvText = `\ufeff${csvRows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n")}`;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `financial-report-${isAllMonths ? "all" : selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showReportNotice("تم تنزيل ملف التقرير");
  };
  const printFinancialPdf = () => {
    const playerRows = playerFinanceRows.map((player) => {
      const team = helpers.teamById[player.teamId];
      const group = helpers.groupById[team?.ageGroupId];
      return [
        player.name,
        team?.name || "بدون فريق",
        group?.name || "-",
        player.subscriptionType || "-",
        currency(player.due),
        currency(player.paid),
        currency(player.remaining),
        player.status,
      ];
    });
    const debtRows = playerFinanceRows
      .filter((player) => player.remaining > 0)
      .map((player) => [
        player.name,
        helpers.teamById[player.teamId]?.name || "بدون فريق",
        currency(player.remaining),
        player.status,
      ]);
    const paymentRows = [...filteredPayments]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((payment) => [
        payment.date || "-",
        helpers.playerById[payment.playerId]?.name || "لاعب غير معروف",
        currency(payment.amount),
        payment.source === "attendance" ? "من التحضير" : payment.method || "-",
        payment.note || "-",
      ]);
    const expenseRows = [...filteredExpenses]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((expense) => [
        expense.date || "-",
        expense.title || "-",
        expense.category || "-",
        currency(expense.amount),
        expense.method || "-",
        expense.vendor || "-",
        expense.note || "-",
      ]);
    const ok = printReportHtml(buildPrintReportHtml({
      title: "التقرير المالي",
      subtitle: `${reportPeriodLabel} - ${reportGroupLabel}`,
      academyName: data.academy.name,
      logo: data.academy.logo,
      cards: [
        { label: "المحصّل", value: currency(collected) },
        { label: "المصروفات", value: currency(totalExpenses) },
        { label: "الصافي", value: currency(netRevenue) },
        { label: "المتوقع", value: currency(expected) },
        { label: "المتبقي", value: currency(remaining) },
        { label: "نسبة التحصيل", value: `${collectionRate}%` },
      ],
      sections: [
        reportTable("كشف حساب اللاعبين", ["اللاعب", "الفريق", "الفئة", "الاشتراك", "المطلوب", "المدفوع", "المتبقي", "الحالة"], playerRows),
        reportTable("المتأخرات", ["اللاعب", "الفريق", "المبلغ المتبقي", "الحالة"], debtRows, "لا توجد متأخرات في الفترة المحددة."),
        reportTable("سجل الدفعات", ["التاريخ", "اللاعب", "المبلغ", "المصدر", "الملاحظة"], paymentRows, "لا توجد دفعات في الفترة المحددة."),
        reportTable("سجل المصروفات", ["التاريخ", "المصروف", "التصنيف", "المبلغ", "الطريقة", "المورد", "الملاحظة"], expenseRows, "لا توجد مصروفات في الفترة المحددة."),
      ],
      note: riskLabel,
    }));
    showReportNotice(ok ? "تم فتح التقرير المالي للطباعة PDF" : "تعذر فتح نافذة الطباعة");
  };
  const printAttendancePdf = () => {
    const attendanceRows = [...filteredAttendance]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((row) => {
        const player = helpers.playerById[row.playerId];
        const team = helpers.teamById[player?.teamId];
        const group = helpers.groupById[team?.ageGroupId];
        const paymentAmount = attendancePaymentsByRow[`${row.playerId}-${row.date}`] || 0;
        return [
          row.date || "-",
          player?.name || "لاعب غير معروف",
          team?.name || "بدون فريق",
          group?.name || "-",
          row.status || "-",
          row.departureTime || "غير مسجل",
          paymentAmount ? currency(paymentAmount) : "-",
        ];
      });
    const ok = printReportHtml(buildPrintReportHtml({
      title: "تقرير الحضور والانصراف",
      subtitle: `${reportPeriodLabel} - ${reportGroupLabel}`,
      academyName: data.academy.name,
      logo: data.academy.logo,
      cards: [
        { label: "إجمالي السجلات", value: filteredAttendance.length },
        { label: "حاضر", value: attendancePresent },
        { label: "متأخر", value: attendanceLate },
        { label: "غائب", value: attendanceAbsent },
        { label: "مبالغ التحضير", value: currency(attendanceCollected) },
      ],
      sections: [
        reportTable("كشف الحضور والانصراف بأسماء اللاعبين", ["التاريخ", "اللاعب", "الفريق", "الفئة", "الحالة", "الانصراف", "دفعة التحضير"], attendanceRows),
      ],
      note: "وقت الانصراف يظهر كغير مسجل لأن النظام الحالي لا يحتوي على خانة وقت انصراف مستقلة.",
    }));
    showReportNotice(ok ? "تم فتح تقرير الحضور للطباعة PDF" : "تعذر فتح نافذة الطباعة");
  };
  const printDailyPdf = () => {
    const playerRows = selectedDailyRows.map((player) => [
      player.name,
      player.teamName,
      player.groupName,
      currency(player.monthlyFee),
      currency(player.dailyDue),
      currency(player.paid),
      currency(player.remaining),
      player.status,
    ]);
    const ok = printReportHtml(buildPrintReportHtml({
      title: "التقرير المالي اليومي",
      subtitle: `${selectedDailyDate} - ${reportGroupLabel}`,
      academyName: data.academy.name,
      logo: data.academy.logo,
      cards: [
        { label: "اللاعبون المحتسبون", value: selectedDailyRows.length },
        { label: "المفترض اليوم", value: currency(selectedDailyExpected) },
        { label: "المدفوع", value: currency(selectedDailyPaid) },
        { label: "المتبقي", value: currency(selectedDailyRemaining) },
      ],
      sections: [
        reportTable(
          "تحصيل اللاعبين الحاضرين غير المسددين بالكامل",
          ["اللاعب", "الفريق", "الفئة", "الاشتراك", "حصة اليوم", "المدفوع", "المتبقي", "الحالة"],
          playerRows,
          "لا توجد سجلات حضور محتسبة لهذا اليوم.",
        ),
      ],
      note: "حصة اليوم = قيمة الاشتراك الشهري مقسومة على 8، ولا يتم احتساب من فعّل خيار دفع الاشتراك كامل.",
    }));
    showReportNotice(ok ? "تم فتح التقرير اليومي للطباعة PDF" : "تعذر فتح نافذة الطباعة");
  };
  const printKitPdf = () => {
    const rows = kitRows.map((player) => [
      player.name,
      player.teamName,
      player.groupName,
      currency(player.kitFee),
      player.kitStatus,
    ]);
    const ok = printReportHtml(buildPrintReportHtml({
      title: "تقرير الطقم الرياضي",
      subtitle: `${reportPeriodLabel} - ${reportGroupLabel}`,
      academyName: data.academy.name,
      logo: data.academy.logo,
      cards: [
        { label: "إجمالي قيمة الأطقم", value: currency(kitExpected) },
        { label: "المدفوع", value: currency(kitCollected) },
        { label: "المتبقي", value: currency(kitRemaining) },
        { label: "عدد اللاعبين", value: kitRows.length },
      ],
      sections: [
        reportTable("كشف الطقم الرياضي", ["اللاعب", "الفريق", "الفئة", "قيمة الطقم", "الحالة"], rows, "لا توجد بيانات طقم لهذه الفترة."),
      ],
      note: "قيمة الطقم تحدد من إدارة الفريق ويمكن تعديلها داخل ملف اللاعب.",
    }));
    showReportNotice(ok ? "تم فتح تقرير الطقم للطباعة PDF" : "تعذر فتح نافذة الطباعة");
  };

  return (
    <section className="finance-report-screen">
      <header className="finance-report-hero">
        <div>
          <span>التقارير المالية</span>
          <h1>{data.academy.name || "الأكاديمية الرياضية"}</h1>
          <p>{isAllMonths ? "كل الفترات" : `تقرير شهر ${selectedMonth}`}</p>
        </div>
        <Wallet size={32} />
      </header>

      <section className="finance-filter-panel">
        <label>
          <span>الفترة</span>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            <option value="all">كل الفترات</option>
            {monthOptions.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </label>
        <label>
          <span>الفئة</span>
          <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
            <option value="all">كل الفئات</option>
            {data.ageGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="finance-kpi-grid">
        <article>
          <CircleDollarSign size={18} />
          <span>المحصّل</span>
          <strong>{currency(collected)}</strong>
        </article>
        <article>
          <Wallet size={18} />
          <span>المتوقع</span>
          <strong>{currency(expected)}</strong>
        </article>
        <article>
          <Bell size={18} />
          <span>المتبقي</span>
          <strong>{currency(remaining)}</strong>
        </article>
        <article>
          <Trash2 size={18} />
          <span>المصروفات</span>
          <strong>{currency(totalExpenses)}</strong>
        </article>
        <article>
          <ShieldCheck size={18} />
          <span>الصافي</span>
          <strong>{currency(netRevenue)}</strong>
        </article>
        <article>
          <CalendarCheck size={18} />
          <span>الحضور</span>
          <strong>{attendanceRate}%</strong>
        </article>
      </section>

      <section className="finance-executive-panel">
        <div className="finance-card-head">
          <div>
            <span>الملخص التنفيذي</span>
            <strong>{riskLabel}</strong>
          </div>
          <ClipboardList size={20} />
        </div>
        <div className="finance-insight-grid">
          <article>
            <span>أكبر متأخر</span>
            <strong>{largestDebt ? largestDebt.name : "لا يوجد"}</strong>
            <small>{largestDebt ? currency(largestDebt.remaining) : "كل شيء مضبوط"}</small>
          </article>
          <article>
            <span>متوسط الدفعة</span>
            <strong>{currency(averagePayment)}</strong>
            <small>{filteredPayments.length} عملية</small>
          </article>
          <article>
            <span>صافي الفترة</span>
            <strong>{currency(netRevenue)}</strong>
            <small>بعد خصم {currency(totalExpenses)}</small>
          </article>
          <article>
            <span>أفضل فئة</span>
            <strong>{topRevenueGroup?.name || "لا يوجد"}</strong>
            <small>{topRevenueGroup ? currency(topRevenueGroup.value) : "لا توجد دفعات"}</small>
          </article>
        </div>
        <div className="finance-report-actions">
          <button type="button" onClick={printFinancialPdf}>
            <CircleDollarSign size={16} />
            PDF مالي
          </button>
          <button className="attendance-pdf-button" type="button" onClick={printAttendancePdf}>
            <CalendarCheck size={16} />
            PDF حضور
          </button>
          <button className="attendance-pdf-button" type="button" onClick={printDailyPdf}>
            <CalendarCheck size={16} />
            PDF يومي
          </button>
          <button type="button" onClick={printKitPdf}>
            <Trophy size={16} />
            PDF الطقم
          </button>
          <button type="button" onClick={copyFinancialSummary}>
            <ClipboardList size={16} />
            نسخ الملخص
          </button>
          <button className="csv-export-button" type="button" onClick={downloadFinancialCsv}>
            <Send size={16} />
            تنزيل CSV
          </button>
        </div>
        {reportNotice && <span className="finance-report-notice">{reportNotice}</span>}
      </section>

      <div className="finance-report-tabs">
        {reportTabs.map((tab) => (
          <button key={tab.id} className={activeReportTab === tab.id ? "active" : ""} type="button" onClick={() => setActiveReportTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeReportTab === "overview" && (
        <section className="finance-report-grid">
          <article className="finance-chart-card collection-card">
            <div className="finance-card-head">
              <div>
                <span>نسبة التحصيل</span>
                <strong>{collectionRate}%</strong>
              </div>
              <BadgeCheck size={20} />
            </div>
            <div className="collection-ring" style={{ "--ring": `${collectionRate}%` }}>
              <b>{collectionRate}%</b>
              <small>محصّل</small>
            </div>
            <p>المتبقي: {currency(remaining)}</p>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>آخر 6 أشهر</span>
                <strong>تطور الإيراد</strong>
              </div>
              <Activity size={20} />
            </div>
            <div className="finance-bar-chart">
              {monthSeries.map((month) => (
                <div key={month.key}>
                  <span style={{ "--bar": `${Math.max(8, Math.round((month.value / maxMonthValue) * 100))}%` }} />
                  <small>{month.label}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>توقع نهاية الشهر</span>
                <strong>{isAllMonths ? "كل الفترات" : selectedMonth}</strong>
              </div>
              <Activity size={20} />
            </div>
            <div className="finance-forecast-card">
              <div>
                <span>المتوقع بنهاية الشهر</span>
                <strong>{currency(projectedCollection)}</strong>
              </div>
              <div>
                <span>متوسط يومي</span>
                <strong>{currency(dailyAverage)}</strong>
              </div>
              <div>
                <span>المطلوب يوميًا</span>
                <strong>{currency(neededDailyCollection)}</strong>
              </div>
              <small>{remainingDays > 0 ? `${remainingDays} يوم متبقي لإغلاق الفجوة` : "الفترة مكتملة أو كل الفترات محددة"}</small>
            </div>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>حالة الاشتراكات</span>
                <strong>{filteredPlayers.length} لاعب</strong>
              </div>
              <Users size={20} />
            </div>
            <div className="finance-status-list">
              {statusSummary.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <b>{item.value}</b>
                  <i style={{ "--fill": `${Math.round((item.value / Math.max(filteredPlayers.length, 1)) * 100)}%`, "--tone": item.color }} />
                </div>
              ))}
            </div>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>حسب الفئات</span>
                <strong>مصادر التحصيل</strong>
              </div>
              <Layers size={20} />
            </div>
            <div className="finance-group-bars">
              {groupRevenue.length === 0 && <p>لا توجد دفعات لهذه الفترة.</p>}
              {groupRevenue.map((group) => (
                <div key={group.name}>
                  <span>{group.name}</span>
                  <b>{currency(group.value)}</b>
                  <i style={{ "--fill": `${Math.round((group.value / maxGroupRevenue) * 100)}%` }} />
                </div>
              ))}
            </div>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>طرق الدفع</span>
                <strong>تحليل التحصيل</strong>
              </div>
              <Wallet size={20} />
            </div>
            <div className="finance-group-bars">
              {methodSummary.length === 0 && <p>لا توجد طرق دفع مسجلة لهذه الفترة.</p>}
              {methodSummary.map((method) => (
                <div key={method.label}>
                  <span>{method.label}</span>
                  <b>{currency(method.value)}</b>
                  <i style={{ "--fill": `${Math.round((method.value / maxMethodValue) * 100)}%` }} />
                </div>
              ))}
            </div>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>مصدر الدفعات</span>
                <strong>تحضير أو تسجيل يدوي</strong>
              </div>
              <CalendarCheck size={20} />
            </div>
            <div className="finance-status-list">
              {sourceSummary.length === 0 && <div className="finance-empty">لا توجد دفعات لهذه الفترة.</div>}
              {sourceSummary.map((source) => (
                <div key={source.label}>
                  <span>{source.label}</span>
                  <b>{currency(source.value)}</b>
                  <i style={{ "--fill": `${Math.round((source.value / Math.max(collected, 1)) * 100)}%`, "--tone": source.color }} />
                </div>
              ))}
            </div>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>المصروفات</span>
                <strong>{currency(totalExpenses)}</strong>
              </div>
              <Trash2 size={20} />
            </div>
            <div className="finance-group-bars">
              {expenseCategorySummary.length === 0 && <p>لا توجد مصروفات لهذه الفترة.</p>}
              {expenseCategorySummary.map((expense) => (
                <div key={expense.label}>
                  <span>{expense.label}</span>
                  <b>{currency(expense.value)}</b>
                  <i style={{ "--fill": `${Math.round((expense.value / maxExpenseCategoryValue) * 100)}%`, "--tone": "#b94a48" }} />
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {activeReportTab === "daily" && (
        <section className="finance-report-grid">
          <article className="finance-chart-card wide">
            <div className="finance-card-head">
              <div>
                <span>التقرير اليومي</span>
                <strong>{selectedDailyDate}</strong>
              </div>
              <CalendarCheck size={20} />
            </div>
            <label className="daily-report-date">
              <span>اختر اليوم</span>
              <input type="date" value={selectedDailyDate} onChange={(event) => setSelectedDailyDate(event.target.value)} />
            </label>
            <div className="finance-ledger-money">
              <span>عدد اللاعبين <b>{selectedDailyRows.length}</b></span>
              <span>المفترض اليوم <b>{currency(selectedDailyExpected)}</b></span>
              <span>المدفوع <b>{currency(selectedDailyPaid)}</b></span>
              <span>المتبقي <b>{currency(selectedDailyRemaining)}</b></span>
            </div>
            <div className="daily-report-note">
              يتم احتساب اللاعب إذا كان حاضرًا ولم يدفع الاشتراك كاملًا. حصة اليوم = الاشتراك الشهري ÷ 8.
            </div>
            <div className="finance-player-ledger">
              {selectedDailyRows.length === 0 && <div className="finance-empty">لا توجد سجلات حضور محتسبة لهذا اليوم.</div>}
              {selectedDailyRows.map((player) => {
                const paymentRate = player.dailyDue === 0 ? 100 : Math.min(100, Math.round((player.paid / Math.max(player.dailyDue, 1)) * 100));
                return (
                  <article key={player.id}>
                    <div className="finance-ledger-head">
                      <div>
                        <strong>{player.name}</strong>
                        <span>{player.teamName} {player.groupName ? `- ${player.groupName}` : ""}</span>
                      </div>
                      <b className={`ledger-status status-${player.status}`}>{player.status}</b>
                    </div>
                    <div className="finance-ledger-money">
                      <span>الاشتراك <b>{currency(player.monthlyFee)}</b></span>
                      <span>حصة اليوم <b>{currency(player.dailyDue)}</b></span>
                      <span>المدفوع <b>{currency(player.paid)}</b></span>
                      <span>المتبقي <b>{currency(player.remaining)}</b></span>
                    </div>
                    <div className="finance-ledger-progress">
                      <i style={{ "--fill": `${paymentRate}%` }} />
                      <small>{paymentRate}% سداد اليوم</small>
                    </div>
                  </article>
                );
              })}
            </div>
          </article>

          <article className="finance-chart-card wide">
            <div className="finance-card-head">
              <div>
                <span>تحصيل كل يوم على حدة</span>
                <strong>{dailyCollectionRows.length} يوم</strong>
              </div>
              <ClipboardList size={20} />
            </div>
            <div className="daily-collection-list">
              {dailyCollectionRows.length === 0 && <div className="finance-empty">لا توجد أيام حضور ضمن الفلتر الحالي.</div>}
              {dailyCollectionRows.map((day) => (
                <button key={day.date} type="button" className={selectedDailyDate === day.date ? "active" : ""} onClick={() => setSelectedDailyDate(day.date)}>
                  <span>{day.date}</span>
                  <b>{day.count} لاعب</b>
                  <small>المفترض {currency(day.expected)}</small>
                  <small>المدفوع {currency(day.paid)}</small>
                  <strong>المتبقي {currency(day.remaining)}</strong>
                </button>
              ))}
            </div>
          </article>

          <article className="finance-chart-card wide">
            <div className="finance-card-head">
              <div>
                <span>عند من النقص</span>
                <strong>{selectedDailyMissingRows.length} لاعب</strong>
              </div>
              <Bell size={20} />
            </div>
            <div className="finance-debt-list">
              {selectedDailyMissingRows.length === 0 && <div className="finance-empty">لا يوجد نقص في اليوم المحدد.</div>}
              {selectedDailyMissingRows.map((player) => (
                <div key={player.id}>
                  <div>
                    <strong>{player.name}</strong>
                    <span>{player.teamName} - حصة اليوم {currency(player.dailyDue)} - دفع {currency(player.paid)}</span>
                  </div>
                  <b>{currency(player.remaining)}</b>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {activeReportTab === "players" && (
        <section className="finance-report-grid">
          <article className="finance-chart-card wide">
            <div className="finance-card-head">
              <div>
                <span>كشف حساب اللاعبين</span>
                <strong>{playerFinanceRows.length} لاعب في الفترة المختارة</strong>
              </div>
              <Users size={20} />
            </div>
            <div className="finance-player-ledger">
              {playerFinanceRows.length === 0 && <div className="finance-empty">لا يوجد لاعبون مطابقون للفلتر.</div>}
              {playerFinanceRows.map((player) => {
                const team = helpers.teamById[player.teamId];
                const group = helpers.groupById[team?.ageGroupId];
                const paymentRate = player.due === 0 ? 100 : Math.min(100, Math.round((player.paid / Math.max(player.due, 1)) * 100));
                return (
                  <article key={player.id}>
                    <div className="finance-ledger-head">
                      <div>
                        <strong>{player.name}</strong>
                        <span>{team?.name || "بدون فريق"} {group?.name ? `- ${group.name}` : ""}</span>
                      </div>
                      <b className={`ledger-status status-${player.status}`}>{player.status}</b>
                    </div>
                    <div className="finance-ledger-money">
                      <span>المطلوب <b>{currency(player.due)}</b></span>
                      <span>المدفوع <b>{currency(player.paid)}</b></span>
                      <span>المتبقي <b>{currency(player.remaining)}</b></span>
                    </div>
                    <div className="finance-ledger-progress">
                      <i style={{ "--fill": `${paymentRate}%` }} />
                      <small>{paymentRate}% سداد</small>
                    </div>
                  </article>
                );
              })}
            </div>
          </article>
        </section>
      )}

      {activeReportTab === "debts" && (
        <section className="finance-report-grid">
          <article className="finance-chart-card wide">
            <div className="finance-card-head">
              <div>
                <span>قائمة المتأخرات</span>
                <strong>{latePlayers.length} لاعب يحتاج متابعة</strong>
              </div>
              <Bell size={20} />
            </div>
            <div className="finance-debt-list">
              {latePlayers.length === 0 && <div className="finance-empty">لا توجد متأخرات في الفترة المختارة.</div>}
              {latePlayers.map((player) => (
                <div key={player.id}>
                  <div>
                    <strong>{player.name}</strong>
                    <span>{helpers.teamById[player.teamId]?.name || "بدون فريق"} - {player.status}</span>
                  </div>
                  <b>{currency(player.remaining)}</b>
                </div>
              ))}
            </div>
          </article>

          <PaymentForm players={filteredPlayers.length ? filteredPlayers : data.players} onAddPayment={addPayment} title="تسجيل دفعة مالية" />
        </section>
      )}

      {activeReportTab === "payments" && (
        <section className="finance-report-grid">
          <article className="finance-chart-card wide">
            <div className="finance-card-head">
              <div>
                <span>آخر الدفعات</span>
                <strong>{filteredPayments.length} عملية</strong>
              </div>
              <ClipboardList size={20} />
            </div>
            <div className="finance-payment-list">
              {recentPayments.length === 0 && <div className="finance-empty">لا توجد دفعات في الفترة المختارة.</div>}
              {recentPayments.map((payment) => {
                const player = helpers.playerById[payment.playerId];
                return (
                  <div key={payment.id}>
                    <div>
                      <strong>{player?.name || "لاعب غير معروف"}</strong>
                      <span>{payment.date} - {payment.source === "attendance" ? "من التحضير" : payment.method}</span>
                    </div>
                    <b>{currency(payment.amount)}</b>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>نوع الاشتراك</span>
                <strong>{monthlyPlayers} شهري / {freePlayers} مجاني</strong>
              </div>
              <Medal size={20} />
            </div>
            <div className="subscription-split">
              <span style={{ "--fill": `${Math.round((monthlyPlayers / Math.max(filteredPlayers.length, 1)) * 100)}%` }} />
              <div>
                <b>شهري</b>
                <small>{monthlyPlayers} لاعب</small>
              </div>
              <div>
                <b>مجاني</b>
                <small>{freePlayers} لاعب</small>
              </div>
            </div>
          </article>
        </section>
      )}

      {activeReportTab === "expenses" && (
        <section className="finance-report-grid">
          <ExpenseForm onAddExpense={addExpense} />

          <article className="finance-chart-card wide">
            <div className="finance-card-head">
              <div>
                <span>سجل المصروفات</span>
                <strong>{filteredExpenses.length} عملية في الفترة المختارة</strong>
              </div>
              <Trash2 size={20} />
            </div>
            <div className="finance-ledger-money">
              <span>إجمالي المصروفات <b>{currency(totalExpenses)}</b></span>
              <span>صافي التحصيل <b>{currency(netRevenue)}</b></span>
              <span>عدد العمليات <b>{filteredExpenses.length}</b></span>
            </div>
            <div className="expense-list">
              {recentExpenses.length === 0 && <div className="finance-empty">لا توجد مصروفات في الفترة المختارة.</div>}
              {recentExpenses.map((expense) => (
                <article key={expense.id}>
                  <div>
                    <strong>{expense.title || "مصروف"}</strong>
                    <span>{expense.date} - {expense.category || "أخرى"} - {expense.method || "غير محدد"}</span>
                    {(expense.vendor || expense.note) && <small>{expense.vendor || ""}{expense.vendor && expense.note ? " - " : ""}{expense.note || ""}</small>}
                  </div>
                  <b>{currency(expense.amount)}</b>
                  <button type="button" onClick={() => deleteExpense?.(expense.id)} aria-label="حذف المصروف">
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          </article>

          <article className="finance-chart-card">
            <div className="finance-card-head">
              <div>
                <span>حسب التصنيف</span>
                <strong>أين تذهب المصروفات</strong>
              </div>
              <ClipboardList size={20} />
            </div>
            <div className="finance-group-bars">
              {expenseCategorySummary.length === 0 && <p>لا توجد مصروفات مصنفة.</p>}
              {expenseCategorySummary.map((expense) => (
                <div key={expense.label}>
                  <span>{expense.label}</span>
                  <b>{currency(expense.value)}</b>
                  <i style={{ "--fill": `${Math.round((expense.value / maxExpenseCategoryValue) * 100)}%`, "--tone": "#b94a48" }} />
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {activeReportTab === "kits" && (
        <section className="finance-report-grid">
          <article className="finance-chart-card wide">
            <div className="finance-card-head">
              <div>
                <span>تقرير الطقم الرياضي</span>
                <strong>{currency(kitCollected)} من {currency(kitExpected)}</strong>
              </div>
              <Trophy size={20} />
            </div>
            <div className="finance-ledger-money">
              <span>المطلوب <b>{currency(kitExpected)}</b></span>
              <span>المدفوع <b>{currency(kitCollected)}</b></span>
              <span>المتبقي <b>{currency(kitRemaining)}</b></span>
            </div>
            <div className="finance-player-ledger">
              {kitRows.length === 0 && <div className="finance-empty">لا توجد بيانات طقم رياضي.</div>}
              {kitRows.map((player) => (
                <article key={player.id}>
                  <div className="finance-ledger-head">
                    <div>
                      <strong>{player.name}</strong>
                      <span>{player.teamName} {player.groupName ? `- ${player.groupName}` : ""}</span>
                    </div>
                    <b className={`ledger-status status-${player.kitPaid ? "مدفوع" : "متأخر"}`}>{player.kitStatus}</b>
                  </div>
                  <div className="finance-ledger-money">
                    <span>قيمة الطقم <b>{currency(player.kitFee)}</b></span>
                    <span>الحالة <b>{player.kitStatus}</b></span>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </section>
      )}
    </section>
  );
}

function Gamification({ data, addBadge }) {
  const leaders = [...data.players].sort((a, b) => b.xp - a.xp);
  return (
    <section className="view-grid">
      <form className="panel form-panel" onSubmit={addBadge}>
        <FormTitle icon={Medal} title="إنشاء وسام" />
        <input name="name" placeholder="اسم الوسام" required />
        <input name="condition" placeholder="شرط الحصول عليه" required />
        <input name="xp" type="number" min="0" placeholder="نقاط XP" required />
        <button className="primary-button" type="submit">
          <Plus size={18} />
          إضافة الوسام
        </button>
      </form>
      <section className="panel table-panel">
        <PanelHead title="Leaderboard" text="ترتيب اللاعبين والأوسمة." icon={Trophy} />
        <SimpleTable
          headers={["الترتيب", "اللاعب", "المستوى", "XP", "الأوسمة"]}
          rows={leaders.map((player, index) => [index + 1, player.name, player.level, player.xp, player.badges.join("، ") || "-"])}
        />
        <div className="badge-grid">
          {data.badges.map((badge) => (
            <div className="badge-item" key={badge.id}>
              <strong>{badge.name}</strong>
              <span>{badge.condition}</span>
              <b>{badge.xp} XP</b>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function Matches({ data, helpers, addMatch }) {
  return (
    <section className="view-grid">
      <form className="panel form-panel" onSubmit={addMatch}>
        <FormTitle icon={Swords} title="تسجيل نتيجة مباراة" />
        <select name="teamAId" required>
          {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <select name="teamBId" required>
          {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <input name="date" type="date" defaultValue={today} required />
        <div className="two-cols">
          <input name="scoreA" type="number" min="0" placeholder="أهداف الأول" required />
          <input name="scoreB" type="number" min="0" placeholder="أهداف الثاني" required />
        </div>
        <select name="mvpId" required>
          {data.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
        <textarea name="evaluation" placeholder="تقييم اللاعب أو المباراة" />
        <button className="primary-button" type="submit">
          <Plus size={18} />
          حفظ النتيجة
        </button>
      </form>
      <section className="panel table-panel">
        <PanelHead title="سجل المباريات" text="النتائج و MVP والتقييم." icon={Swords} />
        <SimpleTable
          headers={["التاريخ", "الفريق الأول", "الفريق الثاني", "النتيجة", "MVP", "التقييم"]}
          rows={data.matches.map((match) => [
            match.date,
            helpers.teamById[match.teamAId]?.name,
            helpers.teamById[match.teamBId]?.name,
            `${match.scoreA} - ${match.scoreB}`,
            helpers.playerById[match.mvpId]?.name,
            match.evaluation || "-",
          ])}
        />
      </section>
    </section>
  );
}

function Notifications({ data, addNotification }) {
  return (
    <section className="view-grid">
      <form className="panel form-panel" onSubmit={addNotification}>
        <FormTitle icon={Bell} title="إنشاء تنبيه" />
        <select name="type" required>
          <option>تأخر دفع</option>
          <option>قرب انتهاء الاشتراك</option>
          <option>غياب متكرر</option>
          <option>رسالة إدارية</option>
        </select>
        <input name="target" placeholder="المستهدف" required />
        <button className="primary-button" type="submit">
          <Send size={18} />
          إضافة التنبيه
        </button>
      </form>
      <section className="panel table-panel">
        <PanelHead title="التنبيهات" text="متابعة الحالات التي تحتاج إجراء." icon={Bell} />
        <SimpleTable
          headers={["النوع", "المستهدف", "التاريخ", "الحالة"]}
          rows={data.notifications.map((item) => [item.type, item.target, item.date, item.status])}
        />
      </section>
    </section>
  );
}

function Community({ data, addPost }) {
  return (
    <section className="view-grid">
      <form className="panel form-panel" onSubmit={addPost}>
        <FormTitle icon={MessageSquare} title="إنشاء منشور" />
        <input name="title" placeholder="عنوان اختياري" />
        <textarea name="content" placeholder="محتوى المنشور" required />
        <select name="type" required>
          <option>إعلان</option>
          <option>تدريب</option>
          <option>مباراة</option>
          <option>إنجاز</option>
        </select>
        <label className="checkbox-line">
          <input name="pinned" type="checkbox" />
          تثبيت المنشور
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          نشر
        </button>
      </form>
      <section className="post-list">
        {data.posts.map((post) => (
          <article className="post-card" key={post.id}>
            <div className="team-card-head">
              <h2>{post.title || post.type}</h2>
              {post.pinned && <span className="pin">مثبت</span>}
            </div>
            <p>{post.content}</p>
            <div className="team-stats">
              <span>{post.type}</span>
              <span>{post.likes} إعجاب</span>
              <span>تعليقات: 0</span>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

function PaymentForm({ players, onAddPayment, title }) {
  return (
    <form className="panel form-panel" onSubmit={onAddPayment}>
      <FormTitle icon={CircleDollarSign} title={title} />
      <select name="playerId" required>
        {players.map((player) => (
          <option key={player.id} value={player.id}>{player.name}</option>
        ))}
      </select>
      <input name="amount" type="number" min="0" placeholder="المبلغ المدفوع" required />
      <input name="date" type="date" defaultValue={today} required />
      <select name="method" required>
        <option>نقد</option>
        <option>تحويل</option>
      </select>
      <select name="status" required>
        <option>مدفوع</option>
        <option>جزئي</option>
        <option>متأخر</option>
      </select>
      <textarea name="note" placeholder="ملاحظة اختيارية" />
      <button className="primary-button" type="submit">
        <Plus size={18} />
        حفظ الدفعة
      </button>
    </form>
  );
}

function ExpenseForm({ onAddExpense }) {
  return (
    <form className="panel form-panel expense-form" onSubmit={onAddExpense}>
      <FormTitle icon={Wallet} title="تسجيل مصروف" />
      <input name="title" placeholder="اسم المصروف: إيجار، معدات، مواصلات..." required />
      <select name="category" required>
        <option>تشغيل</option>
        <option>معدات</option>
        <option>ملاعب</option>
        <option>رواتب</option>
        <option>مواصلات</option>
        <option>تسويق</option>
        <option>أخرى</option>
      </select>
      <input name="amount" type="number" min="0" placeholder="قيمة المصروف" required />
      <input name="date" type="date" defaultValue={today} required />
      <select name="method" required>
        <option>نقد</option>
        <option>تحويل</option>
        <option>آجل</option>
      </select>
      <input name="vendor" placeholder="المورد أو الجهة - اختياري" />
      <textarea name="note" placeholder="ملاحظة اختيارية" />
      <button className="primary-button" type="submit">
        <Plus size={18} />
        حفظ المصروف
      </button>
    </form>
  );
}

function EmptyState({ icon: Icon, title, text }) {
  return (
    <section className="panel empty-state">
      <Icon size={34} />
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

function Metric({ title, value, icon: Icon, tone }) {
  return (
    <section className={`metric ${tone}`}>
      <div className="metric-icon">
        <Icon size={21} />
      </div>
      <span>{title}</span>
      <strong>{value}</strong>
    </section>
  );
}

function StatusPill({ label, value }) {
  return (
    <div className="status-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelHead({ title, text, icon: Icon }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <Icon size={22} className="panel-icon" />
    </div>
  );
}

function FormTitle({ icon: Icon, title }) {
  return (
    <div className="form-title">
      <Icon size={20} />
      <h2>{title}</h2>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Score({ label, value }) {
  return (
    <div className="score-row">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="progress-line">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function PersonCell({ name, sub }) {
  return (
    <div className="person-cell">
      <span>{name.slice(0, 1)}</span>
      <div>
        <strong>{name}</strong>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

function SimpleTable({ headers, rows }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="empty-table-cell" colSpan={headers.length}>لا توجد بيانات مسجلة بعد</td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

