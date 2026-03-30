from __future__ import annotations

import socketserver
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


ROOT = Path(__file__).resolve().parents[1]
PORT = 4173
STORAGE_KEY = "maladum-webapp-state-v2"


class QuietHandler(SimpleHTTPRequestHandler):
    def handle(self) -> None:
        try:
            super().handle()
        except ConnectionResetError:
            return

    def log_message(self, format: str, *args: object) -> None:
        return


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def find_browser() -> str:
    candidates = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    raise FileNotFoundError("Chrome or Edge was not found in the standard install locations.")


def start_server() -> ReusableTCPServer:
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ReusableTCPServer(("127.0.0.1", PORT), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def load_state(driver: webdriver.Chrome) -> dict:
    return driver.execute_script(
        "return JSON.parse(window.localStorage.getItem(arguments[0]));",
        STORAGE_KEY,
    )


def get_adventurer_state(driver: webdriver.Chrome, adventurer_id: str) -> dict:
    state = load_state(driver)
    return next(
        adventurer
        for adventurer in state["adventurers"]
        if adventurer["id"] == adventurer_id
    )


def count_current_pips(driver: webdriver.Chrome, adventurer_id: str, track: str) -> int:
    return len(
        driver.find_elements(
            By.CSS_SELECTOR,
            (
                f'article.card-slide[data-adventurer-id="{adventurer_id}"] '
                f'.pip-hotspot[data-track="{track}"].is-current'
            ),
        )
    )


def count_marked_xp(driver: webdriver.Chrome, adventurer_id: str, row: int) -> int:
    return len(
        driver.find_elements(
            By.CSS_SELECTOR,
            (
                f'article.card-slide[data-adventurer-id="{adventurer_id}"] '
                f'.xp-hotspot[data-row="{row}"].is-marked'
            ),
        )
    )


def count_character_slides(driver: webdriver.Chrome) -> int:
    return len(driver.find_elements(By.CSS_SELECTOR, "article.card-slide[data-adventurer-id]"))


def focus_slide(driver: webdriver.Chrome, adventurer_id: str) -> None:
    selector = f'article.card-slide[data-adventurer-id="{adventurer_id}"]'
    driver.execute_script(
        """
        document.querySelector(arguments[0]).scrollIntoView({
            behavior: "instant",
            block: "nearest",
            inline: "center"
        });
        """,
        selector,
    )


def click_slide_element(driver: webdriver.Chrome, adventurer_id: str, selector: str) -> None:
    focus_slide(driver, adventurer_id)
    element = driver.find_element(
        By.CSS_SELECTOR,
        f'article.card-slide[data-adventurer-id="{adventurer_id}"] {selector}',
    )
    driver.execute_script("arguments[0].click();", element)


def open_campaign_page(driver: webdriver.Chrome) -> None:
    button = driver.find_element(By.CSS_SELECTOR, 'button[data-page-kind="campaign"]')
    driver.execute_script("arguments[0].click();", button)


def recruit_adventurer(
    driver: webdriver.Chrome,
    template_id: str,
    profession: str,
    placement: str = "active",
) -> None:
    if driver.find_elements(By.CSS_SELECTOR, 'button[data-page-kind="campaign"]'):
        open_campaign_page(driver)

    driver.execute_script(
        """
        let characterSelect = document.querySelector('select[data-role="builder-field"][data-field="builderCharacterId"]');
        characterSelect.value = arguments[0];
        characterSelect.dispatchEvent(new Event('change', { bubbles: true }));
        let professionSelect = document.querySelector('select[data-role="builder-field"][data-field="builderProfession"]');
        professionSelect.value = arguments[1];
        professionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        let placementSelect = document.querySelector('select[data-role="builder-field"][data-field="builderPlacement"]');
        placementSelect.value = arguments[2];
        placementSelect.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('button[data-action="add-adventurer"]').click();
        """,
        template_id,
        profession,
        placement,
    )


def add_learned_skill(
    driver: webdriver.Chrome,
    adventurer_id: str,
    skill_id: str,
    skill_name: str,
    level: int = 1,
) -> None:
    driver.execute_script(
        """
        const state = JSON.parse(window.localStorage.getItem(arguments[0]));
        const adventurer = state.adventurers.find((entry) => entry.id === arguments[1]);
        adventurer.campaignState.learnedSkills = adventurer.campaignState.learnedSkills.filter(
          (entry) => entry.id !== arguments[2]
        );
        adventurer.campaignState.learnedSkills.push({
          id: arguments[2],
          name: arguments[3],
          type: 'skill',
          level: arguments[4]
        });
        window.localStorage.setItem(arguments[0], JSON.stringify(state));
        window.location.reload();
        """,
        STORAGE_KEY,
        adventurer_id,
        skill_id,
        skill_name,
        level,
    )


def open_drawer(driver: webdriver.Chrome, adventurer_id: str, summary_text: str) -> None:
    focus_slide(driver, adventurer_id)
    summary = driver.find_element(
        By.XPATH,
        (
            f'//article[@data-adventurer-id="{adventurer_id}"]'
            f'//summary[normalize-space()="{summary_text}"]'
        ),
    )
    driver.execute_script("arguments[0].click();", summary)


def wait_until(wait: WebDriverWait, callback, message: str) -> None:
    try:
        wait.until(lambda driver: callback(driver))
    except TimeoutException as error:
        raise AssertionError(message) from error


def main() -> int:
    results: list[tuple[bool, str, str]] = []

    def check(name: str, passed: bool, detail: str = "") -> None:
        results.append((passed, name, detail))
        prefix = "PASS" if passed else "FAIL"
        line = f"{prefix}: {name}"
        if detail:
            line += f" ({detail})"
        print(line)

    server = start_server()
    driver: webdriver.Chrome | None = None

    try:
        options = Options()
        options.binary_location = find_browser()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=430,1700")

        driver = webdriver.Chrome(options=options)
        wait = WebDriverWait(driver, 10)
        driver.get(f"http://127.0.0.1:{PORT}/index.html")
        driver.execute_script("window.localStorage.removeItem(arguments[0]);", STORAGE_KEY)
        driver.refresh()

        wait_until(
            wait,
            lambda current: bool(current.find_elements(By.CSS_SELECTOR, ".team-builder")),
            "Team builder did not render.",
        )

        check(
            "starts with no rostered character pages",
            count_character_slides(driver) == 0,
            f"found {count_character_slides(driver)}",
        )

        deck_style = driver.execute_script(
            """
            const deck = document.querySelector('.card-deck');
            const style = getComputedStyle(deck);
            return { overflowX: style.overflowX, scrollSnapType: style.scrollSnapType };
            """
        )
        check(
            "uses a phone-first swipe deck",
            deck_style["overflowX"] in {"auto", "scroll"} and "x mandatory" in deck_style["scrollSnapType"],
            f'{deck_style["overflowX"]} / {deck_style["scrollSnapType"]}',
        )

        check(
            "shows the rules lookup panel",
            bool(driver.find_elements(By.CSS_SELECTOR, ".reference-detail")),
        )

        check(
            "shows the team builder",
            bool(driver.find_elements(By.CSS_SELECTOR, ".team-builder")),
        )

        team_builder_text = driver.find_element(By.CSS_SELECTOR, ".team-builder").text
        check(
            "prompts for hero selection on first launch",
            "Choose your first hero and then their profession." in team_builder_text,
        )

        recruit_adventurer(driver, "character-unger", "Marksman")
        wait_until(
            wait,
            lambda current: count_character_slides(current) == 1,
            "The first recruited hero did not create a character page.",
        )
        wait_until(
            wait,
            lambda current: get_adventurer_state(current, "character-unger")["profile"]["profession"] == "Marksman",
            "Unger's profession did not persist from the team builder.",
        )
        check(
            "can recruit the first hero with a profession",
            get_adventurer_state(driver, "character-unger")["profile"]["profession"] == "Marksman",
        )

        recruit_adventurer(driver, "character-syrio", "Rogue")
        wait_until(
            wait,
            lambda current: count_character_slides(current) == 2,
            "The second recruited hero did not create a character page.",
        )

        recruit_adventurer(driver, "character-artain", "Magus")
        wait_until(
            wait,
            lambda current: count_character_slides(current) == 3,
            "The third recruited hero did not create a character page.",
        )

        body_text = driver.find_element(By.TAG_NAME, "body").text
        check(
            "loads the recruited roster",
            all(name in body_text for name in ["Unger", "Syrio", "Artain"]),
        )

        check(
            "shows imported card scans after recruitment",
            len(driver.find_elements(By.CSS_SELECTOR, ".scan-art")) == 3,
        )

        open_campaign_page(driver)
        wait_until(
            wait,
            lambda current: "All imported character cards are already being tracked."
            in current.find_element(By.CSS_SELECTOR, ".team-builder").text,
            "The builder did not report that all imported cards are already tracked.",
        )
        check(
            "explains when all imported cards are already tracked",
            "All imported character cards are already being tracked."
            in driver.find_element(By.CSS_SELECTOR, ".team-builder").text,
        )

        reserve_button = driver.find_element(
            By.CSS_SELECTOR,
            'button[data-action="set-roster-state"][data-adventurer-id="character-artain"][data-roster-state="reserve"]',
        )
        driver.execute_script("arguments[0].click();", reserve_button)
        wait_until(
            wait,
            lambda current: "character-artain" in load_state(current)["party"]["reserveIds"],
            "Artain did not move into the reserve roster.",
        )
        roster_state = load_state(driver)["party"]
        reserve_dots = driver.find_elements(By.CSS_SELECTOR, ".page-dot.is-reserve")
        check(
            "tracks reserve members as part of the team",
            "character-artain" in roster_state["reserveIds"]
            and "character-artain" not in roster_state["memberIds"]
            and len(reserve_dots) >= 1,
        )

        check(
            "newly recruited heroes start with empty xp rows",
            count_marked_xp(driver, "character-unger", 0) == 0
            and count_marked_xp(driver, "character-syrio", 0) == 0
            and count_marked_xp(driver, "character-artain", 0) == 0,
        )
        check(
            "fresh cards do not show a redundant progression dock",
            not driver.find_elements(By.CSS_SELECTOR, ".progress-dock"),
        )

        click_slide_element(
            driver,
            "character-unger",
            'button[data-action="set-track"][data-track="health"][data-value="3"]',
        )
        wait_until(
            wait,
            lambda current: count_current_pips(current, "character-unger", "health") == 2,
            "Unger's health pip overlay did not spend a point.",
        )
        check(
            "printed health pips update live state",
            count_current_pips(driver, "character-unger", "health") == 2,
            f"value {count_current_pips(driver, 'character-unger', 'health')}",
        )

        click_slide_element(
            driver,
            "character-syrio",
            'button[data-action="set-track"][data-track="skill"][data-value="1"]',
        )
        wait_until(
            wait,
            lambda current: get_adventurer_state(current, "character-syrio")["trackerState"]["currentSkill"] == 0,
            "Syrio's skill track did not reach zero from the overlay.",
        )
        check(
            "overlay taps can spend a track to zero",
            get_adventurer_state(driver, "character-syrio")["trackerState"]["currentSkill"] == 0,
        )

        click_slide_element(
            driver,
            "character-syrio",
            'button[data-action="set-xp"][data-row="0"][data-value="4"]',
        )
        wait_until(
            wait,
            lambda current: get_adventurer_state(current, "character-syrio")["campaignState"]["xpMarksByRow"][0] == 4,
            "Syrio's XP row did not update from the card overlay.",
        )
        check(
            "printed xp pips are directly clickable",
            get_adventurer_state(driver, "character-syrio")["campaignState"]["xpMarksByRow"][0] == 4,
        )

        click_slide_element(
            driver,
            "character-artain",
            'button[data-action="set-xp"][data-row="0"][data-value="4"]',
        )
        wait_until(
            wait,
            lambda current: get_adventurer_state(current, "character-artain")["campaignState"]["xpMarksByRow"][0] == 4,
            "Artain's first XP row did not complete.",
        )
        action_bonus = driver.find_element(
            By.CSS_SELECTOR,
            (
                'article.card-slide[data-adventurer-id="character-artain"] '
                'button[data-action="adjust-bonus"][data-track="actions"][data-amount="1"]'
            ),
        )
        check(
            "early completed rows do not unlock action increases",
            action_bonus.get_attribute("disabled") is not None,
        )

        card_bonus_controls = driver.find_elements(
            By.CSS_SELECTOR,
            (
                'article.card-slide[data-adventurer-id="character-artain"] '
                '.progress-dock .reward-choice[data-action="adjust-bonus"]'
            ),
        )
        check(
            "completed xp rows show on-card stat reward choices",
            len(card_bonus_controls) == 3,
            f"found {len(card_bonus_controls)} controls",
        )

        click_slide_element(
            driver,
            "character-artain",
            'button[data-action="adjust-bonus"][data-track="health"][data-amount="1"]',
        )
        wait_until(
            wait,
            lambda current: get_adventurer_state(current, "character-artain")["campaignState"]["statIncreases"]["health"] == 1,
            "Completing Artain's first row did not unlock a stat increase.",
        )
        check(
            "completed xp rows unlock stat increases",
            get_adventurer_state(driver, "character-artain")["campaignState"]["statIncreases"]["health"] == 1,
        )

        click_slide_element(driver, "character-syrio", ".badge-hotspot")
        wait_until(
            wait,
            lambda current: current.find_element(By.CSS_SELECTOR, ".reference-detail h3").text.strip()
            == "Reflexes",
            "Badge hotspot did not open Reflexes.",
        )
        check(
            "starting badge hotspot opens matching rules",
            driver.find_element(By.CSS_SELECTOR, ".reference-detail h3").text.strip() == "Reflexes",
        )

        check(
            "starting badge is not duplicated in the dock",
            not driver.find_elements(
                By.CSS_SELECTOR,
                'article.card-slide[data-adventurer-id="character-syrio"] '
                'button[data-action="select-reference"][data-reference-id="reflexes"].entry-link',
            ),
        )

        add_learned_skill(driver, "character-syrio", "countershot", "Countershot")
        wait_until(
            wait,
            lambda current: bool(
                current.find_elements(
                    By.CSS_SELECTOR,
                    'article.card-slide[data-adventurer-id="character-syrio"] '
                    'button[data-action="select-reference"][data-reference-id="countershot"].entry-link',
                )
            ),
            "Added progression skill did not appear in the dock.",
        )

        click_slide_element(
            driver,
            "character-syrio",
            'button[data-action="adjust-ability-level"][data-ability-id="countershot"][data-amount="1"]',
        )
        wait_until(
            wait,
            lambda current: next(
                entry
                for entry in get_adventurer_state(current, "character-syrio")["campaignState"]["learnedSkills"]
                if entry["id"] == "countershot"
            )["level"] == 2,
            "Countershot did not level up from the progression dock.",
        )
        check(
            "skill levels can be increased from the card",
            next(
                entry
                for entry in get_adventurer_state(driver, "character-syrio")["campaignState"]["learnedSkills"]
                if entry["id"] == "countershot"
            )["level"] == 2,
        )

        click_slide_element(
            driver,
            "character-syrio",
            'button[data-action="select-reference"][data-reference-id="countershot"].entry-link',
        )
        wait_until(
            wait,
            lambda current: current.find_element(By.CSS_SELECTOR, ".reference-detail h3").text.strip()
            == "Countershot",
            "Progression dock link did not keep Countershot selected.",
        )
        check(
            "progression dock links also open rules",
            driver.find_element(By.CSS_SELECTOR, ".reference-detail h3").text.strip() == "Countershot",
        )

        driver.execute_script(
            """
            const input = document.querySelector('input[data-role="search-field"]');
            input.value = arguments[0];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            """,
            "countershot",
        )
        wait_until(
            wait,
            lambda current: len(current.find_elements(By.CSS_SELECTOR, ".reference-item")) == 1,
            "Rules search did not narrow the library.",
        )
        search_matches = [
            item.text.splitlines()[0].strip()
            for item in driver.find_elements(By.CSS_SELECTOR, ".reference-item")
        ]
        check(
            "rules search narrows the library",
            search_matches == ["Countershot"],
            f"matches {', '.join(search_matches)}",
        )

        driver.execute_script(
            """
            const input = document.querySelector('input[data-role="search-field"]');
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            """,
        )
        wait_until(
            wait,
            lambda current: len(current.find_elements(By.CSS_SELECTOR, ".reference-item")) > 1,
            "Rules search did not reset.",
        )

        open_drawer(driver, "character-artain", "Card Notes")
        driver.execute_script(
            """
            const notes = document.querySelector(
              'textarea[data-role="notes-field"][data-adventurer-id="character-artain"]'
            );
            notes.value = arguments[0];
            notes.dispatchEvent(new Event('input', { bubbles: true }));
            """,
            "Smoke test note",
        )
        wait_until(
            wait,
            lambda current: get_adventurer_state(current, "character-artain")["campaignState"]["notes"] == "Smoke test note",
            "Artain note was not persisted.",
        )
        check(
            "card notes persist to localStorage",
            get_adventurer_state(driver, "character-artain")["campaignState"]["notes"] == "Smoke test note",
        )

        open_drawer(driver, "character-artain", "Status Effects")
        click_slide_element(
            driver,
            "character-artain",
            'button[data-action="toggle-status"][data-effect="blessed"]',
        )
        wait_until(
            wait,
            lambda current: "blessed" in get_adventurer_state(current, "character-artain")["trackerState"]["statusEffects"],
            "Artain's blessed status did not persist.",
        )
        check(
            "status toggles persist to localStorage",
            "blessed" in get_adventurer_state(driver, "character-artain")["trackerState"]["statusEffects"],
        )

        click_slide_element(driver, "character-unger", 'button[data-action="restore-adventurer"]')
        wait_until(
            wait,
            lambda current: count_current_pips(current, "character-unger", "health") == 3,
            "Restore on Unger's card did not refill health.",
        )
        check(
            "single-card restore uses the card overlay",
            count_current_pips(driver, "character-unger", "health") == 3,
        )

        driver.find_element(By.CSS_SELECTOR, 'button[data-action="restore-party"]').click()
        wait_until(
            wait,
            lambda current: get_adventurer_state(current, "character-syrio")["trackerState"]["currentSkill"] == 1,
            "Restore party did not reset Syrio's skill track.",
        )
        restored_state = load_state(driver)
        check(
            "restore party resets live tracks and statuses",
            restored_state["adventurers"][1]["trackerState"]["currentSkill"] == 1
            and all(not adventurer["trackerState"]["statusEffects"] for adventurer in restored_state["adventurers"]),
        )

        driver.find_element(By.CSS_SELECTOR, 'button[data-action="reset-imported"]').click()
        wait_until(
            wait,
            lambda current: count_character_slides(current) == 0,
            "Reset did not restore the empty onboarding state.",
        )
        reset_state = load_state(driver)
        check(
            "reset imported restores fresh campaign setup",
            not reset_state["adventurers"]
            and not reset_state["party"]["memberIds"]
            and not reset_state["party"]["reserveIds"],
        )

    except Exception as error:  # noqa: BLE001
        check("smoke test completed", False, str(error))
    finally:
        if driver is not None:
            driver.quit()
        server.shutdown()
        server.server_close()

    failures = [result for result in results if not result[0]]
    if failures:
        print("")
        print(f"Smoke test failed. {len(failures)} of {len(results)} checks failed.")
        return 1

    print("")
    print(f"Smoke test passed. {len(results)} checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
