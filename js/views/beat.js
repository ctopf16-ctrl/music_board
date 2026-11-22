/* Beat Board · Beat screen (placeholder until built) */
(function () {
'use strict';
const BB = window.BB;
BB.views.register({
  id: 'beat', title: 'Beat',
  mount(el) { el.append(BB.h('div', 'view-head', BB.h('h2', 'view-title', 'Beat'))); el.append(BB.h('div', 'empty', BB.h('h4', null, 'Coming soon'))); },
});
})();
