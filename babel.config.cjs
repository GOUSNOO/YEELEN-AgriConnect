module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
  // Uniquement sous Jest (BABEL_ENV/NODE_ENV=test) : remplace toute expression
  // `import.meta` par `({})`, sinon les modules qui y touchent (src/lib/api.js →
  // import.meta.env.VITE_API_URL) sont impossibles à charger sous babel-jest
  // (« Cannot use 'import.meta' outside a module »). Le build Vite n'applique pas
  // ce bloc et gère `import.meta` nativement.
  env: {
    test: {
      plugins: [
        function stubImportMeta() {
          return {
            name: 'stub-import-meta',
            visitor: {
              MetaProperty(path) {
                const { meta, property } = path.node;
                if (meta && meta.name === 'import' && property && property.name === 'meta') {
                  path.replaceWithSourceString('({})');
                }
              },
            },
          };
        },
      ],
    },
  },
};
