/**
 * scripts/prerender/babel-plugin-strip-require-context.js
 *
 * Rewrites any `require.context(...)` call into a harmless stub
 * expression at compile time. Webpack injects `require.context` as a
 * special global at build time; it doesn't exist under plain Node, and
 * src/utils/blogPosts.js calls it at MODULE-LOAD time (not inside a
 * function), so simply importing that file would otherwise crash
 * immediately — even though the prerender script never actually needs
 * that function to run for real, since every public page component
 * accepts a pre-resolved initialPost/initialPosts prop instead.
 */
module.exports = function stripRequireContextPlugin({ types: t }) {
  return {
    visitor: {
      CallExpression(path) {
        const callee = path.node.callee;
        if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object, { name: 'require' }) &&
          t.isIdentifier(callee.property, { name: 'context' })
        ) {
          path.replaceWithSourceString('(() => { const f = () => ""; f.keys = () => []; return f; })()');
        }
      },
    },
  };
};
