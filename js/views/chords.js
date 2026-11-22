/* Beat Board · Chords screen (placeholder until built) */
(function () {
'use strict';
const BB = window.BB;
BB.views.register({
  id: 'chords', title: 'Chords',
  mount(el) { el.append(BB.h('div', 'view-head', BB.h('h2', 'view-title', 'Chords'))); el.append(BB.h('div', 'empty', BB.h('h4', null, 'Coming soon'))); },
});
})();
