import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const appUrl = process.env.QZ_APP_URL || "http://127.0.0.1:5173";
const supabaseUrl = process.env.QZ_TARGET_SUPABASE_URL;
const anonKey = process.env.QZ_TARGET_ANON_KEY;
const serviceKey = process.env.QZ_TARGET_SERVICE_KEY;
if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Missing target Supabase QA configuration");

const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = Date.now().toString().slice(-8);
const academyId = `parent-ui-${suffix}`;
const parentId = `parent-ui-user-${suffix}`;
const playerId = `parent-ui-player-${suffix}`;
const phone = `+96773${suffix}`;
const password = "123456";
const outputDir = process.env.QZ_QA_OUTPUT || `${process.cwd()}\\.codex-qa`;
mkdirSync(outputDir, { recursive: true });

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function cleanup() {
  await service.from("parent_player_links").delete().eq("academy_id", academyId);
  await service.from("parent_player_snapshots").delete().eq("academy_id", academyId);
  await service.from("qz_app_sessions").delete().eq("academy_id", academyId);
  await service.from("platform_accounts").delete().eq("id", parentId);
}

let browser;
try {
  const { error: accountError } = await service.from("platform_accounts").insert({
    id: parentId,
    name: "ولي أمر للمعاينة",
    phone,
    phone_e164: phone,
    role: "ولي أمر",
    role_key: "parent",
    academy_id: academyId,
    academy_name: "أكاديمية QZ التجريبية",
    permissions: "متابعة الأبناء",
    permissions_json: { parent: true, children: true, readOnly: true },
    auth_provider: "qz_auth",
    password_hash: hash(password),
    password_status: "مشفرة",
    status: "نشط",
  });
  if (accountError) throw accountError;

  const { error: linkError } = await service.from("parent_player_links").insert({
    id: randomUUID(),
    academy_id: academyId,
    parent_account_id: parentId,
    parent_phone_e164: phone,
    player_id: playerId,
    relation: "الأب",
  });
  if (linkError) throw linkError;

  const { error: snapshotError } = await service.from("parent_player_snapshots").insert({
    id: randomUUID(),
    academy_id: academyId,
    player_id: playerId,
    payload: {
      academy: { name: "أكاديمية QZ التجريبية" },
      player: { name: "لاعب للمعاينة", ageText: "10 سنوات", position: "وسط", teamName: "فريق البراعم" },
      attendance: { records: [{ id: "a1", date: "2026-11-14", status: "حاضر" }], present: 7, late: 1, absent: 1 },
      finance: { subscriptionTotal: 4000, totalPaid: 3000, remaining: 1000, payments: [] },
      honors: { badges: ["لاعب ملتزم"], positiveEvaluations: [] },
      notifications: [],
      posts: [{ id: "p1", title: "موعد التدريب", content: "التدريب غدًا في الموعد المعتاد", createdAt: "2026-11-14" }],
    },
  });
  if (snapshotError) throw snapshotError;

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.QZ_BROWSER_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-YE" });
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: "networkidle" });
  const inputs = page.locator(".form-panel input");
  await inputs.nth(0).fill(phone);
  await inputs.nth(1).fill(password);
  await page.locator(".form-panel .primary-button").click();
  await page.locator(".parent-portal-screen").waitFor({ timeout: 20000 });

  const closeGuide = page.locator(".app-guide-close");
  if (await closeGuide.count()) {
    await closeGuide.click();
    await page.locator(".app-guide-overlay").waitFor({ state: "detached", timeout: 5000 });
  }

  await page.screenshot({ path: `${outputDir}\\parent-mobile.png`, fullPage: true });
  const mobileLayout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    childNameVisible: document.body.innerText.includes("لاعب للمعاينة"),
  }));

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputDir}\\parent-desktop.png`, fullPage: true });
  const desktopLayout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  if (!mobileLayout.childNameVisible) throw new Error("Child name is not visible in the parent portal");
  if (mobileLayout.scrollWidth > mobileLayout.width + 2) throw new Error("Mobile parent portal has horizontal overflow");
  if (desktopLayout.scrollWidth > desktopLayout.width + 2) throw new Error("Desktop parent portal has horizontal overflow");

  console.log(JSON.stringify({ ok: true, mobileLayout, desktopLayout }));
} finally {
  if (browser) await browser.close();
  await cleanup();
}
