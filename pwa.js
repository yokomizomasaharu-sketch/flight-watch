/* PWA: ホーム画面から開いたときにオフラインでも起動できるようにする */
(function () {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () { /* noop */ });
  });
})();
