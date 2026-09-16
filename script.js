/* VIL project page -- page chrome, the results chart and the two clip
   browsers.

   Same conventions as the JAMB page: hand-rolled SVG, navy tints for the
   baselines and maize for ours, no chart library. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var NAVY = '#00274c';
  var MAIZE = '#ffcb05';
  var REDUCED = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------- helpers */

  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) {
      if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  function text(x, y, str, cls, anchor) {
    var n = svg('text', { x: x, y: y, class: cls, 'text-anchor': anchor || 'middle' });
    n.textContent = str;
    return n;
  }

  /** Navy mixed with white; a = navy fraction. */
  function navyTint(a) {
    var mix = function (c) { return Math.round(c * a + 255 * (1 - a)); };
    return 'rgb(' + mix(0) + ',' + mix(39) + ',' + mix(76) + ')';
  }

  /** Baselines walk a light-to-dark navy ramp; the series flagged `ours` is maize. */
  function seriesColors(series) {
    var baselines = series.filter(function (s) { return !s.ours; }).length;
    var i = 0;
    return series.map(function (s) {
      if (s.ours) return MAIZE;
      var t = baselines === 1 ? 0.5 : 0.20 + 0.62 * (i / (baselines - 1));
      i++;
      return navyTint(t);
    });
  }

  function ticks(max, n) {
    var out = [];
    for (var i = 0; i <= n; i++) out.push((max * i) / n);
    return out;
  }

  /** Grow bars from the baseline; attribute animation, so no CSS geometry
      transition support is assumed. */
  function animate(bars, ms) {
    if (REDUCED) {
      bars.forEach(function (b) { b.apply(1); });
      return;
    }
    var t0 = 0;
    var done = false;
    function frame(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / ms);
      var e = 1 - Math.pow(1 - p, 3);
      bars.forEach(function (b) { b.apply(e); });
      if (p < 1) requestAnimationFrame(frame); else done = true;
    }
    requestAnimationFrame(frame);
    /* The bars are built at zero height and grown, so a frame callback that
       never arrives -- a backgrounded tab, a headless render -- would leave
       the chart empty. Snap to the end state if the run did not finish. */
    setTimeout(function () {
      if (done) return;
      bars.forEach(function (b) { b.apply(1); });
      done = true;
    }, ms + 400);
  }

  function width(host, fallback) {
    var w = host.clientWidth;
    return w > 40 ? w : fallback;
  }

  /** Re-render on resize, but only when the width actually changed. */
  function onResize(host, render) {
    var last = width(host, 0);
    var timer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var w = width(host, 0);
        if (Math.abs(w - last) < 8) return;
        last = w;
        render();
      }, 160);
    });
  }

  /** Wire a .segmented pill group; calls back with the chosen data-<key>. */
  function segmented(host, key, onPick) {
    if (!host) return;
    var buttons = Array.prototype.slice.call(host.querySelectorAll('button'));
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.classList.contains('is-active')) return;
        buttons.forEach(function (o) {
          var on = o === b;
          o.classList.toggle('is-active', on);
          o.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        onPick(b.dataset[key]);
      });
    });
  }

  /* ----------------------------------------------------------- results */

  /* Every number below is transcribed from the paper: Table I for simulation
     (success rate %, averaged over 3 seeds x 20 trials), Table II for the plug
     task (overall % over 10 left-port + 10 right-port trials), and the
     Real-World Evaluation prose for the cube and cup tasks.
     null = not defined: the egocentric-only ablation has no exocentric view,
     so a viewpoint shift does not apply to it. */

  var SIM_SERIES = [
    { name: 'ACT (baseline)' },
    { name: 'DP' },
    { name: 'ACT (res18&50)' },
    { name: 'ACT (res&vit)' },
    { name: 'ACT (all swin)' },
    { name: 'Ours (res&swin)', ours: true },
    { name: 'ACT (egocentric only)' }
  ];

  var DOMAINS = {
    sim: [
      {
        key: 'transfer',
        name: 'Transfer Cube',
        series: SIM_SERIES,
        groups: [
          { label: 'Same view', control: true, values: [93.3, 76.7, 91.7, 90.0, 88.3, 91.7, 83.3] },
          { label: 'Symmetric view', values: [21.7, 11.7, 33.3, 71.7, 70.0, 83.3, null] },
          { label: 'Novel view', values: [3.3, 18.3, 23.3, 1.7, 76.7, 93.3, null] }
        ],
        note: 'Success rate (%) across three viewpoint '
          + 'generalization stages, averaged over 3 seeds of 20 trials each. '
          + 'The egocentric-only ablation has no exocentric view to '
          + 'shift, so it is defined only in the aligned setting.'
      },
      {
        key: 'insertion',
        name: 'Insertion',
        series: SIM_SERIES,
        groups: [
          { label: 'Same view', control: true, values: [50.0, 43.3, 36.7, 33.3, 43.3, 56.7, 46.7] },
          { label: 'Symmetric view', values: [13.3, 8.3, 28.3, 6.7, 35.0, 51.7, null] },
          { label: 'Novel view', values: [1.7, 13.3, 20.0, 5.0, 33.3, 53.3, null] }
        ],
        note: 'Success rate (%) across three viewpoint '
          + 'generalization stages, averaged over 3 seeds of 20 trials each. '
          + 'The egocentric-only ablation has no exocentric view to '
          + 'shift, so it is defined only in the aligned setting.'
      }
    ],
    real: [
      {
        key: 'plug',
        name: 'Unplug the Plug',
        series: [
          { name: 'ACT' },
          { name: 'DP' },
          { name: 'Ours (VIL)', ours: true }
        ],
        groups: [
          { label: 'Same view', control: true, values: [80, 75, 85] },
          { label: 'Different view', values: [20, 50, 80] }
        ],
        note: 'Overall success rate over 20 trials per bar '
          + '&mdash; 10 with the plug in the left port, 10 in the right.'
      },
      {
        key: 'cube',
        name: 'Store Cube',
        table: {
          labels: 1,
          head: ['Variant', 'Pick and place', 'Full task, incl. drawer'],
          rows: [
            { ours: true, cells: ['Ours (VIL)', '26/30 (86.7%)', '14/30 (46.7%)'] },
            { cells: ['w/o exocentric view', '0/30', '0/30'] }
          ]
        },
        note: 'Success over 30 trials on the long-horizon task. '
          + 'Starting from an ambiguous egocentric view, the variant without exocentric '
          + 'input degenerates into a shortcut policy that skips the pick entirely and '
          + 'only learns to close the drawer &mdash; 0/30 either way.'
      },
      {
        key: 'cup',
        name: 'Arrange Cup',
        table: {
          labels: 2,
          head: ['Method', 'Viewpoint', 'Success'],
          rows: [
            { ours: true, cells: ['Ours (VIL)', 'Continuously moving, hand-held', '7/10 (70%)'] }
          ]
        },
        note: 'Success over 10 trials with the exocentric view provided by a human-held camera under dynamic viewpoint conditions.'
      }
    ]
  };

  /**
   * Grouped bars, one group per condition and one bar per method. Values are
   * success rates in percent, so the axis is fixed at 0-100 and every task
   * stays directly comparable when the reader switches.
   */
  function results(host, legendHost, tableHost, domainHost, taskHost, noteHost) {
    if (!host) return;
    var domain = 'sim';
    var spec = DOMAINS[domain][0];

    function renderLegend() {
      var colors = seriesColors(spec.series);
      legendHost.innerHTML = '';
      spec.series.forEach(function (s, i) {
        var span = document.createElement('span');
        var sw = document.createElement('i');
        sw.style.background = colors[i];
        if (s.ours) sw.style.borderColor = NAVY;
        span.appendChild(sw);
        span.appendChild(document.createTextNode(s.name));
        legendHost.appendChild(span);
      });
      return colors;
    }

    /* The task pills belong to the domain, so they are rebuilt on every
       domain switch rather than hidden. */
    function renderTaskPicker() {
      taskHost.innerHTML = '';
      DOMAINS[domain].forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = t.name;
        b.setAttribute('role', 'tab');
        var on = t.key === spec.key;
        b.className = on ? 'is-active' : '';
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.addEventListener('click', function () {
          if (t.key === spec.key) return;
          spec = t;
          renderTaskPicker();
          renderAll();
        });
        taskHost.appendChild(b);
      });
    }

    function render() {
      var colors = renderLegend();
      var W = Math.max(300, width(host, 900));
      var narrow = W < 620;
      var M = { top: 18, right: 10, bottom: 38, left: 40 };
      var ph = Math.max(200, Math.min(340, W * 0.36));
      var H = ph + M.top + M.bottom;
      var pw = W - M.left - M.right;
      var max = 100;

      host.innerHTML = '';
      var root = svg('svg', {
        viewBox: '0 0 ' + W + ' ' + H, role: 'img',
        'aria-label': spec.name + ' success rate by method and condition'
      });

      ticks(max, 5).forEach(function (t) {
        var y = M.top + ph - (t / max) * ph;
        root.appendChild(svg('line', {
          x1: M.left, x2: M.left + pw, y1: y, y2: y, class: 'grid-line'
        }));
        root.appendChild(text(M.left - 7, y + 4, t.toFixed(0) + '%', 'tick-text', 'end'));
      });
      root.appendChild(svg('line', {
        x1: M.left, x2: M.left + pw, y1: M.top + ph, y2: M.top + ph, class: 'axis-line'
      }));

      /* An aligned-view group is the in-distribution control: every method
         clears it, so it carries no signal. It keeps its bars -- dropping them
         would hide data -- but gets a narrower slot, a recessed tint and no
         value labels, which leaves the eye on the shifted conditions. */
      var weights = spec.groups.map(function (g) { return g.control ? 0.55 : 1; });
      var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
      var slots = [];
      var cursor = M.left;
      weights.forEach(function (w) {
        var s = (pw * w) / wsum;
        slots.push({ x: cursor, w: s });
        cursor += s;
      });
      var anims = [];

      spec.groups.forEach(function (g, gi) {
        var slot = slots[gi];
        var inner = Math.min(slot.w * 0.86, spec.series.length * 42);
        var bw = inner / spec.series.length;
        var x0 = slot.x + (slot.w - inner) / 2;
        var showValues = bw >= 24 && !narrow && !g.control;
        var layer = g.control ? svg('g', { class: 'is-control' }) : root;

        if (g.control) {
          // a pale well the control sits in, plus the rule that closes it off
          root.appendChild(svg('rect', {
            x: slot.x, y: M.top, width: slot.w, height: ph, class: 'control-well'
          }));
          root.appendChild(svg('line', {
            x1: slot.x + slot.w, x2: slot.x + slot.w,
            y1: M.top, y2: M.top + ph, class: 'control-edge'
          }));
        }

        g.values.forEach(function (v, si) {
          var x = x0 + bw * si;
          if (v == null) {
            // mark the undefined cell rather than leaving a silent gap
            layer.appendChild(text(x + bw / 2, M.top + ph - 6, 'n/a', 'value-text'));
            return;
          }
          var h = (v / max) * ph;
          var rect = svg('rect', {
            x: x + 1, y: M.top + ph, width: Math.max(2, bw - 2), height: 0,
            rx: 2, fill: colors[si],
            stroke: spec.series[si].ours ? NAVY : 'rgba(0,39,76,0.28)',
            'stroke-width': spec.series[si].ours ? 1.2 : 0.7
          });
          var title = svg('title', {});
          title.textContent = spec.series[si].name + ' · ' + g.label + ' · '
            + v.toFixed(1) + '%';
          rect.appendChild(title);
          layer.appendChild(rect);

          var val = null;
          if (showValues) {
            val = text(x + bw / 2, M.top + ph - 5, v.toFixed(0), 'value-text');
            if (spec.series[si].ours) {
              val.setAttribute('style', 'font-weight:700;fill:' + NAVY);
            }
            layer.appendChild(val);
          }

          anims.push({
            apply: function (e) {
              rect.setAttribute('height', h * e);
              rect.setAttribute('y', M.top + ph - h * e);
              if (val) val.setAttribute('y', M.top + ph - h * e - 5);
            }
          });
        });

        if (layer !== root) root.appendChild(layer);

        var cx = slot.x + slot.w / 2;
        root.appendChild(text(cx, M.top + ph + 18, g.label,
          g.control ? 'group-text is-muted' : 'group-text'));
      });

      host.appendChild(root);
      animate(anims, 560);
    }

    /* Bars need a shared denominator across the whole task. The plug task has
       one -- 20 trials per method per viewpoint -- so it is charted. The cube
       and cup tasks do not: they report two task stages and a single
       un-baselined dynamic-view run, which bars would flatten. Those stay
       tables. */
    function renderTable() {
      var t = document.createElement('table');
      t.className = 'results-table';
      var thead = document.createElement('thead');
      var hr = document.createElement('tr');
      var labelCols = spec.table.labels || 1;
      spec.table.head.forEach(function (label, i) {
        var th = document.createElement('th');
        th.textContent = label;
        if (i < labelCols) th.className = 'is-label';
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      t.appendChild(thead);

      var tbody = document.createElement('tbody');
      spec.table.rows.forEach(function (row) {
        var tr = document.createElement('tr');
        if (row.ours) tr.className = 'is-ours';
        row.cells.forEach(function (cell, i) {
          var td = document.createElement('td');
          td.textContent = cell;
          if (i < labelCols) td.className = 'is-label';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      t.appendChild(tbody);

      tableHost.innerHTML = '';
      tableHost.appendChild(t);
    }

    function renderAll() {
      var isTable = !!spec.table;
      host.hidden = isTable;
      legendHost.hidden = isTable;
      tableHost.hidden = !isTable;
      if (isTable) renderTable(); else render();
      if (noteHost) noteHost.innerHTML = spec.note;
    }

    segmented(domainHost, 'domain', function (next) {
      domain = next;
      spec = DOMAINS[domain][0];
      renderTaskPicker();
      renderAll();
    });

    renderTaskPicker();
    renderAll();
    onResize(host, function () { if (!spec.table) render(); });
  }

  /* -------------------------------------------------- episode browsers */

  /** [< n/5 >] pager over the recorded episodes of one data-collection task. */
  function episodeBrowser(card) {
    var task = card.dataset.task;
    var count = parseInt(card.dataset.count, 10);
    var main = card.querySelector('.pip-main');
    var inset = card.querySelector('.pip-inset');
    var label = card.querySelector('.pager-count');
    var buttons = card.querySelectorAll('.pager-btn');
    var at = 1;

    function show(n) {
      at = ((n - 1 + count) % count) + 1;
      var dir = 'video/' + task + '/ep' + at + '/';
      main.src = dir + 'side.mp4';
      inset.src = dir + 'wrist.mp4';
      label.textContent = at + ' / ' + count;
      // a fresh src drops the autoplay attribute's head start
      main.play().catch(function () { });
      inset.play().catch(function () { });
    }

    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () {
        show(at + parseInt(b.dataset.step, 10));
      });
    });
  }

  /* ------------------------------------------------ real-world theater */

  var RW_TASKS = ['task1', 'task2', 'task3'];
  var SPEEDS = [0.5, 1, 2];

  function fmtTime(t) {
    if (!isFinite(t)) return '0:00';
    var s = Math.floor(t % 60);
    return Math.floor(t / 60) + ':' + (s < 10 ? '0' : '') + s;
  }

  function realworldTheater() {
    var host = document.getElementById('realworld');
    if (!host) return;
    var side = document.getElementById('rw-side');
    var wrist = document.getElementById('rw-wrist');
    var external = document.getElementById('rw-external');
    var play = document.getElementById('rw-play');
    var seek = document.getElementById('rw-seek');
    var time = document.getElementById('rw-time');
    var speedBtn = document.getElementById('rw-speed');
    var clips = [side, wrist, external];
    var speed = 1;
    var scrubbing = false;
    var playing = true;

    /* The side and wrist recordings of a task are the same take, so they share
       a clock. The external camera is a separate recording of a different
       length, so it follows the same fraction of its own duration rather than
       the same timestamp. `side` drives the transport. */
    function mirror(fraction) {
      if (isFinite(side.duration)) side.currentTime = fraction * side.duration;
      if (isFinite(wrist.duration)) wrist.currentTime = fraction * wrist.duration;
      if (isFinite(external.duration)) external.currentTime = fraction * external.duration;
    }

    function syncPlayButton() {
      var live = !side.paused && !side.ended;
      play.textContent = live ? '\u275a\u275a' : '\u25b6';
      play.setAttribute('aria-label', live ? 'Pause' : 'Play');
    }

    function setPlaying(next) {
      playing = next;
      clips.forEach(function (v) {
        if (playing) v.play().catch(function () { }); else v.pause();
      });
      syncPlayButton();
    }

    function showTime() {
      time.textContent = fmtTime(side.currentTime) + ' / ' + fmtTime(side.duration);
    }

    function load(task) {
      if (RW_TASKS.indexOf(task) < 0) return;
      var dir = 'video/realworld/' + task + '/';
      side.src = dir + 'side.mp4';
      wrist.src = dir + 'wrist.mp4';
      external.src = dir + 'external.mp4';
      clips.forEach(function (v) {
        v.playbackRate = speed;
        try { v.currentTime = 0; } catch (e) { /* not seekable yet */ }
      });
      seek.value = 0;
      time.textContent = '0:00 / 0:00';
      setPlaying(playing);
    }

    play.addEventListener('click', function () { setPlaying(side.paused); });

    seek.addEventListener('input', function () {
      if (!isFinite(side.duration)) return;
      scrubbing = true;
      mirror(seek.value / 1000);
    });
    seek.addEventListener('change', function () { scrubbing = false; });

    speedBtn.addEventListener('click', function () {
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      clips.forEach(function (v) { v.playbackRate = speed; });
      speedBtn.textContent = speed + '\u00d7';
    });

    side.addEventListener('loadedmetadata', showTime);
    side.addEventListener('play', syncPlayButton);
    side.addEventListener('pause', syncPlayButton);
    side.addEventListener('timeupdate', function () {
      if (!isFinite(side.duration)) return;
      if (!scrubbing) {
        seek.value = Math.round((side.currentTime / side.duration) * 1000);
      }
      showTime();
    });

    segmented(document.getElementById('rw-task-picker'), 'task', load);
    load('task1');
  }

  /* ---------------------------------------------------------- page chrome */

  function initCopy() {
    var button = document.querySelector('.copy-button');
    if (!button) return;
    button.addEventListener('click', function () {
      var target = document.getElementById(
        button.getAttribute('data-copy-target'));
      if (!target) return;
      navigator.clipboard.writeText(target.innerText).then(function () {
        button.textContent = 'Copied';
        setTimeout(function () { button.textContent = 'Copy'; }, 1800);
      }).catch(function () {
        button.textContent = 'Copy failed';
        setTimeout(function () { button.textContent = 'Copy'; }, 1800);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initCopy();

    document.querySelectorAll('.demo-card').forEach(episodeBrowser);

    results(
      document.getElementById('results-chart'),
      document.getElementById('chart-legend'),
      document.getElementById('results-table'),
      document.getElementById('domain-picker'),
      document.getElementById('task-picker'),
      document.getElementById('chart-note'));

    realworldTheater();
  });
})();
