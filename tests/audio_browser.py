from __future__ import annotations

import io
import json
import math
import os
from array import array
import time
import wave
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-results"
OUTPUT.mkdir(exist_ok=True)
URL = os.environ.get('STRINGNOTE_TEST_URL', 'http://127.0.0.1:5173/')


def prepare_fixture() -> None:
    """Create an original test recording locally; no third-party audio is needed."""
    target = OUTPUT / 'audio-progression.wav'
    if target.exists():
        return
    sample_rate = 22050
    chords = [(48, 52, 55), (45, 48, 52), (41, 45, 48), (43, 47, 50)]
    samples = array('h')
    for notes in chords:
        frequencies = [440 * 2 ** ((note - 69) / 12) for note in notes]
        for frame in range(sample_rate * 3):
            t = frame / sample_rate
            envelope = .25 + .75 * math.exp(-9 * (t % .5))
            fade = min(1, frame / 220, (sample_rate * 3 - frame) / 220)
            value = sum(math.sin(2 * math.pi * frequency * t) + .15 * math.sin(4 * math.pi * frequency * t) for frequency in frequencies)
            samples.append(int(value * envelope * fade * 4500))
    with wave.open(str(target), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(samples.tobytes())


def run() -> None:
    prepare_fixture()
    results: dict = {"url": URL, "checks": {}, "pageErrors": [], "consoleErrors": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1050})
        page = context.new_page()
        page.on("pageerror", lambda error: results["pageErrors"].append(str(error)))
        page.on("console", lambda message: results["consoleErrors"].append(message.text) if message.type == "error" else None)
        try:
            page.goto(URL, timeout=20_000)
            page.wait_for_load_state("networkidle")
            page.screenshot(path=str(OUTPUT / "audio-initial.png"), full_page=True)
            results["initialButtons"] = page.get_by_role("button").all_text_contents()

            started = time.monotonic()
            page.get_by_label("选择音频文件", exact=True).set_input_files(str(OUTPUT / "audio-progression.wav"))
            expect(page.get_by_role("heading", name="audio-progression", exact=True)).to_be_visible(timeout=30_000)
            expect(page.get_by_text("实验性音频识别草稿", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="播放", exact=True)).to_be_enabled(timeout=10_000)
            chords = page.locator(".chord-cell .chord-seek strong").all_text_contents()
            results["checks"]["realUpload"] = {"passed": True, "seconds": round(time.monotonic() - started, 3), "chords": chords}
            page.screenshot(path=str(OUTPUT / "audio-analysis.png"), full_page=True)

            page.get_by_role("button", name="播放", exact=True).click()
            page.wait_for_function("document.querySelector('audio')?.currentTime > 0.3", timeout=10_000)
            time_before = page.locator("audio").evaluate("audio => audio.currentTime")
            page.wait_for_timeout(450)
            time_after = page.locator("audio").evaluate("audio => audio.currentTime")
            assert time_after > time_before
            page.get_by_role("button", name="暂停", exact=True).click()
            results["checks"]["playback"] = {"passed": True, "before": time_before, "after": time_after}

            page.get_by_role("button", name="保存曲谱", exact=True).click()
            expect(page.get_by_role("status")).to_contain_text("已保存", timeout=10_000)
            page.get_by_role("navigation", name="主要导航").get_by_role("button", name="我的曲谱").click()
            expect(page.get_by_role("heading", name="我的曲谱")).to_be_visible()
            page.screenshot(path=str(OUTPUT / "audio-library.png"), full_page=True)
            page.get_by_role("button", name="开始练习audio-progression", exact=True).click()
            expect(page.get_by_role("heading", name="audio-progression", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="播放", exact=True)).to_be_enabled(timeout=10_000)
            reloaded_chords = page.locator(".chord-cell .chord-seek strong").all_text_contents()
            assert reloaded_chords == chords
            page.get_by_role("button", name="播放", exact=True).click()
            page.wait_for_function("document.querySelector('audio')?.currentTime > 0.3", timeout=10_000)
            page.get_by_role("button", name="暂停", exact=True).click()
            results["checks"]["savedReopen"] = {"passed": True, "chordsPersisted": True, "audioPlayable": True}

            # Reload the browser document to ensure this was actual IndexedDB persistence.
            page.reload()
            page.wait_for_load_state("networkidle")
            page.get_by_role("navigation", name="主要导航").get_by_role("button", name="我的曲谱").click()
            page.get_by_role("button", name="开始练习audio-progression", exact=True).click()
            expect(page.get_by_role("button", name="播放", exact=True)).to_be_enabled(timeout=10_000)
            assert page.locator(".chord-cell .chord-seek strong").all_text_contents() == chords
            results["checks"]["reloadPersistence"] = {"passed": True}

            # Correct extension, corrupt body: exercises the actual decoder error path.
            page.get_by_label("选择音频文件", exact=True).set_input_files({"name": "broken.wav", "mimeType": "audio/wav", "buffer": b"invalid audio " * 12})
            invalid_alert = page.get_by_role("dialog", name="从一段音频开始").get_by_role("alert")
            expect(invalid_alert).to_contain_text("无法读取", timeout=10_000)
            expect(page.get_by_role("dialog", name="从一段音频开始").locator(".upload-dropzone")).to_be_visible()
            results["checks"]["invalidAudio"] = {"passed": True, "message": invalid_alert.inner_text()}
            page.screenshot(path=str(OUTPUT / "audio-invalid.png"), full_page=True)
            page.get_by_role("button", name="关闭对话框", exact=True).click()

            with wave.open(str(OUTPUT / "audio-progression.wav"), "rb") as source:
                parameters = source.getparams()
                frames = source.readframes(source.getnframes())
            repeated = io.BytesIO()
            with wave.open(repeated, "wb") as target:
                target.setparams(parameters)
                target.writeframes(frames * 20)
            page.get_by_label("选择音频文件", exact=True).set_input_files({"name": "cancel-test.wav", "mimeType": "audio/wav", "buffer": repeated.getvalue()})
            cancel = page.get_by_role("button", name="取消分析", exact=True)
            expect(cancel).to_be_visible(timeout=10_000)
            expect(page.get_by_role("heading", name="正在分析和弦", exact=True)).to_be_visible(timeout=10_000)
            cancel.click()
            expect(page.get_by_role("dialog", name="从一段音频开始").locator(".upload-dropzone")).to_be_visible(timeout=10_000)
            expect(page.get_by_role("status")).to_contain_text("已取消", timeout=10_000)
            page.wait_for_timeout(900)
            assert page.get_by_role("heading", name="cancel-test", exact=True).count() == 0
            results["checks"]["cancel"] = {"passed": True, "duringWorkerAnalysis": True, "oldTrackPreserved": page.get_by_role("heading", name="audio-progression", exact=True).count() == 1}
            page.screenshot(path=str(OUTPUT / "audio-cancel.png"), full_page=True)
            results["passed"] = True
        except Exception as error:
            results["passed"] = False
            results["failure"] = str(error)
            results["currentUrl"] = page.url
            results["currentText"] = page.locator("body").inner_text()[:14000]
            page.screenshot(path=str(OUTPUT / "audio-failure.png"), full_page=True)
            raise
        finally:
            (OUTPUT / "audio-browser-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
            browser.close()
    print(json.dumps(results, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    run()
