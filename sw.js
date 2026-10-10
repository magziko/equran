// ============================================================
// Service Worker — القرآن الكريم
// ============================================================
//
// ⚠️ مهم جدًا: كل المشاريع على magziko.github.io (القرآن، الراديو، ...) ليها
// نفس الأصل (origin) وبالتالي بتشارك نفس الـ CacheStorage.
// عشان كده:
//   1) كل كاش بيخص التطبيق ده لازم يبدأ بـ CACHE_PREFIX.
//   2) عند حذف الكاشات القديمة نحذف فقط اللي بيبدأ بالبادئة دي،
//      ولا نلمس كاش أي تطبيق تاني (كان ده سبب إن الصفحة تقع أوفلاين).
const CACHE_PREFIX = 'quran-app-';

// غيّر الرقم (v6, v7, ...) لما تحب تجبر الأجهزة تعيد تخزين الملفات الأساسية
const CACHE_NAME = CACHE_PREFIX + 'cache-v5';

// الأساسي: لازم يتخزن، ولو فشل تخزينه يفشل الـ install كله
// فتفضل النسخة القديمة الشغالة ولا تتحذف.
const CORE_SHELL = [
  './',
  './index.html'
];

// اختياري: لو فشل تخزين أي ملف منهم مفيش مشكلة
const OPTIONAL_SHELL = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

// صفحة بديلة بدل شاشة الخطأ (ERR_FAILED) لو الكاش فاضي ومفيش إنترنت
const OFFLINE_HTML =
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>القرآن الكريم</title>' +
  '<style>body{font-family:system-ui,sans-serif;background:#0f4c3a;color:#fff;' +
  'display:flex;align-items:center;justify-content:center;min-height:100vh;' +
  'margin:0;padding:24px;text-align:center;line-height:1.9}' +
  'button{margin-top:16px;padding:10px 22px;border:0;border-radius:10px;font-size:16px}</style>' +
  '</head><body><div><h2>التطبيق غير مخزَّن على الجهاز بعد</h2>' +
  '<p>افتح الصفحة مرة واحدة وأنت متصل بالإنترنت ليتم تخزينها، ثم ستعمل بدون إنترنت.</p>' +
  '<button onclick="location.reload()">إعادة المحاولة</button></div></body></html>';

// ── التثبيت ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // cache:'reload' عشان نتجاوز كاش HTTP بتاع GitHub Pages ونخزّن أحدث نسخة
    await Promise.all(
      CORE_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })))
    );

    await Promise.all(
      OPTIONAL_SHELL.map((url) =>
        cache.add(url).catch((err) => {
          console.warn('تعذر تخزين الملف في الكاش:', url, err);
        })
      )
    );

    await self.skipWaiting();
  })());
});

// ── التفعيل: احذف النسخ القديمة بتاعتنا فقط ───────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

// ── الجلب: الكاش أولًا (يشتغل فورًا أوفلاين) + تحديث في الخلفية ──
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  // طلبات الصوت بـ Range (تقديم/تأخير) يتعامل معها المتصفح مباشرة
  if (req.headers.has('range')) return;

  // حالة خاصة معروفة في أدوات المطوّر
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith(handleFetch(event, req));
});

async function handleFetch(event, req) {
  const cache = await caches.open(CACHE_NAME);
  const isNavigation = req.mode === 'navigate';

  // نبحث في كاشنا إحنا فقط (مش في كل كاشات الدومين)
  let cached = await cache.match(req);
  if (!cached && isNavigation) {
    cached = await cache.match(req, { ignoreSearch: true });
  }

  let cachePut = Promise.resolve();
  const network = fetch(req).then((res) => {
    // نخزّن النسخة الجديدة لو الطلب نجح (ما نخزّنش الردود المعاد توجيهها)
    if (res && res.status === 200 && !res.redirected &&
        (res.type === 'basic' || res.type === 'cors')) {
      cachePut = cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  });

  // نخلّي الـ SW يفضل شغال لحد ما التحديث (والتخزين) يخلص في الخلفية،
  // حتى لو الصفحة اتعرضت من الكاش
  event.waitUntil(network.then(() => cachePut, () => {}));

  if (cached) return cached;

  try {
    return await network;
  } catch (err) {
    // مفيش إنترنت ومفيش نسخة مخزنة لهذا الطلب بالتحديد
    if (isNavigation) {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
      // الكاش فاضي تمامًا: نرجّع صفحة توضيحية بدل ERR_FAILED
      return new Response(OFFLINE_HTML, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}
