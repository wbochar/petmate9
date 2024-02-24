
const { app, Menu, shell } = require('electron');

const importers = [
  { label: '&D64 disk image (.d64)', cmd: 'import-d64' },
  { label: 'PETSCII (.&c)', cmd: 'import-marq-c' },
  { label: '&PNG (.png)', cmd: 'import-png' },
  { label: '&SEQ (.seq)', cmd: 'import-seq' }
]

const exporters = [
  { label: '&Assembler source (.asm)', cmd: 'export-asm' },
  { label: '&BASIC (.bas)', cmd: 'export-basic' },
  { label: '&D64 disk image (.d64)', cmd: 'export-d64' },
  { label: '&Executable (.prg)', cmd: 'export-prg' },
  { label: '&GIF (.gif)', cmd: 'export-gif' },
  { label: '&JSON (.json)', cmd: 'export-json' },
  { label: 'PETSCII (.&c)', cmd: 'export-marq-c' },
  { label: '&PNG (.png)', cmd: 'export-png' },
  { label: '&SEQ (.seq)', cmd: 'export-seq' },
  { label: 'PE&T (.pet)', cmd: 'export-pet' }
]

module.exports = class MenuBuilder {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
  }

  sendMenuCommand (msg) {
    this.mainWindow.webContents.send('menu', msg)
  }

  buildMenu() {
    if (!app.isPackaged) {
    //  this.setupDevelopmentEnvironment();
    }

    const template  = process.platform === 'darwin'
      ? this.buildDarwinTemplate()
      : this.buildDefaultTemplate();

    // @ts-ignore
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return menu;
  }

  mkImportCmd (label, cmd) {
    return {
      label,
      click: () => {
        this.sendMenuCommand(cmd)
      }
    }
  }

  mkExportCmd (label, cmd) {
    return {
      label,
      click: () => {
        this.sendMenuCommand(cmd)
      }
    }
  }

  setupDevelopmentEnvironment() {
    this.mainWindow.webContents.on('context-menu', (e, props) => {
      const { x, y } = props;

      Menu.buildFromTemplate([
        {
          label: 'Inspect element',
          click: () => {
            this.mainWindow.inspectElement(x, y);
          }
        }
      ]).popup(this.mainWindow);
    });
  }

  buildDarwinTemplate() {
    const subMenuAbout = {
      label: 'Petmate 9',
      submenu: [
        {
          label: 'About Petmate 9',
          selector: 'orderFrontStandardAboutPanel:'
        },
        { type: 'separator' },
        { label: 'Preferences...',
          accelerator: 'Command+,',
          click: () => {
            this.sendMenuCommand('preferences');
          }
        },
        { type: 'separator' },
        {
          label: 'Hide Petmate 9',
          accelerator: 'Command+H',
          selector: 'hide:'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          selector: 'hideOtherApplications:'
        },
        { label: 'Show All', selector: 'unhideAllApplications:' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    };
    const subMenuFile = {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'Command+N',
          click: () => {
            this.sendMenuCommand('new');
          }
        },
        { label: 'New Screen', accelerator: 'Command+T',
          click: () => {
            this.sendMenuCommand('new-screen');
          }
        },
        { label: 'New DirArt', accelerator: 'Command+D',
        click: () => {
          this.sendMenuCommand('new-dirart');
        }
      },
        { type: 'separator' },
        { label: 'Open File...', accelerator: 'Command+O',
          click: () => {
            this.sendMenuCommand('open');
          }
        },
        { type: 'separator' },
        { label: 'Save', accelerator: 'Command+S',
          click: () => {
            this.sendMenuCommand('save');
          }
        },
        { label: 'Save As...', accelerator: 'Command+Shift+S',
          click: () => {
            this.sendMenuCommand('save-as');
          }
        },
        { type: 'separator' },
        { label: 'Import...',
          submenu: importers.map(decl => this.mkImportCmd(decl.label, decl.cmd))
        },
        { label: 'Export As...',
          submenu: exporters.map(decl => this.mkExportCmd(decl.label, decl.cmd))
        },
        { type: 'separator' },
        { label: 'Fonts...',
          click: () => {
            this.sendMenuCommand('custom-fonts');
          }
        },
      ]
    };
    const subMenuEdit = {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'Command+Z', selector: 'undo:',
          click: () => {
            this.sendMenuCommand('undo');
          }
        },
        { label: 'Redo', accelerator: 'Shift+Command+Z', selector: 'redo:',
          click: () => {
            this.sendMenuCommand('redo');
          }
        },
        { type: 'separator' },
        { label: 'Paste Text', accelerator: 'Command+V',
          click: () => {
            this.sendMenuCommand('paste-text');
          }
        },
      ]
    };
    const subMenuImage = {
      label: 'Image',
      submenu: [
        { label: 'Shift Left', accelerator: 'Alt+Left',
          click: () => {
            this.sendMenuCommand('shift-screen-left');
          }
        },
        { label: 'Shift Right', accelerator: 'Alt+Right',
          click: () => {
            this.sendMenuCommand('shift-screen-right');
          }
        },
        { label: 'Shift Up', accelerator: 'Alt+Up',
          click: () => {
            this.sendMenuCommand('shift-screen-up');
          }
        },
        { label: 'Shift Down', accelerator: 'Alt+Down',
          click: () => {
            this.sendMenuCommand('shift-screen-down');
          }
        },

        { type: 'separator' },
        { label: 'Border On/Off', accelerator: 'Command+B',
          click: () => {
            this.sendMenuCommand('toggle-border');
          }
        },
        { label: 'Grid On/Off', accelerator: 'Command+G',
          click: () => {
            this.sendMenuCommand('toggle-grid');
          }
        },
        { label: 'Crop/Resize Image', accelerator: 'Command+\\',
          click: () => {
            this.sendMenuCommand('crop-screen');
          }
        },
        { label: 'Clear Image', accelerator: 'Shift+Home',
        click: () => {
          this.sendMenuCommand('clear-screen');
        }
      }




      ]
    };

const subMenuSelection = {
  label: '&Selection',
  submenu: [

    { label: 'Select &All', accelerator: 'Command+A',
      click: () => {
        this.sendMenuCommand('selection-select-all');
      }
    },
    { type: 'separator' },
    { label: 'Paste to &New Image', accelerator: 'Command+N',
      click: () => {
        this.sendMenuCommand('selection-paste-new');
      }
    },
    { label: '&Clear Selection', accelerator: 'Command+Home',
      click: () => {
        this.sendMenuCommand('selection-clear');
      }
    },
    { type: 'separator' },
    { label: 'Rotate &Left', accelerator: 'Command+[',
      click: () => {
        this.sendMenuCommand('selection-rotate-left');
      }
    },
    { label: 'Rotate &Right', accelerator: 'Command+]',
      click: () => {
        this.sendMenuCommand('selection-rotate-right');
      }
    },
    { label: 'Flip &Horizontally', accelerator: 'H',
      click: () => {
        this.sendMenuCommand('selection-flip-h');
      }
    },
    { label: 'Flip &Vertically', accelerator: 'V',
      click: () => {
        this.sendMenuCommand('selection-flip-v');
      }
    },
    { type: 'separator' },
    { label: '&Invert Characters', accelerator: 'Command+I',
      click: () => {
        this.sendMenuCommand('selection-invert');
      }
    }





   ]
};


    const subMenuToolsDev = {
      label: 'Tools',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'Command+R',
          click: () => {
            this.mainWindow.webContents.reload();
          }
        },
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+Command+I',
          click: () => {
            this.mainWindow.toggleDevTools();
          }
        }
      ]
    };

    const subMenuFrames={
      label: '&Frames',
      submenu: [

        { label: 'Align All Frames &Top-Left x2 Zoom', accelerator: 'Command+Alt+Shift+9',
        click: () => {
          this.sendMenuCommand('align-frames-topleft2x');
        }
      },
      { label: 'Align All Frames &Centered x2 Zoom', accelerator: 'Command+Alt+9',
        click: () => {
          this.sendMenuCommand('align-frames-center2x');
        }
      },
      { type: 'separator' },

        { label: 'Move Frame &Left in Stack', accelerator: 'Command+Left',
          click: () => {
            this.sendMenuCommand('shift-frame-left');
          }
        },
        { label: 'Move Frame &Right in Stack', accelerator: 'Command+Right',
          click: () => {
            this.sendMenuCommand('shift-frame-right');
          }
        },
        { type: 'separator' },
        { label: '&Duplicate', accelerator: 'Insert',
          click: () => {
            this.sendMenuCommand('duplicate-frame');
          }
        },
        { label: '&Remove', accelerator: 'Delete',
          click: () => {
            this.sendMenuCommand('remove-frame');
          }
        }
       ]
    }

   const subMenuView =  {
      label: '&View',
      submenu: [

          { label: 'Zoom In (centered)', accelerator: 'Command+=',
        click: () => {
          this.sendMenuCommand('zoom-in-center');
        }
        },

      { label: 'Zoom Out (centered)', accelerator: 'Command+-',
      click: () => {
        this.sendMenuCommand('zoom-out-center');
      }
      },
      { type: 'separator' },
      { label: 'Zoom In (left-top)', accelerator: 'Command+Shift+Plus',
      click: () => {
        this.sendMenuCommand('zoom-in-left');
      }
    },
    { label: 'Zoom Out (left-top)', accelerator: 'Command+Shift+-',
    click: () => {
      this.sendMenuCommand('zoom-out-left');
    }
    },
    { type: 'separator' },
    { label: 'Zoom x2 (centered)', accelerator: 'Command+9',
    click: () => {
      this.sendMenuCommand('zoom-2x-center');
    }
  },
  { label: 'Zoom x2 (left-top)', accelerator: 'Command+Shift+9',
  click: () => {
    this.sendMenuCommand('zoom-2x-left');
  }
  },


       ]
    };

    const subMenuToolsProd = {
      label: 'Tools',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          }
        }
      ]
    };
    const subMenuWindow = {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'Command+M',
          selector: 'performMiniaturize:'
        },
        { label: 'Close', accelerator: 'Command+W', selector: 'performClose:' },
        { type: 'separator' },
        { label: 'Bring All to Front', selector: 'arrangeInFront:' }
      ]
    };
    const subMenuHelp = {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click() {
            shell.openExternal(
              'https://wbochar.com/petmate9/'
            );
          }
        },
        {
          label: 'Search Issues',
          click() {
            shell.openExternal('https://github.com/wbochar/petmate9/issues');
          }
        }
      ]
    };

    const subMenuTools =
      !app.isPackaged ? subMenuToolsDev : subMenuToolsProd;

    return [subMenuAbout, subMenuFile, subMenuEdit, subMenuImage,subMenuSelection, subMenuView,subMenuTools, subMenuWindow, subMenuHelp];
  }

  buildDefaultTemplate() {
    const templateDefault = [
      {
        label: '&File',
        submenu: [
          { label: '&New',
            click: () => {
              this.sendMenuCommand('new');
            }
          },
          { label: 'New S&creen', accelerator: 'Ctrl+T',
            click: () => {
              this.sendMenuCommand('new-screen');
            }
          },
          { label: 'New &DirArt', accelerator: 'Ctrl+D',
          click: () => {
            this.sendMenuCommand('new-dirart');
          }
        },
          { type: 'separator' },
          { label: '&Open', accelerator: 'Ctrl+O',
            click: () => {
              this.sendMenuCommand('open');
            }
          },
          { type: 'separator' },
          { label: '&Save', accelerator: 'Ctrl+S',
            click: () => {
              this.sendMenuCommand('save');
            }
          },
          { label: 'Save &As...', accelerator: 'Ctrl+Shift+S',
            click: () => {
              this.sendMenuCommand('save-as');
            }
          },
          { type: 'separator' },
          { label: '&Import',
            submenu: importers.map(decl => this.mkImportCmd(decl.label, decl.cmd))
          },
          { label: '&Export As',
            submenu: exporters.map(decl => this.mkExportCmd(decl.label, decl.cmd))
          },
          { type: 'separator' },
          { label: '&Fonts...',
            click: () => {
              this.sendMenuCommand('custom-fonts');
            }
          },
          { type: 'separator' },
          { label: 'E&xit',
            accelerator: 'CmdOrCtrl+Q',
            click: () => {
              app.quit();
            }
          },
        ]
      },
      {
        label: '&Edit',
        submenu: [
          { label: '&Undo', accelerator: 'Ctrl+Z', selector: 'undo:',
            click: () => {
              this.sendMenuCommand('undo');
            }
          },
          { label: '&Redo', accelerator: 'Ctrl+Y', selector: 'redo:',
            click: () => {
              this.sendMenuCommand('redo');
            }
          },
          { type: 'separator' },
          { label: 'Paste &Text', accelerator: 'CTRL+V',
            click: () => {
              this.sendMenuCommand('paste-text');
            }
          },
          { type: 'separator' },
          { label: '&Preferences', accelerator: 'Ctrl+P',
            click: () => {
              this.sendMenuCommand('preferences');
            }
          }
        ]
      },

       {
        label: '&Image',
        submenu: [

          { label: 'Shift &Left', accelerator: 'Alt+Left',
            click: () => {
              this.sendMenuCommand('shift-screen-left');
            }
          },
          { label: 'Shift &Right', accelerator: 'Alt+Right',
            click: () => {
              this.sendMenuCommand('shift-screen-right');
            }
          },
          { label: 'Shift &Up', accelerator: 'Alt+Up',
            click: () => {
              this.sendMenuCommand('shift-screen-up');
            }
          },
          { label: 'Shift &Down', accelerator: 'Alt+Down',
            click: () => {
              this.sendMenuCommand('shift-screen-down');
            }
          },
          { type: 'separator' },
        { label: '&Border On/Off', accelerator: 'Ctrl+B',
          click: () => {
            this.sendMenuCommand('toggle-border');
          }
        },
        { label: '&Grid On/Off', accelerator: 'Ctrl+G',
          click: () => {
            this.sendMenuCommand('toggle-grid');
          }
        },
        { label: 'Crop/Resize &Image', accelerator: 'Ctrl+\\',
          click: () => {
            this.sendMenuCommand('crop-screen');
          }
        },
        { label: '&Clear Image', accelerator: 'Shift+Home',
        click: () => {
          this.sendMenuCommand('clear-screen');
        }
      }

         ]
      },

      {
        label: '&Selection',
        submenu: [

          { label: 'Select &All', accelerator: 'Ctrl+A',
            click: () => {
              this.sendMenuCommand('selection-select-all');
            }
          },
          { type: 'separator' },
          { label: 'Paste to &New Image', accelerator: 'Ctrl+N',
            click: () => {
              this.sendMenuCommand('selection-paste-new');
            }
          },
          { label: '&Clear Selection', accelerator: 'Ctrl+Home',
            click: () => {
              this.sendMenuCommand('selection-clear');
            }
          },
          { type: 'separator' },
          { label: 'Rotate &Left', accelerator: 'Ctrl+[',
            click: () => {
              this.sendMenuCommand('selection-rotate-left');
            }
          },
          { label: 'Rotate &Right', accelerator: 'Ctrl+]',
            click: () => {
              this.sendMenuCommand('selection-rotate-right');
            }
          },
          { label: 'Flip &Horizontally', accelerator: 'H',
            click: () => {
              this.sendMenuCommand('selection-flip-h');
            }
          },
          { label: 'Flip &Vertically', accelerator: 'V',
            click: () => {
              this.sendMenuCommand('selection-flip-v');
            }
          },
          { type: 'separator' },
          { label: '&Invert Characters', accelerator: 'Ctrl+I',
            click: () => {
              this.sendMenuCommand('selection-invert');
            }
          }





         ]
      },
      {
        label: 'F&rames',
        submenu: [
          { label: 'Align All Frames &Top-Left x2 Zoom', accelerator: 'Ctrl+Alt+Shift+9',
            click: () => {
              this.sendMenuCommand('align-frames-topleft2x');
            }
          },
          { label: 'Align All Frames &Centered x2 Zoom', accelerator: 'Ctrl+Alt+9',
            click: () => {
              this.sendMenuCommand('align-frames-center2x');
            }
          },
          { type: 'separator' },
          { label: 'Move Frame &Left in Stack', accelerator: 'Ctrl+Left',
            click: () => {
              this.sendMenuCommand('shift-frame-left');
            }
          },
          { label: 'Move Frame &Right in Stack', accelerator: 'Ctrl+Right',
            click: () => {
              this.sendMenuCommand('shift-frame-right');
            }
          },
          { type: 'separator' },
          { label: '&Duplicate', accelerator: 'Insert',
            click: () => {
              this.sendMenuCommand('duplicate-frame');
            }
          },
          { label: '&Remove', accelerator: 'Delete',
            click: () => {
              this.sendMenuCommand('remove-frame');
            }
          }
         ]
      },
      {
        label: '&View',
        submenu: [

            { label: 'Zoom In (centered)', accelerator: 'Ctrl+=',
          click: () => {
            this.sendMenuCommand('zoom-in-center');
          }
          },

        { label: 'Zoom Out (centered)', accelerator: 'Ctrl+-',
        click: () => {
          this.sendMenuCommand('zoom-out-center');
        }
        },
        { type: 'separator' },
        { label: 'Zoom In (left-top)', accelerator: 'Ctrl+Shift+Plus',
        click: () => {
          this.sendMenuCommand('zoom-in-left');
        }
      },
      { label: 'Zoom Out (left-top)', accelerator: 'Ctrl+Shift+-',
      click: () => {
        this.sendMenuCommand('zoom-out-left');
      }
      },
      { type: 'separator' },
      { label: 'Zoom x2 (centered)', accelerator: 'Ctrl+9',
      click: () => {
        this.sendMenuCommand('zoom-2x-center');
      }
    },
    { label: 'Zoom x2 (left-top)', accelerator: 'Ctrl+Shift+9',
    click: () => {
      this.sendMenuCommand('zoom-2x-left');
    }
    },


         ]
      },
      {
        label: '&Tools',
        submenu:
          !app.isPackaged
            ? [
              {
                label: '&Reload',
                accelerator: 'Ctrl+R',
                click: () => {
                  this.mainWindow.webContents.reload();
                }
              },
              /*  {
                  label: 'Toggle &Light/Dark Mode',
                  accelerator: 'Ctrl+M',
                  click: () => {
                    this.sendMenuCommand('toggle-light-dark');
                  }
                },
*/                {
                  label: 'Toggle &Full Screen',
                  accelerator: 'F11',
                  click: () => {
                    this.mainWindow.setFullScreen(
                      !this.mainWindow.isFullScreen()
                    );
                  }
                },
                {
                  label: 'Toggle &Developer Tools',
                  accelerator: 'Alt+Ctrl+I',
                  click: () => {
                    this.mainWindow.toggleDevTools();
                  }
                }
              ]
            : [
                {
                  label: 'Toggle &Full Screen',
                  accelerator: 'F11',
                  click: () => {
                    this.mainWindow.setFullScreen(
                      !this.mainWindow.isFullScreen()
                    );
                  }
                },
                {
                  label: 'Toggle &Developer Tools',
                  accelerator: 'Alt+Ctrl+I',
                  click: () => {
                    this.mainWindow.toggleDevTools();
                  }
                }
              ]
      },
      {
        label: '&Help',
        submenu: [
          {
            label: '&Documentation',
            accelerator: 'F1',
            click() {
              shell.openExternal(
                'https://wbochar.com/petmate9/'
              );
            }
          },
          {
            label: '&Search Issues',
            accelerator: 'Ctrl+F1',
            click() {
              shell.openExternal('https://github.com/wbochar/petmate9/issues');
            }
          },
          { type: 'separator' },
          {
            label: '&About',
            click() {
              app.setAboutPanelOptions({
                applicationName: 'Petmate 9',
                applicationVersion: app.getVersion(),
                copyright: "Copyright (c) 2018-2020, Janne Hellsten, 2023-24 Wolfgang Bochar",
              });
              app.showAboutPanel();
            }
          },
        ]
      }
    ];

    return templateDefault;
  }
}
