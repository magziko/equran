// اسم الكاش — غيّره (مثلاً v2, v3) في كل مرة تحدّث فيها محتوى الملف
// حتى يتم تحميل النسخة الجديدة للمستخدمين بدل النسخة القديمة المخزنة
const CACHE_NAME = 'quran-app-cache-v1';

// الملفات الأساسية للتطبيق (الصفحة نفسها تكفي لأنها تحتوي كل شيء)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// عند التثبيت: خزّن نسخة من التطبيق فوراً
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {
        // لو فشل تحميل أحد الملفات (مثلاً manifest غير موجود)، لا توقف التثبيت
        return Promise.resolve();
      });
    }).then(() => self.skipWaiting())
  );
});

// عند التفعيل: احذف أي نسخ كاش قديمة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// استراتيجية الجلب: أولوية للكاش (تعمل فوراً بدون إنترنت)،
// وفي الخلفية يحاول التحديث من الشبكة إن كانت متاحة
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // تجاهل الطلبات التي ليست GET (مثل بعض طلبات الأدوات الخارجية)
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const networkFetch = fetch(req)
        .then((networkResponse) => {
          // خزّن نسخة جديدة إن نجح الطلب (يشمل هذا خطوط جوجل إن كانت متاحة)
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse); // لا يوجد إنترنت: اعتمد على الكاش

      // إن وجدنا نسخة في الكاش، أعطها فوراً (أسرع + يعمل أوفلاين)
      // وإلا انتظر الشبكة
      return cachedResponse || networkFetch;
    })
  );
});
