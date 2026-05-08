import { BoxPreset, Framebuf, LinePreset, SettingsJson, TexturePreset } from '../redux/types';
import {
  importBoxPresetsFromFramebuf,
  importLinePresetsFromFramebuf,
  importTexturePresetsFromFramebuf,
} from './presetImport';
import bundledDefaultsWorkspace from './bundledDefaultsWorkspace.json';

const PRESET_GROUPS = new Set(['c64', 'c64l', 'vic20', 'vic20l', 'pet', 'petl', 'c128vdc', 'c16', 'c16l']);

type SettingsDefaultsPatch = Pick<SettingsJson, 'linePresets' | 'boxPresetsByGroup' | 'texturePresetsByGroup'>;
type BundledWorkspaceFramebuf = Omit<Framebuf, 'zoomReady'> & { zoomReady?: boolean };

function cloneLinePresets(presets: LinePreset[]): LinePreset[] {
  return presets.map((p) => ({ ...p, chars: [...p.chars] }));
}

function cloneBoxPresetsByGroup(map: Record<string, BoxPreset[]>): Record<string, BoxPreset[]> {
  const out: Record<string, BoxPreset[]> = {};
  for (const [group, presets] of Object.entries(map)) {
    out[group] = JSON.parse(JSON.stringify(presets));
  }
  return out;
}

function cloneTexturePresetsByGroup(map: Record<string, TexturePreset[]>): Record<string, TexturePreset[]> {
  const out: Record<string, TexturePreset[]> = {};
  for (const [group, presets] of Object.entries(map)) {
    out[group] = JSON.parse(JSON.stringify(presets));
  }
  return out;
}

function cloneSettingsDefaultsPatch(patch: SettingsDefaultsPatch): SettingsDefaultsPatch {
  return {
    ...(patch.linePresets ? { linePresets: cloneLinePresets(patch.linePresets) } : {}),
    ...(patch.boxPresetsByGroup ? { boxPresetsByGroup: cloneBoxPresetsByGroup(patch.boxPresetsByGroup) } : {}),
    ...(patch.texturePresetsByGroup ? { texturePresetsByGroup: cloneTexturePresetsByGroup(patch.texturePresetsByGroup) } : {}),
  };
}

function parseGroupFromFrameName(name: string | undefined, prefix: 'boxes' | 'textures'): string | null {
  if (!name) return null;
  const m = name.toLowerCase().match(new RegExp(`^${prefix}_(.+?)_\\d+$`));
  if (!m || !m[1]) return null;
  return PRESET_GROUPS.has(m[1]) ? m[1] : null;
}

function loadBundledDefaultsFromInternalWorkspace(): SettingsDefaultsPatch | null {
  try {
    const ws = bundledDefaultsWorkspace as unknown as { framebufs?: BundledWorkspaceFramebuf[] };
    const framebufs = Array.isArray(ws.framebufs)
      ? ws.framebufs.map((fb) => ({ ...fb, zoomReady: fb.zoomReady ?? false } as Framebuf))
      : [];
    if (framebufs.length === 0) return null;

    let linePresets: LinePreset[] | undefined;
    const boxPresetsByGroup: Record<string, BoxPreset[]> = {};
    const texturePresetsByGroup: Record<string, TexturePreset[]> = {};

    for (const fb of framebufs) {
      const nameLc = (fb.name ?? '').toLowerCase();

      if (!linePresets && (nameLc.startsWith('lines_') || nameLc.includes('_lines_'))) {
        const importedLines = importLinePresetsFromFramebuf(fb);
        if (importedLines && importedLines.presets.length > 0) {
          linePresets = importedLines.presets;
        }
      }

      if (nameLc.startsWith('boxes_') || nameLc.includes('_boxes_')) {
        const importedBoxes = importBoxPresetsFromFramebuf(fb);
        if (importedBoxes && importedBoxes.presets.length > 0) {
          const group = importedBoxes.group ?? parseGroupFromFrameName(fb.name, 'boxes');
          if (group) boxPresetsByGroup[group] = importedBoxes.presets;
        }
      }

      if (nameLc.startsWith('textures_') || nameLc.includes('_textures_')) {
        const importedTextures = importTexturePresetsFromFramebuf(fb);
        if (importedTextures && importedTextures.presets.length > 0) {
          const group = importedTextures.group ?? parseGroupFromFrameName(fb.name, 'textures');
          if (group) texturePresetsByGroup[group] = importedTextures.presets;
        }
      }
    }

    const patch: SettingsDefaultsPatch = {};
    if (linePresets && linePresets.length > 0) patch.linePresets = linePresets;
    if (Object.keys(boxPresetsByGroup).length > 0) patch.boxPresetsByGroup = boxPresetsByGroup;
    if (Object.keys(texturePresetsByGroup).length > 0) patch.texturePresetsByGroup = texturePresetsByGroup;

    return Object.keys(patch).length > 0 ? patch : null;
  } catch (err) {
    console.warn('Unable to load internal bundled preset defaults workspace.', err);
    return null;
  }
}

let cachedBundledDefaultsPatch: SettingsDefaultsPatch | null | undefined;

/** Return line/box/texture defaults sourced from _defaults/AllDefaults_n0918.petmate.
 * Returns null when the internal bundled defaults workspace cannot be parsed. */
export function getBundledDefaultsSettingsPatch(): SettingsDefaultsPatch | null {
  if (cachedBundledDefaultsPatch === undefined) {
    cachedBundledDefaultsPatch = loadBundledDefaultsFromInternalWorkspace();
  }
  return cachedBundledDefaultsPatch ? cloneSettingsDefaultsPatch(cachedBundledDefaultsPatch) : null;
}

