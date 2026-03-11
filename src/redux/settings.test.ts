jest.mock('../utils/electronImports', () => ({
  electron: { remote: { app: { getPath: () => '/tmp' } } },
  fs: { writeFileSync: jest.fn() },
  path: { join: (...a: string[]) => a.join('/') },
}));

import { reducer, actions } from './settings';
import { EditSaved, Settings } from './types';

function defaultState(): EditSaved<Settings> {
  return reducer(undefined, { type: '@@INIT' } as any);
}

describe('settings reducer default state', () => {
  it('has matching saved and editing branches', () => {
    const state = defaultState();
    expect(state.saved).toEqual(state.editing);
  });

  it('has default palette selections', () => {
    const state = defaultState();
    expect(state.saved.selectedColorPalette).toBe('petmate');
    expect(state.saved.selectedVic20ColorPalette).toBe('vic20ntsc');
    expect(state.saved.selectedPetColorPalette).toBe('petwhite');
  });

  it('has 4 C64 palettes of 16 colors each', () => {
    const state = defaultState();
    expect(state.saved.palettes.length).toBe(4);
    expect(state.saved.palettes[0].length).toBe(16);
  });

  it('defaults integerScale to false', () => {
    const state = defaultState();
    expect(state.saved.integerScale).toBe(false);
  });
});

describe('LOAD', () => {
  it('loads settings from JSON into both branches', () => {
    const state = defaultState();
    const next = reducer(state, actions.load({
      selectedColorPalette: 'colodore',
      integerScale: true,
    }));
    expect(next.saved.selectedColorPalette).toBe('colodore');
    expect(next.saved.integerScale).toBe(true);
    expect(next.editing).toEqual(next.saved);
  });

  it('fills in defaults for missing JSON fields', () => {
    const state = defaultState();
    const next = reducer(state, actions.load({}));
    // Should use defaults for everything
    expect(next.saved.selectedColorPalette).toBe('petmate');
    expect(next.saved.palettes.length).toBe(4);
  });
});

describe('SAVE_EDITS', () => {
  it('copies editing state to saved', () => {
    let state = defaultState();
    // Modify the editing branch
    state = reducer(state, actions.setSelectedColorPaletteName({
      branch: 'editing',
      name: 'vice',
    }));
    expect(state.editing.selectedColorPalette).toBe('vice');
    expect(state.saved.selectedColorPalette).toBe('petmate');

    state = reducer(state, actions.saveEditsAction());
    expect(state.saved.selectedColorPalette).toBe('vice');
  });
});

describe('CANCEL_EDITS', () => {
  it('reverts editing state back to saved', () => {
    let state = defaultState();
    state = reducer(state, actions.setSelectedColorPaletteName({
      branch: 'editing',
      name: 'vice',
    }));
    expect(state.editing.selectedColorPalette).toBe('vice');

    state = reducer(state, actions.cancelEdits());
    expect(state.editing.selectedColorPalette).toBe('petmate');
  });
});

describe('SET_PALETTE', () => {
  it('updates a specific palette remap in the editing branch', () => {
    const state = defaultState();
    const newPalette = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    const next = reducer(state, actions.setPalette({
      branch: 'editing',
      idx: 0,
      palette: newPalette,
    }));
    expect(next.editing.palettes[0]).toEqual(newPalette);
    // Other palettes unchanged
    expect(next.editing.palettes[1]).toEqual(state.editing.palettes[1]);
    // Saved branch unchanged
    expect(next.saved.palettes[0]).toEqual(state.saved.palettes[0]);
  });
});

describe('SET_SELECTED_COLOR_PALETTE', () => {
  it('changes the selected color palette name', () => {
    const state = defaultState();
    const next = reducer(state, actions.setSelectedColorPaletteName({
      branch: 'editing',
      name: 'pepto',
    }));
    expect(next.editing.selectedColorPalette).toBe('pepto');
  });
});

describe('SET_SELECTED_VIC20_COLOR_PALETTE', () => {
  it('changes the selected VIC-20 palette', () => {
    const state = defaultState();
    const next = reducer(state, actions.setVic20SelectedColorPaletteName({
      branch: 'editing',
      name: 'vic20pal',
    }));
    expect(next.editing.selectedVic20ColorPalette).toBe('vic20pal');
  });
});

describe('SET_SELECTED_PET_COLOR_PALETTE', () => {
  it('changes the selected PET palette', () => {
    const state = defaultState();
    const next = reducer(state, actions.setPetSelectedColorPaletteName({
      branch: 'editing',
      name: 'petgreen',
    }));
    expect(next.editing.selectedPetColorPalette).toBe('petgreen');
  });
});

describe('SET_INTEGER_SCALE', () => {
  it('toggles integer scale', () => {
    const state = defaultState();
    const next = reducer(state, actions.setIntegerScale({
      branch: 'editing',
      scale: true,
    }));
    expect(next.editing.integerScale).toBe(true);
  });
});

describe('SET_ULTIMATE_ADDRESS', () => {
  it('updates the Ultimate cart address', () => {
    const state = defaultState();
    const next = reducer(state, actions.setUltimateAddress({
      branch: 'editing',
      address: 'http://10.0.0.5',
    }));
    expect(next.editing.ultimateAddress).toBe('http://10.0.0.5');
  });
});
