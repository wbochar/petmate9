import React, { useCallback } from 'react';
import { connect } from 'react-redux';
import Modal from '../components/Modal';
import { Toolbar } from '../redux/toolbar';
import * as selectors from '../redux/selectors';
import { DEFAULT_TEXTURE_OPTIONS, RootState, LinePreset, BoxPreset, BoxSide, TexturePreset, PresetDialogState } from '../redux/types';
import { importBoxPresetsFromFramebuf, importLinePresetsFromFramebuf, importTexturePresetsFromFramebuf } from '../utils/presetImport';
import { getColorGroup } from '../utils/palette';
import common from './ModalCommon.module.css';

interface PresetDialogStateProps {
  presetDialog: PresetDialogState;
  framebufList: RootState['framebufList'];
  linePresets: LinePreset[];
  boxPresetsByGroup: Record<string, BoxPreset[]>;
  texturePresetsByGroup: Record<string, TexturePreset[]>;
  activeGroup: string;
}

interface PresetDialogDispatchProps {
  Toolbar: ReturnType<typeof Toolbar.bindDispatch>;
}

type PresetDialogProps = PresetDialogStateProps & PresetDialogDispatchProps;

function isBoxPresetFrameName(name: string | undefined) {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return normalized.startsWith('boxes_') || normalized.includes('_boxes_');
}

function isTexturePresetFrameName(name: string | undefined) {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return normalized.startsWith('textures_') || normalized.includes('_textures_');
}

function isLinePresetFrameName(name: string | undefined) {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return normalized.startsWith('lines_') || normalized.includes('_lines_');
}

function dedupeBy<T>(list: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function collectImportedPresets(framebufList: RootState['framebufList']) {
  const boxByGroup: Record<string, BoxPreset[]> = {};
  const textureByGroup: Record<string, TexturePreset[]> = {};
  let linePresets: LinePreset[] = [];

  for (const entry of framebufList) {
    const fb = entry.present;
    if (!fb || !fb.name) continue;
    if (isBoxPresetFrameName(fb.name)) {
      const res = importBoxPresetsFromFramebuf(fb);
      if (!res) continue;
      const group = res.group ?? getColorGroup(fb.charset, fb.width);
      boxByGroup[group] = [...(boxByGroup[group] ?? []), ...res.presets];
    } else if (isTexturePresetFrameName(fb.name)) {
      const res = importTexturePresetsFromFramebuf(fb);
      if (!res) continue;
      const group = res.group ?? getColorGroup(fb.charset, fb.width);
      textureByGroup[group] = [...(textureByGroup[group] ?? []), ...res.presets];
    } else if (isLinePresetFrameName(fb.name)) {
      const res = importLinePresetsFromFramebuf(fb);
      if (!res) continue;
      linePresets = [...linePresets, ...res.presets];
    }
  }

  return { boxByGroup, textureByGroup, linePresets };
}

function PresetDialog({
  presetDialog,
  framebufList,
  linePresets,
  boxPresetsByGroup,
  texturePresetsByGroup,
  activeGroup,
  Toolbar: toolbarActions,
}: PresetDialogProps) {
  const close = useCallback(() => {
    toolbarActions.setPresetDialog({ show: false });
  }, [toolbarActions]);

  const applyImport = useCallback((modeMerge: boolean) => {
    const imported = collectImportedPresets(framebufList);
    const importedAnything =
      Object.keys(imported.boxByGroup).length > 0 ||
      Object.keys(imported.textureByGroup).length > 0 ||
      imported.linePresets.length > 0;
    if (!importedAnything) {
      close();
      return;
    }

    for (const [group, presets] of Object.entries(imported.boxByGroup)) {
      const existing = boxPresetsByGroup[group] ?? [];
      const next = modeMerge
        ? dedupeBy([...existing, ...presets], (p) => JSON.stringify(p))
        : dedupeBy(presets, (p) => JSON.stringify(p));
      toolbarActions.setBoxPresetsForGroup(group, next);
    }

    for (const [group, presets] of Object.entries(imported.textureByGroup)) {
      const existing = texturePresetsByGroup[group] ?? [];
      const next = modeMerge
        ? dedupeBy([...existing, ...presets], (p) => JSON.stringify(p))
        : dedupeBy(presets, (p) => JSON.stringify(p));
      toolbarActions.setTexturePresetsForGroup(group, next);
    }

    if (imported.linePresets.length > 0) {
      const importedDeduped = dedupeBy(imported.linePresets, (p) => JSON.stringify(p.chars));
      const merged = modeMerge
        ? dedupeBy([...linePresets, ...importedDeduped], (p) => JSON.stringify(p.chars))
        : importedDeduped;
      const renamed = merged.map((p, i) => ({ ...p, name: `Line ${i + 1}` }));
      toolbarActions.setLinePresets(renamed);
      toolbarActions.setSelectedLinePresetIndex(0);
    }

    if (imported.boxByGroup[activeGroup]) {
      toolbarActions.setSelectedBoxPresetIndex(0);
    }
    if (imported.textureByGroup[activeGroup]) {
      toolbarActions.setSelectedTexturePresetIndex(0);
    }

    close();
  }, [
    framebufList,
    boxPresetsByGroup,
    texturePresetsByGroup,
    linePresets,
    activeGroup,
    toolbarActions,
    close,
  ]);

  const applyPanelImport = useCallback((modeMerge: boolean) => {
    const kind = presetDialog.importKind;
    const sourceIndex = presetDialog.sourceFramebufIndex;
    if (!kind || typeof sourceIndex !== 'number') {
      close();
      return;
    }
    const fb = framebufList[sourceIndex]?.present;
    if (!fb) {
      close();
      return;
    }

    if (kind === 'boxes') {
      if (!isBoxPresetFrameName(fb.name)) {
        close();
        return;
      }
      const imported = importBoxPresetsFromFramebuf(fb);
      if (!imported || imported.presets.length === 0) {
        close();
        return;
      }
      const targetGroup = imported.group ?? getColorGroup(fb.charset, fb.width);
      const existing = boxPresetsByGroup[targetGroup] ?? [];
      const next = modeMerge
        ? dedupeBy([...existing, ...imported.presets], (p) => JSON.stringify(p))
        : dedupeBy(imported.presets, (p) => JSON.stringify(p));
      toolbarActions.setBoxPresetsForGroup(targetGroup, next);
      if (targetGroup === activeGroup) {
        toolbarActions.setSelectedBoxPresetIndex(0);
      }
      close();
      return;
    }

    if (kind === 'textures') {
      if (!isTexturePresetFrameName(fb.name)) {
        close();
        return;
      }
      const imported = importTexturePresetsFromFramebuf(fb);
      if (!imported || imported.presets.length === 0) {
        close();
        return;
      }
      const targetGroup = imported.group ?? getColorGroup(fb.charset, fb.width);
      const existing = texturePresetsByGroup[targetGroup] ?? [];
      const next = modeMerge
        ? dedupeBy([...existing, ...imported.presets], (p) => JSON.stringify(p))
        : dedupeBy(imported.presets, (p) => JSON.stringify(p));
      toolbarActions.setTexturePresetsForGroup(targetGroup, next);
      if (targetGroup === activeGroup) {
        toolbarActions.setSelectedTexturePresetIndex(0);
      }
      close();
      return;
    }

    if (!isLinePresetFrameName(fb.name)) {
      close();
      return;
    }
    const imported = importLinePresetsFromFramebuf(fb);
    if (!imported || imported.presets.length === 0) {
      close();
      return;
    }
    const importedDeduped = dedupeBy(imported.presets, (p) => JSON.stringify(p.chars));
    const merged = modeMerge
      ? dedupeBy([...linePresets, ...importedDeduped], (p) => JSON.stringify(p.chars))
      : importedDeduped;
    const renamed = merged.map((p, i) => ({ ...p, name: `Line ${i + 1}` }));
    toolbarActions.setLinePresets(renamed);
    toolbarActions.setSelectedLinePresetIndex(0);
    close();
  }, [
    presetDialog.importKind,
    presetDialog.sourceFramebufIndex,
    framebufList,
    boxPresetsByGroup,
    texturePresetsByGroup,
    linePresets,
    activeGroup,
    toolbarActions,
    close,
  ]);

  const applyClear = useCallback((kind: 'boxes' | 'textures' | 'lines') => {
    if (kind === 'lines') {
      const blank: LinePreset = { name: 'Line 1', chars: Array(16).fill(0x20) };
      toolbarActions.setLinePresets([blank]);
      toolbarActions.setSelectedLinePresetIndex(0);
      close();
      return;
    }

    if (kind === 'boxes') {
      const side: BoxSide = {
        chars: [0x20],
        colors: [14],
        mirror: false,
        stretch: false,
        repeat: true,
        startEnd: 'none',
      };
      const blank: BoxPreset = {
        name: 'Box 1',
        corners: [0x20, 0x20, 0x20, 0x20],
        cornerColors: [14, 14, 14, 14],
        top: { ...side },
        bottom: { ...side },
        left: { ...side },
        right: { ...side },
        fill: 256,
        fillColor: 14,
      };
      toolbarActions.setBoxPresetsForGroup(activeGroup, [blank]);
      toolbarActions.setSelectedBoxPresetIndex(0);
      close();
      return;
    }

    const blank: TexturePreset = {
      name: 'Texture 1',
      chars: [0x20],
      colors: [14],
      options: [...DEFAULT_TEXTURE_OPTIONS],
      random: false,
      brushWidth: 8,
      brushHeight: 8,
    };
    toolbarActions.setTexturePresetsForGroup(activeGroup, [blank]);
    toolbarActions.setSelectedTexturePresetIndex(0);
    close();
  }, [toolbarActions, activeGroup, close]);

  const clearKind = presetDialog.clearKind ?? 'lines';
  const clearLabel = clearKind === 'lines'
    ? 'all line presets'
    : clearKind === 'boxes'
      ? 'all box presets for the active platform'
      : 'all texture presets for the active platform';
  const panelImportLabel = presetDialog.importKind === 'boxes'
    ? 'box'
    : presetDialog.importKind === 'textures'
      ? 'texture'
      : 'separator';

  return (
    <Modal showModal={presetDialog.show}>
      <div className={common.container}>
        {presetDialog.type === 'import-all' ? (
          <>
            <div className={common.title}>Import all presets</div>
            <div style={{ fontSize: '12px', marginBottom: '8px' }}>
              Choose how imported presets should be applied.
            </div>
            <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
              Merge keeps existing presets and appends imported ones (duplicates removed).<br />
              Replace discards existing presets and uses only imported presets (duplicates removed).
            </div>
            <div className={common.footer}>
              <button className='cancel' onClick={close}>Cancel</button>
              <button className='cancel' onClick={() => applyImport(false)}>Replace</button>
              <button className='primary' onClick={() => applyImport(true)}>Merge</button>
            </div>
          </>
        ) : presetDialog.type === 'import-panel' ? (
          <>
            <div className={common.title}>Import {panelImportLabel} presets</div>
            <div style={{ fontSize: '12px', marginBottom: '8px' }}>
              Choose how imported presets should be applied.
            </div>
            <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
              Merge keeps existing presets and appends imported ones (duplicates removed).<br />
              Replace discards existing presets and uses only imported presets (duplicates removed).
            </div>
            <div className={common.footer}>
              <button className='cancel' onClick={close}>Cancel</button>
              <button className='cancel' onClick={() => applyPanelImport(false)}>Replace</button>
              <button className='primary' onClick={() => applyPanelImport(true)}>Merge</button>
            </div>
          </>
        ) : (
          <>
            <div className={common.title}>Clear presets</div>
            <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
              Are you sure you want to clear {clearLabel}?<br />
              This will reset presets to a single blank entry and cannot be undone.
            </div>
            <div className={common.footer}>
              <button className='cancel' onClick={close}>Cancel</button>
              <button className='primary' onClick={() => applyClear(clearKind)}>Clear</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default connect(
  (state: RootState) => ({
    presetDialog: state.toolbar.presetDialog,
    framebufList: state.framebufList,
    linePresets: state.toolbar.linePresets,
    boxPresetsByGroup: state.toolbar.boxPresetsByGroup,
    texturePresetsByGroup: state.toolbar.texturePresetsByGroup,
    activeGroup: selectors.getActivePresetGroup(state),
  }),
  (dispatch) => ({
    Toolbar: Toolbar.bindDispatch(dispatch),
  }),
)(PresetDialog);
