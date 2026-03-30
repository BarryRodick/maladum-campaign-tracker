import {
  SEED_DATA_URL,
  STATUS_EFFECTS,
  STORAGE_KEY
} from "./app-data.js";

const TRACK_OVERLAY = {
  health: { y: 17.0, startX: 13.2, step: 6.55 },
  skill: { y: 28.1, startX: 13.15, step: 6.55 },
  magic: { y: 39.1, startX: 13.2, step: 6.55 },
  actions: { y: 50.0, startX: 13.15, step: 6.55 }
};

const XP_OVERLAY = [
  { y: 60.2, startX: 12.6, step: 6.55 },
  { y: 68.5, startX: 12.45, step: 6.55 },
  { y: 76.8, startX: 12.55, step: 6.55 },
  { y: 85.1, startX: 12.55, step: 6.55 }
];

const CARD_OVERLAY = {
  badge: { left: 50.9, top: 33.6, width: 16.2, height: 23.8 },
  restore: { left: 84.2, top: 4.2, width: 11.2, height: 7.4 },
  dock: { left: 52.1, top: 57.2, width: 39.2, height: 28.1 }
};

const app = document.getElementById("app");

const ui = {
  search: "",
  selectedReferenceId: null,
  rulesSheetOpen: false,
  activePageIndex: 0
};

let seedState = null;
let state = null;

app.addEventListener("click", handleClick);
app.addEventListener("input", handleInput);
document.addEventListener("change", handleDocumentChange);

bootstrap();

async function bootstrap() {
  renderLoading();

  try {
    seedState = await loadSeedState();
    state = loadState(seedState);
    ui.selectedReferenceId = getDefaultReferenceId();
    render();
  } catch (error) {
    console.error("Failed to initialize the Maladum tracker.", error);
    renderError();
  }
}

async function loadSeedState() {
  const response = await fetch(SEED_DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Seed data request failed with status ${response.status}.`);
  }

  return response.json();
}

function loadState(seed) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return sanitizeState(seed, seed);
  }

  try {
    return sanitizeState(JSON.parse(raw), seed);
  } catch (error) {
    console.error("Failed to load saved state.", error);
    return sanitizeState(seed, seed);
  }
}

function sanitizeState(raw, seed) {
  const next = clone(seed);

  if (raw?.campaign) {
    next.campaign = {
      ...next.campaign,
      ...raw.campaign
    };
  }

  if (raw?.party) {
    next.party = {
      ...next.party,
      ...raw.party,
      memberIds: Array.isArray(raw.party.memberIds) ? clone(raw.party.memberIds) : next.party.memberIds,
      reserveIds: Array.isArray(raw.party.reserveIds) ? clone(raw.party.reserveIds) : next.party.reserveIds,
      storageItemIds: Array.isArray(raw.party.storageItemIds)
        ? clone(raw.party.storageItemIds)
        : next.party.storageItemIds
    };
  }

  if (Array.isArray(raw?.adventurers)) {
    const incomingById = new Map(raw.adventurers.map((adventurer) => [adventurer.id, adventurer]));
    next.adventurers = next.adventurers.map((fallback) => {
      const incoming = incomingById.get(fallback.id);
      if (!incoming) {
        normalizeAdventurer(next, fallback);
        return fallback;
      }

      const merged = {
        ...fallback,
        ...incoming,
        profile: {
          ...fallback.profile,
          ...incoming.profile,
          xpPotentialByRank: Array.isArray(incoming.profile?.xpPotentialByRank)
            ? clone(incoming.profile.xpPotentialByRank)
            : fallback.profile.xpPotentialByRank,
          abilitySlots: Array.isArray(incoming.profile?.abilitySlots)
            ? clone(incoming.profile.abilitySlots)
            : fallback.profile.abilitySlots
        },
        campaignState: {
          ...fallback.campaignState,
          ...incoming.campaignState,
          xpMarksByRow: Array.isArray(incoming.campaignState?.xpMarksByRow)
            ? clone(incoming.campaignState.xpMarksByRow)
            : fallback.campaignState.xpMarksByRow,
          learnedSkills: Array.isArray(incoming.campaignState?.learnedSkills)
            ? clone(incoming.campaignState.learnedSkills)
            : fallback.campaignState.learnedSkills,
          learnedSpells: Array.isArray(incoming.campaignState?.learnedSpells)
            ? clone(incoming.campaignState.learnedSpells)
            : fallback.campaignState.learnedSpells,
          inventoryItemIds: Array.isArray(incoming.campaignState?.inventoryItemIds)
            ? clone(incoming.campaignState.inventoryItemIds)
            : fallback.campaignState.inventoryItemIds,
          armourItemIds: Array.isArray(incoming.campaignState?.armourItemIds)
            ? clone(incoming.campaignState.armourItemIds)
            : fallback.campaignState.armourItemIds,
          brokenItemIds: Array.isArray(incoming.campaignState?.brokenItemIds)
            ? clone(incoming.campaignState.brokenItemIds)
            : fallback.campaignState.brokenItemIds,
          statIncreases: {
            ...fallback.campaignState.statIncreases,
            ...incoming.campaignState?.statIncreases
          }
        },
        trackerState: {
          ...fallback.trackerState,
          ...incoming.trackerState,
          statusEffects: Array.isArray(incoming.trackerState?.statusEffects)
            ? clone(incoming.trackerState.statusEffects)
            : fallback.trackerState.statusEffects
        }
      };

      normalizeAdventurer(next, merged);
      return merged;
    });
  } else {
    next.adventurers.forEach((adventurer) => normalizeAdventurer(next, adventurer));
  }

  if (Array.isArray(raw?.items)) {
    next.items = clone(raw.items);
  }

  if (Array.isArray(raw?.questLog)) {
    next.questLog = clone(raw.questLog);
  }

  if (raw?.referenceLibrary) {
    next.referenceLibrary = {
      ...next.referenceLibrary,
      ...raw.referenceLibrary,
      skills: Array.isArray(raw.referenceLibrary.skills)
        ? clone(raw.referenceLibrary.skills)
        : next.referenceLibrary.skills,
      spells: Array.isArray(raw.referenceLibrary.spells)
        ? clone(raw.referenceLibrary.spells)
        : next.referenceLibrary.spells,
      abilities: Array.isArray(raw.referenceLibrary.abilities)
        ? clone(raw.referenceLibrary.abilities)
        : next.referenceLibrary.abilities
    };
  }

  if (raw?.cardCatalog) {
    next.cardCatalog = clone(raw.cardCatalog);
  }

  if (Array.isArray(raw?.imports)) {
    next.imports = clone(raw.imports);
  }

  return next;
}

function handleClick(event) {
  if (!state) {
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const action = target.dataset.action;

  if (action === "set-track") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    const track = target.dataset.track;
    const value = Number(target.dataset.value);
    const current = adventurer.trackerState[trackKey(track)];
    const nextValue = current === value ? value - 1 : value;
    adventurer.trackerState[trackKey(track)] = clamp(nextValue, 0, getMaxTrack(adventurer, track));
    commit();
    return;
  }

  if (action === "set-xp") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    const row = Number(target.dataset.row);
    const value = Number(target.dataset.value);
    const cap = getXpCapacities(adventurer)[row] ?? 0;
    const current = adventurer.campaignState.xpMarksByRow[row] ?? 0;
    const nextValue = current === value ? value - 1 : value;
    adventurer.campaignState.xpMarksByRow[row] = clamp(nextValue, 0, cap);
    commit();
    return;
  }

  if (action === "adjust-bonus") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    const track = target.dataset.track;
    const amount = Number(target.dataset.amount);
    const current = adventurer.campaignState.statIncreases[track];
    if (amount > 0 && !canIncreaseStat(adventurer, track)) {
      return;
    }

    adventurer.campaignState.statIncreases[track] = clamp(
      current + amount,
      0,
      getTrackIncreaseCap(adventurer, track)
    );
    normalizeStatIncreases(state, adventurer);
    clampTrackerState(adventurer);
    commit();
    return;
  }

  if (action === "adjust-ability-level") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    const id = target.dataset.abilityId;
    const amount = Number(target.dataset.amount);
    const pool = target.dataset.pool === "spells"
      ? adventurer.campaignState.learnedSpells
      : adventurer.campaignState.learnedSkills;
    const entry = pool.find((ability) => ability.id === id);
    if (!entry || entry.type !== "skill") {
      return;
    }
    entry.level = clamp((entry.level ?? 1) + amount, 1, 3);
    commit();
    return;
  }

  if (action === "toggle-status") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    const effect = target.dataset.effect;
    const effects = adventurer.trackerState.statusEffects;
    const index = effects.indexOf(effect);
    if (index === -1) {
      effects.push(effect);
    } else {
      effects.splice(index, 1);
    }
    commit();
    return;
  }

  if (action === "select-reference") {
    ui.selectedReferenceId = target.dataset.referenceId;
    ui.rulesSheetOpen = true;
    render();
    return;
  }

  if (action === "toggle-rules-sheet") {
    ui.rulesSheetOpen = !ui.rulesSheetOpen;
    render();
    return;
  }

  if (action === "jump-page") {
    const pageIndex = clamp(Number(target.dataset.pageIndex), 0, getPartyAdventurers().length);
    ui.activePageIndex = pageIndex;
    scrollToPage(pageIndex);
    return;
  }

  if (action === "restore-adventurer") {
    restoreTracker(getAdventurer(target.dataset.adventurerId));
    commit();
    return;
  }

  if (action === "restore-party") {
    state.adventurers.forEach(restoreTracker);
    commit();
    return;
  }

  if (action === "reset-imported") {
    state = sanitizeState(seedState, seedState);
    ui.selectedReferenceId = getDefaultReferenceId();
    commit(false);
    render();
    return;
  }

  if (action === "export-state") {
    exportState();
    return;
  }

  if (action === "import-state") {
    document.getElementById("import-state-input").click();
  }
}

function handleInput(event) {
  if (!state) {
    return;
  }

  const target = event.target;

  if (target.dataset.role === "campaign-field") {
    const field = target.dataset.field;
    state.campaign[field] = target.type === "number" ? Number(target.value) : target.value;
    commit(false);
    return;
  }

  if (target.dataset.role === "notes-field") {
    getAdventurer(target.dataset.adventurerId).campaignState.notes = target.value;
    commit(false);
    return;
  }

  if (target.dataset.role === "search-field") {
    ui.search = target.value.trim().toLowerCase();
    render();
  }
}

function handleDocumentChange(event) {
  if (!seedState) {
    return;
  }

  const target = event.target;
  if (target.id !== "import-state-input" || !target.files?.length) {
    return;
  }

  const [file] = target.files;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = sanitizeState(JSON.parse(reader.result), seedState);
      if (!getReferenceEntry(ui.selectedReferenceId)) {
        ui.selectedReferenceId = getDefaultReferenceId();
      }
      commit(false);
      render();
    } catch (error) {
      console.error("Import failed.", error);
      window.alert("That file could not be imported.");
    } finally {
      target.value = "";
    }
  };
  reader.readAsText(file);
}

function commit(shouldRender = true) {
  if (!state) {
    return;
  }

  state.adventurers.forEach((adventurer) => normalizeAdventurer(state, adventurer));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (shouldRender) {
    render();
  }
}

function renderLoading() {
  app.innerHTML = `
    <main class="shell">
      <header class="app-toolbar">
        <span class="toolbar-title">Maladum</span>
      </header>
      <div class="page-dots"></div>
      <div class="card-deck">
        <article class="card-slide" style="align-content:center;justify-items:center;padding:2rem;">
          <p class="empty">Loading card overlay&hellip;</p>
        </article>
      </div>
    </main>
  `;
}

function renderError() {
  app.innerHTML = `
    <main class="shell">
      <header class="app-toolbar">
        <span class="toolbar-title">Maladum</span>
      </header>
      <div class="page-dots"></div>
      <div class="card-deck">
        <article class="card-slide" style="align-content:center;justify-items:center;padding:2rem;">
          <p class="empty">Seed data failed to load. Serve the project locally and check <code>imports/maladum-cards/schema-seed.json</code>.</p>
        </article>
      </div>
    </main>
  `;
}

function render() {
  const partyAdventurers = getPartyAdventurers();
  const pageCount = partyAdventurers.length + 1;
  ui.activePageIndex = clamp(ui.activePageIndex, 0, pageCount - 1);
  const referenceEntries = getFilteredReferenceEntries();
  const selectedReference = getSelectedReference(referenceEntries);

  app.innerHTML = `
    <main class="shell">
      <header class="app-toolbar">
        <span class="toolbar-title">Maladum</span>
        <div class="toolbar-actions">
          <button class="toolbar-btn toolbar-btn-primary" data-action="restore-party" title="Restore Party">&#x21bb;</button>
          <button class="toolbar-btn" data-action="export-state" title="Export">&#x2913;</button>
          <button class="toolbar-btn" data-action="import-state" title="Import">&#x2912;</button>
          <button class="toolbar-btn toolbar-btn-ghost" data-action="reset-imported" title="Reset">&#x27F3;</button>
          <input id="import-state-input" type="file" accept=".json,application/json">
        </div>
      </header>

      <div class="page-dots">
        ${partyAdventurers.map((a, i) => `
          <button
            class="page-dot${i === ui.activePageIndex ? " is-active" : ""}"
            data-action="jump-page"
            data-page-index="${i}"
            data-page-kind="character"
            aria-label="Jump to ${escapeAttribute(a.name)}"
            title="${escapeAttribute(a.name)}"
          >${escapeHtml(a.name.charAt(0))}</button>
        `).join("")}
        <button
          class="page-dot${ui.activePageIndex === partyAdventurers.length ? " is-active" : ""}"
          data-action="jump-page"
          data-page-index="${partyAdventurers.length}"
          data-page-kind="campaign"
          aria-label="Jump to campaign page"
          title="Campaign"
        >&#x2699;</button>
      </div>

      <div class="page-deck card-deck" aria-label="Character pages">
        ${partyAdventurers.map(renderAdventurerSlide).join("")}

        <article class="card-slide campaign-page">
          <section class="campaign-bar panel">
            <div class="section-head">
              <h2>${escapeHtml(state.campaign.name)}</h2>
              <p>${escapeHtml(state.party.name)}</p>
            </div>
            <div class="campaign-summary">
              <span>Quest: ${escapeHtml(state.campaign.currentQuestId)}</span>
              <span>Stash ${state.campaign.stash}</span>
              <span>Renown ${state.campaign.renown}</span>
              <span>Delay ${state.campaign.delay}</span>
            </div>
            <div class="campaign-grid">
              <label class="field">
                <span>Campaign Name</span>
                <input data-role="campaign-field" data-field="name" type="text" value="${escapeAttribute(state.campaign.name)}">
              </label>
              <label class="field">
                <span>Current Quest</span>
                <input data-role="campaign-field" data-field="currentQuestId" type="text" value="${escapeAttribute(state.campaign.currentQuestId)}">
              </label>
              <label class="field">
                <span>Stash</span>
                <input data-role="campaign-field" data-field="stash" type="number" value="${escapeAttribute(state.campaign.stash)}">
              </label>
              <label class="field">
                <span>Renown</span>
                <input data-role="campaign-field" data-field="renown" type="number" value="${escapeAttribute(state.campaign.renown)}">
              </label>
              <label class="field">
                <span>Delay</span>
                <input data-role="campaign-field" data-field="delay" type="number" value="${escapeAttribute(state.campaign.delay)}">
              </label>
            </div>
            <label class="field">
              <span>Campaign Notes</span>
              <textarea data-role="campaign-field" data-field="notes" rows="8">${escapeHtml(state.campaign.notes)}</textarea>
            </label>
          </section>
        </article>
      </div>

      <section class="campaign-bar-desktop panel">
        <div class="section-head compact">
          <h4>${escapeHtml(state.campaign.name)}</h4>
          <p>${escapeHtml(state.party.name)}</p>
        </div>
        <div class="campaign-summary">
          <span>${escapeHtml(state.campaign.currentQuestId)}</span>
          <span>Stash ${state.campaign.stash}</span>
          <span>Renown ${state.campaign.renown}</span>
          <span>Delay ${state.campaign.delay}</span>
        </div>
        <label class="field">
          <span>Campaign Notes</span>
          <textarea data-role="campaign-field" data-field="notes" rows="2">${escapeHtml(state.campaign.notes)}</textarea>
        </label>
      </section>

      <aside class="rules-sheet" data-state="${ui.rulesSheetOpen ? "open" : "closed"}">
        <button
          class="rules-sheet-handle"
          type="button"
          data-action="toggle-rules-sheet"
          aria-label="${ui.rulesSheetOpen ? "Close rules sheet" : "Open rules sheet"}"
          aria-expanded="${ui.rulesSheetOpen ? "true" : "false"}"
        >
          <span class="handle-bar"></span>
        </button>
        <div class="rules-sheet-body">
          <div class="section-head">
            <h2>Rules Lookup</h2>
            <p>${referenceEntries.length} matches</p>
          </div>
          <label class="field">
            <span>Search Rules</span>
            <input
              data-role="search-field"
              type="search"
              placeholder="Reflexes, Telekinesis, Guardian..."
              value="${escapeAttribute(ui.search)}"
            >
          </label>
          <div class="reference-list">
            ${referenceEntries.map(renderReferenceListItem).join("")}
          </div>
          <div class="reference-detail">
            ${selectedReference ? renderReferenceDetail(selectedReference) : "<p class=\"empty\">No rules match that search.</p>"}
          </div>
        </div>
      </aside>
    </main>
  `;

  initializePageDeck(pageCount);
}

function initializePageDeck(pageCount) {
  const deck = app.querySelector(".page-deck");
  if (!deck) {
    return;
  }

  requestAnimationFrame(() => {
    deck.scrollLeft = deck.clientWidth * ui.activePageIndex;
    syncPageDots();
  });

  deck.addEventListener("scroll", () => {
    const nextIndex = clamp(
      Math.round(deck.scrollLeft / Math.max(deck.clientWidth, 1)),
      0,
      pageCount - 1
    );

    if (nextIndex !== ui.activePageIndex) {
      ui.activePageIndex = nextIndex;
      syncPageDots();
    }
  }, { passive: true });
}

function scrollToPage(pageIndex) {
  const deck = app.querySelector(".page-deck");
  if (!deck) {
    return;
  }

  deck.scrollTo({
    left: deck.clientWidth * pageIndex,
    top: 0,
    behavior: "smooth"
  });
  syncPageDots();
}

function syncPageDots() {
  app.querySelectorAll(".page-dot").forEach((dot, index) => {
    dot.classList.toggle("is-active", index === ui.activePageIndex);
  });
}

function renderAdventurerSlide(adventurer) {
  const template = getCharacterTemplate(adventurer.id);
  const portraitPath = resolveAssetPath(adventurer.profile.image);
  const progressionState = getProgressionState(adventurer);

  return `
    <article class="card-slide" data-adventurer-id="${adventurer.id}">
      <div class="scan-card panel">
        ${portraitPath ? `<img class="scan-art" src="${escapeAttribute(portraitPath)}" alt="${escapeAttribute(adventurer.name)}">` : ""}
        <div class="scan-overlay">
          ${renderTrackHotspots(adventurer)}
          ${renderXpHotspots(adventurer)}
          ${renderBadgeHotspot(template?.startingBadge)}
          <button
            class="restore-badge"
            style="${boxPosition(CARD_OVERLAY.restore)}"
            data-action="restore-adventurer"
            data-adventurer-id="${adventurer.id}"
          >
            Restore
          </button>
          <div class="progress-dock" style="${boxPosition(CARD_OVERLAY.dock)}">
            <div class="dock-header">
              <strong>${escapeHtml(adventurer.name)}</strong>
              <span>${escapeHtml(template?.cardCode ?? "Imported")}</span>
            </div>
            <p class="progress-note">${escapeHtml(renderProgressSummary(progressionState))}</p>
            <div class="level-dock">
              ${renderProgressEntries(adventurer)}
            </div>
          </div>
        </div>
      </div>

      <div class="slide-tools panel">
        <div class="section-head compact">
          <h4>${escapeHtml(adventurer.profile.species)} · ${escapeHtml(adventurer.profile.profession)}</h4>
          <p>Rank ${adventurer.campaignState.rank}</p>
        </div>
        <details class="tool-drawer">
          <summary>Progression</summary>
          <div class="bonus-dock">
            ${["health", "skill", "magic", "actions"].map((track) => renderBonusChip(adventurer, track)).join("")}
          </div>
          <p class="progress-note">${escapeHtml(renderProgressSummary(progressionState))}</p>
        </details>
        <details class="tool-drawer">
          <summary>Status Effects</summary>
          <div class="status-grid">
            ${STATUS_EFFECTS.map((effect) => renderStatusToggle(adventurer, effect)).join("")}
          </div>
        </details>
        <details class="tool-drawer">
          <summary>Card Notes</summary>
          <label class="field field-notes">
            <span>Notes</span>
            <textarea data-role="notes-field" data-adventurer-id="${adventurer.id}" rows="3">${escapeHtml(adventurer.campaignState.notes)}</textarea>
          </label>
        </details>
      </div>
    </article>
  `;
}

function renderTrackHotspots(adventurer) {
  return ["health", "skill", "magic", "actions"]
    .map((track) => {
      const printedCapacity = getPrintedTrackCapacity(adventurer, track);
      const current = adventurer.trackerState[trackKey(track)];
      const currentMax = getMaxTrack(adventurer, track);
      return Array.from({ length: printedCapacity }, (_, index) => {
        const hotspot = {
          left: TRACK_OVERLAY[track].startX + TRACK_OVERLAY[track].step * index - 2.25,
          top: TRACK_OVERLAY[track].y - 3.05,
          width: 4.5,
          height: 6.1
        };
        const classes = [
          "pip-hotspot",
          index < current ? "is-current" : "is-spent",
          index >= currentMax ? "is-locked" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <button
            class="${classes}"
            style="${boxPosition(hotspot)}"
            data-action="set-track"
            data-adventurer-id="${adventurer.id}"
            data-track="${track}"
            data-value="${index + 1}"
            aria-label="Set ${track} to ${index + 1}"
            ${index >= currentMax ? "disabled" : ""}
          ></button>
        `;
      }).join("");
    })
    .join("");
}

function renderXpHotspots(adventurer) {
  const capacities = getXpCapacities(adventurer);
  return capacities
    .map((capacity, rowIndex) =>
      Array.from({ length: capacity }, (_, index) => {
        const hotspot = {
          left: XP_OVERLAY[rowIndex].startX + XP_OVERLAY[rowIndex].step * index - 2.45,
          top: XP_OVERLAY[rowIndex].y - 3.05,
          width: 4.9,
          height: 6.1
        };
        const current = adventurer.campaignState.xpMarksByRow[rowIndex] ?? 0;
        const classes = [
          "xp-hotspot",
          index < current ? "is-marked" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <button
            class="${classes}"
            style="${boxPosition(hotspot)}"
            data-action="set-xp"
            data-adventurer-id="${adventurer.id}"
            data-row="${rowIndex}"
            data-value="${index + 1}"
            aria-label="Set XP row ${rowIndex + 1} to ${index + 1}"
          ></button>
        `;
      }).join("")
    )
    .join("");
}

function renderBadgeHotspot(badge) {
  if (!badge) {
    return "";
  }

  const selected = ui.selectedReferenceId === badge.id ? "is-selected" : "";
  return `
    <button
      class="badge-hotspot ${selected}"
      style="${boxPosition(CARD_OVERLAY.badge)}"
      data-action="select-reference"
      data-reference-id="${badge.id}"
      aria-label="Open ${badge.name}"
    ></button>
  `;
}

function renderBonusChip(adventurer, track) {
  const value = adventurer.campaignState.statIncreases[track];
  const canIncrease = canIncreaseStat(adventurer, track);
  const canDecrease = value > 0;
  return `
    <div class="bonus-chip">
      <span>${track.charAt(0).toUpperCase()}</span>
      <button
        class="mini-step"
        data-action="adjust-bonus"
        data-adventurer-id="${adventurer.id}"
        data-track="${track}"
        data-amount="-1"
        ${canDecrease ? "" : "disabled"}
      >-</button>
      <strong>${value}</strong>
      <button
        class="mini-step"
        data-action="adjust-bonus"
        data-adventurer-id="${adventurer.id}"
        data-track="${track}"
        data-amount="1"
        ${canIncrease ? "" : "disabled"}
      >+</button>
    </div>
  `;
}

function renderProgressEntries(adventurer) {
  const entries = [
    ...adventurer.campaignState.learnedSkills.map((entry) => ({ ...entry, pool: "skills" })),
    ...adventurer.campaignState.learnedSpells.map((entry) => ({ ...entry, pool: "spells" }))
  ];

  if (!entries.length) {
    return `<p class="empty">No card-linked skills or spells marked.</p>`;
  }

  return entries.map((entry) => {
    const reference = getReferenceEntry(entry.id);
    const label = reference?.name ?? entry.name ?? entry.id;
    const level = entry.level ?? null;
    const levelControls = entry.type === "skill"
      ? `
        <div class="level-controls">
          <button
            class="mini-step"
            data-action="adjust-ability-level"
            data-adventurer-id="${adventurer.id}"
            data-ability-id="${entry.id}"
            data-pool="${entry.pool}"
            data-amount="-1"
          >-</button>
          <strong>${level ?? 1}</strong>
          <button
            class="mini-step"
            data-action="adjust-ability-level"
            data-adventurer-id="${adventurer.id}"
            data-ability-id="${entry.id}"
            data-pool="${entry.pool}"
            data-amount="1"
          >+</button>
        </div>
      `
      : `<span class="entry-tag">${entry.type}</span>`;

    return `
      <div class="progress-entry">
        <button class="entry-link" data-action="select-reference" data-reference-id="${entry.id}">
          ${escapeHtml(label)}
        </button>
        ${levelControls}
      </div>
    `;
  }).join("");
}

function renderStatusToggle(adventurer, effect) {
  const active = adventurer.trackerState.statusEffects.includes(effect) ? "is-active" : "";
  return `
    <button class="status-toggle ${active}" data-action="toggle-status" data-adventurer-id="${adventurer.id}" data-effect="${effect}">
      ${formatLabel(effect)}
    </button>
  `;
}

function renderReferenceListItem(entry) {
  const selected = ui.selectedReferenceId === entry.id ? "is-selected" : "";
  const subtitle = [
    entry.type,
    entry.level ? `level ${entry.level}` : null,
    entry.mode ?? null
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <button class="reference-item ${selected}" data-action="select-reference" data-reference-id="${entry.id}">
      <span>${escapeHtml(entry.name)}</span>
      <small>${escapeHtml(subtitle || (entry.tags?.[0] ?? "imported"))}</small>
    </button>
  `;
}

function renderReferenceDetail(entry) {
  const sourceUrl = resolveAssetPath(entry.source?.url);
  const paragraphs = entry.rulesText
    .split("\n")
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return `
    <div class="detail-head">
      <div>
        <p class="eyebrow">${escapeHtml([entry.type, entry.level ? `level ${entry.level}` : null, entry.mode ?? null].filter(Boolean).join(" · "))}</p>
        <h3>${escapeHtml(entry.name)}</h3>
      </div>
      <span class="source-pill">${escapeHtml(entry.source?.name ?? "Imported source")}</span>
    </div>
    ${entry.tags?.length ? `<div class="tag-row">${entry.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
    <div class="rules-copy">${paragraphs}</div>
    ${sourceUrl ? `<a class="source-link" href="${escapeAttribute(sourceUrl)}" target="_blank" rel="noreferrer">Open source file</a>` : ""}
  `;
}

function getFilteredReferenceEntries() {
  const entries = getAllReferenceEntries();
  if (!ui.search) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = [
      entry.name,
      entry.type,
      entry.mode ?? "",
      entry.level ?? "",
      entry.rulesText,
      ...(entry.tags ?? []),
      entry.source?.name ?? ""
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(ui.search);
  });
}

function getSelectedReference(entries) {
  if (!entries.length) {
    return null;
  }

  return entries.find((entry) => entry.id === ui.selectedReferenceId) ?? entries[0];
}

function getAllReferenceEntries() {
  return [
    ...state.referenceLibrary.skills,
    ...state.referenceLibrary.spells,
    ...state.referenceLibrary.abilities
  ];
}

function getReferenceEntry(id) {
  if (!id) {
    return null;
  }

  return getAllReferenceEntries().find((entry) => entry.id === id) ?? null;
}

function getPartyAdventurers() {
  const byId = new Map(state.adventurers.map((adventurer) => [adventurer.id, adventurer]));
  return state.party.memberIds.map((id) => byId.get(id)).filter(Boolean);
}

function getAdventurer(id) {
  return state.adventurers.find((adventurer) => adventurer.id === id);
}

function getCharacterTemplate(id, sourceState = state) {
  return sourceState?.cardCatalog?.characterCards?.find((card) => card.id === id) ?? null;
}

function getPrintedTrackCapacity(adventurer, track, sourceState = state) {
  return getCharacterTemplate(adventurer.id, sourceState)?.trackTemplate?.[track]?.maxValue
    ?? getMaxTrack(adventurer, track);
}

function getXpCapacities(adventurer, sourceState = state) {
  return adventurer.profile.xpPotentialByRank
    ?? getCharacterTemplate(adventurer.id, sourceState)?.trackTemplate?.xpRowCapacities
    ?? [];
}

function getCompletedXpRows(adventurer, sourceState = state) {
  const capacities = getXpCapacities(adventurer, sourceState);
  return capacities.map((capacity, index) => (adventurer.campaignState.xpMarksByRow[index] ?? 0) >= capacity);
}

function getDerivedRank(adventurer, sourceState = state) {
  const rowsWithMarks = getXpCapacities(adventurer, sourceState)
    .filter((_, index) => (adventurer.campaignState.xpMarksByRow[index] ?? 0) > 0)
    .length;

  return Math.max(1, rowsWithMarks);
}

function getProgressionState(adventurer, sourceState = state) {
  const completedRows = getCompletedXpRows(adventurer, sourceState);
  const earlyPicks = completedRows.reduce((total, isComplete, index) => {
    if (!isComplete) {
      return total;
    }

    if (index === 0 || index === 1) {
      return total + 1;
    }

    if (index === 2) {
      return total + 2;
    }

    return total;
  }, 0);

  const latePicks = completedRows.reduce((total, isComplete, index) => {
    if (!isComplete) {
      return total;
    }

    return index >= 3 ? total + 2 : total;
  }, 0);

  const nonActionUsed =
    adventurer.campaignState.statIncreases.health
    + adventurer.campaignState.statIncreases.skill
    + adventurer.campaignState.statIncreases.magic;
  const actionUsed = adventurer.campaignState.statIncreases.actions;
  const overflowIntoLate = Math.max(0, nonActionUsed - earlyPicks);
  const lateUsed = actionUsed + overflowIntoLate;
  const totalPicks = earlyPicks + latePicks;
  const totalUsed = nonActionUsed + actionUsed;

  return {
    completedRows,
    rank: getDerivedRank(adventurer, sourceState),
    earlyPicks,
    latePicks,
    totalPicks,
    totalUsed,
    totalRemaining: Math.max(0, totalPicks - totalUsed),
    lateRemaining: Math.max(0, latePicks - lateUsed)
  };
}

function getTrackIncreaseCap(adventurer, track, sourceState = state) {
  const printedMax = getPrintedTrackCapacity(adventurer, track, sourceState);
  const baseKey = `base${track.charAt(0).toUpperCase()}${track.slice(1)}`;
  return Math.max(0, printedMax - adventurer.profile[baseKey]);
}

function canIncreaseStat(adventurer, track) {
  const progressionState = getProgressionState(adventurer);
  const currentValue = adventurer.campaignState.statIncreases[track];
  const maxForTrack = getTrackIncreaseCap(adventurer, track);

  if (currentValue >= maxForTrack) {
    return false;
  }

  if (track === "actions") {
    return progressionState.lateRemaining > 0;
  }

  return progressionState.totalRemaining > 0;
}

function renderProgressSummary(progressionState) {
  if (!progressionState.totalPicks) {
    return "Complete an XP row to unlock stat increases.";
  }

  if (progressionState.totalRemaining > 0) {
    return progressionState.lateRemaining > 0
      ? `${progressionState.totalRemaining} stat picks ready. Actions are now unlockable.`
      : `${progressionState.totalRemaining} stat picks ready from completed XP rows.`;
  }

  return "Completed row rewards allocated.";
}

function getMaxTrack(adventurer, track) {
  const baseKey = `base${track.charAt(0).toUpperCase()}${track.slice(1)}`;
  return adventurer.profile[baseKey] + adventurer.campaignState.statIncreases[track];
}

function trackKey(track) {
  return `current${track.charAt(0).toUpperCase()}${track.slice(1)}`;
}

function normalizeAdventurer(currentState, adventurer) {
  const capacities = getXpCapacities(adventurer, currentState);
  const marks = Array.isArray(adventurer.campaignState.xpMarksByRow)
    ? [...adventurer.campaignState.xpMarksByRow]
    : [];

  if (capacities.length) {
    adventurer.campaignState.xpMarksByRow = capacities.map((capacity, index) =>
      clamp(marks[index] ?? 0, 0, capacity)
    );
  }

  adventurer.campaignState.rank = getDerivedRank(adventurer, currentState);
  normalizeStatIncreases(currentState, adventurer);

  clampTrackerState(adventurer);

  adventurer.trackerState.statusEffects = adventurer.trackerState.statusEffects.filter((effect, index, values) =>
    STATUS_EFFECTS.includes(effect) && values.indexOf(effect) === index
  );
}

function normalizeStatIncreases(currentState, adventurer) {
  const next = { ...adventurer.campaignState.statIncreases };
  const trackOrder = ["health", "skill", "magic", "actions"];

  trackOrder.forEach((track) => {
    next[track] = clamp(
      Number.isFinite(next[track]) ? next[track] : 0,
      0,
      getTrackIncreaseCap(adventurer, track, currentState)
    );
  });

  const progressionState = getProgressionState(
    {
      ...adventurer,
      campaignState: {
        ...adventurer.campaignState,
        statIncreases: next
      }
    },
    currentState
  );

  next.actions = clamp(next.actions, 0, progressionState.latePicks);

  let remainingTotal = progressionState.totalPicks - next.actions;
  ["health", "skill", "magic"].forEach((track) => {
    next[track] = Math.min(next[track], remainingTotal);
    remainingTotal -= next[track];
  });

  adventurer.campaignState.statIncreases = next;
}

function clampTrackerState(adventurer) {
  ["health", "skill", "magic", "actions"].forEach((track) => {
    adventurer.trackerState[trackKey(track)] = clamp(
      adventurer.trackerState[trackKey(track)],
      0,
      getMaxTrack(adventurer, track)
    );
  });
}

function restoreTracker(adventurer) {
  adventurer.trackerState.currentHealth = getMaxTrack(adventurer, "health");
  adventurer.trackerState.currentSkill = getMaxTrack(adventurer, "skill");
  adventurer.trackerState.currentMagic = getMaxTrack(adventurer, "magic");
  adventurer.trackerState.currentActions = getMaxTrack(adventurer, "actions");
  adventurer.trackerState.statusEffects = [];
}

function getDefaultReferenceId() {
  const partyAdventurers = getPartyAdventurers();

  for (const adventurer of partyAdventurers) {
    const template = getCharacterTemplate(adventurer.id);
    if (template?.startingBadge && getReferenceEntry(template.startingBadge.id)) {
      return template.startingBadge.id;
    }

    const entries = [
      ...adventurer.campaignState.learnedSkills,
      ...adventurer.campaignState.learnedSpells
    ];

    for (const entry of entries) {
      if (getReferenceEntry(entry.id)) {
        return entry.id;
      }
    }
  }

  return getAllReferenceEntries()[0]?.id ?? null;
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "maladum-card-overlay.json";
  link.click();
  URL.revokeObjectURL(url);
}

function boxPosition(box) {
  return `left:${box.left}%;top:${box.top}%;width:${box.width}%;height:${box.height}%;`;
}

function resolveAssetPath(value) {
  if (!value) {
    return null;
  }

  if (/^https?:/i.test(value)) {
    return value;
  }

  const normalized = String(value).replaceAll("\\", "/").replace(/^\.\//, "");
  return `./${normalized}`;
}

function formatLabel(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
