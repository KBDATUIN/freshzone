/* Push Toggle — Draggable + Click-to-toggle
 * Compatible with existing onclick="togglePushNotifications()"
 * Drag knob or click switch → toggle
 * Touch/mobile friendly
 * No conflicts */

(function() {
  'use strict';

  const switchBtn = document.getElementById('push-btn');
  if (!switchBtn) return;

  const knob = switchBtn.querySelector('.
