// settings.ts re-exports `normalizeUltimatePresets` and friends and pulls in
// the toolbar module, which in turn imports utils/index.ts at module load
// (font/template assets are loaded eagerly via electron.remote.app.getAppPath
// + fs.readFileSync).  The mock below has to satisfy that whole chain so the
// test file can be loaded under jsdom.  This mirrors the shape used by
// screens.test.ts and toolbar.test.ts.
jest.mock('../utils/electronImports', () => ({
  electron: {
    remote: {
      app: {
        getPath: () => '/tmp',
        getAppPath: () => '/mock',
        getVersion: () => '0.0.0',
        addRecentDocument: jest.fn(),
      },
      getCurrentWindow: jest.fn(),
      process: { platform: 'darwin' },
      dialog: {},
    },
    ipcRenderer: { send: jest.fn() },
    clipboard: {
      writeBuffer: jest.fn(),
      readBuffer: jest.fn(),
      readText: jest.fn(),
      has: jest.fn(),
      availableFormats: jest.fn(),
    },
  },
  fs: {
    readFileSync: () => Buffer.alloc(2048),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
    existsSync: () => false,
  },
  path: {
    resolve: (...a: string[]) => a.join('/'),
    join: (...a: string[]) => a.join('/'),
    extname: (_f: string) => '',
    dirname: (p: string) => p.split('/').slice(0, -1).join('/') || '/',
    basename: (p: string) => p.split('/').pop(),
  },
  buffer: {},
  app: {},
}));

// Break the toolbar ↔ brush circular dependency so this test file can load
// the settings reducer (settings.ts imports from './toolbar').
jest.mock('./brush', () => ({
  findTransformedChar: jest.fn((_font: any, code: number) => code),
  findInverseChar: jest.fn((_font: any, code: number) => code),
  mirrorBrush: jest.fn(),
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

  it('defaults showTransparency to true', () => {
    const state = defaultState();
    expect(state.saved.showTransparency).toBe(true);
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

describe('SET_SHOW_TRANSPARENCY', () => {
  it('updates transparency visibility preference', () => {
    const state = defaultState();
    const next = reducer(state, actions.setShowTransparency({
      branch: 'editing',
      show: false,
    }));
    expect(next.editing.showTransparency).toBe(false);
    expect(next.saved.showTransparency).toBe(true);
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

describe('Settings file writes are atomic (temp file + rename)', () => {
  it('writes to a temp path and renames it into place rather than truncating the destination directly', () => {
    const electronImports = require('../utils/electronImports');
    const mockFs = electronImports.fs as { writeFileSync: jest.Mock; renameSync: jest.Mock };
    mockFs.writeFileSync.mockClear();
    mockFs.renameSync.mockClear();

    let state = defaultState();
    const fakeStore: any = {
      getState: () => ({ settings: state }),
      dispatch: (action: any) => {
        if (typeof action === 'function') {
          return action(fakeStore.dispatch, fakeStore.getState);
        }
        state = reducer(state, action);
        return action;
      },
    };

    fakeStore.dispatch(actions.applyShowTransparencyImmediate(false));

    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockFs.renameSync).toHaveBeenCalledTimes(1);
    const [writtenPath] = mockFs.writeFileSync.mock.calls[0];
    const [renamedFrom, renamedTo] = mockFs.renameSync.mock.calls[0];
    // The initial write must target a temp path distinct from the real
    // Settings file, and the rename must move that exact temp path onto it.
    expect(writtenPath).not.toBe('/tmp/Settings');
    expect(renamedFrom).toBe(writtenPath);
    expect(renamedTo).toBe('/tmp/Settings');
  });
});

describe('MERGE_EXTERNAL', () => {
  it('adopts an external change into both branches when untouched', () => {
    const state = defaultState();
    const next = reducer(state, actions.mergeExternal({
      showTransparency: false,
    }));
    expect(next.saved.showTransparency).toBe(false);
    expect(next.editing.showTransparency).toBe(false);
  });

  it('does not clobber an in-progress Preferences-dialog edit', () => {
    let state = defaultState();
    // User has an unsaved edit in the Preferences dialog (editing diverges
    // from saved) for showTransparency.
    state = reducer(state, actions.setShowTransparency({
      branch: 'editing',
      show: false,
    }));
    expect(state.editing.showTransparency).toBe(false);
    expect(state.saved.showTransparency).toBe(true);

    // Meanwhile another instance changes the same key on disk to a third
    // value, and the file-watcher merges it in.
    const next = reducer(state, actions.mergeExternal({
      showTransparency: true,
    }));
    // saved tracks the new persisted baseline...
    expect(next.saved.showTransparency).toBe(true);
    // ...but the user's unsaved draft must survive untouched.
    expect(next.editing.showTransparency).toBe(false);
  });

  it('still adopts untouched keys while protecting an edited one in the same patch', () => {
    let state = defaultState();
    state = reducer(state, actions.setShowTransparency({
      branch: 'editing',
      show: false,
    }));
    const next = reducer(state, actions.mergeExternal({
      showTransparency: true,
      showColorNumbers: true,
    }));
    // Edited key: saved updates, editing draft is preserved.
    expect(next.saved.showTransparency).toBe(true);
    expect(next.editing.showTransparency).toBe(false);
    // Untouched key: both branches adopt the external value.
    expect(next.saved.showColorNumbers).toBe(true);
    expect(next.editing.showColorNumbers).toBe(true);
  });
});
