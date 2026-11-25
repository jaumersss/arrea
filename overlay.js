(() => {
  const demo = location.protocol === 'chrome-extension:';
  const provider = {
    'gemini.google.com': {
      name: 'Gemini',
      editor: 'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"]',
      stop: 'button.stop-button, button.stop-icon, button[data-test-id="stop-button"]'
    },
    'chatgpt.com': { name: 'ChatGPT', editor: '#prompt-textarea', stop: 'button#composer-submit-button[data-testid="stop-button"]' },
    'chat.openai.com': { name: 'ChatGPT', editor: '#prompt-textarea' }
  }[location.hostname] ?? { name: 'Claude' };
  const site = demo ? 'demo' : provider.name.toLowerCase();
  const positionKey = `position-${site}`;
  const crewKey = `crew-${site}`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const settings = { ...GalactusSettings };
  const host = document.createElement('galactus-overlay');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;
      font:14px/1.4 system-ui,sans-serif;color:#222721}
    canvas{position:absolute;top:0;left:0;pointer-events:none}
    canvas[data-effect]{will-change:transform,opacity}
    canvas[data-effect="mega-whip"],canvas[data-effect="plane"]{opacity:0}
    button{font:inherit;cursor:pointer}
    button:focus-visible{outline:2px solid #32763a;outline-offset:2px}
    [hidden]{display:none!important}
    #cowboy{position:absolute;width:48px;height:106px;pointer-events:auto;background:none;
      border:0;border-radius:8px;touch-action:none;padding:0;cursor:grab;user-select:none}
    #cowboy[data-dragging]{cursor:grabbing}
    #cowboy:hover{background:#798a6524}
    #menu{position:absolute;pointer-events:auto;box-sizing:border-box;width:min(258px,calc(100vw - 16px));
      max-height:calc(100vh - 16px);overflow:auto;background:#f8f8f2;color:#222721;padding:6px;
      border:1px solid #c8cbbf;border-radius:10px;box-shadow:0 10px 32px #15191231}
    #menu button{display:flex;align-items:center;gap:8px;min-height:31px;width:100%;border:0;
      text-align:left;border-radius:5px;padding:4px 7px;background:transparent;color:inherit}
    #menu button:hover,#menu button:focus-visible{background:#2d642f;color:white}
    #menu span{width:16px;text-align:center;flex:none}
    hr{height:1px;border:0;background:#dcded3;margin:4px}
    @media(prefers-color-scheme:dark){
      #menu{color:#f2f4ec;background:#252b24;border-color:#4a5346}hr{background:#454d41}
    }
  `;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const actor = document.createElement('button');
  actor.id = 'cowboy';
  actor.hidden = true;
  actor.setAttribute('aria-label', 'Vaquero. Arrastra o pulsa Mayús y las flechas para moverlo. Clic para lanzar el látigo. Clic derecho o Intro para abrir acciones.');
  actor.setAttribute('aria-haspopup', 'true');
  actor.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.id = 'menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Acciones del vaquero');
  menu.hidden = true;
  shadow.append(style, canvas, actor, menu);
  canvas.hidden = true;
  document.documentElement.append(host);

  const art = new GalactusAnimation(canvas, provider.name);
  const actions = [
    ['mega', 'Mega ultra giga latigazo', '✦'],
    ['world', 'Destructor de mundos', '◇'],
    ['crew', 'Llamar refuerzos', '⋮'],
    ['planes', 'Ataque aéreo', '↗'],
    ['duel', `Duelo contra ${provider.name}`, '⇄'],
    ['dino', 'Látigo jurásico', '▵']
  ];
  const scenes = [
    ['whip', 'Latigazo clásico', '∿'],
    ...actions,
    ['all', 'Ver todas las escenas', '▶']
  ];
  const sceneDuration = { mega: 2300, world: 3000, crew: 3000, planes: 3700, duel: 5100, dino: 3600 };
  const sceneImpact = { whip: .32, mega: .52, world: .64, crew: .32, planes: .48, duel: .61, dino: .46 };
  const specialScenes = ['mega', 'crew', 'dino'];
  const firstSpecialDelay = 45000;
  const specialInterval = 60000;
  const stopLabels = /^(?:stop(?: (?:generating|generation|response|streaming))?|(?:detener|parar)(?: (?:la )?(?:respuesta|generación)| de (?:generar|gerar))?|(?:atura|atura la generació|atura la resposta|aturar la resposta)|arrêter(?: la (?:génération|réponse))?|(?:antwort |generierung )?(?:stoppen|anhalten)|interrompi(?: la generazione)?)$/iu;
  const preferredStop = ['[data-testid="stop-button"]', '[data-testid="stop-response-button"]',
    '[data-testid="stop-generation-button"]', provider.stop].filter(Boolean).join(',');
  const editors = [provider.editor, '[data-testid="chat-input"]',
    '[contenteditable="true"][role="textbox"]', '.ProseMirror'].filter(Boolean).join(',');
  const labeledButtons = 'button[aria-label],button[title],button[mattooltip],[role="button"][aria-label]';
  let box = { x: 50, y: 300 };
  let stopControl = null;
  let editor = null;
  let customPosition = null;
  let drag = null;
  let ignoreDragClick = false;
  let generating = false;
  let crewActive = false;
  let generationStartedAt = 0;
  let nextSpecialAt = 0;
  let specialIndex = 0;
  let sequence = [];
  let current = null;
  let animationFrame = 0;
  let frameTimer = 0;
  let nextPaintAt = 0;
  let lastSync = 0;
  let submenu = false;
  let demoHidden = false;
  let audio = null;
  let crackBuffer = null;
  let syncTimer = 0;
  let syncDueAt = 0;
  let ready = false;
  let contextPoint = null;

  function visible(element) {
    return element?.isConnected && !element.closest('[aria-hidden="true"], [inert]') && element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden';
  }

  function availableStop(element) {
    return !element.disabled && element.getAttribute('aria-disabled') !== 'true' && visible(element);
  }

  function hasStopLabel(element) {
    const name = element.getAttribute('aria-label') || element.title || element.getAttribute('mattooltip') || '';
    return stopLabels.test(name.trim());
  }

  function findStop() {
    if (stopControl && (stopControl.matches(preferredStop) || hasStopLabel(stopControl)) && availableStop(stopControl)) {
      return stopControl;
    }
    stopControl = [...document.querySelectorAll(preferredStop)].find(availableStop) ??
      [...document.querySelectorAll(labeledButtons)].find(element => hasStopLabel(element) && availableStop(element)) ??
      null;
    return stopControl;
  }

  function sync(forcePaint = false) {
    if (!ready) return;
    lastSync = performance.now();
    const stop = !demo && settings.enabled ? findStop() : null;
    if (Boolean(stop) !== generating) {
      generating = Boolean(stop);
      if (generating) {
        generationStartedAt = performance.now();
        nextSpecialAt = generationStartedAt + firstSpecialDelay;
        specialIndex = 0;
      }
      if (!generating && current?.duringGeneration) {
        current = null;
        sequence = [];
        cancelDraw();
        art.clearEffects();
      }
    }
    const enabled = demo ? !demoHidden : settings.enabled;
    if (!enabled) {
      current = null;
      sequence = [];
      closeMenu();
    }
    const show = enabled && (demo || generating || !!current || !menu.hidden || !!drag);
    const hidden = !show;
    if (actor.hidden !== hidden) {
      actor.hidden = hidden;
      canvas.hidden = hidden;
    }
    if (show) {
      position(stop);
      if (forcePaint || !frameTimer) requestDraw();
    } else {
      cancelDraw();
      art.clearEffects();
    }
  }

  function position(stop) {
    if (drag?.moved) return;
    if (customPosition) {
      place(customPosition.x * innerWidth, customPosition.y * innerHeight);
      return;
    }
    if (!editor?.matches(editors) || !visible(editor)) {
      editor = [...document.querySelectorAll(editors)].find(visible);
    }
    const rect = (editor ?? stop)?.getBoundingClientRect();
    const left = rect && rect.left > 115 ? rect.left - 53 : Math.min(innerWidth * .12, 80);
    const targetY = rect ? rect.top - 100 : innerHeight * .60;
    place(left, targetY);
  }

  function place(x, y) {
    const next = {
      x: Math.round(Math.max(24, Math.min(innerWidth - 24, x))),
      y: Math.round(Math.max(103, Math.min(innerHeight - 3, y)))
    };
    if (next.x === box.x && next.y === box.y && actor.style.left) return;
    box = next;
    Object.assign(actor.style, { left: `${box.x - 24}px`, top: `${box.y - 103}px` });
    requestDraw();
  }

  function rememberPosition() {
    customPosition = { x: box.x / innerWidth, y: box.y / innerHeight };
    chrome.storage.local.set({ [positionKey]: customPosition }).catch(console.error);
  }

  function requestDraw() {
    if (!animationFrame && !document.hidden) animationFrame = requestAnimationFrame(draw);
  }

  function cancelDraw() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    clearTimeout(frameTimer);
    frameTimer = 0;
    nextPaintAt = 0;
  }

  function scheduleDraw(now, reduced) {
    if (!current || (reduced && current.repeating)) return;
    const { start, impact, duration } = current;
    const impactAt = start + duration * impact;
    const nextVisual = reduced ? start + duration : art.nextVisualChange(current, now);
    const nextSound = settings.sound && !current.sounded && now < impactAt ? impactAt : Infinity;
    const pauseUntil = Math.min(nextVisual, nextSound);
    if (pauseUntil > now) {
      if (!frameTimer) {
        frameTimer = setTimeout(() => {
          frameTimer = 0;
          requestDraw();
        }, Math.max(0, pauseUntil - performance.now()));
      }
    } else requestDraw();
  }

  function draw(now) {
    animationFrame = 0;
    if (actor.hidden || document.hidden) return;
    const reduced = reducedMotion.matches;
    if (current && now + 1 < nextPaintAt) {
      requestDraw();
      return;
    }
    if (current?.repeating && reduced && current.name === 'whip') current = null;
    if (current && !(reduced && current.repeating) && now - current.start >= current.duration) {
      if (!demo && !current.repeating && current.name !== 'whip') {
        sync();
        if (actor.hidden) return;
      }
      current = null;
      if (sequence.length) startScene(sequence.shift(), now);
      else if (!demo && !generating && menu.hidden) {
        sync();
        return;
      }
    }
    if (!current && generating && crewActive) startScene('crew', now, true);
    if (!current && generating && !reduced) {
      if (now >= nextSpecialAt && menu.hidden && !drag) {
        startScene(specialScenes[specialIndex], now);
        specialIndex = (specialIndex + 1) % specialScenes.length;
        nextSpecialAt = now + current.duration + specialInterval;
      } else startScene('whip', now, true);
    }
    if (current && !(reduced && current.repeating) && !current.sounded && now - current.start >= current.duration * current.impact) {
      current.sounded = true;
      crack();
    }
    try {
      art.draw(box, current, now, settings.bubbles, reduced);
      const framePeriod = 1000 / 60;
      nextPaintAt = nextPaintAt && now - nextPaintAt < framePeriod ? nextPaintAt + framePeriod : now + framePeriod;
      scheduleDraw(now, reduced);
    } catch (error) {
      console.error(error);
      cancelDraw();
      if (current && current.name !== 'whip') {
        const repeatingCrew = current.name === 'crew' && current.repeating;
        current = null;
        sequence = [];
        art.clearEffects();
        if (!repeatingCrew) sync();
      }
    }
  }

  function startScene(name, now, repeating = false) {
    clearTimeout(frameTimer);
    frameTimer = 0;
    nextPaintAt = 0;
    const elapsed = generating ? now - generationStartedAt : 0;
    const duration = name === 'whip' ? galactusWhipDuration(settings.pace, elapsed) : sceneDuration[name];
    current = {
      name, start: now, duration: reducedMotion.matches ? 1000 : duration, impact: sceneImpact[name],
      recovery: name === 'mega' ? .952 : 1, repeating, duringGeneration: generating
    };
  }

  function unlockSound() {
    if (!settings.sound) return;
    try {
      audio ??= new AudioContext();
      audio.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }

  function crack() {
    if (!settings.sound || audio?.state !== 'running') return;
    if (!crackBuffer) {
      crackBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * .12), audio.sampleRate);
      const data = crackBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * .14));
      }
    }
    const source = audio.createBufferSource();
    const volume = audio.createGain();
    volume.gain.value = .21;
    source.buffer = crackBuffer;
    source.connect(volume).connect(audio.destination);
    source.start();
  }

  function setCrewActive(active) {
    if (crewActive === active) return;
    crewActive = active;
    if (active || (current?.name === 'crew' && current.repeating)) {
      current = null;
      sequence = [];
      cancelDraw();
    }
    if (generating) nextSpecialAt = Math.max(nextSpecialAt, performance.now() + firstSpecialDelay);
  }

  function select(name) {
    unlockSound();
    if (name === 'crew' && !demo) {
      setCrewActive(!crewActive);
      chrome.storage.local.set({ [crewKey]: crewActive }).catch(console.error);
      closeMenu(true);
      sync(true);
      return;
    }
    const now = performance.now();
    sequence = name === 'all' ? scenes.slice(0, -1).map(([id]) => id) : [];
    startScene(name === 'all' ? sequence.shift() : name, now);
    if (generating) nextSpecialAt = Math.max(nextSpecialAt, now + current.duration + specialInterval);
    closeMenu(true);
    sync();
  }

  function save(changes) {
    Object.assign(settings, changes);
    chrome.storage.local.set(changes).catch(console.error);
    sync();
  }

  function renderMenu(x, y, focusIndex = 0) {
    menu.replaceChildren();
    function entry(label, icon, onClick, pressed) {
      const button = document.createElement('button');
      button.type = 'button';
      if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
      const mark = document.createElement('span');
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = icon;
      button.append(mark, label);
      button.addEventListener('click', onClick);
      menu.append(button);
    }
    if (submenu) entry('Volver', '‹', () => { submenu = false; renderMenu(x, y, actions.length); });
    for (const [id, label, icon] of submenu ? scenes : actions) {
      const pressed = id === 'crew' && !demo ? crewActive : undefined;
      entry(label, pressed ? '✓' : icon, () => select(id), pressed);
    }
    if (!submenu) {
      entry('Escenas', '›', () => { submenu = true; renderMenu(x, y); });
      menu.append(document.createElement('hr'));
      for (const [key, label] of [['bubbles', 'Bocadillos'], ['sound', 'Sonido']]) {
        entry(label, settings[key] ? '✓' : '·', () => {
          const index = [...menu.querySelectorAll('button')].indexOf(shadow.activeElement);
          save({ [key]: !settings[key] });
          unlockSound();
          renderMenu(x, y, index);
        }, settings[key]);
      }
      for (const [delta, label, icon] of [[-1000, 'Más rápido', '+'], [1000, 'Más lento', '−']]) {
        entry(label, icon, () => {
          save({ pace: Math.min(15000, Math.max(1500, settings.pace + delta)) });
          closeMenu(true);
        });
      }
      menu.append(document.createElement('hr'));
      if (customPosition) {
        entry('Restablecer posición', '↶', () => {
          customPosition = null;
          chrome.storage.local.remove(positionKey).catch(console.error);
          closeMenu(true);
          sync();
        });
      }
      entry('Ocultar vaquero', '×', () => {
        if (demo) {
          demoHidden = true;
          sync();
          document.querySelector('#preview')?.focus();
        } else save({ enabled: false });
      });
    }
    menu.hidden = false;
    sync();
    actor.setAttribute('aria-expanded', 'true');
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelectorAll('button')[Math.max(0, focusIndex)]?.focus();
  }

  function closeMenu(restoreFocus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    actor.setAttribute('aria-expanded', 'false');
    submenu = false;
    if (restoreFocus) actor.focus();
    requestDraw();
    queueSync();
  }

  actor.addEventListener('click', event => {
    if (event.detail === 0) renderMenu(box.x + 16, box.y - 60);
    else if (!ignoreDragClick) select('whip');
    ignoreDragClick = false;
  });
  actor.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    ignoreDragClick = false;
    drag = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      origin: box, moved: false, returnToMenu: !demo && !generating && !menu.hidden
    };
    actor.setPointerCapture(event.pointerId);
  });
  actor.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      actor.setAttribute('data-dragging', '');
      closeMenu();
      actor.focus({ preventScroll: true });
    }
    place(drag.origin.x + dx, drag.origin.y + dy);
  });
  function finishDrag(event) {
    if (drag?.id !== event.pointerId) return;
    const { moved, returnToMenu } = drag;
    drag = null;
    if (!moved) return;
    ignoreDragClick = true;
    actor.removeAttribute('data-dragging');
    if (event.type === 'pointerup') rememberPosition();
    if (returnToMenu && settings.enabled) renderMenu(box.x + 16, box.y - 60);
    else sync();
  }
  actor.addEventListener('pointerup', finishDrag);
  actor.addEventListener('pointercancel', finishDrag);
  actor.addEventListener('lostpointercapture', finishDrag);
  actor.addEventListener('keydown', event => {
    const offsets = { ArrowUp: [0, -20], ArrowDown: [0, 20], ArrowLeft: [-20, 0], ArrowRight: [20, 0] };
    const offset = event.shiftKey && offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    event.stopPropagation();
    place(box.x + offset[0], box.y + offset[1]);
    rememberPosition();
  });
  actor.addEventListener('contextmenu', event => {
    event.preventDefault();
    renderMenu(event.clientX, event.clientY);
  });
  if (!demo) {
    document.addEventListener('contextmenu', event => {
      if (!event.composedPath().includes(host)) {
        contextPoint = { x: event.clientX, y: event.clientY, time: performance.now() };
      }
    }, true);
    chrome.runtime.onMessage.addListener(message => {
      if (message?.type !== 'galactus-open-actions') return;
      initialization.then(() => {
        if (!settings.enabled) return;
        const point = contextPoint && performance.now() - contextPoint.time < 60000 ? contextPoint : null;
        contextPoint = null;
        submenu = false;
        if (!point) position(findStop());
        renderMenu(point?.x ?? box.x + 16, point?.y ?? box.y - 60);
      });
    });
  }
  shadow.addEventListener('keydown', event => {
    if (menu.hidden) return;
    if (event.key === 'Escape') closeMenu(true);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const buttons = [...menu.querySelectorAll('button')];
      const index = buttons.indexOf(shadow.activeElement);
      const next = { ArrowDown: (index + 1) % buttons.length, ArrowUp: (index - 1 + buttons.length) % buttons.length,
        Home: 0, End: buttons.length - 1 }[event.key];
      buttons[next].focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  });
  document.addEventListener('pointerdown', event => {
    if (!event.composedPath().includes(host)) closeMenu();
  }, true);
  document.addEventListener('focusin', event => {
    if (!event.composedPath().includes(host)) closeMenu();
  }, true);
  document.addEventListener('pointerdown', unlockSound, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      closeMenu();
      cancelDraw();
      art.clearEffects();
    }
    else sync(true);
  });
  canvas.addEventListener('contextrestored', requestDraw);
  window.addEventListener('resize', () => { closeMenu(); sync(true); });
  reducedMotion.addEventListener('change', () => {
    cancelDraw();
    sync(true);
  });

  if (demo) document.querySelector('#preview')?.addEventListener('click', () => {
    demoHidden = false;
    select('all');
  });

  function queueSync(delay = 150) {
    const due = performance.now() + delay;
    if (syncTimer && syncDueAt <= due) return;
    clearTimeout(syncTimer);
    syncDueAt = due;
    syncTimer = setTimeout(() => {
      syncTimer = 0;
      sync();
    }, delay);
  }

  function observeChat(records) {
    if (!generating || !stopControl?.isConnected ||
        records.some(({ target }) => target === editor || target.contains(stopControl))) {
      queueSync();
    } else {
      queueSync(Math.max(150, lastSync + 1000 - performance.now()));
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[positionKey]) customPosition = changes[positionKey].newValue ?? null;
    if (changes[crewKey]) setCrewActive(changes[crewKey].newValue === true);
    for (const name of Object.keys(GalactusSettings)) {
      if (changes[name]) settings[name] = changes[name].newValue ?? GalactusSettings[name];
    }
    sync(true);
  });
  const initialization = chrome.storage.local.get({ ...GalactusSettings, [positionKey]: null, [crewKey]: false })
    .then(({ [positionKey]: savedPosition, [crewKey]: savedCrew, ...stored }) => {
      customPosition = savedPosition;
      crewActive = savedCrew;
      Object.assign(settings, stored);
    }, console.error)
    .finally(() => {
      ready = true;
      new MutationObserver(observeChat).observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['aria-label', 'title', 'mattooltip', 'data-testid', 'data-test-id',
          'hidden', 'disabled', 'aria-disabled', 'aria-hidden', 'inert', 'class', 'style']
      });
      sync();
    });
})();
