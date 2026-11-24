"""Check a two-release Docker rollout on the disposable CI runner."""
import hashlib
import json
import ssl
import subprocess
import time
from urllib.request import urlopen

from selenium import webdriver
from selenium.webdriver.common.by import By

SITE = "https://localhost"
TLS = ssl._create_unverified_context()  # Caddy's local test CA.


def read(url):
    with urlopen(url, context=TLS, timeout=8) as response:
        return response.read()


def version():
    return json.loads(read(SITE + "/api/version"))["commit"]


def styles(driver):
    return {item.get_attribute("href") for item in
            driver.find_elements(By.CSS_SELECTOR, 'link[rel="stylesheet"][href*="/_next/static/"]')}


options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.set_capability("acceptInsecureCerts", True)
expected = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
with webdriver.Chrome(options=options) as browser:
    before = version()
    assert before != expected
    browser.get(SITE)
    old_tab = browser.current_window_handle
    old = {url: hashlib.sha256(read(url)).digest() for url in styles(browser)}
    assert old and all("dpl=" + before in url for url in old)
    unavailable = []
    with subprocess.Popen(["bash", "deploy/update.sh"]) as update:
        while update.poll() is None:
            try:
                read(SITE + "/api/health")
            except OSError as exc:
                unavailable.append(str(exc))
            time.sleep(2)
        assert update.returncode == 0, update.returncode
    assert version() == expected
    assert not unavailable, unavailable
    browser.switch_to.new_window("tab")
    browser.get(SITE)
    new = styles(browser)
    assert new and all("dpl=" + expected in url and read(url) for url in new)
    assert browser.find_element(By.CSS_SELECTOR, "main h1")
    browser.switch_to.window(old_tab)
    assert styles(browser) == set(old)
    for url, digest in old.items():
        assert hashlib.sha256(read(url)).digest() == digest, url
    browser.find_element(By.CSS_SELECTOR, "[data-shop-menu]").click()
    assert browser.find_element(By.ID, "site-menu").is_displayed()
    print(f"Verified {before} -> {expected}; {len(old)} old and {len(new)} new stylesheets.")
