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

  // ───── Page transition — fade-out on exit + fade-in with slide-up on entry ─────
  //
  // HOW IT WORKS
  // ─────────────────────────────────────────────────────────────────────────────
  // The KEY insight: html must be invisible at the very first paint of the new
  // page, before any CSS or JS has loaded. We achieve this by adding
  //   html { opacity: 0; }
  // to each page's *inline* anti-flash <style> (the one already in <head> before
  // any other resource). That style is the first thing the browser executes, so
  // the page is invisible from frame 0.
  //
  // Entry: enhance.js runs (deferred), adds .fz-entering, then on the very next
  //        animation frame fades html back to opacity:1. Content elements animate
  //        up via @keyframes tied to .fz-entering.
  //
  // Exit : clicking an internal nav link adds .fz-out (opacity:0, 180ms), then
  //        navigates. The departing page fades out cleanly.
  //
  // What is skipped (native behaviour kept):
  //   • Logout anchors (onclick contains openLogoutModal)
  //   • auth.html / offline.html — not in NAV_PAGES
  //   • External links, mailto:, tel:
  //   • Modifier-key clicks (Cmd/Ctrl/Shift+click → new tab)
  //   • prefers-reduced-motion users (no animation at all)
  // ─────────────────────────────────────────────────────────────────────────────
  function setupPageTransition() {

    // ── Runtime CSS (injected once, early) ───────────────────────────
    // This handles transitions and slide-up keyframes.
    // The initial opacity:0 on <html> must be in the inline <style> per page
    // (not here) — because this script runs deferred, after first paint.
    if (!document.getElementById('fz-pt-style')) {
      var s = document.createElement('style');
      s.id = 'fz-pt-style';
      s.textContent = [
        // Base: smooth opacity transitions on <html>
        'html{transition:opacity 0.32s cubic-bezier(0.22,1,0.36,1);}',

        // Exit class: snap to invisible quickly
        'html.fz-out{opacity:0!important;transition:opacity 0.18s cubic-bezier(0.4,0,0.2,1)!important;pointer-events:none!important;}',

        // Entry keyframe: elements slide up while fading in
        '@keyframes fzSlideUp{',
        '  from{opacity:0;transform:translateY(22px) scale(0.98)}',
        '  to  {opacity:1;transform:translateY(0)    scale(1)   }',
        '}',

        // Apply slide-up to key content blocks during entry
        'html.fz-entering nav,',
        'html.fz-entering .page-hero,',
        'html.fz-entering .dashboard-masthead,',
        'html.fz-entering .hero,',
        'html.fz-entering .glass-card,',
        'html.fz-entering .stat-box,',
        'html.fz-entering .location-card,',
        'html.fz-entering .log-container,',
        'html.fz-entering .filter-bar,',
        'html.fz-entering .profile-card,',
        'html.fz-entering .contact-page-header,',
        'html.fz-entering .about-stat-strip,',
        'html.fz-entering .about-team-grid,',
        'html.fz-entering .inbox-section{',
        '  animation:fzSlideUp 0.48s cubic-bezier(0.22,1,0.36,1) both;',
        '}',

        // Stagger so elements cascade in naturally
        'html.fz-entering nav{animation-delay:0ms;}',
        'html.fz-entering .hero,html.fz-entering .page-hero,html.fz-entering .dashboard-masthead{animation-delay:50ms;}',
        'html.fz-entering .filter-bar,html.fz-entering .contact-page-header,html.fz-entering .about-stat-strip{animation-delay:80ms;}',
        'html.fz-entering .profile-card{animation-delay:80ms;}',
        'html.fz-entering .glass-card:nth-child(1),.html.fz-entering .stat-box:nth-child(1),html.fz-entering .location-card:nth-child(1){animation-delay:100ms;}',
        'html.fz-entering .glass-card:nth-child(2),html.fz-entering .stat-box:nth-child(2),html.fz-entering .location-card:nth-child(2){animation-delay:140ms;}',
        'html.fz-entering .glass-card:nth-child(3),html.fz-entering .stat-box:nth-child(3),html.fz-entering .location-card:nth-child(3){animation-delay:180ms;}',
        'html.fz-entering .glass-card:nth-child(n+4),html.fz-entering .stat-box:nth-child(n+4),html.fz-entering .location-card:nth-child(n+4){animation-delay:220ms;}',
        'html.fz-entering .log-container,html.fz-entering .inbox-section,html.fz-entering .about-team-grid{animation-delay:160ms;}',

        // Respect prefers-reduced-motion — zero animation, instant visibility
        '@media(prefers-reduced-motion:reduce){',
        '  html{opacity:1!important;transition:none!important;}',
        '  html.fz-out{opacity:1!important;transition:none!important;}',
        '  html.fz-entering *{animation:none!important;opacity:1!important;transform:none!important;}',
        '}',
      ].join('');
      document.head.appendChild(s);
    }

    // Pages in the internal nav — everything else falls through to native load
    var NAV_PAGES = ['dashboard.html','history.html','profile.html','contact.html','about.html','admin.html'];

    function isNavHref(href) {
      if (!href) return false;
      var clean = href.replace(/[?#].*$/, '').split('/').pop();
      // bare '/' or '' maps to dashboard-level — treat as nav
      if (clean === '' || clean === '/') return true;
      return NAV_PAGES.indexOf(clean) !== -1;
    }

    // ── EXIT: intercept nav-link clicks ──────────────────────────────
    document.addEventListener('click', function(ev) {
      if (ev.defaultPrevented) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (ev.button !== 0) return;

      var a = ev.target.closest('a[href]');
      if (!a) return;

      var href = a.getAttribute('href');
      if (!href || href === '#' || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
      if (a.getAttribute('target') === '_blank') return;
      if (!isNavHref(href)) return;

      // Skip logout / modal-triggering anchors
      var oc = a.getAttribute('onclick') || '';
      if (oc.indexOf('openLogoutModal') !== -1 || oc.indexOf('Modal') !== -1) return;

      ev.preventDefault();
      var dest = href;

      // Fade out, then navigate
      document.documentElement.classList.add('fz-out');
      setTimeout(function() { window.location.href = dest; }, 200);
    }, true); // capture phase so we beat other listeners

    // ── ENTRY: <html> starts at opacity:0 (set in inline anti-flash style).
    //    We add .fz-entering here, then on the very next animation frame
    //    remove the inline opacity:0 so the CSS transition kicks in (0→1).
    function enterPage() {
      if (prefersReduced) {
        // Just make sure we're visible immediately
        document.documentElement.style.opacity = '';
        return;
      }

      var html = document.documentElement;
      html.classList.remove('fz-out');
      html.classList.add('fz-entering');

      // Remove the inline opacity:0 on the next frame so the CSS
      // transition (set in fz-pt-style above) animates it to 1.
      // Double-rAF ensures the browser has committed the opacity:0 state.
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          html.style.opacity = '';   // let CSS transition handle 0 → 1
        });
      });

      // Remove .fz-entering after all slide-ups complete (longest: 220+480ms)
      setTimeout(function() {
        html.classList.remove('fz-entering');
      }, 760);
    }

    // Run on every page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enterPage);
    } else {
      enterPage();
    }

    // Handle bfcache restore (back/forward button)
    window.addEventListener('pageshow', function(ev) {
      if (ev.persisted) {
        document.documentElement.classList.remove('fz-out');
        // Re-apply opacity:0 so the fade-in plays again
        document.documentElement.style.opacity = '0';
        enterPage();
      }
    });
  }

  ready(function(){
    try { setupPageTransition(); } catch(e){}
    try { setupReveal(); } catch(e){}
    try { setupRipple(); } catch(e){}
    try { setupMagnetic(); } catch(e){}
    try { setupCounters(); } catch(e){}
    try { setupTilt(); } catch(e){}
    try { setupCursorHalo(); } catch(e){}
    try { setupAnchors(); } catch(e){}
  });
})();
