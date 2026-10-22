"""Exercise the self-hosted guitar sample bank and its audible offline fallback."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


BASE = os.environ.get('STRINGNOTE_TEST_URL', 'http://127.0.0.1:5173/')
OUT = Path(__file__).resolve().parents[1] / 'test-results'
OUT.mkdir(exist_ok=True)
BANK_PATH = '/audio/acoustic-guitar.json'
CHORDS = 'C G Am F'


def is_bank(url):
    return urlsplit(url).path.endswith(BANK_PATH)


def audio_stats(page):
    return page.locator('.composer-preview audio').evaluate('''async audio => {
        const bytes = await (await fetch(audio.src)).arrayBuffer();
        const view = new DataView(bytes);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        let peak = 0;
        let nonSilentSamples = 0;
        for (let offset = 44; offset + 1 < bytes.byteLength; offset += 2) {
            const sample = Math.abs(view.getInt16(offset, true));
            peak = Math.max(peak, sample);
            if (sample > 100) nonSilentSamples++;
        }
        return {
            sha256: Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join(''),
            sampleRate: view.getUint32(24, true),
            channels: view.getUint16(22, true),
            duration: audio.duration,
            byteLength: bytes.byteLength,
            peak,
            nonSilentSamples,
        };
    }''')


def open_composer(page):
    page.goto(BASE, timeout=30000)
    page.wait_for_load_state('networkidle')
    page.get_by_role('tab', name='自己写和弦').click()
    dialog = page.get_by_role('dialog', name='写下你的和弦')
    dialog.get_by_label('和弦进行').fill(CHORDS)
    dialog.get_by_label('试听速度').select_option('120')
    return dialog


def play_preview(page, dialog):
    dialog.get_by_role('button', name='试听和弦', exact=True).click()
    page.wait_for_function('''() => {
        const audio = document.querySelector('.composer-preview audio');
        return audio && audio.currentTime > .15;
    }''', timeout=30000)
    expect(dialog.get_by_role('button', name='暂停试听', exact=True)).to_be_visible()
    stats = audio_stats(page)
    assert stats['sampleRate'] == 22050, stats
    assert stats['channels'] == 1, stats
    assert abs(stats['duration'] - 8) < .01, stats
    assert stats['peak'] > 1000, stats
    assert stats['nonSilentSamples'] > 22050, stats
    return stats


def run():
    results = {'url': BASE, 'checks': {}, 'pageErrors': []}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            sampled_context = browser.new_context(viewport={'width': 1280, 'height': 950})
            sampled_page = sampled_context.new_page()
            sampled_page.on('pageerror', lambda error: results['pageErrors'].append(str(error)))
            requests = []
            responses = []
            sampled_page.on('request', lambda request: requests.append(request.url) if is_bank(request.url) else None)
            sampled_page.on('response', lambda response: responses.append({'url': response.url, 'status': response.status}) if is_bank(response.url) else None)
            dialog = open_composer(sampled_page)
            sampled = play_preview(sampled_page, dialog)
            assert len(requests) == 1, requests
            assert responses and responses[0]['status'] == 200, responses
            assert urlsplit(requests[0]).netloc == urlsplit(BASE).netloc, requests
            results['checks']['sampleBankSelfHosted'] = True
            results['checks']['sampledPlayback'] = True

            dialog.get_by_label('和弦进行').fill('Am Am Am Am')
            changed = play_preview(sampled_page, dialog)
            assert changed['sha256'] != sampled['sha256']
            assert len(requests) == 1, requests
            dialog.get_by_label('和弦进行').fill(CHORDS)
            restored = play_preview(sampled_page, dialog)
            assert restored['sha256'] == sampled['sha256']
            assert len(requests) == 1, requests
            results['checks']['decodedBankReused'] = True
            sampled_context.close()

            fallback_context = browser.new_context(viewport={'width': 1280, 'height': 950})
            fallback_requests = []

            def block_bank(route):
                fallback_requests.append(route.request.url)
                route.fulfill(status=503, content_type='application/json', body='{"error":"test sample bank unavailable"}')

            fallback_context.route(lambda url: is_bank(url), block_bank)
            fallback_page = fallback_context.new_page()
            fallback_page.on('pageerror', lambda error: results['pageErrors'].append(str(error)))
            fallback_dialog = open_composer(fallback_page)
            fallback = play_preview(fallback_page, fallback_dialog)
            assert fallback_requests, 'The fallback test did not intercept the sample bank.'
            assert fallback['sha256'] != sampled['sha256'], 'Normal playback also used the fallback, or the bank was ignored.'
            results['checks']['bankFailureStillAudible'] = True
            results['checks']['sampledAndFallbackAudioDiffer'] = True
            results['sampledAudio'] = sampled
            results['fallbackAudio'] = fallback
            results['sampleBankResponses'] = responses
            fallback_context.close()
            assert not results['pageErrors'], results['pageErrors']
        finally:
            browser.close()
    (OUT / 'guitar-browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(results, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    run()
