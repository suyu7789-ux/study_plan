const state = {
  summary: null,
  tasks: [],
  selectedDate: null,
  selectedSubject: "全部",
  selectedStudent: "",
  activeTimerTask: null,
  timerFinishing: false,
  expandedTasks: new Set(),
};

const role = window.APP_USER.role;
const canManageUsers = Boolean(window.APP_USER.canManageUsers);
const subjectClass = { 数学: "math", 物理: "physics", 化学: "chemistry", 英语: "english" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  try { payload = await response.json(); } catch (_error) { payload = {}; }
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("请重新登录");
  }
  if (!response.ok) throw new Error(payload.error || "操作失败");
  return payload;
}

function toast(message, type = "success") {
  const region = document.getElementById("toastRegion");
  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.textContent = message;
  region.appendChild(item);
  setTimeout(() => item.remove(), 2800);
}

function percent(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

function miniProgressRing(rate) {
  const circumference = 113.097; // 2 * Math.PI * 18
  const offset = circumference - (rate / 100) * circumference;
  return `
    <svg class="progress-ring" width="40" height="40" role="img" aria-label="进度：${rate}%">
      <circle class="progress-ring-bg" stroke="rgba(255, 255, 255, 0.05)" stroke-width="3" fill="transparent" r="18" cx="20" cy="20"/>
      <circle class="progress-ring-bar" data-progress-offset="${offset}" stroke="var(--subject-color)" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" stroke-width="3" stroke-linecap="round" fill="transparent" r="18" cx="20" cy="20">
        <animate attributeName="stroke-dashoffset" from="${circumference}" to="${offset}" dur="850ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".22 .75 .24 1"/>
      </circle>
    </svg>
  `;
}

function largeProgressRing(rate, subject) {
  const circumference = 314.159; // 2 * Math.PI * 50
  const offset = circumference - (rate / 100) * circumference;
  return `
    <svg class="progress-ring" width="116" height="116" role="img" aria-label="${subject}进度：${rate}%">
      <circle class="progress-ring-bg" stroke="rgba(255, 255, 255, 0.05)" stroke-width="6" fill="transparent" r="50" cx="58" cy="58"/>
      <circle class="progress-ring-bar" data-progress-offset="${offset}" stroke="var(--subject-color)" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" stroke-width="6" stroke-linecap="round" fill="transparent" r="50" cx="58" cy="58">
        <animate attributeName="stroke-dashoffset" from="${circumference}" to="${offset}" dur="850ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".22 .75 .24 1"/>
      </circle>
    </svg>
  `;
}

function orderedList(items, className = "requirement-list") {
  return `<ol class="${className}">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ol>`;
}

function syncTimerTask(task) {
  task._timerSyncedAt = Date.now();
  return task;
}

function timerElapsed(task) {
  const base = Number(task.timer?.elapsed_seconds || 0);
  if (task.timer?.state !== "running") return base;
  return base + Math.max(0, Math.floor((Date.now() - task._timerSyncedAt) / 1000));
}

function timerRemaining(task) {
  return Math.max(0, Number(task.timer?.target_seconds || 0) - timerElapsed(task));
}

function initTimerDialMarks() {
  const container = document.getElementById("timerDialMarks");
  if (!container || container.childElementCount) return;
  for (let index = 0; index < 12; index += 1) {
    const angle = index * 30;
    const mark = document.createElement("span");
    mark.className = `dial-mark ${index % 3 === 0 ? "major" : ""}`;
    mark.style.transform = `rotate(${angle}deg)`;
    container.appendChild(mark);

    const number = document.createElement("span");
    number.className = "dial-number";
    number.style.transform = `rotate(${angle}deg)`;
    const label = document.createElement("span");
    label.textContent = index === 0 ? "12" : String(index);
    label.style.transform = `rotate(${-angle}deg)`;
    number.appendChild(label);
    container.appendChild(number);
  }
}

const timerMusicPresets = {
  flow: {
    title: "灵动流光",
    accent: "#2dd4bf",
    soft: "rgba(45,212,191,.12)",
    glow: "rgba(45,212,191,.3)",
    panel: "radial-gradient(circle at 88% 8%,rgba(45,212,191,.2),transparent 44%),linear-gradient(145deg,rgba(10,30,38,.98),rgba(7,12,24,.98))",
    interval: 600,
    delay: 0.6,
    feedback: 0.38,
    reverb: 2.8,
  },
  moon: {
    title: "月海浮光",
    accent: "#a78bfa",
    soft: "rgba(167,139,250,.12)",
    glow: "rgba(167,139,250,.32)",
    panel: "radial-gradient(circle at 88% 8%,rgba(167,139,250,.25),transparent 46%),linear-gradient(145deg,rgba(29,20,52,.98),rgba(8,11,25,.98))",
    interval: 2400,
    delay: 0.82,
    feedback: 0.3,
    reverb: 4.2,
  },
  pulse: {
    title: "深空脉冲",
    accent: "#38bdf8",
    soft: "rgba(56,189,248,.12)",
    glow: "rgba(56,189,248,.32)",
    panel: "radial-gradient(circle at 88% 8%,rgba(56,189,248,.24),transparent 45%),linear-gradient(145deg,rgba(8,26,48,.98),rgba(6,11,24,.98))",
    interval: 375,
    delay: 0.375,
    feedback: 0.26,
    reverb: 2.1,
  },
  rain: {
    title: "雨夜星尘",
    accent: "#f0abfc",
    soft: "rgba(240,171,252,.12)",
    glow: "rgba(240,171,252,.3)",
    panel: "radial-gradient(circle at 88% 8%,rgba(240,171,252,.22),transparent 45%),linear-gradient(145deg,rgba(40,22,51,.98),rgba(10,11,27,.98))",
    interval: 800,
    delay: 0.72,
    feedback: 0.34,
    reverb: 3.6,
  },
};

const timerMusicProgressions = {
  flow: [
    { bass: 130.81, notes: [261.63, 329.63, 392, 493.88, 523.25] },
    { bass: 110, notes: [220, 261.63, 329.63, 392, 440] },
    { bass: 87.31, notes: [174.61, 220, 329.63, 349.23, 440] },
    { bass: 98, notes: [196, 293.66, 392, 440, 493.88] },
  ],
  moon: [
    [146.83, 220, 293.66, 369.99],
    [130.81, 196, 261.63, 329.63],
    [110, 164.81, 220, 293.66],
    [98, 146.83, 196, 261.63],
  ],
  pulse: [
    { bass: 73.42, notes: [146.83, 174.61, 220, 261.63] },
    { bass: 65.41, notes: [130.81, 164.81, 196, 246.94] },
    { bass: 55, notes: [110, 130.81, 164.81, 220] },
    { bass: 61.74, notes: [123.47, 146.83, 185, 220] },
  ],
  rain: [523.25, 587.33, 659.25, 783.99, 880, 1046.5],
};

const timerAudio = {
  context: null,
  soundEnabled: false,
  ambientEnabled: false,
  selectedStyle: "flow",
  volume: 0.42,
  masterGain: null,
  graph: null,
  sources: [],
  musicTimer: null,
  musicStep: 0,
  sessionId: 0,
  lastTickSecond: null,
};

function timerMusicPreferenceKey() {
  return `changxia.timerMusic.${window.APP_USER?.username || "default"}`;
}

function loadTimerMusicPreference() {
  try {
    const preference = JSON.parse(localStorage.getItem(timerMusicPreferenceKey()) || "{}");
    if (timerMusicPresets[preference.style]) timerAudio.selectedStyle = preference.style;
    const volume = Number(preference.volume);
    if (Number.isFinite(volume)) timerAudio.volume = Math.min(1, Math.max(0, volume));
  } catch (_error) {
    // A blocked or malformed local preference should not prevent the timer from loading.
  }
}

function saveTimerMusicPreference() {
  try {
    localStorage.setItem(timerMusicPreferenceKey(), JSON.stringify({
      style: timerAudio.selectedStyle,
      volume: timerAudio.volume,
    }));
  } catch (_error) {
    // Audio remains usable when browser storage is unavailable.
  }
}

function initTimerAudio() {
  if (!timerAudio.context) {
    timerAudio.context = new (window.AudioContext || window.webkitAudioContext)();
    timerAudio.masterGain = timerAudio.context.createGain();
    timerAudio.masterGain.gain.value = timerAudio.volume;
    timerAudio.masterGain.connect(timerAudio.context.destination);
  }
  if (timerAudio.context.state === "suspended") timerAudio.context.resume();
}

function playTimerTick(isMajor = false) {
  if (!timerAudio.context) return;
  const oscillator = timerAudio.context.createOscillator();
  const gain = timerAudio.context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(isMajor ? 880 : 1200, timerAudio.context.currentTime);
  gain.gain.setValueAtTime(isMajor ? 0.08 : 0.04, timerAudio.context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, timerAudio.context.currentTime + 0.04);
  oscillator.connect(gain).connect(timerAudio.context.destination);
  oscillator.start();
  oscillator.stop(timerAudio.context.currentTime + 0.05);
}

function makeTimerMusicImpulse(seconds, decay) {
  const rate = timerAudio.context.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = timerAudio.context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
    }
  }
  return impulse;
}

function createTimerMusicGraph(preset) {
  const context = timerAudio.context;
  const bus = context.createGain();
  const delay = context.createDelay(2);
  const delayTone = context.createBiquadFilter();
  const feedback = context.createGain();
  const convolver = context.createConvolver();
  const reverbGain = context.createGain();

  bus.gain.setValueAtTime(0.0001, context.currentTime);
  bus.gain.exponentialRampToValueAtTime(1, context.currentTime + 0.3);
  delay.delayTime.value = preset.delay;
  delayTone.type = "lowpass";
  delayTone.frequency.value = 2600;
  feedback.gain.value = preset.feedback;
  convolver.buffer = makeTimerMusicImpulse(preset.reverb, 2.7);
  reverbGain.gain.value = timerAudio.selectedStyle === "moon" ? 0.33 : 0.2;

  bus.connect(timerAudio.masterGain);
  delay.connect(delayTone);
  delayTone.connect(feedback);
  feedback.connect(delay);
  delayTone.connect(bus);
  convolver.connect(reverbGain);
  reverbGain.connect(bus);

  return { bus, delay, convolver, nodes: [bus, delay, delayTone, feedback, convolver, reverbGain] };
}

function trackTimerMusicSource(source, cleanupNodes = []) {
  timerAudio.sources.push(source);
  source.addEventListener("ended", () => {
    timerAudio.sources = timerAudio.sources.filter((item) => item !== source);
    [source, ...cleanupNodes].forEach((node) => {
      try { node.disconnect(); } catch (_error) {}
    });
  }, { once: true });
}

function triggerTimerMusicTone(frequency, options = {}) {
  if (!timerAudio.graph) return;
  const context = timerAudio.context;
  const now = context.currentTime;
  const duration = options.duration || 1.2;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const panner = context.createStereoPanner();

  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  if (options.detune) oscillator.detune.value = options.detune;
  filter.type = "lowpass";
  filter.frequency.value = options.filter || 4200;
  filter.Q.value = 0.35;
  panner.pan.value = options.pan || 0;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(options.gain || 0.025, now + (options.attack || 0.035));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(timerAudio.graph.bus);
  if (options.echo !== false) panner.connect(timerAudio.graph.delay);
  if (options.reverb !== false) panner.connect(timerAudio.graph.convolver);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.08);
  trackTimerMusicSource(oscillator, [filter, gain, panner]);
}

function triggerTimerMusicPad(notes) {
  notes.forEach((frequency, index) => {
    triggerTimerMusicTone(frequency, {
      type: index === 0 ? "triangle" : "sine",
      gain: index === 0 ? 0.022 : 0.012,
      duration: 5.4,
      attack: 1.1,
      filter: 1500,
      pan: (index - 1.5) * 0.2,
      echo: false,
    });
    if (index > 0) {
      triggerTimerMusicTone(frequency, {
        gain: 0.006,
        duration: 5,
        attack: 1.4,
        detune: 7,
        filter: 1300,
        pan: (1.5 - index) * 0.2,
        echo: false,
      });
    }
  });
}

function startTimerMusicRain() {
  const context = timerAudio.context;
  const length = context.sampleRate * 4;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = last * 0.985 + white * 0.015;
    data[index] = white * 0.28 + last * 1.6;
  }
  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  highpass.type = "highpass";
  highpass.frequency.value = 650;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 5200;
  gain.gain.value = 0.032;
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(timerAudio.graph.bus);
  gain.connect(timerAudio.graph.convolver);
  source.start();
  trackTimerMusicSource(source, [highpass, lowpass, gain]);
}

function playTimerMusicFlow(step) {
  const chord = timerMusicProgressions.flow[Math.floor((step % 32) / 8)];
  const position = step % 8;
  const pattern = [0, 2, 1, 3, 0, 2, 4, 1];
  triggerTimerMusicTone(chord.notes[pattern[position]], { gain: 0.026, duration: 0.85, pan: position % 2 ? 0.25 : -0.25 });
  if (position === 0) triggerTimerMusicTone(chord.bass, { type: "triangle", gain: 0.045, duration: 3.5, filter: 900, echo: false });
  if (position === 2) triggerTimerMusicTone([659.25, 783.99, 880, 987.77][Math.floor((step % 32) / 8)], { gain: 0.014, duration: 2.4, pan: 0.35 });
}

function playTimerMusicMoon(step) {
  triggerTimerMusicPad(timerMusicProgressions.moon[step % timerMusicProgressions.moon.length]);
  if (step % 2 === 1) {
    triggerTimerMusicTone([440, 392, 329.63, 293.66][step % 4], { gain: 0.011, duration: 4.2, attack: 0.65, pan: step % 4 === 1 ? -0.4 : 0.4 });
  }
}

function playTimerMusicPulse(step) {
  const chord = timerMusicProgressions.pulse[Math.floor((step % 32) / 8)];
  const position = step % 8;
  const pattern = [0, 0, 2, 1, 0, 3, 2, 1];
  triggerTimerMusicTone(chord.notes[pattern[position]], { type: "triangle", gain: 0.022, duration: 0.34, filter: 1900, pan: position % 2 ? 0.18 : -0.18 });
  if (position % 4 === 0) triggerTimerMusicTone(chord.bass, { type: "sine", gain: 0.07, duration: 0.5, attack: 0.018, filter: 500, echo: false, reverb: false });
  if (position === 6) triggerTimerMusicTone(chord.notes[3] * 2, { gain: 0.008, duration: 1.4, pan: 0.42 });
}

function playTimerMusicRain(step) {
  if (![0, 3, 7, 10].includes(step % 12)) return;
  const notes = timerMusicProgressions.rain;
  const frequency = notes[(step * 5 + Math.floor(step / 3)) % notes.length];
  triggerTimerMusicTone(frequency, { gain: 0.017, duration: 2.8, attack: 0.02, pan: Math.sin(step * 1.7) * 0.5 });
  triggerTimerMusicTone(frequency * 2.01, { gain: 0.004, duration: 1.6, attack: 0.012, pan: -Math.sin(step * 1.7) * 0.4 });
}

function startTimerAmbient() {
  initTimerAudio();
  if (timerAudio.graph || timerAudio.musicTimer) return;
  const style = timerAudio.selectedStyle;
  const preset = timerMusicPresets[style];
  timerAudio.graph = createTimerMusicGraph(preset);
  timerAudio.musicStep = 0;
  if (style === "rain") startTimerMusicRain();

  const playStep = () => {
    const step = timerAudio.musicStep;
    if (style === "flow") playTimerMusicFlow(step);
    if (style === "moon") playTimerMusicMoon(step);
    if (style === "pulse") playTimerMusicPulse(step);
    if (style === "rain") playTimerMusicRain(step);
    timerAudio.musicStep += 1;
  };
  playStep();
  timerAudio.musicTimer = window.setInterval(playStep, preset.interval);
}

function stopTimerAmbient(fadeSeconds = 0.18) {
  timerAudio.sessionId += 1;
  if (timerAudio.musicTimer) window.clearInterval(timerAudio.musicTimer);
  timerAudio.musicTimer = null;
  const graph = timerAudio.graph;
  const sources = timerAudio.sources;
  timerAudio.graph = null;
  timerAudio.sources = [];
  if (graph && timerAudio.context) {
    const now = timerAudio.context.currentTime;
    graph.bus.gain.cancelScheduledValues(now);
    graph.bus.gain.setValueAtTime(Math.max(graph.bus.gain.value, 0.0001), now);
    graph.bus.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
  }
  window.setTimeout(() => {
    sources.forEach((source) => {
      try { source.stop(); } catch (_error) {}
    });
    graph?.nodes.forEach((node) => {
      try { node.disconnect(); } catch (_error) {}
    });
  }, fadeSeconds * 1000 + 40);
}

function applyTimerMusicTheme() {
  const preset = timerMusicPresets[timerAudio.selectedStyle];
  const panel = document.getElementById("musicPanel");
  panel.style.setProperty("--music-accent", preset.accent);
  panel.style.setProperty("--music-soft", preset.soft);
  panel.style.setProperty("--music-glow", preset.glow);
  panel.style.setProperty("--music-panel-bg", preset.panel);
  document.getElementById("musicPanelTitle").textContent = preset.title;
  document.querySelectorAll("[data-music-style]").forEach((option) => {
    const selected = option.dataset.musicStyle === timerAudio.selectedStyle;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-checked", String(selected));
  });
}

function updateTimerMusicUI() {
  const ambientButton = document.getElementById("btnAmbient");
  const powerButton = document.getElementById("musicPower");
  ambientButton.classList.toggle("is-active", timerAudio.ambientEnabled);
  powerButton.classList.toggle("is-playing", timerAudio.ambientEnabled);
  powerButton.innerHTML = timerAudio.ambientEnabled
    ? '<i data-lucide="pause"></i><span>停止播放</span>'
    : '<i data-lucide="play"></i><span>开始播放</span>';
  refreshIcons();
}

function closeTimerMusicPanel() {
  const panel = document.getElementById("musicPanel");
  panel.hidden = true;
  document.getElementById("btnAmbient").setAttribute("aria-expanded", "false");
}

function selectTimerMusicStyle(style) {
  if (!timerMusicPresets[style]) return;
  const wasPlaying = timerAudio.ambientEnabled;
  stopTimerAmbient();
  timerAudio.selectedStyle = style;
  timerAudio.ambientEnabled = true;
  applyTimerMusicTheme();
  saveTimerMusicPreference();
  updateTimerMusicUI();
  const switchId = timerAudio.sessionId;
  window.setTimeout(() => {
    if (timerAudio.ambientEnabled && switchId === timerAudio.sessionId) startTimerAmbient();
  }, wasPlaying ? 220 : 0);
}

function setupTimerClockExperience() {
  const shell = document.getElementById("timerClockShell");
  const soundButton = document.getElementById("btnSound");
  const ambientButton = document.getElementById("btnAmbient");
  const themeButton = document.getElementById("btnTheme");
  const musicPanel = document.getElementById("musicPanel");
  const musicPanelClose = document.getElementById("musicPanelClose");
  const musicPower = document.getElementById("musicPower");
  const musicVolume = document.getElementById("musicVolume");
  const musicVolumeValue = document.getElementById("musicVolumeValue");
  if (!shell || !soundButton || !ambientButton || !themeButton || !musicPanel) return;
  loadTimerMusicPreference();
  musicVolume.value = String(timerAudio.volume);
  musicVolumeValue.textContent = `${Math.round(timerAudio.volume * 100)}%`;
  applyTimerMusicTheme();
  updateTimerMusicUI();
  soundButton.addEventListener("click", () => {
    initTimerAudio();
    timerAudio.soundEnabled = !timerAudio.soundEnabled;
    soundButton.classList.toggle("is-active", timerAudio.soundEnabled);
    if (timerAudio.soundEnabled) playTimerTick(false);
  });
  ambientButton.addEventListener("click", () => {
    const isOpen = !musicPanel.hidden;
    musicPanel.hidden = isOpen;
    ambientButton.setAttribute("aria-expanded", String(!isOpen));
  });
  musicPanelClose.addEventListener("click", closeTimerMusicPanel);
  musicPower.addEventListener("click", () => {
    initTimerAudio();
    timerAudio.ambientEnabled = !timerAudio.ambientEnabled;
    if (timerAudio.ambientEnabled) startTimerAmbient();
    else stopTimerAmbient();
    updateTimerMusicUI();
  });
  document.querySelectorAll("[data-music-style]").forEach((option) => {
    option.addEventListener("click", () => selectTimerMusicStyle(option.dataset.musicStyle));
  });
  musicVolume.addEventListener("input", (event) => {
    timerAudio.volume = Number(event.target.value);
    musicVolumeValue.textContent = `${Math.round(timerAudio.volume * 100)}%`;
    if (timerAudio.masterGain) timerAudio.masterGain.gain.setTargetAtTime(timerAudio.volume, timerAudio.context.currentTime, 0.035);
    saveTimerMusicPreference();
  });
  document.addEventListener("click", (event) => {
    if (!musicPanel.hidden && !musicPanel.contains(event.target) && !ambientButton.contains(event.target)) closeTimerMusicPanel();
  });
  const themes = [
    { blue: "#e0aaff", mint: "#c77dff", pink: "#9d4edd", purple: "#7b2cbf", yellow: "#3c096c" },
    { blue: "#00d2ff", mint: "#2dd4bf", pink: "#f43f5e", purple: "#b19ffb", yellow: "#fbbf24" },
    { blue: "#06b6d4", mint: "#10b981", pink: "#f43f5e", purple: "#8b5cf6", yellow: "#f59e0b" },
  ];
  let themeIndex = 0;
  themeButton.addEventListener("click", () => {
    themeIndex = (themeIndex + 1) % themes.length;
    const theme = themes[themeIndex];
    Object.entries(theme).forEach(([name, value]) => shell.style.setProperty(`--neon-${name}`, value));
    themeButton.classList.add("is-active");
    setTimeout(() => themeButton.classList.remove("is-active"), 700);
    if (timerAudio.context) playTimerTick(true);
  });
  shell.addEventListener("mousemove", (event) => {
    const dx = (event.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
    const dy = (event.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    shell.style.transform = `rotateY(${dx * 8}deg) rotateX(${-dy * 8}deg) translateY(-2px)`;
  });
  shell.addEventListener("mouseleave", () => { shell.style.transform = "rotateY(0deg) rotateX(0deg) translateY(0)"; });
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function initSupervisorStudentSelector() {
  const container = document.getElementById("supervisorStudentContainer");
  const select = document.getElementById("supervisorStudentSelect");
  if (!container || !select) return;

  try {
    const res = await api("/api/supervisor/students");
    if (res && res.students && res.students.length > 0) {
      select.innerHTML = res.students.map(s => `<option value="${escapeHtml(s.username)}">${escapeHtml(s.display_name)} (${escapeHtml(s.username)})</option>`).join("");
      state.selectedStudent = res.students[0].username;

      select.addEventListener("change", async (e) => {
        state.selectedStudent = e.target.value;
        await loadSummary();
        await loadTasks();
        toast(`已切换审阅学生: ${state.selectedStudent}`);
      });
    } else {
      select.innerHTML = '<option value="">暂无学生</option>';
    }
  } catch (err) {
    console.error("加载监督学生失败:", err);
    select.innerHTML = '<option value="">暂无学生</option>';
  }
}

async function loadSummary() {
  let url = "/api/summary";
  if (state.selectedStudent) {
    url += `?student=${encodeURIComponent(state.selectedStudent)}`;
  }
  state.summary = await api(url);
  const dates = state.summary.dates;
  const today = state.summary.today;
  if (!state.selectedDate) {
    const firstDate = dates[0]?.date;
    const lastDate = dates.at(-1)?.date;
    if (dates.some((item) => item.date === today)) {
      state.selectedDate = today;
    } else if (today && firstDate && today < firstDate) {
      state.selectedDate = firstDate;
    } else if (today && lastDate && today > lastDate) {
      state.selectedDate = lastDate;
    } else {
      state.selectedDate = dates.find((item) => item.date >= today)?.date || firstDate;
    }
  }
  renderOverview();
}

async function loadTasks() {
  const parameters = new URLSearchParams({ date: state.selectedDate });
  if (state.selectedSubject !== "全部") parameters.set("subject", state.selectedSubject);
  if (state.selectedStudent) parameters.set("student", state.selectedStudent);
  state.tasks = (await api(`/api/tasks?${parameters}`)).map(syncTimerTask);
  renderTasks();
}

function dateMeta() {
  return state.summary?.dates.find((item) => item.date === state.selectedDate);
}

function renderDateControl() {
  const meta = dateMeta();
  document.getElementById("dateInput").value = state.selectedDate || "";
  document.getElementById("dayLabel").textContent = meta ? `Day ${meta.day}` : "日期";
  const index = state.summary.dates.findIndex((item) => item.date === state.selectedDate);
  document.getElementById("previousDay").disabled = index <= 0;
  document.getElementById("nextDay").disabled = index < 0 || index >= state.summary.dates.length - 1;
}

function statusOptions(current) {
  return ["未开始", "进行中", "已完成", "需补做"]
    .map((item) => `<option ${item === current ? "selected" : ""}>${item}</option>`)
    .join("");
}

function reviewOptions(current) {
  return ["待审核", "通过", "需补充", "退回"]
    .map((item) => `<option ${item === current ? "selected" : ""}>${item}</option>`)
    .join("");
}

function imageCell(task) {
  const enough = task.image_count >= task.min_images;
  const thumbnails = task.images.length
    ? task.images.map((image) => `
      <div class="image-thumb">
        <img src="/media/thumb/${encodeURIComponent(image.thumb_filename)}"
             data-full="/media/full/${encodeURIComponent(image.filename)}"
             data-caption="${escapeHtml(image.original_name)}"
             alt="${escapeHtml(image.original_name)}" loading="lazy">
        <button class="image-delete" data-image-id="${image.id}" type="button" title="删除图片" aria-label="删除图片">
          <i data-lucide="x"></i>
        </button>
      </div>
    `).join("")
    : `<div class="image-empty">暂无图片</div>`;

  const guideId = `evidence-guide-${escapeHtml(task.id)}`;
  const guideTooltipHtml = `
    <div class="evidence-guide-tooltip">
      <button class="evidence-guide-trigger" type="button" data-evidence-guide
              aria-label="查看成果图片拍摄要求" aria-expanded="false" aria-controls="${guideId}">
        <i data-lucide="circle-help"></i>
      </button>
      <div class="tooltip-box" id="${guideId}" role="tooltip">
        <h4>成果图片拍摄要求：</h4>
        ${orderedList(task.evidence_guide, "tooltip-list")}
      </div>
    </div>
  `;

  return `
    <div class="evidence-summary">
      <span class="evidence-count ${enough ? "is-enough" : ""}"><i data-lucide="images"></i>${task.image_count} / ${task.min_images} 张</span>
      ${guideTooltipHtml}
      <label class="upload-button" title="上传成果图片">
        <i data-lucide="image-plus"></i><span>上传</span>
        <input type="file" accept="image/*,.heic,.heif" multiple data-upload-task="${task.id}">
      </label>
    </div>
    <div class="image-grid">${thumbnails}</div>
  `;
}

function timerButton(task) {
  const timerState = task.timer?.state || "idle";
  const label = role === "supervisor"
    ? "查看计时"
    : timerState === "running"
    ? formatClock(timerRemaining(task))
    : timerState === "paused"
      ? "继续计时"
      : timerState === "completed"
        ? "计时记录"
        : "开始计时";

  const pulseHtml = (timerState === "running" && role !== "supervisor") ? `<span class="pulse-dot"></span>` : "";

  return `
    <button class="task-timer-button ${timerState === "running" ? "is-running" : ""}"
            type="button" data-timer-task="${task.id}" title="打开任务计时器">
      <i data-lucide="timer"></i>
      <span><strong class="timer-button-label">${label}</strong><small>建议 ${task.planned_minutes} 分钟</small></span>
      ${pulseHtml}
    </button>
  `;
}

function reviewCell(task) {
  if (role === "supervisor") {
    return `
      <div class="review-stack">
        <div><span class="field-label">学生记录</span><div>${escapeHtml(task.student_note || "暂无")}</div></div>
        <label><span class="field-label">监督结果</span>
          <select class="review-select" data-task-id="${task.id}" data-field="supervisor_status" data-state="${escapeHtml(task.supervisor_status)}">
            ${reviewOptions(task.supervisor_status)}
          </select>
        </label>
        <label><span class="field-label">监督评语</span>
          <textarea class="note-input" data-task-id="${task.id}" data-field="supervisor_comment" placeholder="输入审核意见">${escapeHtml(task.supervisor_comment)}</textarea>
        </label>
        <span class="save-indicator" data-save-for="${task.id}"></span>
      </div>
    `;
  }
  return `
    <div class="review-stack">
      <label><span class="field-label">学生记录</span>
        <textarea class="note-input" data-task-id="${task.id}" data-field="student_note" placeholder="记录页码、题号、错因或困难">${escapeHtml(task.student_note)}</textarea>
      </label>
      <div><span class="field-label">监督结果</span><strong>${escapeHtml(task.supervisor_status)}</strong></div>
      ${task.supervisor_comment ? `<div><span class="field-label">监督评语</span>${escapeHtml(task.supervisor_comment)}</div>` : ""}
      <span class="save-indicator" data-save-for="${task.id}"></span>
    </div>
  `;
}

function renderTasks() {
  renderDateControl();
  const body = document.getElementById("taskCardList");
  body.innerHTML = state.tasks.map((task, index) => `
    <article class="task-card subject-${task.subject} ${state.expandedTasks.has(task.id) ? "is-expanded" : ""}" style="--row-index:${index}" data-task-card="${task.id}">
      <div class="task-card-main">
        <div class="mobile-subject-rail" aria-hidden="true"><span>${escapeHtml(task.subject)}</span></div>
        <div class="task-index">${String(index + 1).padStart(2, "0")}</div>
        <div class="task-subject">
          <span class="subject-label">${escapeHtml(task.subject)}</span>
          <span class="category-pill">${escapeHtml(task.category)}</span>
          <small>${escapeHtml(task.id)}</small>
        </div>
        <div class="task-description">
        <div class="source-title">${escapeHtml(task.source)}</div>
        <div class="section-text">${escapeHtml(task.section)}</div>
        </div>
        <div class="mobile-task-requirements">${orderedList(task.detail_items.slice(0, 4), "mobile-requirement-list")}</div>
        <div class="task-duration"><strong>${task.planned_minutes}</strong><span>分钟</span></div>
        <div class="task-evidence">${imageCell(task)}</div>
        <div class="task-status">
        <select class="status-select" data-task-id="${task.id}" data-field="status" data-state="${escapeHtml(task.status)}">
          ${statusOptions(task.status)}
        </select>
        </div>
        <div class="task-actions">
          ${timerButton(task)}
          <button class="detail-toggle" type="button" data-toggle-details="${task.id}" aria-expanded="${state.expandedTasks.has(task.id)}">
            <i data-lucide="chevron-down"></i><span>${state.expandedTasks.has(task.id) ? "收起" : "成果与记录"}</span>
          </button>
        </div>
      </div>
      <div class="task-card-details card-inner-details">
        <section class="detail-section"><div class="detail-heading"><i data-lucide="book-open-check"></i><h3>学习要求</h3></div>${orderedList(task.detail_items)}</section>
        <section class="detail-section"><div class="detail-heading"><i data-lucide="badge-check"></i><h3>成果标准</h3></div>${orderedList(task.output_items, "requirement-list output-list")}</section>
        <section class="detail-section review-detail"><div class="detail-heading"><i data-lucide="message-square-text"></i><h3>记录与审核</h3></div>${reviewCell(task)}</section>
      </div>
    </article>
  `).join("");
  document.getElementById("emptyState").hidden = state.tasks.length > 0;
  renderDailyProgress();
  refreshIcons();
}

function renderDailyProgress() {
  const allDateTasks = state.selectedSubject === "全部" ? state.tasks : [];
  const done = state.tasks.filter((task) => task.status === "已完成").length;
  document.getElementById("dailySummary").textContent = `${done} / ${state.tasks.length} 项完成`;

  if (!allDateTasks.length) {
    document.getElementById("subjectProgress").innerHTML = "";
    return;
  }
  const subjects = ["数学", "物理", "化学", "英语"];
  document.getElementById("subjectProgress").innerHTML = subjects.map((subject) => {
    const items = allDateTasks.filter((task) => task.subject === subject);
    const completed = items.filter((task) => task.status === "已完成").length;
    const rate = percent(completed, items.length);
    return `
      <div class="subject-progress-item ${subjectClass[subject]}">
        <div class="mini-ring">
          ${miniProgressRing(rate)}
          <span>${rate}%</span>
        </div>
        <div><strong>${subject}</strong><span>${completed}/${items.length} 项完成</span></div>
      </div>
    `;
  }).join("");
}

function renderOverview() {
  if (!state.summary) return;
  const summary = state.summary;
  const rate = percent(summary.completed, summary.total);
  document.getElementById("metricTotal").textContent = summary.total;
  document.getElementById("metricCompleted").textContent = summary.completed;
  document.getElementById("metricRate").textContent = `${rate}%`;
  document.getElementById("metricImages").textContent = summary.image_count;
  document.getElementById("metricTime").textContent = `${Math.round(summary.planned_minutes / 60)}h`;
  document.getElementById("overviewDate").textContent = `${summary.dates[0]?.date || ""} 至 ${summary.dates.at(-1)?.date || ""}`;
  document.getElementById("subjectOverview").innerHTML = summary.subjects.map((item) => {
    const itemRate = percent(item.completed, item.total);
    return `
      <div class="subject-gauge ${subjectClass[item.subject]}">
        <div class="gauge-ring">
          ${largeProgressRing(itemRate, item.subject)}
          <div><strong>${itemRate}%</strong><span>${escapeHtml(item.subject)}</span></div>
        </div>
        <small>${item.completed} / ${item.total} 项</small>
      </div>
    `;
  }).join("");
  document.getElementById("weekChart").innerHTML = summary.weeks.map((item) => {
    const itemRate = percent(item.completed, item.total);
    return `
      <div class="week-column">
        <strong>${itemRate}%</strong>
        <div class="week-bar-track"><div class="week-bar" style="height:${Math.max(itemRate, 2)}%"></div></div>
        <span>第${item.week}周</span>
      </div>
    `;
  }).join("");
}

async function updateTask(taskId, field, value, indicator = null) {
  if (indicator) indicator.textContent = "保存中";
  try {
    await api(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (indicator) {
      indicator.textContent = "已保存";
      setTimeout(() => { indicator.textContent = ""; }, 1300);
    }
    if (field === "status") {
      await Promise.all([loadSummary(), loadTasks()]);
    }
  } catch (error) {
    if (indicator) indicator.textContent = "保存失败";
    toast(error.message, "error");
  }
}

async function uploadImages(input) {
  const files = [...input.files];
  if (!files.length) return;
  const taskId = input.dataset.uploadTask;
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  input.disabled = true;
  toast(`正在上传 ${files.length} 张图片`);
  try {
    await api(`/api/tasks/${encodeURIComponent(taskId)}/images`, { method: "POST", body: form });
    await Promise.all([loadSummary(), loadTasks()]);
    toast("图片已上传");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

async function deleteImage(imageId) {
  if (!window.confirm("删除这张成果图片？")) return;
  try {
    await api(`/api/images/${imageId}`, { method: "DELETE" });
    await Promise.all([loadSummary(), loadTasks()]);
    toast("图片已删除");
  } catch (error) {
    toast(error.message, "error");
  }
}

function openImage(image) {
  document.getElementById("modalImage").src = image.dataset.full;
  document.getElementById("modalCaption").textContent = image.dataset.caption || "成果图片";
  document.getElementById("imageModal").hidden = false;
}

function closeModal(id) {
  if (id === "timerModal") closeTimerMusicPanel();
  document.getElementById(id).hidden = true;
}

function closeEvidenceGuides(except = null) {
  document.querySelectorAll(".evidence-guide-tooltip.is-open").forEach((tooltip) => {
    if (tooltip === except) return;
    tooltip.classList.remove("is-open");
    tooltip.querySelector("[data-evidence-guide]")?.setAttribute("aria-expanded", "false");
  });
}

function renderUsers(users) {
  document.getElementById("userCount").textContent = `${users.length} 个`;

  const supervisors = users.filter((u) => u.role === "supervisor" || u.can_manage_users);
  const supervisorOptions = [
    '<option value="">未指定 (无监督人)</option>',
    ...supervisors.map((s) => `<option value="${escapeHtml(s.username)}">${escapeHtml(s.display_name)} (${escapeHtml(s.username)})</option>`)
  ].join("");

  const createSelect = document.getElementById("createSupervisorUsername");
  const editSelect = document.getElementById("editSupervisorUsername");
  if (createSelect) createSelect.innerHTML = supervisorOptions;
  if (editSelect) editSelect.innerHTML = supervisorOptions;

  document.getElementById("userList").innerHTML = users.map((user) => `
    <div class="user-list-item">
      <span class="user-avatar ${user.role}">${escapeHtml(user.display_name.slice(0, 1).toUpperCase())}</span>
      <span class="user-list-identity">
        <strong>${escapeHtml(user.display_name)}</strong>
        <small>${escapeHtml(user.username)}${user.role === "student" && user.supervisor_username ? ` · 监督人: ${escapeHtml(user.supervisor_username)}` : ""}</small>
      </span>
      <span class="user-role ${user.role}">${user.role === "student" ? "学生" : "监督者"}</span>
      ${user.can_manage_users ? `<span class="user-admin-mark" title="账号管理员"><i data-lucide="shield-check"></i></span>` : ""}
      <button class="icon-button edit-user-button" data-user='${escapeHtml(JSON.stringify(user))}' title="编辑账号" style="margin-left: auto; width: 32px; height: 32px; border-radius: 8px;"><i data-lucide="pencil"></i></button>
    </div>
  `).join("");
  
  document.querySelectorAll(".edit-user-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      try {
        const uData = JSON.parse(btn.dataset.user);
        document.getElementById("editUsername").value = uData.username;
        document.getElementById("editUsernameDisplay").value = uData.username;
        document.getElementById("editDisplayName").value = uData.display_name;
        document.getElementById("editRole").value = uData.role;
        document.getElementById("editSupervisorUsername").value = uData.supervisor_username || "";
        document.getElementById("editPassword").value = "";
        document.getElementById("editUserModal").hidden = false;
      } catch (err) {
        console.error("解析用户数据失败:", err);
      }
    });
  });
  
  refreshIcons();
}

async function loadUsers() {
  if (!canManageUsers) return;
  renderUsers(await api("/api/users"));
}

function timerStateText(timerState, remaining) {
  if (timerState === "running") return remaining > 0 ? "专注中" : "时间到";
  if (timerState === "paused") return "已暂停";
  if (timerState === "completed") return "本次已结束";
  return "准备开始";
}

function renderTimerClock() {
  const task = state.activeTimerTask;
  if (!task) return;
  const elapsed = timerElapsed(task);
  const target = Number(task.timer.target_seconds || task.planned_minutes * 60);
  const remaining = Math.max(0, target - elapsed);
  const progress = target ? Math.min(100, (elapsed / target) * 100) : 0;
  document.getElementById("timerClock").textContent = formatClock(remaining);
  document.getElementById("timerProgressBar").style.width = `${progress}%`;
  const remainingMinute = remaining > 0 ? (remaining % 60 || 60) : 0;
  const remainingHour = remaining > 0 ? (remaining % 3600 || 3600) : 0;
  const secOrbit = document.getElementById("timerSecOrbit");
  const minOrbit = document.getElementById("timerMinOrbit");
  const hourOrbit = document.getElementById("timerOrbitProgress");
  if (secOrbit) secOrbit.style.strokeDashoffset = String(753.98 * (1 - remainingMinute / 60));
  if (minOrbit) minOrbit.style.strokeDashoffset = String(628.318 * (1 - remainingHour / 3600));
  if (hourOrbit) hourOrbit.style.strokeDashoffset = String(502.65 * (progress / 100));
  const hourHand = document.getElementById("timerHourHand");
  const minHand = document.getElementById("timerMinHand");
  const secHand = document.getElementById("timerSecHand");
  if (hourHand) hourHand.style.transform = `rotate(${((remaining % 43200) / 43200) * 360}deg)`;
  if (minHand) minHand.style.transform = `rotate(${((remaining % 3600) / 3600) * 360}deg)`;
  if (secHand) secHand.style.transform = `rotate(${(remainingMinute / 60) * 360}deg)`;
  document.getElementById("timerStatus").textContent = timerStateText(task.timer.state, remaining);
  document.getElementById("timerStatus").dataset.state = task.timer.state;
  document.getElementById("timerDate").textContent = task.timer.state === "completed" ? "本次倒计时已结束" : "剩余时间倒计时";
  document.getElementById("timerElapsedLabel").textContent = `已学习 ${Math.floor(elapsed / 60)} 分钟`;

  if (timerAudio.soundEnabled && task.timer.state === "running" && remaining !== timerAudio.lastTickSecond) {
    timerAudio.lastTickSecond = remaining;
    playTimerTick(remaining % 60 === 0);
  } else if (task.timer.state !== "running") {
    timerAudio.lastTickSecond = null;
  }

  const rowLabel = document.querySelector(`[data-timer-task="${task.id}"] .timer-button-label`);
  if (rowLabel && task.timer.state === "running") rowLabel.textContent = formatClock(remaining);

  if (task.timer.state === "running" && remaining <= 0 && !state.timerFinishing) {
    state.timerFinishing = true;
    performTimerAction("finish", true).finally(() => { state.timerFinishing = false; });
  }
}

function renderTimerModal() {
  const task = state.activeTimerTask;
  if (!task) return;
  const timerState = task.timer.state;
  const isStudent = role === "student";
  document.getElementById("timerTitle").textContent = task.section || task.category;
  document.getElementById("timerTaskMeta").textContent = `${task.subject} · ${task.category} · ${task.id}`;
  document.getElementById("timerSuggestion").textContent = `建议 ${task.planned_minutes} 分钟，可按实际情况调整`;
  document.getElementById("timerDuration").value = Math.max(1, Math.round(task.timer.target_seconds / 60));
  document.getElementById("timerSetup").hidden = timerState !== "idle" && timerState !== "completed";

  document.getElementById("timerStart").hidden = !isStudent || (timerState !== "idle" && timerState !== "completed");
  document.getElementById("timerStart").querySelector("span").textContent = timerState === "completed" ? "再次开始" : "开始专注";
  document.getElementById("timerPause").hidden = !isStudent || timerState !== "running";
  document.getElementById("timerResume").hidden = !isStudent || timerState !== "paused";
  document.getElementById("timerFinish").hidden = !isStudent || !["running", "paused"].includes(timerState);
  document.getElementById("timerReset").hidden = !isStudent || timerState === "idle";
  renderTimerClock();
  refreshIcons();
}

function openTimer(task) {
  state.activeTimerTask = syncTimerTask(task);
  document.getElementById("timerModal").hidden = false;
  renderTimerModal();
}

async function performTimerAction(action, automatic = false) {
  const task = state.activeTimerTask;
  if (!task) return;
  const payload = { action };
  if (action === "start") payload.duration_minutes = Number(document.getElementById("timerDuration").value);
  document.querySelectorAll(".timer-actions button").forEach((button) => { button.disabled = true; });
  try {
    const result = await api(`/api/tasks/${encodeURIComponent(task.id)}/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.activeTimerTask = syncTimerTask(result.task);
    const index = state.tasks.findIndex((item) => item.id === result.task.id);
    if (index >= 0) state.tasks[index] = syncTimerTask(result.task);
    renderTasks();
    renderTimerModal();
    if (action === "start" || action === "resume") await loadSummary();
    if (!automatic) {
      const messages = { start: "计时已开始", pause: "计时已暂停", resume: "继续计时", finish: "本次计时已结束", reset: "计时器已重置" };
      toast(messages[action]);
    } else {
      toast("学习时间已到");
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    document.querySelectorAll(".timer-actions button").forEach((button) => { button.disabled = false; });
  }
}

async function restoreActiveTimer() {
  if (role !== "student") return;
  const result = await api("/api/timer/active");
  if (result.task) openTimer(result.task);
}

setInterval(renderTimerClock, 500);
initTimerDialMarks();

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-upload-task]")) {
    uploadImages(target);
    return;
  }
  if (target.matches(".status-select, .review-select")) {
    target.dataset.state = target.value;
    const indicator = document.querySelector(`[data-save-for="${target.dataset.taskId}"]`);
    updateTask(target.dataset.taskId, target.dataset.field, target.value, indicator);
  }
});

document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!target.matches(".note-input")) return;
  const indicator = document.querySelector(`[data-save-for="${target.dataset.taskId}"]`);
  updateTask(target.dataset.taskId, target.dataset.field, target.value, indicator);
});

document.addEventListener("click", (event) => {
  const guideButton = event.target.closest("[data-evidence-guide]");
  if (guideButton) {
    const tooltip = guideButton.closest(".evidence-guide-tooltip");
    const willOpen = !tooltip.classList.contains("is-open");
    closeEvidenceGuides(tooltip);
    tooltip.classList.toggle("is-open", willOpen);
    guideButton.setAttribute("aria-expanded", String(willOpen));
    return;
  }
  closeEvidenceGuides();
  const detailButton = event.target.closest("[data-toggle-details]");
  if (detailButton) {
    const taskId = detailButton.dataset.toggleDetails;
    const card = detailButton.closest("[data-task-card]");
    const willExpand = !state.expandedTasks.has(taskId);
    if (willExpand) state.expandedTasks.add(taskId);
    else state.expandedTasks.delete(taskId);
    card.classList.toggle("is-expanded", willExpand);
    detailButton.setAttribute("aria-expanded", String(willExpand));
    detailButton.querySelector("span").textContent = willExpand ? "收起" : "成果与记录";
    return;
  }
  const timerButton = event.target.closest("[data-timer-task]");
  if (timerButton) {
    const task = state.tasks.find((item) => item.id === timerButton.dataset.timerTask);
    if (task) openTimer(task);
    return;
  }
  const deleteButton = event.target.closest("[data-image-id]");
  if (deleteButton) {
    deleteImage(deleteButton.dataset.imageId);
    return;
  }
  const image = event.target.closest(".image-thumb img");
  if (image) {
    openImage(image);
    return;
  }
  const closeButton = event.target.closest("[data-close-modal]");
  if (closeButton) closeModal(closeButton.dataset.closeModal);
});

document.getElementById("timerStart").addEventListener("click", () => performTimerAction("start"));
document.getElementById("timerPause").addEventListener("click", () => performTimerAction("pause"));
document.getElementById("timerResume").addEventListener("click", () => performTimerAction("resume"));
document.getElementById("timerFinish").addEventListener("click", () => performTimerAction("finish"));
document.getElementById("timerReset").addEventListener("click", () => performTimerAction("reset"));

const appSidebar = document.getElementById("appSidebar");
const sidebarScrim = document.getElementById("sidebarScrim");

function closeSidebar() {
  appSidebar.classList.remove("is-open");
  sidebarScrim.classList.remove("is-visible");
}

function openSidebar() {
  appSidebar.classList.add("is-open");
  sidebarScrim.classList.add("is-visible");
}

function switchView(view) {
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === `${view}View`));
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  document.getElementById("pageTitle").textContent = view === "tasks" ? "我的课程 | 任务列表" : "学习总览";
  document.getElementById("pageKicker").textContent = view === "tasks" ? "DAILY PLAN" : "LEARNING OVERVIEW";
  closeSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.getElementById("menuButton").addEventListener("click", openSidebar);
document.querySelector("[data-open-menu]").addEventListener("click", openSidebar);
sidebarScrim.addEventListener("click", closeSidebar);

document.getElementById("subjectFilter").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-subject]");
  if (!button) return;
  state.selectedSubject = button.dataset.subject;
  document.querySelectorAll("#subjectFilter button").forEach((item) => item.classList.toggle("is-active", item === button));
  await loadTasks();
});

document.getElementById("dateInput").addEventListener("change", async (event) => {
  if (!state.summary.dates.some((item) => item.date === event.target.value)) {
    toast("请选择计划内日期", "error");
    renderDateControl();
    return;
  }
  state.selectedDate = event.target.value;
  await loadTasks();
});

document.getElementById("previousDay").addEventListener("click", async () => {
  const index = state.summary.dates.findIndex((item) => item.date === state.selectedDate);
  if (index > 0) state.selectedDate = state.summary.dates[index - 1].date;
  await loadTasks();
});

document.getElementById("nextDay").addEventListener("click", async () => {
  const index = state.summary.dates.findIndex((item) => item.date === state.selectedDate);
  if (index < state.summary.dates.length - 1) state.selectedDate = state.summary.dates[index + 1].date;
  await loadTasks();
});

document.getElementById("accountButton").addEventListener("click", () => {
  document.getElementById("accountModal").hidden = false;
  closeSidebar();
});

document.querySelector("[data-open-account]").addEventListener("click", () => {
  document.getElementById("accountModal").hidden = false;
});

if (canManageUsers) {
  document.getElementById("userManagementButton").addEventListener("click", async () => {
    document.getElementById("userManagementModal").hidden = false;
    closeSidebar();
    refreshIcons();
    try {
      await loadUsers();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  document.getElementById("createUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const submitButton = event.target.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      await api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          display_name: form.get("display_name"),
          role: form.get("role"),
          supervisor_username: form.get("supervisor_username") || "",
          password: form.get("password"),
        }),
      });
      event.target.reset();
      await loadUsers();
      toast("账号已创建");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  const editUserForm = document.getElementById("editUserForm");
  if (editUserForm) {
    editUserForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const username = form.get("username");
      const submitButton = event.target.querySelector("button[type='submit']");
      submitButton.disabled = true;
      try {
        const payload = {
          display_name: form.get("display_name"),
          role: form.get("role"),
          supervisor_username: form.get("supervisor_username"),
        };
        const pass = form.get("password");
        if (pass && pass.trim()) {
          payload.password = pass;
        }

        await api(`/api/users/${encodeURIComponent(username)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        document.getElementById("editUserModal").hidden = true;
        await loadUsers();
        toast("账号资料已更新");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }
}

document.getElementById("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  if (form.get("new_password") !== form.get("confirm_password")) {
    toast("两次输入的新密码不一致", "error");
    return;
  }
  try {
    await api("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: form.get("current_password"),
        new_password: form.get("new_password"),
      }),
    });
    event.target.reset();
    closeModal("accountModal");
    toast("密码已修改");
  } catch (error) {
    toast(error.message, "error");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const musicPanel = document.getElementById("musicPanel");
    if (musicPanel && !musicPanel.hidden) {
      closeTimerMusicPanel();
      return;
    }
    closeEvidenceGuides();
    document.querySelectorAll(".modal-backdrop:not([hidden])").forEach((modal) => { modal.hidden = true; });
    closeSidebar();
  }
});

async function start() {
  try {
    if (role === "supervisor" || canManageUsers) {
      initSupervisorStudentSelector().catch((err) => console.error("初始化监督者选户错误:", err));
    }
    await loadSummary();
    await loadTasks();
    await restoreActiveTimer();
    refreshIcons();
  } catch (error) {
    toast(error.message, "error");
  }
}

setupTimerClockExperience();
start();


/* =================================================== */
/* AI AGENT 3D 太空萌宠与双端自适应对话系统 JS 驱动核心 */
/* =================================================== */

function bootAgentPetAndDrawer() {
  if (document.getElementById("webglContainer")) {
    initAgentPet();
    initAgentDrawer();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAgentPetAndDrawer);
} else {
  bootAgentPetAndDrawer();
}

let agentThreeScene, agentCamera, agentRenderer;
let agentRobotGroup, agentHead, agentBody, agentLeftEar, agentRightEar, agentLeftEye, agentRightEye;
let agentLeftBlush, agentRightBlush, agentBaseRing, agentBadge, agentBadgeLight, agentBaseRingMaterial, agentBlushMaterial, agentBadgeMaterial;
let agentLeftEarCollider, agentRightEarCollider;
let agentMouse = { x: 0, y: 0 };
let agentJumpTime = 0;
let agentIsJumping = false;
let agentIsHovered = false;

let agentEarTwitchTimer = 0;
let agentHeadNudgeTimer = 0;
let agentBaseRingTargetSpin = 0.015;
let agentBaseRingCurrentSpin = 0.015;
let agentBadgeTargetScale = 1.0;
let agentBadgeCurrentScale = 1.0;
let agentBadgeLightTargetIntensity = 0.0;
let agentBadgeLightCurrentIntensity = 0.0;
let agentHoverTime = 0;
let agentAvatarDataUrl = "";

function initAgentPet() {
  const container = document.getElementById("webglContainer");
  if (!container) return;

  if (typeof THREE === "undefined" || !window.THREE) {
    setTimeout(initAgentPet, 50);
    return;
  }

  container.innerHTML = "";

  agentThreeScene = new THREE.Scene();
  agentCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  agentCamera.position.set(0, -0.05, 4.4);

  agentRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  agentRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  agentRenderer.setSize(100, 100);
  container.appendChild(agentRenderer.domElement);

  agentRobotGroup = new THREE.Group();
  agentThreeScene.add(agentRobotGroup);

  const porcelainMat = new THREE.MeshPhongMaterial({
    color: 0xf8fafc, specular: 0xffffff, shininess: 85
  });
  const screenMat = new THREE.MeshPhongMaterial({
    color: 0x0f172a, specular: 0x38bdf8, shininess: 100
  });
  const eyeGlowMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf });
  agentBlushMaterial = new THREE.MeshBasicMaterial({ color: 0xff65a3 });
  agentBadgeMaterial = new THREE.MeshBasicMaterial({ color: 0x2dd4bf });
  agentBaseRingMaterial = new THREE.MeshBasicMaterial({ color: 0x8c70ed });

  // 头部
  agentHead = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 32), porcelainMat);
  agentHead.position.y = 0.2;
  agentRobotGroup.add(agentHead);

  const screenGeom = new THREE.SphereGeometry(0.724, 32, 32, Math.PI * 0.35, Math.PI * 0.3, Math.PI * 0.38, Math.PI * 0.26);
  const screen = new THREE.Mesh(screenGeom, screenMat);
  agentHead.add(screen);

  agentLeftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), eyeGlowMat);
  agentLeftEye.scale.set(1, 1.25, 0.5);
  agentLeftEye.position.set(-0.22, 0.08, 0.68);
  agentHead.add(agentLeftEye);

  agentRightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), eyeGlowMat);
  agentRightEye.scale.set(1, 1.25, 0.5);
  agentRightEye.position.set(0.22, 0.08, 0.68);
  agentHead.add(agentRightEye);

  const mouthGeom = new THREE.TorusGeometry(0.038, 0.012, 8, 16, Math.PI);
  const leftMouth = new THREE.Mesh(mouthGeom, eyeGlowMat);
  leftMouth.rotation.set(0, 0, Math.PI);
  leftMouth.position.set(-0.035, -0.07, 0.695);
  agentHead.add(leftMouth);

  const rightMouth = new THREE.Mesh(mouthGeom, eyeGlowMat);
  rightMouth.rotation.set(0, 0, Math.PI);
  rightMouth.position.set(0.035, -0.07, 0.695);
  agentHead.add(rightMouth);

  agentLeftBlush = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), agentBlushMaterial);
  agentLeftBlush.scale.set(1.6, 0.8, 0.5);
  agentLeftBlush.position.set(-0.35, -0.1, 0.64);
  agentHead.add(agentLeftBlush);

  agentRightBlush = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), agentBlushMaterial);
  agentRightBlush.scale.set(1.6, 0.8, 0.5);
  agentRightBlush.position.set(0.35, -0.1, 0.64);
  agentHead.add(agentRightBlush);

  const earGeom = new THREE.ConeGeometry(0.18, 0.35, 4);
  agentLeftEar = new THREE.Mesh(earGeom, porcelainMat);
  agentLeftEar.position.set(-0.45, 0.6, -0.1);
  agentLeftEar.rotation.set(0.2, 0.0, 0.45);
  agentHead.add(agentLeftEar);

  agentRightEar = new THREE.Mesh(earGeom, porcelainMat);
  agentRightEar.position.set(0.45, 0.6, -0.1);
  agentRightEar.rotation.set(0.2, 0.0, -0.45);
  agentHead.add(agentRightEar);

  const colliderGeom = new THREE.SphereGeometry(0.24, 8, 8);
  const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
  agentLeftEarCollider = new THREE.Mesh(colliderGeom, colliderMat);
  agentLeftEarCollider.position.set(-0.45, 0.6, -0.1);
  agentHead.add(agentLeftEarCollider);

  agentRightEarCollider = new THREE.Mesh(colliderGeom, colliderMat);
  agentRightEarCollider.position.set(0.45, 0.6, -0.1);
  agentHead.add(agentRightEarCollider);

  agentBody = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), porcelainMat);
  agentBody.scale.set(1.0, 1.2, 1.0);
  agentBody.position.y = -0.62;
  agentRobotGroup.add(agentBody);

  agentBadge = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), agentBadgeMaterial);
  agentBadge.position.set(0, 0.12, 0.58);
  agentBody.add(agentBadge);

  const armGeom = new THREE.SphereGeometry(0.11, 16, 16);
  const leftArm = new THREE.Mesh(armGeom, porcelainMat);
  leftArm.position.set(-0.64, -0.5, 0.15);
  agentRobotGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeom, porcelainMat);
  rightArm.position.set(0.64, -0.5, 0.15);
  agentRobotGroup.add(rightArm);

  const torusGeom = new THREE.TorusGeometry(0.85, 0.04, 8, 48);
  agentBaseRing = new THREE.Mesh(torusGeom, agentBaseRingMaterial);
  agentBaseRing.rotation.x = Math.PI / 2;
  agentBaseRing.position.y = -1.3;
  agentRobotGroup.add(agentBaseRing);

  const nodeGeom = new THREE.BoxGeometry(0.12, 0.06, 0.12);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const node = new THREE.Mesh(nodeGeom, eyeGlowMat);
    node.position.set(Math.cos(angle) * 0.85, Math.sin(angle) * 0.85, 0);
    agentBaseRing.add(node);
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
  agentThreeScene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  dirLight.position.set(3, 5, 4);
  agentThreeScene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xa5f3fc, 0.8);
  fillLight.position.set(-3, -2, 3);
  agentThreeScene.add(fillLight);

  const faceLight = new THREE.PointLight(0xffffff, 1.5, 4);
  faceLight.position.set(0, 0.5, 1.5);
  agentThreeScene.add(faceLight);

  agentBadgeLight = new THREE.PointLight(0x2dd4bf, 0.0, 2.2);
  agentBadgeLight.position.set(0, -0.5, 1.0);
  agentThreeScene.add(agentBadgeLight);

  const cyanLight = new THREE.PointLight(0x2dd4bf, 2.5, 6);
  cyanLight.position.set(-2.5, -0.5, 1.5);
  agentThreeScene.add(cyanLight);

  const purpleLight = new THREE.PointLight(0x8c70ed, 2.5, 6);
  purpleLight.position.set(2.5, -1.5, 1.5);
  agentThreeScene.add(purpleLight);

  animateAgent3D();

  // 对焦快照
  setTimeout(() => {
    try {
      const origPos = agentCamera.position.clone();
      agentCamera.position.set(0, -0.2, 4.4);
      agentCamera.lookAt(0, -0.2, 0);
      agentRenderer.render(agentThreeScene, agentCamera);
      agentAvatarDataUrl = agentRenderer.domElement.toDataURL("image/png");

      agentCamera.position.copy(origPos);
      agentCamera.lookAt(new THREE.Vector3(0, 0, 0));
      agentRenderer.render(agentThreeScene, agentCamera);

      const headerAvatar = document.getElementById("headerAvatar");
      if (headerAvatar) headerAvatar.src = agentAvatarDataUrl;
    } catch (e) {
      console.error("Pet avatar capture failed:", e);
    }
  }, 150);

  // 绑动手势/鼠标监听
  document.addEventListener("mousemove", (e) => {
    const petBody = document.getElementById("petAvatarBody");
    if (!petBody) return;
    const rect = petBody.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    agentMouse.x = Math.max(-1, Math.min(1, ((e.clientX - cx) / window.innerWidth) * 12));
    agentMouse.y = Math.max(-1, Math.min(1, ((e.clientY - cy) / window.innerHeight) * 12));
  });

  const petContainer = document.getElementById("desktopPetContainer");
  if (petContainer) {
    petContainer.addEventListener("mouseenter", () => { agentIsHovered = true; });
    petContainer.addEventListener("mouseleave", () => { agentIsHovered = false; });
    
    petContainer.addEventListener("click", (e) => {
      e.stopPropagation();
      if (petDragState.hasMoved) {
        petDragState.hasMoved = false;
        return;
      }
      const panel = document.getElementById("agentPanel");
      const isOpen = panel && panel.classList.contains("is-open");
      if (!isOpen) {
        openAgentDrawer();
      }
      triggerPetRaycast(e);
    });

    initPetDrag();
  }
}

function animateAgent3D() {
  requestAnimationFrame(animateAgent3D);
  const time = Date.now() * 0.0015;

  if (!agentIsJumping) {
    currentY = 0.22 + Math.sin(time * 1.5) * 0.08;
    agentRobotGroup.position.y = currentY;
  } else {
    agentJumpTime += 0.05;
    if (agentJumpTime >= Math.PI) {
      agentIsJumping = false;
      agentRobotGroup.position.y = currentY;
    } else {
      agentRobotGroup.position.y = currentY + Math.sin(agentJumpTime) * 1.3;
      agentRobotGroup.rotation.x = agentJumpTime * 2;
    }
  }

  const targetRotY = agentMouse.x * 0.45;
  const targetRotX = -agentMouse.y * 0.3;

  if (agentHeadNudgeTimer <= 0) {
    agentHead.rotation.y += (targetRotY - agentHead.rotation.y) * 0.12;
    agentHead.rotation.x += (targetRotX - agentHead.rotation.x) * 0.12;
    agentHead.rotation.z += (0 - agentHead.rotation.z) * 0.1;
  }
  agentBody.rotation.y += (targetRotY * 0.25 - agentBody.rotation.y) * 0.1;

  let eyeScaleX = 1.0;
  let eyeScaleY = 1.25;

  if (agentIsHovered) {
    agentHoverTime += 0.016;
    if (agentHoverTime < 0.6) {
      const wink = Math.sin(agentHoverTime * Math.PI * 2 / 0.3);
      if (wink < 0) eyeScaleY = 0.08;
    } else {
      eyeScaleX = 1.25 + Math.sin(time * 10) * 0.06;
      eyeScaleY = 1.25 + Math.sin(time * 10) * 0.06;
    }
    agentBlushMaterial.emissiveIntensity = 3.2;
    agentLeftEar.rotation.z += (1.0 - agentLeftEar.rotation.z) * 0.15;
    agentRightEar.rotation.z += (-1.0 - agentRightEar.rotation.z) * 0.15;
  } else {
    agentHoverTime = 0;
    agentBlushMaterial.emissiveIntensity = 1.5;
    agentLeftEar.rotation.z += (0.45 - agentLeftEar.rotation.z) * 0.12;
    agentRightEar.rotation.z += (-0.45 - agentRightEar.rotation.z) * 0.12;
  }

  if (agentEarTwitchTimer > 0) {
    agentEarTwitchTimer -= 0.016;
    const twitch = Math.sin(Date.now() * 0.09) * 0.28;
    agentLeftEar.rotation.z = (agentIsHovered ? 1.0 : 0.45) + twitch;
    agentRightEar.rotation.z = (agentIsHovered ? -1.0 : -0.45) - twitch;
  }

  if (agentHeadNudgeTimer > 0) {
    agentHeadNudgeTimer -= 0.016;
    agentHead.rotation.z = Math.sin(agentHeadNudgeTimer * Math.PI * 4.0) * 0.24;
    agentHead.rotation.x = Math.abs(Math.sin(agentHeadNudgeTimer * Math.PI * 2.0)) * 0.12;
  }

  let finalEyeY = eyeScaleY;
  if (!agentIsHovered) {
    if ((time % 4) > 3.8) finalEyeY = 0.08;
  }
  agentLeftEye.scale.set(eyeScaleX, finalEyeY, 0.5);
  agentRightEye.scale.set(eyeScaleX, finalEyeY, 0.5);

  agentBaseRingCurrentSpin += (agentBaseRingTargetSpin - agentBaseRingCurrentSpin) * 0.08;
  agentBaseRing.rotation.z -= agentBaseRingCurrentSpin;
  if (agentBaseRingTargetSpin > 0.015) agentBaseRingTargetSpin -= 0.003;

  agentBadgeCurrentScale += (agentBadgeTargetScale - agentBadgeCurrentScale) * 0.12;
  agentBadge.scale.set(agentBadgeCurrentScale, agentBadgeCurrentScale, agentBadgeCurrentScale * 0.45);
  if (agentBadgeTargetScale > 1.0) {
    agentBadgeMaterial.color.setHex(0xffffff);
    agentBadgeMaterial.emissive.setHex(0xffffff);
    agentBadgeMaterial.emissiveIntensity = 8.0;
    agentBadgeTargetScale -= 0.035;
  } else {
    agentBadgeMaterial.color.setHex(0x2dd4bf);
    agentBadgeMaterial.emissive.setHex(0x2dd4bf);
    agentBadgeMaterial.emissiveIntensity = 2.5;
  }

  agentBadgeLightCurrentIntensity += (agentBadgeLightTargetIntensity - agentBadgeLightCurrentIntensity) * 0.12;
  agentBadgeLight.intensity = agentBadgeLightCurrentIntensity;
  if (agentBadgeLightTargetIntensity > 0.0) agentBadgeLightTargetIntensity -= 0.15;

  agentBaseRing.position.y = -1.35 + Math.sin(time * 1.5 - 0.5) * 0.07;
  agentBaseRingMaterial.emissiveIntensity = (1.6 + Math.sin(time * 3.5) * 0.4) * (agentBaseRingCurrentSpin * 20.0);

  if (!agentIsJumping) {
    agentRobotGroup.rotation.x += (0 - agentRobotGroup.rotation.x) * 0.1;
    agentRobotGroup.rotation.y += (0 - agentRobotGroup.rotation.y) * 0.1;
  }

  agentRenderer.render(agentThreeScene, agentCamera);
}

function triggerPetRaycast(eventClient) {
  if (!agentRenderer || !agentCamera) return;
  const raycaster = new THREE.Raycaster();
  const mouse3d = new THREE.Vector2();
  const rect = agentRenderer.domElement.getBoundingClientRect();

  mouse3d.x = ((eventClient.clientX - rect.left) / rect.width) * 2 - 1;
  mouse3d.y = -((eventClient.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse3d, agentCamera);
  const intersects = raycaster.intersectObjects(agentRobotGroup.children, true);

  if (intersects.length > 0) {
    let hitObj = intersects[0].object;
    if (hitObj.parent === agentBaseRing) hitObj = agentBaseRing;

    if (hitObj === agentLeftEar || hitObj === agentRightEar || hitObj === agentLeftEarCollider || hitObj === agentRightEarCollider) {
      agentEarTwitchTimer = 1.2;
      triggerSpeechBubble(["喵呜～捏捏猫耳，精力拉满！😸", "耳朵竖起来听你说话呢！👂"]);
    } else if (hitObj === agentHead) {
      agentHeadNudgeTimer = 1.0;
      triggerSpeechBubble(["摸摸猫头，专注度爆发！✨", "好舒服～加油自习哦！😸"]);
    } else if (hitObj === agentBadge) {
      agentBadgeTargetScale = 1.8;
      agentBadgeLightTargetIntensity = 5.0;
      triggerSpeechBubble(["CX 核心充能 100%！⚡", "爆发出巨大的专注能量！🔥"]);
    } else if (hitObj === agentBaseRing) {
      agentBaseRingTargetSpin = 0.25;
      triggerSpeechBubble(["反重力发动机超载！🚀", "要飞往星辰大海啦！✨"]);
    } else {
      triggerAgentJump();
      for (let i = 0; i < 3; i++) spawnFloatingHeart();
    }
  } else {
    triggerAgentJump();
    for (let i = 0; i < 3; i++) spawnFloatingHeart();
  }
}

function triggerAgentJump() {
  if (agentIsJumping) return;
  agentIsJumping = true;
  agentJumpTime = 0;
}

let speechTimer = null;
function triggerSpeechBubble(speechList) {
  const speechBubble = document.getElementById("petSpeechBubble");
  if (!speechBubble) return;
  if (speechTimer) clearTimeout(speechTimer);

  const text = speechList[Math.floor(Math.random() * speechList.length)];
  speechBubble.textContent = text;
  speechBubble.classList.add("is-visible");

  speechTimer = setTimeout(() => {
    speechBubble.classList.remove("is-visible");
  }, 4000);
}

function spawnFloatingHeart() {
  const container = document.getElementById("desktopPetContainer");
  if (!container) return;
  const heart = document.createElement("div");
  heart.className = "floating-heart";
  heart.innerHTML = "♥";

  const startX = Math.random() * 40 + 30;
  const dx = (Math.random() - 0.5) * 60;
  const duration = 0.8 + Math.random() * 0.5;

  heart.style.left = `${startX}px`;
  heart.style.bottom = "40px";
  heart.style.setProperty("--dx", `${dx}px`);
  heart.style.setProperty("--duration", `${duration}s`);

  container.appendChild(heart);
  setTimeout(() => heart.remove(), duration * 1000);
}

let petDragState = {
  isDragging: false,
  hasMoved: false,
  startX: 0,
  startY: 0,
  initialLeft: 0,
  initialTop: 0
};

function initPetDrag() {
  const pet = document.getElementById("desktopPetContainer");
  if (!pet) return;

  function onPointerDown(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    petDragState.isDragging = true;
    petDragState.hasMoved = false;
    petDragState.startX = clientX;
    petDragState.startY = clientY;
    petDragState.initialLeft = pet.offsetLeft;
    petDragState.initialTop = pet.offsetTop;
  }

  function onPointerMove(e) {
    if (!petDragState.isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = clientX - petDragState.startX;
    const dy = clientY - petDragState.startY;

    if (!petDragState.hasMoved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      petDragState.hasMoved = true;
      pet.style.right = "auto";
      pet.style.bottom = "auto";
      pet.style.left = `${petDragState.initialLeft}px`;
      pet.style.top = `${petDragState.initialTop}px`;
      pet.style.transition = "none";
    }

    if (petDragState.hasMoved) {
      if (e.cancelable && e.touches) e.preventDefault();

      let newLeft = petDragState.initialLeft + dx;
      let newTop = petDragState.initialTop + dy;

      const maxLeft = window.innerWidth - pet.offsetWidth;
      const maxTop = window.innerHeight - pet.offsetHeight;
      newLeft = Math.max(8, Math.min(maxLeft - 8, newLeft));
      newTop = Math.max(8, Math.min(maxTop - 8, newTop));

      pet.style.left = `${newLeft}px`;
      pet.style.top = `${newTop}px`;
    }
  }

  function onPointerUp() {
    if (!petDragState.isDragging) return;
    petDragState.isDragging = false;
    if (petDragState.hasMoved) {
      pet.style.transition = "left 0.38s cubic-bezier(0.32, 0.72, 0, 1), top 0.38s cubic-bezier(0.32, 0.72, 0, 1), right 0.38s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.38s cubic-bezier(0.32, 0.72, 0, 1), transform 0.3s ease, opacity 0.3s ease";
    }
  }

  pet.addEventListener("mousedown", onPointerDown);
  document.addEventListener("mousemove", onPointerMove);
  document.addEventListener("mouseup", onPointerUp);

  pet.addEventListener("touchstart", onPointerDown, { passive: false });
  document.addEventListener("touchmove", onPointerMove, { passive: false });
  document.addEventListener("touchend", onPointerUp);
}

// Drawer Toggle Logic
let preOpenPetPos = null;

function toggleAgentDrawer() {
  const panel = document.getElementById("agentPanel");
  if (panel && panel.classList.contains("is-open")) {
    closeAgentDrawer();
  } else {
    openAgentDrawer();
  }
}

function openAgentDrawer() {
  const panel = document.getElementById("agentPanel");
  const pet = document.getElementById("desktopPetContainer");
  const backdrop = document.getElementById("agentDrawerBackdrop");

  if (panel && panel.classList.contains("is-open")) return;

  if (pet) {
    const rect = pet.getBoundingClientRect();
    preOpenPetPos = {
      left: pet.style.left,
      top: pet.style.top,
      right: pet.style.right,
      bottom: pet.style.bottom,
      rectLeft: rect.left,
      rectTop: rect.top
    };

    pet.classList.add("panel-open");

    if (window.innerWidth <= 768) {
      pet.style.right = "auto";
      pet.style.bottom = "auto";
      pet.style.left = `${rect.left}px`;
      pet.style.top = `${rect.top}px`;

      void pet.offsetHeight;
      pet.style.transition = "left 0.38s cubic-bezier(0.32, 0.72, 0, 1), top 0.38s cubic-bezier(0.32, 0.72, 0, 1), transform 0.3s ease, opacity 0.3s ease";

      const petWidth = pet.offsetWidth || 85;
      const targetLeft = Math.max(10, (window.innerWidth - petWidth) / 2);
      const targetTop = Math.max(8, window.innerHeight * 0.12 - petWidth - 6);

      pet.style.left = `${targetLeft}px`;
      pet.style.top = `${targetTop}px`;
    }
  }

  if (panel) {
    panel.classList.remove("is-closed");
    panel.classList.add("is-open");
  }
  if (backdrop) backdrop.classList.add("is-visible");

  // 延迟 200ms 加载对话历史，确保移动端 slide-up CSS 动画 60fps 丝滑播放
  setTimeout(() => {
    fetchAgentHistory(currentSessionId || "physics");
  }, 200);
}

function closeAgentDrawer() {
  const panel = document.getElementById("agentPanel");
  const pet = document.getElementById("desktopPetContainer");
  const backdrop = document.getElementById("agentDrawerBackdrop");

  if (panel) {
    panel.classList.add("is-closed");
    panel.classList.remove("is-open");
  }
  if (backdrop) backdrop.classList.remove("is-visible");

  if (pet) {
    pet.classList.remove("panel-open");

    if (preOpenPetPos) {
      pet.style.transition = "left 0.38s cubic-bezier(0.32, 0.72, 0, 1), top 0.38s cubic-bezier(0.32, 0.72, 0, 1), right 0.38s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.38s cubic-bezier(0.32, 0.72, 0, 1), transform 0.3s ease, opacity 0.3s ease";

      if (preOpenPetPos.left || preOpenPetPos.top) {
        pet.style.left = preOpenPetPos.left || `${preOpenPetPos.rectLeft}px`;
        pet.style.top = preOpenPetPos.top || `${preOpenPetPos.rectTop}px`;
        pet.style.right = preOpenPetPos.right || "auto";
        pet.style.bottom = preOpenPetPos.bottom || "auto";
      } else {
        pet.style.left = "";
        pet.style.top = "";
        pet.style.right = "";
        pet.style.bottom = "";
      }
      preOpenPetPos = null;
    }
  }
}


// ==========================================
// Agent UI & API Interaction Engine
// ==========================================
let currentSessionId = "physics";
let uploadedFileUrl = "";
let uploadedFileName = "";
let uploadedFileSizeStr = "";

function initAgentDrawer() {
  const closeBtn = document.getElementById("closePanelBtn");
  const backdrop = document.getElementById("agentDrawerBackdrop");
  const handleBar = document.getElementById("drawerHandleBar");
  const sendBtn = document.getElementById("sendBtn");
  const chatInput = document.getElementById("chatInput");
  const attachBtn = document.getElementById("attachBtn");
  const voiceBtn = document.getElementById("voiceBtn");
  const historyBtn = document.getElementById("historyBtn");
  const backChatBtn = document.getElementById("backChatBtn");

  if (closeBtn) closeBtn.addEventListener("click", closeAgentDrawer);
  if (backdrop) backdrop.addEventListener("click", closeAgentDrawer);
  if (handleBar) handleBar.addEventListener("click", closeAgentDrawer);

  if (sendBtn) sendBtn.addEventListener("click", () => handleAgentSend(chatInput ? chatInput.value : ""));
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAgentSend(chatInput.value);
    });
  }

  // 附件上传绑定
  if (attachBtn) {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    attachBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/agent/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.ok) {
          uploadedFileUrl = data.url;
          uploadedFileName = data.filename;
          uploadedFileSizeStr = data.size_str;

          const previewContainer = document.getElementById("uploadPreviewContainer");
          const previewThumb = document.getElementById("uploadPreviewThumb");
          const previewFileIcon = document.getElementById("uploadPreviewFileIcon");
          const previewName = document.getElementById("uploadPreviewName");

          if (data.is_image) {
            previewThumb.src = data.url;
            previewThumb.style.display = "block";
            previewFileIcon.style.display = "none";
          } else {
            previewThumb.style.display = "none";
            previewFileIcon.style.display = "flex";
            previewFileIcon.innerHTML = getFileIconSvg(data.ext);
          }

          if (previewName) previewName.textContent = `${data.filename} (${data.size_str})`;
          if (previewContainer) previewContainer.style.display = "block";
        }
      } catch (err) {
        console.error("Upload error:", err);
      }
    });
  }

  const removeBtn = document.getElementById("uploadPreviewRemove");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      uploadedFileUrl = "";
      uploadedFileName = "";
      uploadedFileSizeStr = "";
      const container = document.getElementById("uploadPreviewContainer");
      if (container) container.style.display = "none";
    });
  }

  // 芯片点击
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      handleAgentSend(chip.dataset.text || chip.textContent);
    });
  });

  // 历史遮罩
  const historyOverlay = document.getElementById("historyOverlay");
  if (historyBtn && historyOverlay) {
    historyBtn.addEventListener("click", () => {
      historyOverlay.classList.add("is-open");
      renderHistoryListUI();
    });
  }
  if (backChatBtn && historyOverlay) {
    backChatBtn.addEventListener("click", () => {
      historyOverlay.classList.remove("is-open");
    });
  }

  const searchInput = document.getElementById("historySearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      filterHistoryList(e.target.value.toLowerCase());
    });
  }
}

function getFileIconSvg(ext) {
  ext = (ext || "").toLowerCase();
  if (ext === "pdf") return `<svg class="file-card-icon" viewBox="0 0 24 24" fill="none" stroke="#ff5d9e" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>`;
  if (["doc", "docx"].includes(ext)) return `<svg class="file-card-icon" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  return `<svg class="file-card-icon" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

async function fetchAgentHistory(sessionId) {
  currentSessionId = sessionId;
  try {
    const res = await fetch(`/api/agent/history?session_id=${sessionId}`);
    const data = await res.json();
    if (data.ok) {
      renderChatMessages(data.messages);
    }
  } catch (e) {
    console.error("Fetch history error:", e);
  }
}

function renderChatMessages(messages) {
  const historyContainer = document.getElementById("chatHistory");
  if (!historyContainer) return;
  historyContainer.innerHTML = "";

  (messages || []).forEach(msg => {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${msg.role === 'user' ? 'sent' : 'received'}`;

    if (msg.role === 'assistant') {
      const avatarWrapper = document.createElement("div");
      avatarWrapper.className = "msg-avatar-wrapper";
      avatarWrapper.innerHTML = `<img src="${agentAvatarDataUrl || '/static/cx_study_pet.jpg'}" class="msg-pet-avatar">`;
      messageDiv.appendChild(avatarWrapper);
    }

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "msg-content-wrapper";

    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "msg-bubble";

    let bubbleContent = parseAgentMarkdown(msg.content);
    if (msg.attachment_filename) {
      const ext = msg.attachment_filename.split('.').pop().toLowerCase();
      const isImg = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
      if (isImg) {
        bubbleContent = `
          <div class="attachment-preview">
            <div class="image-placeholder tex2jax_ignore" style="padding:6px; text-align:center;">
              <img src="/media/full/${msg.attachment_filename}" style="max-width:100%; max-height:140px; border-radius:6px;">
            </div>
            <div class="attachment-info">
              <span class="file-name">${msg.attachment_filename}</span>
              <span class="file-size">${msg.attachment_size}</span>
            </div>
          </div>
        ` + bubbleContent;
      } else {
        bubbleContent = `
          <div class="attachment-preview non-image">
            <div class="file-download-card">
              <div class="file-icon-box">${getFileIconSvg(ext)}</div>
              <div class="file-text-box">
                <span class="file-name">${msg.attachment_filename}</span>
                <span class="file-size">${msg.attachment_size}</span>
              </div>
            </div>
          </div>
        ` + bubbleContent;
      }
    }

    bubbleDiv.innerHTML = bubbleContent;

    const timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.textContent = msg.created_at ? msg.created_at.split(" ")[1] || msg.created_at : "刚刚";

    contentWrapper.appendChild(bubbleDiv);
    contentWrapper.appendChild(timeSpan);
    messageDiv.appendChild(contentWrapper);
    historyContainer.appendChild(messageDiv);
  });

  historyContainer.scrollTo({ top: historyContainer.scrollHeight, behavior: "smooth" });

  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([historyContainer]).catch(err => console.error("MathJax err:", err));
  }
}

async function handleAgentSend(text) {
  if (!text.trim() && !uploadedFileUrl) return;

  const chatInput = document.getElementById("chatInput");
  const contextSelect = document.getElementById("contextSelect");
  const taskId = contextSelect ? contextSelect.value : "";
  const historyContainer = document.getElementById("chatHistory");

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 插入用户暂态消息
  const userMsgDiv = document.createElement("div");
  userMsgDiv.className = "message sent";
  
  let bubbleContent = parseAgentMarkdown(text);
  if (uploadedFileUrl) {
    bubbleContent = `
      <div class="attachment-preview">
        <div class="file-download-card">
          <div class="file-icon-box">${getFileIconSvg(uploadedFileName.split('.').pop())}</div>
          <div class="file-text-box">
            <span class="file-name">${uploadedFileName}</span>
            <span class="file-size">${uploadedFileSizeStr}</span>
          </div>
        </div>
      </div>
    ` + bubbleContent;
  }

  userMsgDiv.innerHTML = `
    <div class="msg-content-wrapper">
      <div class="msg-bubble">${bubbleContent}</div>
      <span class="msg-time">${nowStr}</span>
    </div>
  `;
  historyContainer.appendChild(userMsgDiv);
  if (chatInput) chatInput.value = "";

  // 显示 AI 正在输入指示器
  const typingDiv = document.createElement("div");
  typingDiv.className = "message received";
  typingDiv.id = "agentTypingTemp";
  typingDiv.innerHTML = `
    <div class="msg-avatar-wrapper"><img src="${agentAvatarDataUrl || '/static/cx_study_pet.jpg'}" class="msg-pet-avatar"></div>
    <div class="msg-content-wrapper">
      <div class="msg-bubble" style="padding:10px 14px;"><span class="pulse-dot"></span> 思考推导中...</div>
    </div>
  `;
  historyContainer.appendChild(typingDiv);
  historyContainer.scrollTo({ top: historyContainer.scrollHeight, behavior: "smooth" });

  const payload = {
    message: text,
    session_id: currentSessionId,
    task_id: taskId,
    attachment_name: uploadedFileName,
    attachment_size: uploadedFileSizeStr
  };

  // 发送后清空附件暂存
  uploadedFileUrl = "";
  uploadedFileName = "";
  uploadedFileSizeStr = "";
  const previewContainer = document.getElementById("uploadPreviewContainer");
  if (previewContainer) previewContainer.style.display = "none";

  try {
    const res = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if (typingDiv) typingDiv.remove();

    if (data.ok) {
      const aiMsgDiv = document.createElement("div");
      aiMsgDiv.className = "message received";
      aiMsgDiv.innerHTML = `
        <div class="msg-avatar-wrapper"><img src="${agentAvatarDataUrl || '/static/cx_study_pet.jpg'}" class="msg-pet-avatar"></div>
        <div class="msg-content-wrapper">
          <div class="msg-bubble">${parseAgentMarkdown(data.reply)}</div>
          <span class="msg-time">${nowStr}</span>
        </div>
      `;
      historyContainer.appendChild(aiMsgDiv);
      historyContainer.scrollTo({ top: historyContainer.scrollHeight, behavior: "smooth" });

      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([aiMsgDiv]).catch(err => console.error(err));
      }
    }
  } catch (e) {
    if (typingDiv) typingDiv.remove();
    console.error("Chat API error:", e);
  }
}

function parseAgentMarkdown(text) {
  if (!text) return "";
  let html = text;
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`(.*?)`/g, "<code>$1</code>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

const mockSessions = [
  { id: "physics", title: "物理：斜面体与摩擦力分析", date: "今天", tag: "物理", preview: "根据牛顿第二定律公式 a = g(sinθ - μcosθ)..." },
  { id: "math", title: "数学：高二函数与导数探究", date: "昨天", tag: "数学", preview: "对曲线方程求导得到 y' = 3x² - 4x..." },
  { id: "chemistry", title: "化学：同分异构体分类卡", date: "前天", tag: "化学", preview: "有机化学同分异构体主要包含碳链与官能团异构..." }
];

function renderHistoryListUI() {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;
  historyList.innerHTML = "";

  mockSessions.forEach(session => {
    const item = document.createElement("div");
    item.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12.5px; font-weight:700; color:#fff;">${session.title}</span>
        <span style="font-size:10px; color:#64748b;">${session.date}</span>
      </div>
      <div style="font-size:11px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${session.preview}</div>
    `;
    item.addEventListener("click", () => {
      currentSessionId = session.id;
      const historyOverlay = document.getElementById("historyOverlay");
      if (historyOverlay) historyOverlay.classList.remove("is-open");
      fetchAgentHistory(session.id);
    });
    historyList.appendChild(item);
  });
}

function filterHistoryList(query) {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;
  const filtered = mockSessions.filter(s => s.title.toLowerCase().includes(query) || s.preview.toLowerCase().includes(query));
  historyList.innerHTML = "";
  filtered.forEach(session => {
    const item = document.createElement("div");
    item.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12.5px; font-weight:700; color:#fff;">${session.title}</span>
        <span style="font-size:10px; color:#64748b;">${session.date}</span>
      </div>
      <div style="font-size:11px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${session.preview}</div>
    `;
    item.addEventListener("click", () => {
      currentSessionId = session.id;
      const historyOverlay = document.getElementById("historyOverlay");
      if (historyOverlay) historyOverlay.classList.remove("is-open");
      fetchAgentHistory(session.id);
    });
    historyList.appendChild(item);
  });
}
