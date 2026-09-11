/**
 * scripts/prerender/setup.js — must be required FIRST, before any React
 * component file, by every prerender entry script.
 */

// CSS (plain and CSS-modules) imports need SOMETHING to resolve to when
// required under plain Node — there's no webpack here to handle them.
// Returns a Proxy that hands back the property name itself for any class
// lookup (s.wrap -> "wrap") — not the real hashed CSS-module class name
// the actual build generates, but that mismatch doesn't matter here:
// this HTML's only job is to be readable by a crawler that doesn't
// execute JS or care about class names, and any human visitor's browser
// immediately re-renders the real client-side app over this on load.
require.extensions['.css'] = function (module) {
  module.exports = new Proxy({}, { get: (_, prop) => (typeof prop === 'string' ? prop : undefined) });
};

// require.context is webpack-only, but src/utils/blogPosts.js calls it at
// MODULE-LOAD time (not inside a function) — so simply importing that file
// transitively crashes under plain Node even when loadBlogPosts() itself is
// never actually invoked (the prerender script bypasses it entirely via the
// initialPost/initialPosts props added to each public page component).
// Fixed via a standalone Babel plugin file (babel-plugin-strip-require-context.js),
// referenced below by path rather than as an inline function — this
// version of @babel/register runs Babel in a worker thread, and plugin
// options have to survive being passed across that thread boundary via
// postMessage, which can't serialize a raw function.
const path = require('path');

require('@babel/register').default({
  presets: ['@babel/preset-env', ['@babel/preset-react', { runtime: 'automatic' }]],
  plugins: ['@babel/plugin-transform-modules-commonjs', path.join(__dirname, 'babel-plugin-strip-require-context.js')],
  extensions: ['.js', '.jsx'],
  ignore: [/node_modules/],
  cache: false,
});

// Deliberately NOT defining global.window/localStorage — src/context/AuthContext.js
// already has explicit `typeof window === 'undefined'` guards and returns
// safe defaults in that case (see getInitialAuthState/getStoredUser). Only
// the routes that actually depend on that context (the landing page) rely
// on this; the standalone public pages (blog index/post) never touch
// AuthContext at all, so this matters for exactly one entry point.
