"""Verify audible capo pitch changes, easy fingerings and ChordPro round trips."""
import base64
from array import array
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys
import wave

from playwright.sync_api import expect, sync_playwright
from audio_browser import prepare_fixture

BASE = os.environ.get('STRINGNOTE_TEST_URL', 'http://127.0.0.1:5173/')
OUT = Path(__file__).resolve().parents[1] / 'test-results'
OUT.mkdir(exist_ok=True)


def audio_data(page):
    return base64.b64decode(page.locator('.player audio').evaluate('''async audio => {
        const bytes = new Uint8Array(await (await fetch(audio.src)).arrayBuffer());
        let binary = '';
        for (let start = 0; start < bytes.length; start += 8192) {
            binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
        }
        return btoa(binary);
    }'''))


def inspect_audio(page):
    """Measure the actual PCM, including its strongest bass-frequency peak.

    Use a windowed Goertzel scan instead of an additional NumPy dependency.
    The frequency check would fail if the old C audio were still playing.
    """
    data = audio_data(page)
    with wave.open(io.BytesIO(data)) as wav:
        rate = wav.getframerate()
        assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
        raw = wav.readframes(wav.getnframes())
    samples = array('h')
    samples.frombytes(raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    assert max(abs(value) for value in samples) > 1000
    assert abs(len(samples) / rate - 8) < .01
    step = 8
    window = list(samples[int(.07 * rate):int(.7 * rate):step])
    window = [value * (.5 - .5 * math.cos(2 * math.pi * index / (len(window) - 1)))
              for index, value in enumerate(window)]
    scanned = []
    for index in range(481):
        frequency = 70 + index * .25
        coefficient = 2 * math.cos(2 * math.pi * frequency / (rate / step))
        previous = older = 0.
        for value in window:
            current = value + coefficient * previous - older
            older, previous = previous, current
        energy = previous ** 2 + older ** 2 - coefficient * previous * older
        scanned.append((energy, frequency))
    bass = max(scanned)[1]
    midi = round(69 + 12 * math.log2(bass / 440))
    return {'sha256': hashlib.sha256(data).hexdigest(), 'bassFrequencyHz': bass,
            'bassPitchClass': midi % 12, 'duration': len(samples) / rate}


def source(page):
    return page.locator('.player audio').evaluate('audio => audio.src')


def wait_new_playback(page, previous):
    page.wait_for_function('''previous => {
        const audio = document.querySelector('.player audio');
        return audio && audio.src !== previous && !audio.paused && audio.currentTime > .15;
    }''', arg=previous, timeout=30000)


def compose(page):
    page.get_by_role('tab', name='自己写和弦').click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_label('练习名称').fill('变调夹回归练习')
    dialog.get_by_label('和弦进行').fill('C C C C')
    dialog.get_by_label('试听速度').select_option('120')
    dialog.get_by_role('button', name='生成练习谱', exact=True).click()
    expect(page.get_by_role('button', name='试听和弦', exact=True)).to_be_enabled()


def run():
    prepare_fixture()
    results = {'url': BASE, 'checks': {}}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(viewport={'width': 1280, 'height': 1000}, accept_downloads=True)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE, timeout=30000)
            page.wait_for_load_state('networkidle')
            compose(page)
            page.get_by_role('button', name='试听和弦', exact=True).click()
            page.wait_for_function('document.querySelector(".player audio").currentTime > .15')
            original = inspect_audio(page)
            assert abs(original['bassFrequencyHz'] / 130.8128 - 1) < .01, original

            previous = source(page)
            page.get_by_label('变调夹', exact=True).select_option('2')
            expect(page.locator('.chord-cell').first.locator('strong')).to_have_text('C')
            page.wait_for_function('document.querySelector(".player audio").paused')
            page.get_by_role('button', name='试听和弦', exact=True).click()
            wait_new_playback(page, previous)
            capo_two = inspect_audio(page)
            assert abs(capo_two['bassFrequencyHz'] / 146.8324 - 1) < .01, capo_two
            assert capo_two['sha256'] != original['sha256']
            results['checks']['capoRaisesActualPitch'] = True
            results['checks']['manualCapoPreservesHandShape'] = True
            page.get_by_role('button', name='暂停试听', exact=True).click()

            page.get_by_role('button', name='导出', exact=True).click()
            with page.expect_download() as download_info:
                page.get_by_role('button', name='ChordPro 和弦谱', exact=False).click()
            exported = OUT / 'capo-two.cho'
            download_info.value.save_as(exported)
            text = exported.read_text(encoding='utf8')
            assert '{capo: 2}' in text and '[C]' in text and '实际发声调 D' in text, text
            page.get_by_label('关闭对话框', exact=True).click()

            previous = source(page)
            page.get_by_label('变调夹', exact=True).select_option('0')
            page.get_by_role('button', name='播放', exact=True).click()
            wait_new_playback(page, previous)
            assert inspect_audio(page)['sha256'] == original['sha256']
            results['checks']['bottomPlayRegeneratesAndCapoZeroRestores'] = True

            # Keep the C hand shape while raising every string four frets.
            # Scan the whole 70–190 Hz band, so choosing an open E2 voicing
            # instead of raising C3 to E3 cannot pass this assertion.
            previous = source(page)
            page.get_by_label('变调夹', exact=True).select_option('4')
            expect(page.locator('.chord-cell').first.locator('strong')).to_have_text('C')
            page.get_by_role('button', name='试听和弦', exact=True).click()
            wait_new_playback(page, previous)
            capo_four = inspect_audio(page)
            assert abs(capo_four['bassFrequencyHz'] / 164.8138 - 1) < .01, capo_four
            results['checks']['capoRaisesExistingStringsWithoutOctaveDrop'] = True

            page.get_by_label('升半音', exact=True).click(click_count=2, delay=80)
            page.get_by_label('变调夹', exact=True).select_option('2')
            expect(page.locator('.chord-cell').first.locator('strong')).to_have_text('D')
            previous = source(page)
            page.get_by_role('button', name='试听和弦', exact=True).click()
            wait_new_playback(page, previous)
            combined = inspect_audio(page)
            assert combined['bassPitchClass'] == 4, combined
            assert combined['sha256'] not in (original['sha256'], capo_two['sha256'])
            results['checks']['transposeAndCapoAddTogether'] = True

            previous = source(page)
            page.get_by_role('button', name='试试更容易的指法', exact=False).click()
            transpose = int(page.locator('.stepper > span').inner_text())
            capo = int(page.get_by_label('变调夹', exact=True).input_value())
            assert transpose + capo == 4 and -12 <= transpose <= 12 and 0 <= capo <= 9
            # Easy fingerings preserve the key, not the exact string voicing.
            # A changed hand shape must invalidate/re-render the accompaniment.
            if (transpose, capo) != (2, 2):
                page.wait_for_function('document.querySelector(".player audio").paused')
                page.get_by_role('button', name='试听和弦', exact=True).click()
                wait_new_playback(page, previous)
            easy = inspect_audio(page)
            assert easy['bassPitchClass'] == combined['bassPitchClass'] == 4, easy
            results['checks']['easyFingeringPreservesActualPitch'] = True
            page.screenshot(path=str(OUT / 'capo-practice.png'), full_page=True)

            page.get_by_label('选择音频文件', exact=True).set_input_files(str(OUT / 'audio-progression.wav'))
            expect(page.get_by_role('heading', name='audio-progression', exact=True)).to_be_visible(timeout=30000)
            expect(page.locator('.player-track-title')).to_contain_text('本机原音频')
            recording = hashlib.sha256(audio_data(page)).hexdigest()
            page.get_by_label('变调夹', exact=True).select_option('2')
            assert hashlib.sha256(audio_data(page)).hexdigest() == recording
            previous = source(page)
            page.get_by_role('button', name='试听和弦', exact=True).click()
            wait_new_playback(page, previous)
            assert hashlib.sha256(audio_data(page)).hexdigest() != recording
            previous = source(page)
            page.get_by_role('button', name='听原音频', exact=True).click()
            wait_new_playback(page, previous)
            assert hashlib.sha256(audio_data(page)).hexdigest() == recording
            results['checks']['originalRecordingPreserved'] = True

            page.get_by_label('选择和弦谱文件', exact=True).set_input_files(str(exported))
            expect(page.locator('.chord-cell').first.locator('strong')).to_have_text('D')
            expect(page.get_by_label('变调夹', exact=True)).to_have_value('0')
            expect(page.locator('.stepper > span')).to_have_text('0')
            expect(page.get_by_role('button', name='试听和弦', exact=True)).to_be_enabled()
            page.get_by_role('button', name='试听和弦', exact=True).click()
            page.wait_for_function('document.querySelector(".player audio").currentTime > .15')
            imported = inspect_audio(page)
            assert imported['bassPitchClass'] == capo_two['bassPitchClass'] == 2, imported
            assert abs(imported['bassFrequencyHz'] / 146.8324 - 1) < .01, imported
            results['checks']['chordProRestoresSoundingPitch'] = True

            mobile = browser.new_page(viewport={'width': 390, 'height': 844})
            mobile.goto(BASE)
            mobile.wait_for_load_state('networkidle')
            compose(mobile)
            mobile.get_by_label('变调夹', exact=True).select_option('2')
            expect(mobile.locator('.chord-cell').first.locator('strong')).to_have_text('C')
            assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
            mobile.screenshot(path=str(OUT / 'capo-mobile.png'), full_page=True)
            results['checks']['mobileNoOverflow'] = True
            assert not errors
            results['originalC'] = original
            results['capoTwoD'] = capo_two
            results['capoFourE'] = capo_four
            results['combinedE'] = combined
            results['easyE'] = easy
            results['importedD'] = imported
            results['pageErrors'] = errors
        finally:
            browser.close()
    (OUT / 'capo-browser-results.json').write_text(json.dumps(results, indent=2), encoding='utf8')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    run()
