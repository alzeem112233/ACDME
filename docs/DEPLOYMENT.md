# إعداد النشر

## رابط الإنتاج الحالي

```text
https://al-qaisar-dashboard.vercel.app
```

قاعدة البيانات الحالية على Supabase:

```text
https://gsttfeqmpauipbuqrjjn.supabase.co
```

## البناء المحلي

```bash
pnpm install
pnpm build
pnpm preview
```

## Vercel

1. ارفع المشروع إلى GitHub.
2. افتح Vercel وأنشئ مشروعاً جديداً.
3. الإعدادات جاهزة في `vercel.json`.
4. Build command: `pnpm build`.
5. Output directory: `dist`.

## Netlify

الإعدادات جاهزة في `netlify.toml`.

- Build command: `pnpm build`
- Publish directory: `dist`

## Supabase Database

1. سجل الدخول:

```bash
pnpm db:login
```

2. اربط المشروع بمشروع Supabase الذي أنشأته:

```bash
pnpm db:link
```

3. ادفع الجداول:

```bash
pnpm db:push
```

4. أضف القيم التالية في إعدادات النشر:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

يمكن أخذ القيم من صفحة Project Settings ثم API في Supabase.

## Docker

```bash
docker build -t al-qaisar-dashboard .
docker run -p 8080:80 al-qaisar-dashboard
```

ثم افتح:

```text
http://localhost:8080
```

## متغيرات البيئة

انسخ `.env.example` إلى `.env` عند الحاجة، ثم عدل القيم.
