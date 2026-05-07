/* FreshZone Enhance v3 — micro-interactions & motion
   - Reveal-on-scroll with stagger
   - Click ripple on action buttons
   - Magnetic hover on primary buttons
   - Animated stat-box number counters (data-target or text-based)
   - Subtle 3D tilt on cards (desktop only)
   - Cursor halo for auth page (desktop only)
   - Smooth in-page anchor scroll
   No DOM mutations beyond decorative spans/classes. */
(function(){
  if (window.__fzEnhance3) return; window.__fzEnhance3 = true;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // ───── Reveal-on-scroll with stagger ─────
  function setupReveal(){
    if (prefersReduced) return;
    var sel = '.glass-card, .card, .hero, .stat-box, .location-card, .log-container, .filter-bar, .profile-card, .inbox-ticket, .contact-page-header';
    var els = document.querySelectorAll(sel);
    els.forEach(function(el){
      if (el.classList.contains('animate-in')) return; // don't double-animate site-built ones
      el.classList.add('fz-reveal');
    });
    // assign a per-parent stagger index so siblings cascade
    var groups = new Map();
    document.querySelectorAll('.fz-reveal').forEach(function(el){
      var parent = el.parentElement;
      var idx = groups.get(parent) || 0;
      el.style.setProperty('--fz-i', idx);
      groups.set(parent, idx + 1);
    });
    if (!('IntersectionObserver' in window)){
      document.querySelectorAll('.fz-reveal').forEach(function(el){ el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting){
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    document.querySelectorAll('.fz-reveal').forEach(function(el){ io.observe(el); });
  }

  // ───── Click ripple ─────
  function setupRipple(){
    if (prefersReduced) return;
    document.addEventListener('click', function(ev){
      var btn = ev.target.closest('button');
      if (!btn) return;
      if (btn.classList.contains('dark-toggle') ||
          btn.classList.contains('hamburger') ||
          btn.classList.contains('mobile-nav-close') ||
          btn.classList.contains('push-toggle-switch') ||
          btn.classList.contains('eye-btn')) return;
      var cs = getComputedStyle(btn);
      if (cs.position === 'static') btn.style.position = 'relative';
      if (cs.overflow !== 'hidden') btn.style.overflow = 'hidden';
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var span = document.createElement('span');
      span.className = 'fz-ripple';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (ev.clientX - rect.left - size/2) + 'px';
      span.style.top  = (ev.clientY - rect.top  - size/2) + 'px';
      btn.appendChild(span);
      setTimeout(function(){ span.remove(); }, 700);
    }, { passive: true });
  }

  // ───── Magnetic hover on key buttons ─────
  function setupMagnetic(){
    if (prefersReduced || !isDesktop) return;
    var sel = '.btn-primary, .auth-form-content .btn-primary, .change-photo-btn';
    var btns = document.querySelectorAll(sel);
    btns.forEach(function(btn){
      btn.classList.add('fz-magnetic');
      var raf = null;
      function move(e){
        var r = btn.getBoundingClientRect();
        var mx = e.clientX - r.left - r.width/2;
        var my = e.clientY - r.top  - r.height/2;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function(){
          btn.style.setProperty('--mx', mx + 'px');
          btn.style.setProperty('--my', my + 'px');
        });
      }
      function leave(){
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      }
      btn.addEventListener('mousemove', move);
      btn.addEventListener('mouseleave', leave);
    });
  }

  // ───── Animated counters for stat-box numbers ─────
  function setupCounters(){
    if (prefersReduced) return;
    var nums = document.querySelectorAll('.stat-box h3');
    nums.forEach(function(el){
      // skip if already processed or contains non-numeric markup we shouldn't touch
      if (el.dataset.fzCounted) return;
      var raw = (el.textContent || '').trim();
      var match = raw.match(/^(-?\d+(?:[.,]\d+)?)([%a-zA-Z\s/]*)$/);
      if (!match) return;
      var target = parseFloat(match[1].replace(',', '.'));
      if (isNaN(target)) return;
      var suffix = match[2] || '';
      el.dataset.fzCounted = '1';
      el.dataset.fzTarget = target;
      el.dataset.fzSuffix = suffix;
      el.textContent = '0' + suffix;
    });
    if (!('IntersectionObserver' in window)){
      nums.forEach(function(el){ if (el.dataset.fzTarget != null) animateCounter(el); });
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting){ animateCounter(e.target); io.unobserve(e.target); }
      });
    }, { threshold: .35 });
    nums.forEach(function(el){ if (el.dataset.fzTarget != null) io.observe(el); });
  }
  function animateCounter(el){
    var target = parseFloat(el.dataset.fzTarget);
    var suffix = el.dataset.fzSuffix || '';
    var isFloat = String(target).indexOf('.') !== -1;
    var dur = 1100;
    var t0 = performance.now();
    function frame(now){
      var p = Math.min(1, (now - t0) / dur);
      // easeOutCubic
      p = 1 - Math.pow(1 - p, 3);
      var v = target * p;
      el.textContent = (isFloat ? v.toFixed(1) : Math.round(v)) + suffix;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = (isFloat ? target.toFixed(1) : target) + suffix;
    }
    requestAnimationFrame(frame);
  }

  // ───── Subtle 3D tilt on cards (desktop only) ─────
  function setupTilt(){
    if (prefersReduced || !isDesktop) return;
    var cards = document.querySelectorAll('.location-card, .stat-box');
    cards.forEach(function(card){
      var raf = null;
      function move(e){
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width  - .5;
        var py = (e.clientY - r.top)  / r.height - .5;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function(){
          card.style.transform = 'perspective(900px) rotateX(' + (-py * 4) + 'deg) rotateY(' + (px * 5) + 'deg) translateY(-4px)';
        });
      }
      function leave(){
        card.style.transform = '';
      }
      card.addEventListener('mousemove', move);
      card.addEventListener('mouseleave', leave);
    });
  }

  // ───── Cursor halo on auth page ─────
  function setupCursorHalo(){
    if (prefersReduced || !isDesktop) return;
    var wrap = document.querySelector('.auth-wrapper');
    if (!wrap) return;
    document.addEventListener('mousemove', function(e){
      wrap.style.setProperty('--cx', e.clientX + 'px');
      wrap.style.setProperty('--cy', e.clientY + 'px');
    }, { passive: true });
  }

  // ───── Smooth in-page anchor scroll ─────
  function setupAnchors(){
    document.addEventListener('click', function(ev){
      var a = ev.target.closest('a[href^="#"]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href === '#' || href.length < 2) return;
      var t = document.querySelector(href);
      if (!t) return;
      ev.preventDefault();
      t.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    });
  }

  ready(function(){
    try { setupReveal(); } catch(e){}
    try { setupRipple(); } catch(e){}
    try { setupMagnetic(); } catch(e){}
    try { setupCounters(); } catch(e){}
    try { setupTilt(); } catch(e){}
    try { setupCursorHalo(); } catch(e){}
    try { setupAnchors(); } catch(e){}
  });
})();
