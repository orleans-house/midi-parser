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
});
