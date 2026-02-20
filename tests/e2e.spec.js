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

  test('MIDI file upload shows file info and enables controls', async ({ page }) => {
    await uploadMidi(page);

    // File info should be populated
    await expect(page.locator('#info-filename')).toHaveText('test.mid');
    await expect(page.locator('#info-notes')).not.toHaveText('-');

    // Play button should be enabled
    await expect(page.locator('#btn-play')).toBeEnabled();
  });

  test('channel cards and visualizer are created after MIDI load', async ({ page }) => {
    await uploadMidi(page);

    // Visualizer section should be visible
    await expect(page.locator('#visualizer-section')).toBeVisible();

    // At least some channel cards should exist
    const cards = page.locator('.channel-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('playback controls work after loading MIDI', async ({ page }) => {
    await uploadMidi(page);

    // Click play
    await page.locator('#btn-play').click();

    // Stop button should become enabled
    await expect(page.locator('#btn-stop')).toBeEnabled({ timeout: 5000 });

    // Click stop
    await page.locator('#btn-stop').click();

    // Stop button should be disabled again
    await expect(page.locator('#btn-stop')).toBeDisabled({ timeout: 5000 });
  });

  test('volume slider exists and has default value', async ({ page }) => {
    await expect(page.locator('#master-volume')).toBeVisible();
    await expect(page.locator('#volume-display')).toHaveText('50%');
  });
});
