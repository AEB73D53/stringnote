"""Functional browser checks; run a local Vite server first. No account required."""
import json
import os
from pathlib import Path
from urllib.parse import unquote
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('STRINGNOTE_TEST_URL', 'http://127.0.0.1:5173/')
OUT = Path(__file__).resolve().parents[1] / 'test-results'
OUT.mkdir(exist_ok=True)

def run():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 1080}, accept_downloads=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        expect(page.locator('.track-card')).to_have_count(3)
        page.screenshot(path=str(OUT / 'home-desktop.png'), full_page=True)
        results['home'] = not page.evaluate('document.documentElement.scrollWidth > innerWidth')

        page.get_by_label('搜索歌名或歌手').fill('晴天 周杰伦')
        page.get_by_role('button', name='找曲谱', exact=False).click()
        page.wait_for_function("!document.querySelector('.version-loading')", timeout=16000)
        assert page.locator('.song-version').count() or page.locator('.version-fallback').is_visible()
        for link in page.locator('.source-card').all():
            assert '晴天 周杰伦' in unquote(link.get_attribute('href'))
        results['search'] = {'sourceLinks': page.locator('.source-card').count(), 'songVersions': page.locator('.song-version').count()}
        page.screenshot(path=str(OUT / 'search-desktop.png'), full_page=True)
        page.get_by_role('button', name='清除搜索').click()

        page.get_by_role('button', name='开始练习晚风练习曲').click()
        play = page.get_by_role('button', name='播放', exact=True)
        expect(play).to_be_enabled()
        play.click()
        page.wait_for_function('document.querySelector("audio").currentTime > .3')
        page.get_by_role('button', name='暂停', exact=True).click()
        page.get_by_label('播放速度').select_option('0.5')
        assert page.locator('audio').evaluate('(a)=>a.playbackRate') == .5
        results['playback'] = True

        original = page.locator('.chord-cell').nth(1).locator('strong').inner_text()
        page.get_by_label('修改第2段和弦').click()
        page.get_by_label('基础和弦').fill('Dm')
        page.get_by_role('button', name='保存修改', exact=True).click()
        expect(page.locator('.chord-cell').nth(1).locator('strong')).to_have_text('Dm')
        page.get_by_role('button', name='撤销', exact=True).click()
        expect(page.locator('.chord-cell').nth(1).locator('strong')).to_have_text(original)
        page.get_by_label('修改第2段和弦').click()
        page.get_by_label('基础和弦').fill('Dm')
        page.get_by_role('button', name='保存修改', exact=True).click()
        page.get_by_role('button', name='升半音').click()
        expect(page.locator('.chord-cell').first.locator('strong')).to_have_text('C#')
        page.get_by_label('变调夹', exact=True).select_option('2')
        # A manually moved capo raises the sounding chord; the chosen hand
        # shape stays unchanged, as it does on a real guitar.
        expect(page.locator('.chord-cell').first.locator('strong')).to_have_text('C#')
        page.get_by_role('button', name='节拍器', exact=False).click()
        expect(page.get_by_role('button', name='节拍器', exact=False)).to_have_attribute('aria-pressed', 'true')
        results['editingTransposeCapoMetronome'] = True

        page.locator('audio').evaluate('(a)=>{a.currentTime=.5}')
        page.get_by_label('播放进度').fill('0.5')
        page.get_by_label('设置循环起点 A').click()
        page.get_by_label('播放进度').fill('3')
        page.get_by_label('设置循环终点 B').click()
        expect(page.locator('.loop-status')).to_contain_text('循环')
        page.get_by_label('取消循环').click()
        results['loop'] = True

        page.get_by_role('button', name='保存曲谱', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('已保存')
        page.get_by_role('button', name='导出', exact=True).click()
        with page.expect_download() as download_info:
            page.get_by_role('button', name='和弦数据 JSON', exact=False).click()
        exported = download_info.value
        exported.save_as(OUT / 'practice-export.json')
        data = json.loads((OUT / 'practice-export.json').read_text(encoding='utf-8'))
        assert data['track']['segments'][1]['chord'] == 'Dm'
        page.get_by_label('关闭对话框').click()
        page.get_by_role('button', name='我的曲谱', exact=False).click()
        expect(page.locator('.track-card')).to_have_count(1)
        page.reload()
        page.wait_for_load_state('networkidle')
        expect(page.locator('.track-card')).to_have_count(1)
        page.get_by_role('button', name='开始练习晚风练习曲').click()
        expect(page.locator('.chord-cell').nth(1).locator('strong')).to_have_text('Dm')
        results['saveExportPersistence'] = True
        page.evaluate('scrollTo(0,0)')
        page.screenshot(path=str(OUT / 'practice-desktop.png'), full_page=True)

        page.get_by_role('navigation', name='主要导航').get_by_role('button', name='发现与练习', exact=True).click()
        page.get_by_role('tab', name='自己写和弦').click()
        page.get_by_label('练习名称').fill('自动验收练习')
        page.get_by_label('和弦进行').fill('C G Am F')
        page.get_by_role('button', name='生成练习谱', exact=True).click()
        expect(page.locator('.chord-cell')).to_have_count(4)
        results['compose'] = True

        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        phone = mobile.new_page()
        phone.goto(BASE)
        phone.wait_for_load_state('networkidle')
        phone.wait_for_timeout(300)
        assert not phone.evaluate('document.documentElement.scrollWidth > innerWidth')
        phone.screenshot(path=str(OUT / 'home-mobile.png'), full_page=True)
        phone.get_by_role('button', name='开始练习晚风练习曲').click()
        expect(phone.get_by_role('button', name='播放', exact=True)).to_be_enabled()
        phone.wait_for_timeout(300)
        phone.evaluate('scrollTo(0,0)')
        assert not phone.evaluate('document.documentElement.scrollWidth > innerWidth')
        phone.screenshot(path=str(OUT / 'practice-mobile.png'), full_page=True)
        phone.get_by_label('打开导航').click()
        phone.get_by_role('button', name='和弦字典', exact=True).click()
        expect(phone.locator('.dictionary-tile')).to_have_count(16)
        assert not phone.evaluate('document.documentElement.scrollWidth > innerWidth')
        results['mobile390'] = True
        results['pageErrors'] = errors
        assert not errors
        browser.close()
    (OUT / 'browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(results, ensure_ascii=True, indent=2))

if __name__ == '__main__':
    run()
