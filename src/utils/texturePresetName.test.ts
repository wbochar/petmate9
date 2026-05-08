import {
  buildTexturesExportPixels,
  normalizeTexturePresetName,
  PRESET_EXPORT_WIDTH,
  TEXTURE_NAME_MARKER,
  TEXTURE_PRESET_NAME_MAX_CHARS,
} from './presetExport';
import { TexturePreset } from '../redux/types';

function nameCharToScreencode(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 64;
  if (code >= 48 && code <= 57) return code - 48 + 0x30;
  return 0x20;
}

describe('normalizeTexturePresetName', () => {
  test('uppercases and truncates to exporter-compatible name width', () => {
    const raw = 'texture_name_that_is_way_too_long_1234567890';
    const normalized = normalizeTexturePresetName(raw);
    expect(TEXTURE_PRESET_NAME_MAX_CHARS).toBe(PRESET_EXPORT_WIDTH - 1);
    expect(normalized).toBe(raw.toUpperCase().slice(0, TEXTURE_PRESET_NAME_MAX_CHARS));
    expect(normalized.length).toBe(TEXTURE_PRESET_NAME_MAX_CHARS);
  });
});

describe('buildTexturesExportPixels name row', () => {
  test('writes normalized texture names and keeps last cell as NAME_MARKER', () => {
    const preset: TexturePreset = {
      name: 'miXed case 123 !@#',
      chars: [0x41, 0x42],
      colors: [14, 14],
    };
    const rows = buildTexturesExportPixels([preset], 'c64', 14, PRESET_EXPORT_WIDTH, false);
    const nameRow = rows[0];
    const normalized = normalizeTexturePresetName(preset.name);

    for (let i = 0; i < normalized.length; i++) {
      expect(nameRow[i].code).toBe(nameCharToScreencode(normalized[i]));
    }
    for (let i = normalized.length; i < PRESET_EXPORT_WIDTH - 1; i++) {
      expect(nameRow[i].code).toBe(0x20);
    }
    expect(nameRow[PRESET_EXPORT_WIDTH - 1].code).toBe(TEXTURE_NAME_MARKER);
  });
});
