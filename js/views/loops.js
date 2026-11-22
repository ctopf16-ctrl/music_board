/* Beat Board · Loops screen (placeholder until built) */
(function () {
'use strict';
const BB = window.BB;
BB.views.register({
  id: 'loops', title: 'Loops',
  mount(el) { el.append(BB.h('div', 'view-head', BB.h('h2', 'view-title', 'Loops'))); el.append(BB.h('div', 'empty', BB.h('h4', null, 'Coming soon'))); },
});
})();
