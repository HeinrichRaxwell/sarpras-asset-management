// Konfigurasi global frontend
(function () {
  var params = new URLSearchParams(location.search);
  // Default same-origin '/api' agar jalan via nginx (prod) maupun dev sama-sama.
  // Override: tambahkan ?api=http://host:port/api bila backend berbeda origin.
  var apiBase = params.get('api') || '/api';
  window.APP_CONFIG = {
    API_BASE: apiBase,
    APP_NAME: 'SARPRAS AM',
    APP_VERSION: '1.0.0',
    CURRENCY: 'IDR',
    LOCALE: 'id-ID',
  };
})();