/* Beat Board · Keys screen (placeholder until built) */
(function () {
'use strict';
const BB = window.BB;
BB.views.register({
  id: 'keys', title: 'Keys',
  mount(el) { el.append(BB.h('div', 'view-head', BB.h('h2', 'view-title', 'Keys'))); el.append(BB.h('div', 'empty', BB.h('h4', null, 'Coming soon'))); },
});
})();
