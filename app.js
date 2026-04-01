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

const PROFESSION_NAME_ALIASES = {
  prymorist: "Primorist",
  primorist: "Primorist"
};

const GLOBAL_SKILL_ID_ALIASES = {
  countershot: "countershot",
  countershotskill: "countershot"
};

const PROFESSION_SCOPED_SKILL_ID_ALIASES = {
  "sellsword:countershot": "countershot"
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
    if (Array.isArray(overview?.professionBoards)) {
      return clone(overview.professionBoards);
    }

    if (Array.isArray(overview?.summary?.uniqueProfessions)) {
      return overview.summary.uniqueProfessions.map((profession) => ({
        profession,
        boardCode: null,
        skills: []
      }));
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

  if (target.closest("summary")) {
    event.preventDefault();
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
    const clampedValue = clamp(nextValue, 0, cap);
    const nextMarks = clone(adventurer.campaignState.xpMarksByRow);
    nextMarks[row] = clampedValue;

    if (!canApplyXpMarks(adventurer, nextMarks)) {
      return;
    }

    adventurer.campaignState.xpMarksByRow[row] = clampedValue;
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

    const currentLevel = entry.level ?? 1;
    const minLevel = getSkillMinimumLevel(adventurer, id);
    const maxLevel = getSkillMaxLevel(adventurer, id);

    if (amount > 0) {
      if (getProgressionState(adventurer).xpPending <= 0 || currentLevel >= maxLevel) {
        return;
      }

      entry.level = clamp(currentLevel + amount, Math.max(1, minLevel || 1), maxLevel);
      commit();
      return;
    }

    if (currentLevel === 1 && minLevel === 0) {
      const index = pool.indexOf(entry);
      if (index !== -1) {
        pool.splice(index, 1);
        commit();
      }
      return;
    }

    if (currentLevel > minLevel) {
      entry.level = currentLevel - 1;
      commit();
      return;
    }

    return;
  }

  if (action === "learn-board-skill") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    const skillId = target.dataset.skillId;
    const skillName = target.dataset.skillName;

    if (!adventurer || !canLearnBoardSkill(adventurer, skillId)) {
      return;
    }

    adventurer.campaignState.learnedSkills.push({
      id: skillId,
      name: skillName,
      type: "skill",
      level: 1
    });
    commit();
    return;
  }

  if (action === "learn-spell") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    const spellId = target.dataset.spellId;
    const spellName = target.dataset.spellName;

    if (!adventurer || !canLearnSpell(adventurer, spellId)) {
      return;
    }

    adventurer.campaignState.learnedSpells.push({
      id: spellId,
      name: spellName,
      type: "spell",
      level: null
    });
    commit();
    return;
  }

  if (action === "remove-ability") {
    const adventurer = getAdventurer(target.dataset.adventurerId);
    const pool = target.dataset.pool === "spells"
      ? adventurer?.campaignState.learnedSpells
      : adventurer?.campaignState.learnedSkills;
    const id = target.dataset.abilityId;
    if (!adventurer || !pool) {
      return;
    }

    const entryIndex = pool.findIndex((entry) => entry.id === id);
    if (entryIndex === -1) {
      return;
    }

    pool.splice(entryIndex, 1);
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
    ui.builderProfession = "";
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
  const cardRewardChoices = renderCardRewardChoices(adventurer);
  const showCardProgressDock = Boolean(cardRewardChoices || cardProgressEntries.length > 0);
  const skillBoardPanel = renderSkillBoardPanel(adventurer);

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
              ${cardRewardChoices}
              ${cardProgressEntries.length ? `
              <div class="level-dock">
                ${renderProgressEntries(adventurer, { includeStartingBadge: false, emptyMessage: "" })}
              </div>
              ` : ""}
            </div>
            ` : ""}
          </div>
        </div>

        ${skillBoardPanel}

        <div class="slide-tools panel">
        <div class="section-head compact">
          <h4>${escapeHtml(adventurer.profile.species)} · ${escapeHtml(getDisplayProfession(adventurer))}</h4>
          <p>Rank ${adventurer.campaignState.rank} · ${escapeHtml(rosterLabel)}</p>
        </div>
        <p class="progress-note${progressionState.xpOverspent ? " is-warning" : ""}">${escapeHtml(renderXpAllocationSummary(progressionState))}</p>
        <details class="tool-drawer">
          <summary>Progression</summary>
          <div class="bonus-dock">
            ${["health", "skill", "magic", "actions"].map((track) => renderBonusChip(adventurer, track, false)).join("")}
          </div>
          <p class="progress-note">${escapeHtml(renderProgressSummary(progressionState))}</p>
          <div class="drawer-section">
            <div class="drawer-section-head">
              <strong>Learned</strong>
              <span>${escapeHtml(String(getProgressEntries(adventurer).length))}</span>
            </div>
            <div class="level-dock drawer-level-dock">
              ${renderProgressEntries(adventurer, { emptyMessage: "No learned skills or spells yet." })}
            </div>
          </div>
        </details>
        <details class="tool-drawer">
          <summary>Spells</summary>
          ${renderSpellBoard(adventurer)}
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

function renderSkillBoardPanel(adventurer) {
  const profession = getNormalizedProfessionValue(adventurer.profile.profession);
  const referenceCard = getProfessionReferenceCard(profession);
  const previewPath = referenceCard ? resolveAssetPath(getCardPreviewImagePath(referenceCard)) : null;

  return `
    <section class="skill-board-panel panel">
      <div class="drawer-section-head">
        <strong>Skill Board</strong>
        <span>${escapeHtml(getProfessionBoardLabel(adventurer))}</span>
      </div>
      ${previewPath
        ? `
        <div class="skill-board-preview">
          <img
            class="skill-board-preview-art"
            src="${escapeAttribute(previewPath)}"
            alt="${escapeAttribute(`${profession} skill board`)}"
          >
        </div>
      `
        : ""}
      ${profession
        ? `<p class="progress-note">Tap a skill below to open its rules. Use the + control to spend XP when a rank is available.</p>`
        : ""}
      ${renderClassBoard(adventurer)}
    </section>
  `;
}

function renderTeamBuilder() {
  const roster = getRosterAdventurers();
  const availableTemplates = getAvailableCharacterTemplates();
  const professionOptions = getProfessionOptions();
  const activeCount = state.party.memberIds.length;
  const reserveCount = state.party.reserveIds.length;
  const partyFull = activeCount >= ACTIVE_PARTY_LIMIT;
  const canAddAsActive = ui.builderPlacement !== "active" || !partyFull;
  const addDisabled = !ui.builderCharacterId || !getNormalizedProfessionValue(ui.builderProfession) || !canAddAsActive;
  const characterPreview = ui.builderCharacterId ? renderCharacterPreview(ui.builderCharacterId) : "";
  const professionPreview = ui.builderProfession ? renderProfessionPreview(ui.builderProfession) : "";

  return `
    <section class="team-builder panel">
      <div class="section-head">
        <div>
          <h2>Team Builder</h2>
          <p>${roster.length ? `${activeCount}/${ACTIVE_PARTY_LIMIT} active · ${reserveCount} reserve` : "Choose your first hero and then their profession."}</p>
        </div>
        <span class="team-summary">${roster.length} tracked</span>
      </div>

      <div class="builder-grid${partyFull ? "" : " builder-grid-compact"}">
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
        ${partyFull ? `
        <label class="field">
          <span>Join As</span>
          <select data-role="builder-field" data-field="builderPlacement">
            <option value="active" ${ui.builderPlacement === "active" ? "selected" : ""}>Active Party</option>
            <option value="reserve" ${ui.builderPlacement === "reserve" ? "selected" : ""}>Reserve</option>
          </select>
        </label>
        ` : ""}
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
      ${partyFull && ui.builderPlacement === "active"
        ? `<p class="progress-note">The active party is full. New recruits can still be added to the reserve.</p>`
        : ""}

      ${(characterPreview || professionPreview)
        ? `
        <div class="builder-preview-stack">
          ${characterPreview}
          ${professionPreview}
        </div>
      `
        : ""}

      <div class="roster-list">
        ${roster.map(renderRosterCard).join("")}
      </div>
    </section>
  `;
}

function renderCharacterPreview(characterId) {
  const template = getCharacterTemplate(characterId);
  if (!template) {
    return "";
  }

  const asset = getCharacterAsset(template.id);
  const imagePath = resolveAssetPath(asset?.previewImagePath);
  const badge = template.startingBadge;
  const t = template.trackTemplate;

  return `
    <div class="builder-preview">
      ${imagePath ? `<img class="builder-preview-thumb" src="${escapeAttribute(imagePath)}" alt="${escapeAttribute(template.name)}">` : ""}
      <div class="builder-preview-stats">
        <strong>${escapeHtml(template.name)}</strong>
        <span>${escapeHtml(template.species)}</span>
        <div class="builder-preview-tracks">
          <span title="Health">H ${t.health.baseValue}</span>
          <span title="Skill">S ${t.skill.baseValue}</span>
          <span title="Magic">M ${t.magic.baseValue}</span>
          <span title="Actions">A ${t.actions.baseValue}</span>
        </div>
        ${badge ? `<span class="builder-preview-badge">${escapeHtml(badge.name)}</span>` : ""}
      </div>
    </div>
  `;
}

function renderProfessionPreview(professionName) {
  const profession = getNormalizedProfessionValue(professionName);
  if (!profession) {
    return "";
  }

  const board = getProfessionBoard(profession);
  const spellCard = getSpellCardForProfession(profession);

  if (!board && !spellCard) {
    return `
      <div class="builder-preview builder-preview-board">
        <div class="builder-preview-board-head">
          <div class="builder-preview-stats">
            <strong>${escapeHtml(profession)}</strong>
            <span>No imported board preview available yet.</span>
          </div>
        </div>
      </div>
    `;
  }

  const boardSkills = board?.skills ?? [];
  const specialNotes = [...(board?.specials ?? [])];
  if (spellCard?.abilities?.length) {
    specialNotes.push(`Spell board available · ${spellCard.abilities.length} spells`);
  }

  return `
    <div class="builder-preview builder-preview-board">
      <div class="builder-preview-board-head">
        <div class="builder-preview-stats">
          <strong>${escapeHtml(profession)}</strong>
          <span>${escapeHtml(board?.boardCode ? `Board ${board.boardCode}` : "Profession board preview")}</span>
        </div>
        <span class="builder-preview-chip">${boardSkills.length} skills</span>
      </div>
      ${boardSkills.length
        ? `
        <div class="builder-board-preview-grid">
          ${boardSkills.map((skill) => renderProfessionPreviewSkill(skill)).join("")}
        </div>
      `
        : `<p class="empty">No imported skill board data is available for ${escapeHtml(profession)}.</p>`}
      ${specialNotes.length
        ? `
        <div class="builder-preview-notes">
          ${specialNotes.map((note) => `<span class="builder-preview-chip">${escapeHtml(note)}</span>`).join("")}
        </div>
      `
        : ""}
    </div>
  `;
}

function renderProfessionPreviewSkill(skill) {
  const totalAvailablePips = getBoardSkillPipCount(skill);
  return `
    <div class="builder-board-skill">
      <span class="builder-board-skill-name">${escapeHtml(skill.name)}</span>
      <div class="board-skill-pips" aria-hidden="true">
        ${renderBoardSkillPips(totalAvailablePips, 0, totalAvailablePips)}
      </div>
    </div>
  `;
}

function renderRosterCard(adventurer) {
  const active = isActiveRosterMember(adventurer.id);
  const canPromote = active || state.party.memberIds.length < ACTIVE_PARTY_LIMIT;
  const profession = getNormalizedProfessionValue(adventurer.profile.profession) || "Unassigned";

  return `
    <details class="roster-drawer">
      <summary class="roster-summary">
        <div class="roster-summary-info">
          <strong>${escapeHtml(adventurer.name)}</strong>
          <span class="roster-summary-detail">${escapeHtml(`${profession} · ${getRosterLabel(adventurer.id)}`)}</span>
        </div>
        <button class="entry-link roster-open" data-action="jump-adventurer" data-adventurer-id="${adventurer.id}">
          Open
        </button>
      </summary>
      <div class="roster-drawer-body">
        <label class="field field-inline">
          <span>Profession</span>
          <select data-role="profession-field" data-adventurer-id="${adventurer.id}">
            <option value="">Unassigned</option>
            ${getProfessionOptions().map((p) => `
              <option
                value="${escapeAttribute(p)}"
                ${getNormalizedProfessionValue(adventurer.profile.profession) === p ? "selected" : ""}
              >
                ${escapeHtml(p)}
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
    </details>
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

function renderCardRewardChoices(adventurer) {
  const selectableTracks = ["health", "skill", "magic", "actions"].filter((track) => canIncreaseStat(adventurer, track));
  if (!selectableTracks.length) {
    return "";
  }

  return `
    <div class="reward-choice-grid">
      ${selectableTracks.map((track) => `
        <button
          class="reward-choice"
          data-action="adjust-bonus"
          data-adventurer-id="${adventurer.id}"
          data-track="${track}"
          data-amount="1"
        >
          ${escapeHtml(`${getTrackChipLabel(track)} +1`)}
        </button>
      `).join("")}
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

    let controls = `<span class="entry-tag">${entry.type}</span>`;
    if (entry.type === "skill") {
      const canDecrease = canDecreaseAbilityLevel(adventurer, entry);
      const canIncrease = canIncreaseAbilityLevel(adventurer, entry);
      controls = `
        <div class="level-controls">
          <button
            class="mini-step"
            data-action="adjust-ability-level"
            data-adventurer-id="${adventurer.id}"
            data-ability-id="${entry.id}"
            data-pool="${entry.pool}"
            data-amount="-1"
            ${canDecrease ? "" : "disabled"}
          >-</button>
          <strong>${level ?? 1}</strong>
          <button
            class="mini-step"
            data-action="adjust-ability-level"
            data-adventurer-id="${adventurer.id}"
            data-ability-id="${entry.id}"
            data-pool="${entry.pool}"
            data-amount="1"
            ${canIncrease ? "" : "disabled"}
          >+</button>
        </div>
      `;
    } else if (entry.pool === "spells") {
      controls = `
        <button
          class="mini-step"
          data-action="remove-ability"
          data-adventurer-id="${adventurer.id}"
          data-ability-id="${entry.id}"
          data-pool="${entry.pool}"
          aria-label="Remove ${escapeAttribute(label)}"
          title="Remove ${escapeAttribute(label)}"
        >&times;</button>
      `;
    }

    return `
      <div class="progress-entry">
        <button class="entry-link" data-action="select-reference" data-reference-id="${entry.id}">
          ${escapeHtml(label)}
        </button>
        ${controls}
      </div>
    `;
  }).join("");
}

function renderClassBoard(adventurer) {
  const profession = getNormalizedProfessionValue(adventurer.profile.profession);
  if (!profession) {
    return `<p class="empty">Assign a profession to see available skills.</p>`;
  }

  const board = getProfessionBoard(profession);
  if (!board?.skills?.length) {
    return `<p class="empty">No board data available for ${escapeHtml(profession)}.</p>`;
  }

  return `
    <div class="board-skill-grid">
      ${board.skills.map((skill) => renderBoardSkillTile(adventurer, board, skill)).join("")}
    </div>
  `;
}

function renderBoardSkillTile(adventurer, board, skill) {
  const skillId = normalizeSkillId(skill.name, board.profession, state);
  const learnedEntry = adventurer.campaignState.learnedSkills.find((entry) => entry.id === skillId) ?? null;
  const totalAvailablePips = getBoardSkillPipCount(skill);
  const maxLevel = getSkillMaxLevel(adventurer, skillId, totalAvailablePips);
  const currentLevel = learnedEntry?.type === "skill" ? (learnedEntry.level ?? 1) : 0;
  const unlockedPips = Math.min(totalAvailablePips, adventurer.campaignState.rank);
  const hasReference = Boolean(getReferenceEntry(skillId));

  let actionMarkup = `<span class="board-skill-meta">${escapeHtml(learnedEntry ? "Known" : "Need XP")}</span>`;
  if (!learnedEntry) {
    actionMarkup = `
      <button
        class="mini-step board-action-btn"
        data-action="learn-board-skill"
        data-adventurer-id="${adventurer.id}"
        data-skill-id="${skillId}"
        data-skill-name="${escapeAttribute(skill.name)}"
        aria-label="Learn ${escapeAttribute(skill.name)}"
        title="Learn ${escapeAttribute(skill.name)}"
        ${canLearnBoardSkill(adventurer, skillId) ? "" : "disabled"}
      >+</button>
    `;
  } else if (learnedEntry.type === "skill" && canIncreaseAbilityLevel(adventurer, learnedEntry)) {
    actionMarkup = `
      <button
        class="mini-step board-action-btn"
        data-action="adjust-ability-level"
        data-adventurer-id="${adventurer.id}"
        data-ability-id="${skillId}"
        data-pool="skills"
        data-amount="1"
        aria-label="Increase ${escapeAttribute(skill.name)}"
        title="Increase ${escapeAttribute(skill.name)}"
      >+</button>
    `;
  } else if (learnedEntry.type === "skill") {
    actionMarkup = `<span class="board-skill-meta">Rank ${currentLevel}/${maxLevel}</span>`;
  } else {
    actionMarkup = `<span class="board-skill-meta">Granted</span>`;
  }

  return `
    <div class="board-skill-tile">
      ${hasReference
        ? `<button class="entry-link board-skill-link" data-action="select-reference" data-reference-id="${skillId}">${escapeHtml(skill.name)}</button>`
        : `<div class="board-skill-link board-skill-link-static">${escapeHtml(skill.name)}</div>`}
      <div class="board-skill-pips" aria-hidden="true">
        ${renderBoardSkillPips(totalAvailablePips, currentLevel, unlockedPips)}
      </div>
      <div class="board-skill-action">
        ${actionMarkup}
      </div>
    </div>
  `;
}

function renderSpellBoard(adventurer) {
  const profession = getNormalizedProfessionValue(adventurer.profile.profession);
  if (!profession) {
    return `<p class="empty">Assign a profession to see available spells.</p>`;
  }

  const spellCard = getSpellCardForProfession(profession);
  if (!spellCard?.abilities?.length) {
    return `<p class="empty">No spell board data available for ${escapeHtml(profession)}.</p>`;
  }

  return `
    <div class="drawer-section">
      <div class="drawer-section-head">
        <strong>${escapeHtml(spellCard.name)}</strong>
        <span>${escapeHtml(`Rank ${adventurer.campaignState.rank}`)}</span>
      </div>
      <div class="board-skill-grid spell-grid">
        ${spellCard.abilities.map((spell) => renderSpellTile(adventurer, spell)).join("")}
      </div>
    </div>
  `;
}

function renderSpellTile(adventurer, spell) {
  const reference = getReferenceEntry(spell.id);
  const learned = adventurer.campaignState.learnedSpells.some((entry) => entry.id === spell.id);
  const requiredRank = reference?.level ?? 1;
  const canLearn = canLearnSpell(adventurer, spell.id);

  let actionMarkup = `<span class="board-skill-meta">${escapeHtml(requiredRank > adventurer.campaignState.rank ? `Rank ${requiredRank}` : "Need XP")}</span>`;
  if (learned) {
    actionMarkup = `
      <button
        class="mini-step"
        data-action="remove-ability"
        data-adventurer-id="${adventurer.id}"
        data-ability-id="${spell.id}"
        data-pool="spells"
        aria-label="Remove ${escapeAttribute(spell.name)}"
        title="Remove ${escapeAttribute(spell.name)}"
      >&times;</button>
    `;
  } else if (canLearn) {
    actionMarkup = `
      <button
        class="reward-choice board-learn-btn"
        data-action="learn-spell"
        data-adventurer-id="${adventurer.id}"
        data-spell-id="${spell.id}"
        data-spell-name="${escapeAttribute(spell.name)}"
      >Learn</button>
    `;
  }

  return `
    <div class="board-skill-tile spell-tile">
      <button class="entry-link board-skill-link" data-action="select-reference" data-reference-id="${spell.id}">
        ${escapeHtml(spell.name)}
      </button>
      <div class="spell-meta-row">
        <span class="board-skill-meta">${escapeHtml(`Spell ${requiredRank}`)}</span>
        ${learned ? '<span class="entry-tag">learned</span>' : ""}
      </div>
      <div class="board-skill-action">
        ${actionMarkup}
      </div>
    </div>
  `;
}

function renderBoardSkillPips(totalAvailablePips, currentLevel = 0, unlockedPips = totalAvailablePips) {
  return Array.from({ length: totalAvailablePips }, (_, index) => {
    const classes = [
      "board-skill-pip",
      index < currentLevel ? "is-filled" : "",
      index >= currentLevel && index < unlockedPips ? "is-open" : "",
      index >= unlockedPips ? "is-locked" : ""
    ].filter(Boolean).join(" ");
    return `<span class="${classes}"></span>`;
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

function getAllReferenceEntries(sourceState = state) {
  return [
    ...(sourceState?.referenceLibrary?.skills ?? []),
    ...(sourceState?.referenceLibrary?.spells ?? []),
    ...(sourceState?.referenceLibrary?.abilities ?? [])
  ];
}

function getReferenceEntry(id, sourceState = state) {
  if (!id) {
    return null;
  }

  return getAllReferenceEntries(sourceState).find((entry) => entry.id === id) ?? null;
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
  professionCatalog.forEach((board) => {
    const profession = getNormalizedProfessionValue(board?.profession);
    if (profession) {
      options.set(getLooseKey(profession), profession);
    }
  });

  (state.cardCatalog?.referenceCards ?? []).forEach((card) => {
    const profession = getNormalizedProfessionValue(card?.name);
    if (profession) {
      options.set(getLooseKey(profession), profession);
    }
  });

  state.adventurers.forEach((adventurer) => {
    const profession = getNormalizedProfessionValue(adventurer.profile.profession);
    if (profession) {
      options.set(getLooseKey(profession), profession);
    }
  });

  return [...options.values()].sort((left, right) => left.localeCompare(right));
}

function getNormalizedProfessionValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || /^TODO:/i.test(normalized)) {
    return "";
  }

  return PROFESSION_NAME_ALIASES[getLooseKey(normalized)] ?? normalized;
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

  if (state?.party?.memberIds?.length < ACTIVE_PARTY_LIMIT) {
    ui.builderPlacement = "active";
  } else if (!["active", "reserve"].includes(ui.builderPlacement)) {
    ui.builderPlacement = "reserve";
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

function getDerivedRankFromMarks(adventurer, marks, sourceState = state) {
  const rowsWithMarks = getXpCapacities(adventurer, sourceState)
    .filter((_, index) => (marks[index] ?? 0) > 0)
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
  const xpMarked = getTotalMarkedXp(adventurer);
  const xpSpent = getSpentXpAllocations(adventurer, sourceState);
  const xpOverspent = Math.max(0, xpSpent - xpMarked);

  return {
    completedRows,
    rank: getDerivedRank(adventurer, sourceState),
    earlyPicks,
    latePicks,
    totalPicks,
    totalUsed,
    totalRemaining: Math.max(0, totalPicks - totalUsed),
    lateRemaining: Math.max(0, latePicks - lateUsed),
    xpMarked,
    xpSpent,
    xpPending: Math.max(0, xpMarked - xpSpent),
    xpOverspent
  };
}

function getTotalMarkedXp(adventurer) {
  return (adventurer.campaignState.xpMarksByRow ?? []).reduce((total, mark) => total + (mark ?? 0), 0);
}

function getSpentXpAllocations(adventurer, sourceState = state) {
  const startingBadge = getCharacterTemplate(getAdventurerTemplateId(adventurer), sourceState)?.startingBadge ?? null;
  const skillSpend = adventurer.campaignState.learnedSkills.reduce((total, entry) => {
    if (entry.type !== "skill") {
      return total;
    }

    const baseLevel = startingBadge?.type === "skill" && startingBadge.id === entry.id
      ? startingBadge.level ?? 1
      : 0;
    return total + Math.max(0, (entry.level ?? 1) - baseLevel);
  }, 0);

  return skillSpend + adventurer.campaignState.learnedSpells.length;
}

function canApplyXpMarks(adventurer, nextMarks, sourceState = state) {
  const nextTotalMarkedXp = nextMarks.reduce((total, mark) => total + (mark ?? 0), 0);
  if (nextTotalMarkedXp < getSpentXpAllocations(adventurer, sourceState)) {
    return false;
  }

  const nextRank = getDerivedRankFromMarks(adventurer, nextMarks, sourceState);

  for (const entry of adventurer.campaignState.learnedSkills) {
    if (entry.type !== "skill") {
      continue;
    }

    const maxLevel = Math.max(
      getSkillMinimumLevel(adventurer, entry.id, sourceState),
      Math.min(getBoardSkills(adventurer, sourceState).find((skill) => skill.id === entry.id)?.totalAvailablePips ?? 3, nextRank)
    );
    if ((entry.level ?? 1) > maxLevel) {
      return false;
    }
  }

  for (const spell of adventurer.campaignState.learnedSpells) {
    const requiredRank = getReferenceEntry(spell.id, sourceState)?.level ?? 1;
    if (nextRank < requiredRank) {
      return false;
    }
  }

  const nextProgression = getProgressionState(
    {
      ...adventurer,
      campaignState: {
        ...adventurer.campaignState,
        xpMarksByRow: nextMarks
      }
    },
    sourceState
  );
  const actionUsed = adventurer.campaignState.statIncreases.actions;
  const nonActionUsed =
    adventurer.campaignState.statIncreases.health
    + adventurer.campaignState.statIncreases.skill
    + adventurer.campaignState.statIncreases.magic;

  if (actionUsed > nextProgression.latePicks) {
    return false;
  }

  return nonActionUsed <= (nextProgression.totalPicks - actionUsed);
}

function renderXpAllocationSummary(progressionState) {
  if (progressionState.xpOverspent > 0) {
    return `XP overspent by ${progressionState.xpOverspent}. Re-add XP or remove learned choices.`;
  }

  if (progressionState.xpPending > 0) {
    return `${progressionState.xpPending} XP ready to allocate to skills or spells.`;
  }

  if (progressionState.xpMarked > 0) {
    return "All marked XP is currently allocated.";
  }

  return "Mark XP to learn or improve skills and spells.";
}

function getProfessionBoard(professionName) {
  const profession = getNormalizedProfessionValue(professionName);
  if (!profession) {
    return null;
  }

  const key = getLooseKey(profession);
  return professionCatalog.find((board) => getLooseKey(board?.profession) === key) ?? null;
}

function getProfessionBoardLabel(adventurer) {
  const board = getProfessionBoard(adventurer.profile.profession);
  if (!board?.profession) {
    return "No board";
  }

  return board.boardCode ? `${board.profession} ${board.boardCode}` : board.profession;
}

function getSpellCardForProfession(professionName) {
  const profession = getNormalizedProfessionValue(professionName);
  if (!profession) {
    return null;
  }

  const key = getLooseKey(profession);
  return (state.cardCatalog?.referenceCards ?? []).find((card) =>
    card.kind === "spell-card" && getLooseKey(card.name) === key
  ) ?? null;
}

function getProfessionReferenceCard(professionName) {
  const profession = getNormalizedProfessionValue(professionName);
  if (!profession) {
    return null;
  }

  const key = getLooseKey(profession);
  return (state.cardCatalog?.referenceCards ?? []).find((card) =>
    card.kind === "profession" && getLooseKey(card.name) === key
  ) ?? null;
}

function getCardPreviewImagePath(card) {
  if (!card?.sourceAssetIds?.length) {
    return null;
  }

  const assetId = card.sourceAssetIds[0];
  const asset = (state.cardCatalog?.assets ?? []).find((entry) => entry.id === assetId) ?? null;
  return asset?.previewImagePath ?? null;
}

function normalizeSkillId(skillName, professionName = "", sourceState = state) {
  const professionKey = getLooseKey(professionName);
  const skillKey = getLooseKey(skillName);
  const scopedAlias = PROFESSION_SCOPED_SKILL_ID_ALIASES[`${professionKey}:${skillKey}`];
  if (scopedAlias) {
    return scopedAlias;
  }

  const globalAlias = GLOBAL_SKILL_ID_ALIASES[skillKey];
  if (globalAlias) {
    return globalAlias;
  }

  const reference = getAllReferenceEntries(sourceState).find((entry) =>
    getLooseKey(entry.id) === skillKey || getLooseKey(entry.name) === skillKey
  );

  return reference?.id ?? toKebabCase(skillName);
}

function getBoardSkillPipCount(skill) {
  return Number.isFinite(skill?.totalAvailablePips) ? skill.totalAvailablePips : 3;
}

function getBoardSkills(adventurer, sourceState = state) {
  const board = getProfessionBoard(adventurer.profile.profession);
  if (!board?.skills?.length) {
    return [];
  }

  return board.skills.map((skill) => {
    const id = normalizeSkillId(skill.name, board.profession, sourceState);
    return {
      ...skill,
      id,
      totalAvailablePips: getBoardSkillPipCount(skill),
      hasReference: Boolean(getReferenceEntry(id, sourceState))
    };
  });
}

function getAvailableBoardSkills(adventurer, sourceState = state) {
  const learnedIds = new Set(adventurer.campaignState.learnedSkills.map((entry) => entry.id));
  return getBoardSkills(adventurer, sourceState).filter((skill) => !learnedIds.has(skill.id));
}

function getSkillMinimumLevel(adventurer, skillId, sourceState = state) {
  const startingBadge = getCharacterTemplate(getAdventurerTemplateId(adventurer), sourceState)?.startingBadge;
  if (startingBadge?.type === "skill" && startingBadge.id === skillId) {
    return startingBadge.level ?? 1;
  }

  return 0;
}

function getSkillMaxLevel(adventurer, skillId, fallbackPipCount = 3, sourceState = state) {
  const boardSkill = getBoardSkills(adventurer, sourceState).find((skill) => skill.id === skillId);
  const totalAvailablePips = boardSkill?.totalAvailablePips ?? fallbackPipCount;
  return Math.max(
    getSkillMinimumLevel(adventurer, skillId, sourceState),
    Math.min(totalAvailablePips, getDerivedRank(adventurer, sourceState))
  );
}

function canIncreaseAbilityLevel(adventurer, entry) {
  if (entry.type !== "skill") {
    return false;
  }

  const progressionState = getProgressionState(adventurer);
  if (progressionState.xpPending <= 0 || progressionState.xpOverspent > 0) {
    return false;
  }

  return (entry.level ?? 1) < getSkillMaxLevel(adventurer, entry.id);
}

function canDecreaseAbilityLevel(adventurer, entry) {
  if (entry.type !== "skill") {
    return false;
  }

  const currentLevel = entry.level ?? 1;
  return currentLevel > getSkillMinimumLevel(adventurer, entry.id);
}

function canLearnBoardSkill(adventurer, skillId) {
  const progressionState = getProgressionState(adventurer);
  if (progressionState.xpPending <= 0 || progressionState.xpOverspent > 0) {
    return false;
  }

  if (adventurer.campaignState.learnedSkills.some((entry) => entry.id === skillId)) {
    return false;
  }

  return getSkillMaxLevel(adventurer, skillId) >= 1;
}

function canLearnSpell(adventurer, spellId) {
  const progressionState = getProgressionState(adventurer);
  if (progressionState.xpPending <= 0 || progressionState.xpOverspent > 0) {
    return false;
  }

  if (adventurer.campaignState.learnedSpells.some((entry) => entry.id === spellId)) {
    return false;
  }

  const requiredRank = getReferenceEntry(spellId)?.level ?? 1;
  return progressionState.rank >= requiredRank;
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
  adventurer.campaignState.learnedSkills = normalizeLearnedSkills(adventurer, currentState);
  adventurer.campaignState.learnedSpells = normalizeLearnedSpells(adventurer);
  normalizeStatIncreases(currentState, adventurer);

  clampTrackerState(adventurer);

  adventurer.trackerState.statusEffects = adventurer.trackerState.statusEffects.filter((effect, index, values) =>
    STATUS_EFFECTS.includes(effect) && values.indexOf(effect) === index
  );
}

function normalizeLearnedSkills(adventurer, sourceState = state) {
  const seen = new Set();
  return (adventurer.campaignState.learnedSkills ?? []).reduce((skills, entry) => {
    if (!entry?.id || seen.has(entry.id)) {
      return skills;
    }

    seen.add(entry.id);
    if (entry.type !== "skill") {
      skills.push({
        id: entry.id,
        name: entry.name ?? formatLabel(entry.id),
        type: entry.type ?? "ability",
        level: entry.level ?? null
      });
      return skills;
    }

    const minimumLevel = Math.max(1, getSkillMinimumLevel(adventurer, entry.id, sourceState) || 1);
    skills.push({
      id: entry.id,
      name: entry.name ?? formatLabel(entry.id),
      type: "skill",
      level: clamp(entry.level ?? 1, minimumLevel, Math.max(minimumLevel, getSkillMaxLevel(adventurer, entry.id, 3, sourceState)))
    });
    return skills;
  }, []);
}

function normalizeLearnedSpells(adventurer) {
  const seen = new Set();
  return (adventurer.campaignState.learnedSpells ?? []).reduce((spells, entry) => {
    if (!entry?.id || seen.has(entry.id)) {
      return spells;
    }

    seen.add(entry.id);
    spells.push({
      id: entry.id,
      name: entry.name ?? formatLabel(entry.id),
      type: "spell",
      level: null
    });
    return spells;
  }, []);
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

function getLooseKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toKebabCase(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
