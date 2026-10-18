/* ==========================================================================
   Fluxo · Prearranque de apariencia
   Aplica el tema, el acento y el estado de la barra lateral guardados en el
   equipo antes de que se pinte la interfaz, para evitar el destello inicial.
   ========================================================================== */
(function () {
  'use strict';
  try {
    var html = document.documentElement;
    html.setAttribute('data-tema', localStorage.getItem('fluxo_tema') || 'claro');
    html.setAttribute('data-acento', localStorage.getItem('fluxo_acento') || 'azul');
    if (localStorage.getItem('fluxo_sidebar') === '1') html.classList.add('is-colapsado');
  } catch (e) {
    /* sin almacenamiento: se usan los valores por defecto del CSS */
  }
})();
