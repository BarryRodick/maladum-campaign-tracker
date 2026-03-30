import {
  ACTIVE_PARTY_LIMIT,
  PROFESSION_BOARD_OVERVIEW_URL,
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
  activePageIndex: 0,
  builderCharacterId: "",
  builderProfession: "",
  builderPlacement: "active"
};

let seedState = null;
let freshState = null;
let professionCatalog = [];
let state = null;

app.addEventListener("click", handleClick);
app.addEventListener("input", handleInput);
app.addEventListener("change", handleInput);
document.addEventListener("change", handleDocumentChange);

bootstrap();

async function bootstrap() {
  renderLoading();

  try {
    const [loadedSeed, loadedProfessionCatalog] = await Promise.all([
      loadSeedState(),
      loadProfessionCatalog()
    ]);
    seedState = loadedSeed;
    freshState = buildFreshState(seedState);
    professionCatalog = loadedProfessionCatalog;
    state = loadState(seedState, freshState);
    syncBuilderSelections();
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

async function loadProfessionCatalog() {
  try {
    const response = await fetch(PROFESSION_BOARD_OVERVIEW_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Profession overview request failed with status ${response.status}.`);
    }

    const overview = await response.json();
    if (Array.isArray(overview?.summary?.uniqueProfessions)) {
      return clone(overview.summary.uniqueProfessions);
    }

    if (Array.isArray(overview?.professionBoards)) {
      return overview.professionBoards
        .map((board) => board.profession)
        .filter(Boolean);
    }
  } catch (error) {
    console.warn("Failed to load profession catalog; falling back to imported references only.", error);
  }

  return [];
}

function buildFreshState(seed) {
  const next = clone(seed);
  next.campaign = {
    ...next.campaign,
    id: "campaign-new",
    name: "New Maladum Campaign",
    currentQuestId: "unassigned",
    nextQuestOptions: [],
    delay: 0,
    renown: 0,
    stash: 0,
    secureStorageEnabled: false,
    notes: "Choose your first hero and their profession to begin."
  };
  next.party = {
    ...next.party,
    id: "party-new",
    name: "New Party",
    memberIds: [],
    reserveIds: [],
    storageItemIds: []
  };
  next.adventurers = [];
  next.items = [];
  next.questLog = [];
  return next;
}

function loadState(seed, fresh) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return sanitizeState(fresh, seed);
  }

  try {
    return sanitizeState(JSON.parse(raw), seed);
  } catch (error) {
    console.error("Failed to load saved state.", error);
    return sanitizeState(fresh, seed);
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

  if (raw?.cardCatalog) {
    next.cardCatalog = clone(raw.cardCatalog);
  }

  if (Array.isArray(raw?.adventurers)) {
    const seedAdventurersById = new Map((seed.adventurers ?? []).map((adventurer) => [adventurer.id, clone(adventurer)]));
    next.adventurers = raw.adventurers.map((incoming) => {
      const templateId = getAdventurerTemplateId(incoming);
      const fallback =
        seedAdventurersById.get(incoming.id)
        ?? createAdventurerFromTemplate(
          templateId,
          getNormalizedProfessionValue(incoming.profile?.profession) || null,
          next,
          incoming.id
        );

      return mergeAdventurerRecord(next, fallback, incoming);
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

  if (Array.isArray(raw?.imports)) {
    next.imports = clone(raw.imports);
  }

  normalizePartyRoster(next);

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
    const pageIndex = clamp(Number(target.dataset.pageIndex), 0, getRosterAdventurers().length);
    ui.activePageIndex = pageIndex;
    scrollToPage(pageIndex);
    return;
  }

  if (action === "jump-adventurer") {
    const pageIndex = getRosterAdventurers().findIndex((adventurer) => adventurer.id === target.dataset.adventurerId);
    if (pageIndex === -1) {
      return;
    }

    ui.activePageIndex = pageIndex;
    scrollToPage(pageIndex);
    return;
  }

  if (action === "set-roster-state") {
    if (setAdventurerRosterState(target.dataset.adventurerId, target.dataset.rosterState)) {
      commit();
    }
    return;
  }

  if (action === "add-adventurer") {
    if (!ui.builderCharacterId || !getNormalizedProfessionValue(ui.builderProfession)) {
      return;
    }

    const rosterState = ui.builderPlacement === "reserve" ? "reserve" : "active";
    const adventurer = createAdventurerFromTemplate(
      ui.builderCharacterId,
      getNormalizedProfessionValue(ui.builderProfession),
      state
    );
    state.adventurers.push(adventurer);
    setAdventurerRosterState(adventurer.id, rosterState);
    ui.activePageIndex = [...state.party.memberIds, ...state.party.reserveIds].indexOf(adventurer.id);
    syncBuilderSelections();
    commit();
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
    state = sanitizeState(freshState, seedState);
    ui.activePageIndex = 0;
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
    return;
  }

  if (target.dataset.role === "builder-field") {
    const field = target.dataset.field;
    ui[field] = target.value;
    syncBuilderSelections();
    render();
    return;
  }

  if (target.dataset.role === "profession-field") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    if (!adventurer) {
      return;
    }

    adventurer.profile.profession = getNormalizedProfessionValue(target.value) || null;
    commit(false);
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
  normalizePartyRoster(state);
  syncBuilderSelections();
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
  syncBuilderSelections();

  const rosterAdventurers = getRosterAdventurers();
  const pageCount = rosterAdventurers.length + 1;
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
        ${rosterAdventurers.map((a, i) => `
          <button
            class="page-dot ${isActiveRosterMember(a.id) ? "is-party" : "is-reserve"}${i === ui.activePageIndex ? " is-active" : ""}"
            data-action="jump-page"
            data-page-index="${i}"
            data-page-kind="character"
            aria-label="Jump to ${escapeAttribute(a.name)}"
            title="${escapeAttribute(`${a.name} · ${getRosterLabel(a.id)}`)}"
          >${escapeHtml(a.name.charAt(0))}</button>
        `).join("")}
        <button
          class="page-dot${ui.activePageIndex === rosterAdventurers.length ? " is-active" : ""}"
          data-action="jump-page"
          data-page-index="${rosterAdventurers.length}"
          data-page-kind="campaign"
          aria-label="Jump to campaign page"
          title="Campaign"
        >&#x2699;</button>
      </div>

      <div class="page-deck card-deck" aria-label="Character pages">
        ${rosterAdventurers.map(renderAdventurerSlide).join("")}

        <article class="card-slide campaign-page">
          ${renderTeamBuilder()}
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
  const template = getCharacterTemplate(getAdventurerTemplateId(adventurer));
  const portraitPath = resolveAssetPath(adventurer.profile.image);
  const progressionState = getProgressionState(adventurer);
  const rosterLabel = getRosterLabel(adventurer.id);
  const cardProgressEntries = getProgressEntries(adventurer, { includeStartingBadge: false });
  const showCardProgressDock =
    progressionState.totalPicks > 0
    || progressionState.totalUsed > 0
    || cardProgressEntries.length > 0;

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
            ${showCardProgressDock ? `
            <div class="progress-dock" style="${boxPosition(CARD_OVERLAY.dock)}">
              ${progressionState.totalPicks || progressionState.totalUsed ? `
                <div class="bonus-dock bonus-dock-card">
                  ${["health", "skill", "magic", "actions"].map((track) => renderBonusChip(adventurer, track, true)).join("")}
                </div>
              ` : ""}
              ${cardProgressEntries.length ? `
              <div class="level-dock">
                ${renderProgressEntries(adventurer, { includeStartingBadge: false, emptyMessage: "" })}
              </div>
              ` : ""}
            </div>
            ` : ""}
          </div>
        </div>

      <div class="slide-tools panel">
        <div class="section-head compact">
          <h4>${escapeHtml(adventurer.profile.species)} · ${escapeHtml(getDisplayProfession(adventurer))}</h4>
          <p>Rank ${adventurer.campaignState.rank} · ${escapeHtml(rosterLabel)}</p>
        </div>
        <details class="tool-drawer">
          <summary>Progression</summary>
          <div class="bonus-dock">
            ${["health", "skill", "magic", "actions"].map((track) => renderBonusChip(adventurer, track, false)).join("")}
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

function renderTeamBuilder() {
  const roster = getRosterAdventurers();
  const availableTemplates = getAvailableCharacterTemplates();
  const professionOptions = getProfessionOptions();
  const activeCount = state.party.memberIds.length;
  const reserveCount = state.party.reserveIds.length;
  const canAddAsActive = ui.builderPlacement !== "active" || activeCount < ACTIVE_PARTY_LIMIT;
  const addDisabled = !ui.builderCharacterId || !getNormalizedProfessionValue(ui.builderProfession) || !canAddAsActive;

  return `
    <section class="team-builder panel">
      <div class="section-head">
        <div>
          <h2>Team Builder</h2>
          <p>${roster.length ? `${activeCount}/${ACTIVE_PARTY_LIMIT} active · ${reserveCount} reserve` : "Choose your first hero and then their profession."}</p>
        </div>
        <span class="team-summary">${roster.length} tracked</span>
      </div>

      <div class="builder-grid">
        <label class="field">
          <span>Character Card</span>
          <select data-role="builder-field" data-field="builderCharacterId" ${availableTemplates.length ? "" : "disabled"}>
            ${availableTemplates.length
              ? availableTemplates.map((template) => `
                <option value="${escapeAttribute(template.id)}" ${ui.builderCharacterId === template.id ? "selected" : ""}>
                  ${escapeHtml(`${template.name} · ${template.species}`)}
                </option>
              `).join("")
              : `<option value="">No unused imported cards</option>`}
          </select>
        </label>
        <label class="field">
          <span>Profession</span>
          <select data-role="builder-field" data-field="builderProfession">
            <option value="">Select profession</option>
            ${professionOptions.map((profession) => `
              <option value="${escapeAttribute(profession)}" ${ui.builderProfession === profession ? "selected" : ""}>
                ${escapeHtml(profession)}
              </option>
            `).join("")}
          </select>
        </label>
        <label class="field">
          <span>Join As</span>
          <select data-role="builder-field" data-field="builderPlacement">
            <option value="active" ${ui.builderPlacement === "active" ? "selected" : ""}>Active Party</option>
            <option value="reserve" ${ui.builderPlacement === "reserve" ? "selected" : ""}>Reserve</option>
          </select>
        </label>
        <div class="field field-action">
          <span>Recruit</span>
          <button
            class="action-btn"
            data-action="add-adventurer"
            ${addDisabled ? "disabled" : ""}
          >Add Adventurer</button>
        </div>
      </div>

      ${availableTemplates.length
        ? ""
        : `<p class="empty">All imported character cards are already being tracked. Add more character cards to the catalog to recruit additional adventurers here.</p>`}
      ${ui.builderPlacement === "active" && activeCount >= ACTIVE_PARTY_LIMIT
        ? `<p class="progress-note">The active party is full. New recruits can still be added to the reserve.</p>`
        : ""}

      <div class="roster-list">
        ${roster.map(renderRosterCard).join("")}
      </div>
    </section>
  `;
}

function renderRosterCard(adventurer) {
  const active = isActiveRosterMember(adventurer.id);
  const canPromote = active || state.party.memberIds.length < ACTIVE_PARTY_LIMIT;

  return `
    <div class="roster-card">
      <div class="roster-meta">
        <div>
          <strong>${escapeHtml(adventurer.name)}</strong>
          <p>${escapeHtml(`${adventurer.profile.species} · Rank ${adventurer.campaignState.rank} · ${getRosterLabel(adventurer.id)}`)}</p>
        </div>
        <button class="entry-link roster-open" data-action="jump-adventurer" data-adventurer-id="${adventurer.id}">
          Open
        </button>
      </div>

      <label class="field field-inline">
        <span>Profession</span>
        <select data-role="profession-field" data-adventurer-id="${adventurer.id}">
          <option value="">Unassigned</option>
          ${getProfessionOptions().map((profession) => `
            <option
              value="${escapeAttribute(profession)}"
              ${getNormalizedProfessionValue(adventurer.profile.profession) === profession ? "selected" : ""}
            >
              ${escapeHtml(profession)}
            </option>
          `).join("")}
        </select>
      </label>

      <div class="roster-actions">
        <button
          class="state-toggle${active ? " is-active" : ""}"
          data-action="set-roster-state"
          data-adventurer-id="${adventurer.id}"
          data-roster-state="active"
          ${canPromote ? "" : "disabled"}
        >Active</button>
        <button
          class="state-toggle${!active ? " is-active" : ""}"
          data-action="set-roster-state"
          data-adventurer-id="${adventurer.id}"
          data-roster-state="reserve"
        >Reserve</button>
      </div>
    </div>
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

function renderBonusChip(adventurer, track, compact = false) {
  const value = adventurer.campaignState.statIncreases[track];
  const canIncrease = canIncreaseStat(adventurer, track);
  const canDecrease = value > 0;
  const label = compact ? getTrackChipLabel(track) : formatLabel(track);
  return `
    <div class="bonus-chip">
      <span title="${escapeAttribute(formatLabel(track))}">${escapeHtml(label)}</span>
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

function getProgressEntries(adventurer, options = {}) {
  const { includeStartingBadge = true } = options;
  const startingBadgeId = getCharacterTemplate(getAdventurerTemplateId(adventurer))?.startingBadge?.id ?? null;
  const entries = [
    ...adventurer.campaignState.learnedSkills.map((entry) => ({ ...entry, pool: "skills" })),
    ...adventurer.campaignState.learnedSpells.map((entry) => ({ ...entry, pool: "spells" }))
  ];

  return includeStartingBadge || !startingBadgeId
    ? entries
    : entries.filter((entry) => entry.id !== startingBadgeId);
}

function renderProgressEntries(adventurer, options = {}) {
  const { includeStartingBadge = true, emptyMessage = "No card-linked skills or spells marked." } = options;
  const entries = getProgressEntries(adventurer, { includeStartingBadge });

  if (!entries.length) {
    return emptyMessage ? `<p class="empty">${escapeHtml(emptyMessage)}</p>` : "";
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

function getRosterAdventurers() {
  const byId = new Map(state.adventurers.map((adventurer) => [adventurer.id, adventurer]));
  return [...state.party.memberIds, ...state.party.reserveIds]
    .map((id) => byId.get(id))
    .filter(Boolean);
}

function getAdventurer(id) {
  return state.adventurers.find((adventurer) => adventurer.id === id);
}

function getCharacterTemplate(id, sourceState = state) {
  return sourceState?.cardCatalog?.characterCards?.find((card) => card.id === id) ?? null;
}

function getAdventurerTemplateId(adventurer) {
  return adventurer?.profile?.templateId ?? adventurer?.id ?? null;
}

function getCharacterAsset(id, sourceState = state) {
  return sourceState?.cardCatalog?.assets?.find((asset) => asset.normalizedCardId === id) ?? null;
}

function getAvailableCharacterTemplates() {
  const usedTemplateIds = new Set(
    state.adventurers.map((adventurer) => getAdventurerTemplateId(adventurer)).filter(Boolean)
  );
  return (state.cardCatalog?.characterCards ?? []).filter((template) => !usedTemplateIds.has(template.id));
}

function getProfessionOptions() {
  const options = new Map();
  professionCatalog.forEach((profession) => {
    if (profession) {
      options.set(profession.toLowerCase(), profession);
    }
  });

  (state.cardCatalog?.referenceCards ?? []).forEach((card) => {
    if (card?.name) {
      options.set(card.name.toLowerCase(), card.name);
    }
  });

  state.adventurers.forEach((adventurer) => {
    const profession = getNormalizedProfessionValue(adventurer.profile.profession);
    if (profession) {
      options.set(profession.toLowerCase(), profession);
    }
  });

  return [...options.values()].sort((left, right) => left.localeCompare(right));
}

function getNormalizedProfessionValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || /^TODO:/i.test(normalized)) {
    return "";
  }

  return normalized;
}

function getDisplayProfession(adventurer) {
  return getNormalizedProfessionValue(adventurer.profile.profession) || "Profession unassigned";
}

function syncBuilderSelections() {
  const availableTemplates = getAvailableCharacterTemplates();
  const professions = getProfessionOptions();

  if (!availableTemplates.some((template) => template.id === ui.builderCharacterId)) {
    ui.builderCharacterId = availableTemplates[0]?.id ?? "";
  }

  if (!professions.includes(ui.builderProfession)) {
    ui.builderProfession = "";
  }

  if (!["active", "reserve"].includes(ui.builderPlacement)) {
    ui.builderPlacement = state?.party?.memberIds?.length < ACTIVE_PARTY_LIMIT ? "active" : "reserve";
  }
}

function isActiveRosterMember(adventurerId) {
  return state.party.memberIds.includes(adventurerId);
}

function getRosterLabel(adventurerId) {
  return isActiveRosterMember(adventurerId) ? "Active Party" : "Reserve";
}

function setAdventurerRosterState(adventurerId, rosterState) {
  const adventurer = getAdventurer(adventurerId);
  if (!adventurer) {
    return false;
  }

  const isActive = state.party.memberIds.includes(adventurerId);
  if (rosterState === "active" && !isActive && state.party.memberIds.length >= ACTIVE_PARTY_LIMIT) {
    return false;
  }

  state.party.memberIds = state.party.memberIds.filter((id) => id !== adventurerId);
  state.party.reserveIds = state.party.reserveIds.filter((id) => id !== adventurerId);

  if (rosterState === "active") {
    state.party.memberIds.push(adventurerId);
    adventurer.status = "active";
    return true;
  }

  state.party.reserveIds.push(adventurerId);
  adventurer.status = "reserve";
  return true;
}

function createAdventurerFromTemplate(templateId, profession, sourceState = state, forcedId = null) {
  const template = getCharacterTemplate(templateId, sourceState);
  if (!template) {
    throw new Error(`Character template ${templateId} was not found.`);
  }

  const asset = getCharacterAsset(template.id, sourceState);
  const capacities = clone(template.trackTemplate?.xpRowCapacities ?? []);
  const badge = template.startingBadge ? clone(template.startingBadge) : null;
  const learnedSkills = badge
    ? [{
      id: badge.id,
      name: badge.name,
      type: badge.type,
      level: badge.type === "skill" ? (badge.level ?? 1) : badge.level ?? null
    }]
    : [];

  return {
    id: forcedId ?? template.id,
    name: template.name,
    status: "reserve",
    profile: {
      templateId: template.id,
      species: template.species,
      profession,
      baseHealth: template.trackTemplate.health.baseValue,
      baseSkill: template.trackTemplate.skill.baseValue,
      baseMagic: template.trackTemplate.magic.baseValue,
      baseActions: template.trackTemplate.actions.baseValue,
      xpRank1: null,
      xpPotentialByRank: capacities,
      abilitySlots: [],
      image: asset?.previewImagePath ?? null
    },
    campaignState: {
      rank: 1,
      xpMarksByRow: capacities.map(() => 0),
      statIncreases: {
        health: 0,
        skill: 0,
        magic: 0,
        actions: 0
      },
      learnedSkills,
      learnedSpells: [],
      inventoryItemIds: [],
      armourItemIds: [],
      brokenItemIds: [],
      missedQuestCount: 0,
      participatedLastQuest: false,
      notes: `Added from ${template.name}'s imported character card.`
    },
    trackerState: {
      currentHealth: template.trackTemplate.health.baseValue,
      currentSkill: template.trackTemplate.skill.baseValue,
      currentMagic: template.trackTemplate.magic.baseValue,
      currentActions: template.trackTemplate.actions.baseValue,
      statusEffects: [],
      notes: ""
    }
  };
}

function mergeAdventurerRecord(currentState, fallback, incoming) {
  if (!incoming) {
    normalizeAdventurer(currentState, fallback);
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

  normalizeAdventurer(currentState, merged);
  return merged;
}

function getPrintedTrackCapacity(adventurer, track, sourceState = state) {
  return getCharacterTemplate(getAdventurerTemplateId(adventurer), sourceState)?.trackTemplate?.[track]?.maxValue
    ?? getMaxTrack(adventurer, track);
}

function getXpCapacities(adventurer, sourceState = state) {
  return adventurer.profile.xpPotentialByRank
    ?? getCharacterTemplate(getAdventurerTemplateId(adventurer), sourceState)?.trackTemplate?.xpRowCapacities
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
  adventurer.profile.templateId = adventurer.profile.templateId ?? adventurer.id;
  adventurer.profile.profession = getNormalizedProfessionValue(adventurer.profile.profession) || null;
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

function normalizePartyRoster(currentState) {
  const adventurerById = new Map(currentState.adventurers.map((adventurer) => [adventurer.id, adventurer]));
  const seen = new Set();

  const memberIds = currentState.party.memberIds.filter((id) => {
    if (seen.has(id) || !adventurerById.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });

  const reserveIds = currentState.party.reserveIds.filter((id) => {
    if (seen.has(id) || !adventurerById.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });

  currentState.adventurers.forEach((adventurer) => {
    if (seen.has(adventurer.id)) {
      return;
    }

    if (adventurer.status === "active" && memberIds.length < ACTIVE_PARTY_LIMIT) {
      memberIds.push(adventurer.id);
      seen.add(adventurer.id);
      return;
    }

    reserveIds.push(adventurer.id);
    adventurer.status = "reserve";
    seen.add(adventurer.id);
  });

  while (memberIds.length > ACTIVE_PARTY_LIMIT) {
    const movedId = memberIds.pop();
    reserveIds.unshift(movedId);
  }

  memberIds.forEach((id) => {
    const adventurer = adventurerById.get(id);
    if (adventurer) {
      adventurer.status = "active";
    }
  });

  reserveIds.forEach((id) => {
    const adventurer = adventurerById.get(id);
    if (adventurer && adventurer.status === "active") {
      adventurer.status = "reserve";
    }
  });

  currentState.party.memberIds = memberIds;
  currentState.party.reserveIds = reserveIds;
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
  const rosterAdventurers = getRosterAdventurers();

  for (const adventurer of rosterAdventurers) {
    const template = getCharacterTemplate(getAdventurerTemplateId(adventurer));
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

function getTrackChipLabel(track) {
  return {
    health: "HP",
    skill: "Skill",
    magic: "Magic",
    actions: "Act"
  }[track] ?? formatLabel(track);
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
