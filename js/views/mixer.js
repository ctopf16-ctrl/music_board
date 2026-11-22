/* Beat Board · Mixer screen (placeholder until built) */
(function () {
'use strict';
const BB = window.BB;
BB.views.register({
  id: 'mixer', title: 'Mixer',
  mount(el) { el.append(BB.h('div', 'view-head', BB.h('h2', 'view-title', 'Mixer'))); el.append(BB.h('div', 'empty', BB.h('h4', null, 'Coming soon'))); },
});
})();
