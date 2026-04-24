// craco.config.js
// Overrides CRA 5 (webpack 5) to support Node.js built-in modules
// in the Electron renderer process (nodeIntegration: true).

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Electron's renderer process provides Node.js built-ins natively
      // via nodeIntegration. Use "externals" so webpack leaves require()
      // calls for these modules alone and they resolve at runtime.
      const nodeBuiltins = {
        stream: 'commonjs stream',
        zlib: 'commonjs zlib',
        buffer: 'commonjs buffer',
        util: 'commonjs util',
        assert: 'commonjs assert',
        fs: 'commonjs fs',
        path: 'commonjs path',
        os: 'commonjs os',
        crypto: 'commonjs crypto',
        module: 'commonjs module',
      };

      const existing = webpackConfig.externals || [];
      webpackConfig.externals = Array.isArray(existing)
        ? [...existing, nodeBuiltins]
        : [existing, nodeBuiltins];

      // Remove any fallbacks that would conflict with externals
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        stream: false,
        zlib: false,
        buffer: false,
        util: false,
        assert: false,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        module: false,
      };

      // Allow importing from outside src/ (e.g. assets/)
      // CRA 5's ModuleScopePlugin can block this.
      const scopePlugin = webpackConfig.resolve.plugins?.find(
        (p) => p.constructor && p.constructor.name === 'ModuleScopePlugin'
      );
      if (scopePlugin) {
        scopePlugin.allowedPaths = scopePlugin.allowedPaths || [];
      }

      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => {
    // react-scripts@5 config uses onBeforeSetupMiddleware/onAfterSetupMiddleware.
    // webpack-dev-server@5 removed those hooks in favor of setupMiddlewares.
    const before = devServerConfig.onBeforeSetupMiddleware;
    const after = devServerConfig.onAfterSetupMiddleware;

    // webpack-dev-server@5 replaced `https` with `server`.
    if (devServerConfig.https !== undefined && devServerConfig.server === undefined) {
      if (typeof devServerConfig.https === 'boolean') {
        devServerConfig.server = devServerConfig.https ? 'https' : 'http';
      } else {
        devServerConfig.server = { type: 'https', options: devServerConfig.https };
      }
    }
    delete devServerConfig.https;
    if (!devServerConfig.setupMiddlewares && (before || after)) {
      devServerConfig.setupMiddlewares = (middlewares, server) => {
        if (typeof before === 'function') {
          before(server);
        }
        if (typeof after === 'function') {
          after(server);
        }
        return middlewares;
      };
    }

    delete devServerConfig.onBeforeSetupMiddleware;
    delete devServerConfig.onAfterSetupMiddleware;
    return devServerConfig;
  },
};
