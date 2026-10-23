"""Regression checks for audible, current chord previews and original audio safety."""
import json
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from audio_browser import prepare_fixture

BASE = os.environ.get('STRINGNOTE_TEST_URL', 'http://127.0.0.1:5173/')
OUT = Path(__file__).resolve().parents[1] / 'test-results'
OUT.mkdir(exist_ok=True)

def audio_hash(page, selector='audio'):
    return page.locator(selector).evaluate('''async audio => {
        const bytes = await (await fetch(audio.src)).arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    }''')

def wait_for_new_playback(page, previous_source):
    page.wait_for_function('''previous => {
        const audio = document.querySelector('.player audio');
        return audio && audio.src !== previous && !audio.paused && audio.currentTime > .1;
    }''', arg=previous_source)

def run():
    prepare_fixture()
    results = {'url': BASE}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 950})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        page.get_by_role('tab', name='自己写和弦').click()
        dialog = page.get_by_role('dialog', name='写下你的和弦')
        dialog.get_by_label('练习名称').fill('试听回归练习')
        dialog.get_by_label('和弦进行').fill('C G Am F')
        dialog.get_by_role('button', name='试听和弦', exact=True).click()
        page.wait_for_function('document.querySelector(".composer-preview audio").currentTime > .2')
        first_hash = audio_hash(page, '.composer-preview audio')
        expect(dialog.get_by_role('button', name='暂停试听')).to_be_visible()
        page.screenshot(path=str(OUT / 'compose-audition.png'), full_page=True)
        results['composerPlayback'] = True

        dialog.get_by_label('和弦进行').fill('Am Am Am Am')
        expect(dialog.locator('.composer-preview audio')).to_be_hidden()
        dialog.get_by_role('button', name='试听和弦', exact=True).click()
        page.wait_for_function('document.querySelector(".composer-preview audio").currentTime > .1')
        assert audio_hash(page, '.composer-preview audio') != first_hash
        dialog.get_by_label('试听速度').select_option('120')
        dialog.get_by_role('button', name='试听和弦', exact=True).click()
        page.wait_for_function('document.querySelector(".composer-preview audio").duration > 0')
        assert abs(dialog.locator('audio').evaluate('(audio) => audio.duration') - 8) < .01
        results['composerEditsAndTempo'] = True

        dialog.get_by_role('button', name='生成练习谱', exact=True).click()
        expect(page.locator('.composer-preview')).to_have_count(0)
        audition = page.get_by_role('button', name='试听和弦', exact=True)
        expect(audition).to_be_enabled()
        assert audition.bounding_box()['y'] < 950
        audition.click()
        page.wait_for_function('document.querySelector(".player audio").currentTime > .1')
        first_track_hash = audio_hash(page, '.player audio')
        page.get_by_role('button', name='暂停试听').click()
        previous_source = page.locator('.player audio').evaluate('audio => audio.src')
        page.get_by_label('修改第1段和弦').click()
        page.get_by_label('基础和弦').fill('G7')
        page.get_by_role('button', name='保存修改', exact=True).click()
        expect(page.locator('.audition-bar')).to_contain_text('和弦或调性已修改')
        page.get_by_role('button', name='试听和弦', exact=True).click()
        wait_for_new_playback(page, previous_source)
        assert audio_hash(page, '.player audio') != first_track_hash
        page.get_by_role('button', name='暂停试听').click()
        previous_source = page.locator('.player audio').evaluate('audio => audio.src')
        page.get_by_role('button', name='撤销', exact=True).click()
        page.get_by_role('button', name='试听和弦', exact=True).click()
        wait_for_new_playback(page, previous_source)
        assert audio_hash(page, '.player audio') == first_track_hash
        results['updatedChordsAreAudible'] = True
        page.screenshot(path=str(OUT / 'practice-audition.png'), full_page=True)

        page.get_by_label('选择音频文件', exact=True).set_input_files(str(OUT / 'audio-progression.wav'))
        expect(page.get_by_role('heading', name='audio-progression', exact=True)).to_be_visible(timeout=30000)
        expect(page.locator('.player-track-title')).to_contain_text('本机原音频')
        original_hash = audio_hash(page, '.player audio')
        page.get_by_role('button', name='试听和弦', exact=True).click()
        page.wait_for_function('document.querySelector(".player audio").currentTime > .1')
        assert audio_hash(page, '.player audio') != original_hash
        page.get_by_role('button', name='听原音频', exact=True).click()
        page.wait_for_function('document.querySelector(".player audio").currentTime > .1')
        assert audio_hash(page, '.player audio') == original_hash
        page.get_by_role('button', name='试听和弦', exact=True).click()
        page.wait_for_function('document.querySelector(".player audio").currentTime > .1')
        page.get_by_role('button', name='保存曲谱', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('已保存')
        page.get_by_role('navigation', name='主要导航').get_by_role('button', name='我的曲谱').click()
        page.get_by_role('button', name='开始练习audio-progression', exact=True).click()
        expect(page.get_by_role('button', name='播放', exact=True)).to_be_enabled()
        expect(page.locator('.player-track-title')).to_contain_text('本机原音频')
        assert audio_hash(page, '.player audio') == original_hash
        results['originalRecordingPreserved'] = True

        mobile = browser.new_page(viewport={'width': 390, 'height': 844})
        mobile.goto(BASE)
        mobile.wait_for_load_state('networkidle')
        mobile.get_by_role('tab', name='自己写和弦').click()
        expect(mobile.get_by_role('dialog').get_by_role('button', name='试听和弦', exact=True)).to_be_visible()
        assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
        mobile.screenshot(path=str(OUT / 'compose-audition-mobile.png'), full_page=True)
        mobile.get_by_role('dialog').get_by_role('button', name='生成练习谱', exact=True).click()
        expect(mobile.get_by_role('button', name='试听和弦', exact=True)).to_be_enabled()
        assert mobile.get_by_role('button', name='试听和弦', exact=True).bounding_box()['y'] < 844
        assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
        results['mobilePreviewVisible'] = True
        assert not errors
        results['pageErrors'] = errors
        browser.close()
    (OUT / 'preview-browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(results, ensure_ascii=True, indent=2))

if __name__ == '__main__':
    run()
