import { expect, test } from '@playwright/test';

// Generate a minimal valid MIDI file (Format 0, 1 track, 4 notes)
function createTestMidi() {
  const bytes = [];
  const push = (...b) => bytes.push(...b);

  // Header: MThd, length=6, format=0, tracks=1, division=480
  push(0x4d, 0x54, 0x68, 0x64);
  push(0x00, 0x00, 0x00, 0x06);
  push(0x00, 0x00, 0x00, 0x01);
  push(0x01, 0xe0); // 480 ticks per quarter

  // Track chunk
  const trackData = [];
  const tpush = (...b) => trackData.push(...b);

  // Tempo: 120 BPM (500000 microseconds per quarter)
  tpush(0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20);

  // Program Change: Ch0, Piano (program 0)
  tpush(0x00, 0xc0, 0x00);

  // Note On C4, velocity 100
  tpush(0x00, 0x90, 0x3c, 0x64);
  // Note Off after 480 ticks
  tpush(0x83, 0x60, 0x80, 0x3c, 0x00);

  // Note On E4
  tpush(0x00, 0x90, 0x40, 0x64);
  tpush(0x83, 0x60, 0x80, 0x40, 0x00);

  // Note On G4
  tpush(0x00, 0x90, 0x43, 0x64);
  tpush(0x83, 0x60, 0x80, 0x43, 0x00);

  // Note On C5
  tpush(0x00, 0x90, 0x48, 0x64);
  tpush(0x83, 0x60, 0x80, 0x48, 0x00);

  // End of track
  tpush(0x00, 0xff, 0x2f, 0x00);

  // MTrk + length
  push(0x4d, 0x54, 0x72, 0x6b);
  const len = trackData.length;
  push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
  push(...trackData);

  return new Uint8Array(bytes);
}

// Helper: upload test MIDI and wait for parse
async function uploadMidi(page) {
  const midiData = createTestMidi();
  const buffer = Buffer.from(midiData);
  await page.locator('#file-input').setInputFiles({
    name: 'test.mid',
    mimeType: 'audio/midi',
    buffer: buffer,
  });
  // Wait for play button to become enabled (indicates parse complete)
  await expect(page.locator('#btn-play')).toBeEnabled({ timeout: 5000 });
}

test.describe('MIDI Parser App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ===== Initial State =====

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/MIDI/i);
  });

  test('control panel is visible on initial load', async ({ page }) => {
    await expect(page.locator('#control-panel')).toBeVisible();
    await expect(page.locator('#main-container')).toBeVisible();
    await expect(page.locator('#btn-open')).toBeVisible();
  });

  test('play button is disabled before file load', async ({ page }) => {
    await expect(page.locator('#btn-play')).toBeDisabled();
    await expect(page.locator('#btn-stop')).toBeDisabled();
  });

  // ===== File Upload =====

  test('MIDI file upload shows file info and enables controls', async ({ page }) => {
    await uploadMidi(page);

    await expect(page.locator('#info-filename')).toHaveText('test.mid');
    await expect(page.locator('#info-notes')).not.toHaveText('-');
    await expect(page.locator('#btn-play')).toBeEnabled();
  });

  test('channel cards and visualizer are created after MIDI load', async ({ page }) => {
    await uploadMidi(page);

    await expect(page.locator('#visualizer-section')).toBeVisible();
    const cards = page.locator('.channel-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ===== Playback Controls =====

  test('playback controls work after loading MIDI', async ({ page }) => {
    await uploadMidi(page);

    await page.locator('#btn-play').click();
    await expect(page.locator('#btn-stop')).toBeEnabled({ timeout: 5000 });

    await page.locator('#btn-stop').click();
    await expect(page.locator('#btn-stop')).toBeDisabled({ timeout: 5000 });
  });

  test('repeat button toggles active state', async ({ page }) => {
    const repeatBtn = page.locator('#btn-repeat');
    await expect(repeatBtn).not.toHaveClass(/active/);

    await repeatBtn.click();
    await expect(repeatBtn).toHaveClass(/active/);

    await repeatBtn.click();
    await expect(repeatBtn).not.toHaveClass(/active/);
  });

  // ===== Wave Mixer =====

  test('wave mixer with master + 4 wave channels exists', async ({ page }) => {
    const channels = page.locator('.mixer-channel');
    await expect(channels).toHaveCount(5);
    await expect(page.locator('.mixer-channel[data-wave="triangle"] .mixer-btn')).toHaveClass(/active/);
    await expect(page.locator('#master-volume')).toBeVisible();
  });

  test('master volume slider updates display', async ({ page }) => {
    const slider = page.locator('#master-volume');
    const display = page.locator('#master-vol-pct');

    await expect(display).toHaveText('60%');
    await slider.fill('80');
    await expect(display).toHaveText('80%');
    await slider.fill('0');
    await expect(display).toHaveText('0%');
  });

  test('wave type buttons switch active state', async ({ page }) => {
    const sinBtn = page.locator('.mixer-channel[data-wave="sine"] .mixer-btn');
    const triBtn = page.locator('.mixer-channel[data-wave="triangle"] .mixer-btn');

    await expect(triBtn).toHaveClass(/active/);
    await expect(sinBtn).not.toHaveClass(/active/);

    await sinBtn.click();
    await expect(sinBtn).toHaveClass(/active/);
    await expect(triBtn).not.toHaveClass(/active/);
  });

  test('global wave switch updates all channel FX wave buttons', async ({ page }) => {
    await uploadMidi(page);

    // Switch to sine globally
    await page.locator('.mixer-channel[data-wave="sine"] .mixer-btn').click();

    // All channel FX wave buttons should show sine as active
    const activeWaveBtns = page.locator('.fx-wave-btn.active');
    const count = await activeWaveBtns.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      await expect(activeWaveBtns.nth(i)).toHaveAttribute('data-wave', 'sine');
    }
  });

  test('wave volume slider updates display text', async ({ page }) => {
    const slider = page.locator('.mixer-channel[data-wave="triangle"] .mixer-vol');
    const display = page.locator('.mixer-channel[data-wave="triangle"] .mixer-pct');

    await slider.fill('75');
    await expect(display).toHaveText('75%');
  });

  // ===== Per-channel Wave Buttons =====

  test('per-channel wave button changes only that channel', async ({ page }) => {
    await uploadMidi(page);

    // Find first channel's FX wave buttons
    const firstModule = page.locator('.fx-module').first();
    const squareBtn = firstModule.locator('.fx-wave-btn[data-wave="square"]');
    const triBtn = firstModule.locator('.fx-wave-btn[data-wave="triangle"]');

    await expect(triBtn).toHaveClass(/active/);
    await squareBtn.click();
    await expect(squareBtn).toHaveClass(/active/);
    await expect(triBtn).not.toHaveClass(/active/);
  });

  // ===== EQ =====

  test('EQ has 5 bands with correct frequencies', async ({ page }) => {
    const bands = page.locator('.eq-band');
    await expect(bands).toHaveCount(5);

    const expectedFreqs = ['60', '250', '1000', '4000', '12000'];
    for (let i = 0; i < 5; i++) {
      await expect(bands.nth(i)).toHaveAttribute('data-freq', expectedFreqs[i]);
    }
  });

  test('EQ slider updates value display', async ({ page }) => {
    const firstBand = page.locator('.eq-band').first();
    const slider = firstBand.locator('.eq-slider');
    const display = firstBand.locator('.eq-val');

    await expect(display).toHaveText('0');
    await slider.fill('6');
    await expect(display).toHaveText('+6');
    await slider.fill('-3');
    await expect(display).toHaveText('-3');
  });

  // ===== Filter XY Pad =====

  test('XY pad exists with initial labels', async ({ page }) => {
    await expect(page.locator('#xy-pad')).toBeVisible();
    await expect(page.locator('#xy-hpf-label')).toHaveText('HPF: 20Hz');
    await expect(page.locator('#xy-lpf-label')).toHaveText('LPF: 20kHz');
  });

  test('XY pad updates labels on mouse interaction', async ({ page }) => {
    const pad = page.locator('#xy-pad');
    const box = await pad.boundingBox();

    // Click in the center of the pad
    await pad.click({ position: { x: box.width / 2, y: box.height / 2 } });

    // Labels should change from defaults
    const hpfText = await page.locator('#xy-hpf-label').textContent();
    const lpfText = await page.locator('#xy-lpf-label').textContent();
    expect(hpfText).not.toBe('HPF: 20Hz');
    expect(lpfText).not.toBe('LPF: 20kHz');
  });

  // ===== Q Sliders =====

  test('HPF and LPF Q sliders exist with default value 10', async ({ page }) => {
    await expect(page.locator('#hpf-q')).toBeVisible();
    await expect(page.locator('#lpf-q')).toBeVisible();
    await expect(page.locator('#hpf-q-value')).toHaveText('10.0');
    await expect(page.locator('#lpf-q-value')).toHaveText('10.0');
  });

  test('Q slider updates value display', async ({ page }) => {
    const slider = page.locator('#hpf-q');
    const display = page.locator('#hpf-q-value');

    await slider.fill('5');
    await expect(display).toHaveText('5.0');
    await slider.fill('15.5');
    await expect(display).toHaveText('15.5');
  });

  // ===== Metronome =====

  test('metronome controls exist and are initially disabled', async ({ page }) => {
    const toggle = page.locator('#metronome-on');
    const typeSelect = page.locator('#metronome-type');
    const volSlider = page.locator('#metronome-vol');

    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await expect(typeSelect).toBeDisabled();
    await expect(volSlider).toBeDisabled();
  });

  test('metronome toggle enables type and volume controls', async ({ page }) => {
    await page.locator('#metronome-on').check();

    await expect(page.locator('#metronome-type')).toBeEnabled();
    await expect(page.locator('#metronome-vol')).toBeEnabled();
  });

  test('metronome volume slider updates display', async ({ page }) => {
    await page.locator('#metronome-on').check();

    const slider = page.locator('#metronome-vol');
    const display = page.locator('#metronome-vol-val');

    await slider.fill('80');
    await expect(display).toHaveText('80%');
  });

  test('metronome type selector has 5 options', async ({ page }) => {
    const options = page.locator('#metronome-type option');
    await expect(options).toHaveCount(5);
  });

  // ===== Channel Cards =====

  test('channel cards have mute and solo buttons', async ({ page }) => {
    await uploadMidi(page);

    // Skip master card (first), use first channel card with mute/solo
    const channelCard = page.locator('.channel-card .btn-mute').first();
    await expect(channelCard).toBeVisible();
    await expect(page.locator('.channel-card .btn-solo').first()).toBeVisible();
  });

  test('mute button toggles active state', async ({ page }) => {
    await uploadMidi(page);

    const muteBtn = page.locator('.channel-card .btn-mute').first();
    await expect(muteBtn).not.toHaveClass(/active/);

    await muteBtn.click();
    await expect(muteBtn).toHaveClass(/active/);

    await muteBtn.click();
    await expect(muteBtn).not.toHaveClass(/active/);
  });

  test('solo button toggles active state', async ({ page }) => {
    await uploadMidi(page);

    const soloBtn = page.locator('.channel-card .btn-solo').first();
    await expect(soloBtn).not.toHaveClass(/active/);

    await soloBtn.click();
    await expect(soloBtn).toHaveClass(/active/);

    await soloBtn.click();
    await expect(soloBtn).not.toHaveClass(/active/);
  });

  // ===== FX Module =====

  test('FX modules are created for each channel after MIDI load', async ({ page }) => {
    await uploadMidi(page);

    const modules = page.locator('.fx-module');
    const count = await modules.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('FX module has distortion, delay, reverb toggles', async ({ page }) => {
    await uploadMidi(page);

    const firstModule = page.locator('.fx-module').first();
    const toggles = firstModule.locator('.ch-fx-toggle');
    const count = await toggles.count();
    expect(count).toBe(3); // distortion, delay, reverb
  });

  test('FX toggle enables corresponding slider', async ({ page }) => {
    await uploadMidi(page);

    const firstModule = page.locator('.fx-module').first();
    const toggle = firstModule.locator('.ch-fx-toggle').first();
    const slider = firstModule.locator('.ch-fx-slider').first();

    // Initially disabled
    await expect(slider).toBeDisabled();

    // Enable
    await toggle.check();
    await expect(slider).toBeEnabled();

    // Disable
    await toggle.uncheck();
    await expect(slider).toBeDisabled();
  });

  test('FX module has 4 wave type buttons', async ({ page }) => {
    await uploadMidi(page);

    const firstModule = page.locator('.fx-module').first();
    const waveBtns = firstModule.locator('.fx-wave-btn');
    await expect(waveBtns).toHaveCount(4);
  });

  // ===== Spectrum =====

  test('spectrum canvas exists', async ({ page }) => {
    await expect(page.locator('#spectrum-canvas')).toBeVisible();
  });

  // ===== Piano Roll =====

  test('piano roll canvas is visible after MIDI load', async ({ page }) => {
    await uploadMidi(page);
    await expect(page.locator('#piano-roll-canvas')).toBeVisible();
  });

  // ===== Drag & Drop =====

  test('drag overlay activates on dragenter with files', async ({ page }) => {
    const overlay = page.locator('#drag-overlay');
    await expect(overlay).not.toHaveClass(/active/);

    // Simulate dragenter with Files type
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([''], 'test.mid', { type: 'audio/midi' }));
      const event = new DragEvent('dragenter', { bubbles: true, dataTransfer: dt });
      document.body.dispatchEvent(event);
    });

    await expect(overlay).toHaveClass(/active/, { timeout: 2000 });
  });

  // ===== Right Panel =====

  test('right panel contains spectrum and filter sections', async ({ page }) => {
    await expect(page.locator('#right-panel')).toBeVisible();
    await expect(page.locator('#spectrum-canvas')).toBeVisible();
    await expect(page.locator('#xy-pad')).toBeVisible();
  });

  // ===== ピッチシフト =====

  test('pitch shift slider updates global state', async ({ page }) => {
    const slider = page.locator('#pitch-shift');
    await expect(slider).toBeVisible();
    await slider.fill('5');
    await slider.dispatchEvent('input');
    const val = await page.evaluate(() => window._pitchShift);
    expect(val).toBe(5);
    const display = await page.locator('#pitch-shift-val').textContent();
    expect(display).toBe('+5 st');
  });

  test('pitch shift reset button clears value', async ({ page }) => {
    const slider = page.locator('#pitch-shift');
    await slider.fill('7');
    await slider.dispatchEvent('input');
    await page.locator('#pitch-shift-reset').click();
    const val = await page.evaluate(() => window._pitchShift);
    expect(val).toBe(0);
    const display = await page.locator('#pitch-shift-val').textContent();
    expect(display).toBe('0 st');
  });

  // ===== 周波数シフト =====

  test('frequency shift slider updates global state', async ({ page }) => {
    const slider = page.locator('#freq-shift');
    await expect(slider).toBeVisible();
    await slider.fill('-30');
    await slider.dispatchEvent('input');
    const val = await page.evaluate(() => window._freqShift);
    expect(val).toBe(-30);
    const display = await page.locator('#freq-shift-val').textContent();
    expect(display).toBe('-30 Hz');
  });

  test('frequency shift reset button clears value', async ({ page }) => {
    const slider = page.locator('#freq-shift');
    await slider.fill('50');
    await slider.dispatchEvent('input');
    await page.locator('#freq-shift-reset').click();
    const val = await page.evaluate(() => window._freqShift);
    expect(val).toBe(0);
  });

  // ===== スケール変換 =====

  test('scale convert controls exist and are functional', async ({ page }) => {
    await expect(page.locator('#scale-convert-on')).toBeVisible();
    await expect(page.locator('#scale-key')).toBeVisible();
    await expect(page.locator('#scale-from')).toBeVisible();
    await expect(page.locator('#scale-to')).toBeVisible();
  });

  test('scale convert ON updates global state', async ({ page }) => {
    await page.locator('#scale-convert-on').check();
    const cfg = await page.evaluate(() => window._scaleConvert);
    expect(cfg.enabled).toBe(true);
  });

  test('scale convert key/from/to changes update state', async ({ page }) => {
    await page.locator('#scale-key').selectOption('2'); // D
    await page.locator('#scale-from').selectOption('major');
    await page.locator('#scale-to').selectOption('dorian');
    const cfg = await page.evaluate(() => window._scaleConvert);
    expect(cfg.key).toBe(2);
    expect(cfg.from).toBe('major');
    expect(cfg.to).toBe('dorian');
  });

  // ===== フィルターモード切替 =====

  test('filter mode buttons switch active state', async ({ page }) => {
    const bandBtn = page.locator('.filter-mode-btn[data-mode="bandpass"]');
    await bandBtn.click();
    await expect(bandBtn).toHaveClass(/active/);
    const hpfBtn = page.locator('.filter-mode-btn[data-mode="hpf-lpf"]');
    await expect(hpfBtn).not.toHaveClass(/active/);
  });

  test('filter mode defaults to hpf-lpf', async ({ page }) => {
    const hpfBtn = page.locator('.filter-mode-btn[data-mode="hpf-lpf"]');
    await expect(hpfBtn).toHaveClass(/active/);
  });

  // ===== カスタム波形 =====

  test('custom waveform select exists with 10 options', async ({ page }) => {
    const select = page.locator('#custom-waveform-select');
    await expect(select).toBeVisible();
    const options = await select.locator('option').count();
    expect(options).toBe(11); // 1 placeholder + 10 waveforms
  });

  test('custom waveform selection deactivates standard wave buttons', async ({ page }) => {
    await page.locator('#custom-waveform-select').selectOption('organ');
    // 標準波形ボタンはすべて非アクティブ
    for (const wave of ['triangle', 'sine', 'square', 'sawtooth']) {
      const btn = page.locator(`.mixer-channel[data-wave="${wave}"] .mixer-btn`);
      await expect(btn).not.toHaveClass(/active/);
    }
  });

  test('standard wave button click resets custom waveform select', async ({ page }) => {
    await page.locator('#custom-waveform-select').selectOption('piano');
    await page.locator('.mixer-channel[data-wave="sine"] .mixer-btn').click();
    const val = await page.locator('#custom-waveform-select').inputValue();
    expect(val).toBe('');
  });

  // ===== SF2 =====

  test('SF2 button and status display exist', async ({ page }) => {
    await expect(page.locator('#btn-load-sf2')).toBeVisible();
    const name = await page.locator('#sf2-name').textContent();
    expect(name).toBe('未読み込み');
  });

  test('SF2 button click without loaded font opens file dialog', async ({ page }) => {
    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#btn-load-sf2').click()]);
    expect(fileChooser).toBeTruthy();
  });

  // ===== キー自動検出 =====

  test('key detection displays after MIDI load', async ({ page }) => {
    await uploadMidi(page);
    const keyText = await page.locator('#info-key').textContent();
    expect(keyText).not.toBe('-');
    expect(keyText.length).toBeGreaterThan(0);
  });

  // ===== 組み合わせテスト =====

  test('pitch shift and frequency shift can be set simultaneously', async ({ page }) => {
    const pitchSlider = page.locator('#pitch-shift');
    const freqSlider = page.locator('#freq-shift');
    await pitchSlider.fill('3');
    await pitchSlider.dispatchEvent('input');
    await freqSlider.fill('-20');
    await freqSlider.dispatchEvent('input');
    const pitch = await page.evaluate(() => window._pitchShift);
    const freq = await page.evaluate(() => window._freqShift);
    expect(pitch).toBe(3);
    expect(freq).toBe(-20);
  });

  test('scale convert with pitch shift combo', async ({ page }) => {
    await page.locator('#scale-convert-on').check();
    await page.locator('#scale-to').selectOption('minor');
    const pitchSlider = page.locator('#pitch-shift');
    await pitchSlider.fill('-2');
    await pitchSlider.dispatchEvent('input');
    const cfg = await page.evaluate(() => window._scaleConvert);
    const pitch = await page.evaluate(() => window._pitchShift);
    expect(cfg.enabled).toBe(true);
    expect(cfg.to).toBe('minor');
    expect(pitch).toBe(-2);
  });

  test('switching wave type after custom waveform restores standard mode', async ({ page }) => {
    // カスタム波形選択 → 標準波形に戻す
    await page.locator('#custom-waveform-select').selectOption('brass');
    await page.locator('.mixer-channel[data-wave="triangle"] .mixer-btn').click();
    const triBtn = page.locator('.mixer-channel[data-wave="triangle"] .mixer-btn');
    await expect(triBtn).toHaveClass(/active/);
    // SF2は無効のまま
    const useSF2 = await page.evaluate(() => window._useSF2);
    expect(useSF2).toBeFalsy();
  });

  test('midiToFreq applies pitch shift and frequency shift correctly', async ({ page }) => {
    // midiToFreq が全シフトを正しく適用するか検証
    await page.evaluate(() => {
      window._pitchShift = 0;
      window._freqShift = 0;
      window._scaleConvert = { enabled: false };
    });
    const baseFreq = await page.evaluate(() => midiToFreq(69)); // A4
    expect(baseFreq).toBeCloseTo(440, 0);

    // ピッチシフト+12 = 1オクターブ上
    await page.evaluate(() => {
      window._pitchShift = 12;
    });
    const shiftedFreq = await page.evaluate(() => midiToFreq(69));
    expect(shiftedFreq).toBeCloseTo(880, 0);

    // 周波数シフト+10Hz
    await page.evaluate(() => {
      window._pitchShift = 0;
      window._freqShift = 10;
    });
    const freqShifted = await page.evaluate(() => midiToFreq(69));
    expect(freqShifted).toBeCloseTo(450, 0);
  });

  test('midiToFreq clamps to minimum 1Hz', async ({ page }) => {
    await page.evaluate(() => {
      window._pitchShift = 0;
      window._freqShift = -100;
    });
    const freq = await page.evaluate(() => midiToFreq(21)); // A0 = 27.5Hz
    expect(freq).toBeGreaterThanOrEqual(1);
  });

  test('remapNote converts scale correctly', async ({ page }) => {
    // C major → C minor: E(64) → Eb(63)
    await page.evaluate(() => {
      window._scaleConvert = { enabled: true, key: 0, from: 'major', to: 'minor' };
    });
    const remapped = await page.evaluate(() => remapNote(64)); // E4
    expect(remapped).toBe(63); // Eb4
  });

  test('remapNote passes through when disabled', async ({ page }) => {
    await page.evaluate(() => {
      window._scaleConvert = { enabled: false, key: 0, from: 'major', to: 'minor' };
    });
    const remapped = await page.evaluate(() => remapNote(64));
    expect(remapped).toBe(64); // 変換なし
  });

  test('detectKeyScale returns valid key and scale', async ({ page }) => {
    await uploadMidi(page);
    const result = await page.evaluate(() => {
      return detectKeyScale(currentNotes);
    });
    expect(result.key).toBeGreaterThanOrEqual(0);
    expect(result.key).toBeLessThanOrEqual(11);
    expect(typeof result.scale).toBe('string');
  });
});
