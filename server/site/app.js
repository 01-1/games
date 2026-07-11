const cards = [...document.querySelectorAll(".game-card")];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const motionToggle = document.querySelector(".motion-toggle");
const motionLabel = motionToggle?.querySelector("[data-motion-label]");
const motionStorageKey = "playable-systems:motion";
let savedMotion = readMotionPreference();
let motionEnabled = savedMotion ? savedMotion === "on" : !prefersReducedMotion.matches;

applyMotionPreference(motionEnabled);

if (motionToggle) {
  motionToggle.hidden = false;
  motionToggle.addEventListener("click", () => {
    savedMotion = motionEnabled ? "off" : "on";
    writeMotionPreference(savedMotion);
    applyMotionPreference(savedMotion === "on");
  });
}

if ("IntersectionObserver" in window) {
  const cardObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          entry.target.classList.toggle("is-active", motionEnabled && !document.hidden);
        } else {
          entry.target.classList.remove("is-active");
        }
      }
    },
    { rootMargin: "8% 0px 8%", threshold: 0.08 }
  );

  cards.forEach((card, index) => {
    card.style.transitionDelay = `${Math.min(index % 3, 2) * 70}ms`;
    cardObserver.observe(card);
  });
} else {
  cards.forEach((card) => {
    card.classList.add("is-visible");
    card.classList.toggle("is-active", motionEnabled);
  });
}

document.addEventListener("visibilitychange", syncActiveCards);

const handleReducedMotionChange = (event) => {
  if (!savedMotion) applyMotionPreference(!event.matches);
};

if (typeof prefersReducedMotion.addEventListener === "function") {
  prefersReducedMotion.addEventListener("change", handleReducedMotionChange);
} else if (typeof prefersReducedMotion.addListener === "function") {
  prefersReducedMotion.addListener(handleReducedMotionChange);
}

if (window.matchMedia("(pointer: fine)").matches) {
  for (const card of cards) {
    const preview = card.querySelector(".preview");
    if (!preview) continue;

    card.addEventListener("pointermove", (event) => {
      const bounds = preview.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
      const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
      card.style.setProperty("--pointer-x", `${x}%`);
      card.style.setProperty("--pointer-y", `${y}%`);
    });

  }
}

const hero = document.querySelector(".hero");
const heroObject = document.querySelector(".hero-object");

if (hero && heroObject && window.matchMedia("(pointer: fine)").matches) {
  hero.addEventListener("pointermove", (event) => {
    if (!motionEnabled) return;
    const bounds = hero.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 18;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 18;
    heroObject.style.setProperty("--object-x", `${x}px`);
    heroObject.style.setProperty("--object-y", `${y}px`);
  });

  hero.addEventListener("pointerleave", () => {
    heroObject.style.setProperty("--object-x", "0px");
    heroObject.style.setProperty("--object-y", "0px");
  });
}

const terminalTime = document.querySelector(".terminal-time");

if (terminalTime) {
  let remainingSeconds = 47 * 60 + 12;

  window.setInterval(() => {
    if (!motionEnabled || document.hidden) return;
    remainingSeconds = remainingSeconds > 0 ? remainingSeconds - 1 : 47 * 60 + 12;
    const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
    const seconds = String(remainingSeconds % 60).padStart(2, "0");
    terminalTime.textContent = `DECOMMISSION 00:${minutes}:${seconds}`;
  }, 1000);
}

function applyMotionPreference(enabled) {
  motionEnabled = enabled;
  document.documentElement.classList.toggle("motion-enabled", enabled);
  document.documentElement.classList.toggle("motion-disabled", !enabled);

  if (motionToggle) {
    motionToggle.setAttribute("aria-pressed", String(enabled));
    motionToggle.setAttribute("aria-label", enabled ? "Turn motion off" : "Turn motion on");
  }

  if (motionLabel) motionLabel.textContent = enabled ? "Motion: on" : "Motion: reduced";
  syncActiveCards();
}

function syncActiveCards() {
  for (const card of cards) {
    const bounds = card.getBoundingClientRect();
    const inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
    card.classList.toggle("is-active", motionEnabled && !document.hidden && inView);
  }
}

function readMotionPreference() {
  try {
    return window.localStorage.getItem(motionStorageKey);
  } catch {
    return null;
  }
}

function writeMotionPreference(value) {
  try {
    window.localStorage.setItem(motionStorageKey, value);
  } catch {
    // Privacy-focused browsers may block storage; motion still works for this visit.
  }
}
