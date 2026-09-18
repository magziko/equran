// اسم الكاش — غيّره (مثلاً v2, v3) في كل مرة تحدّث فيها محتوى الملف
// حتى يتم تحميل النسخة الجديدة للمستخدمين بدل النسخة القديمة المخزنة
const CACHE_NAME = 'quran-app-cache-v4';

// الملفات الأساسية للتطبيق (الصفحة نفسها تكفي لأنها تحتوي كل شيء)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

// عند التثبيت: خزّن كل ملف على حدة
// (addAll كانت ذرية: فشل ملف واحد كان يمنع تخزين كل الملفات بصمت)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('تعذر تخزين الملف في الكاش:', url, err);
          })
        )
      );
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
        .catch(() => {
          // لا يوجد إنترنت ولا نسخة مخزنة لهذا الطلب تحديداً:
          // لو كان طلب فتح صفحة (تنقل)، ارجع الصفحة الرئيسية المخزنة بدل فشل كامل
          if (cachedResponse) return cachedResponse;
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 408, statusText: 'Offline' });
        });

      // إن وجدنا نسخة في الكاش، أعطها فوراً (أسرع + يعمل أوفلاين)
      // وإلا انتظر الشبكة
      return cachedResponse || networkFetch;
    })
  );
});
