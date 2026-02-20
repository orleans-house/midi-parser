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
  // Wait for controls to become visible (indicates parse complete)
  await expect(page.locator('#controls')).toBeVisible({ timeout: 5000 });
}

test.describe('MIDI Parser App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/MIDI/i);
  });

  test('drop zone is visible on initial load', async ({ page }) => {
    await expect(page.locator('#drop-zone')).toBeVisible();
  });

  test('controls are hidden before file load', async ({ page }) => {
    await expect(page.locator('#controls')).toBeHidden();
  });

  test('MIDI file upload shows controls and instrument info', async ({ page }) => {
    await uploadMidi(page);

    // Play and stop buttons should be visible
    await expect(page.locator('#btn-play')).toBeVisible();
    await expect(page.locator('#btn-stop')).toBeVisible();

    // Wave type selector should be visible
    await expect(page.locator('#wave-type')).toBeVisible();

    // Ch.1 should show instrument name (Acoustic Grand Piano)
    await expect(page.locator('#channel-card-0')).toContainText('Acoustic Grand Piano');
  });

  test('channel cards and visualizer are created after MIDI load', async ({ page }) => {
    await uploadMidi(page);

    // Visualizer section should be visible
    await expect(page.locator('#visualizer-section')).toBeVisible();

    // 16 channel cards + 1 master card
    const cards = page.locator('.channel-card');
    const count = await cards.count();
    expect(count).toBe(17);
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
});
