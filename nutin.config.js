export default {
  // Browser extension (side-panel): the build writes one unpacked extension per browser, in dist/<browser>
  extension: {
    browsers: ['chrome', 'firefox'],
    // Firefox's add-on id. storage.sync data and addons.mozilla.org tie to it: it can never change.
    geckoId: 'notelet@kouninef.dev',
  },

  // Build pipeline
  builder: {
    sass: {
      paths: [ 
        'base', 
      ], // Directories in styles/ to include in the Sass load path
    },

    esbuild: {
      bundle: true,
      minify: true,
      sourcemap: false,
      target: ['es2020'],
      drop: ['console', 'debugger'],
    },
  },

  // Testing toolkit
  // `npm run testin-nutin`
  testinNutin: {
    includeFramework: false,  // Test Nutin source - src/core
    includeTools: false,     // Test tools/ (builder, testin-nutin, etc.)
    includeApp: true,        // Include application tests

    coverage: {
      enabled: false,        // Include coverage in the normal test command
      threshold: 95,         // Fail if any global coverage metric falls below this threshold
      reportUncovered: true, // Generate a report of uncovered lines, functions and branches
    },

    jsdomOptions: {
      runScripts: false,
      resources: false,
      freezeGlobals: false,
      pretendToBeVisual: true,
    },
  },
}
