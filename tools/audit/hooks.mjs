// Resolve 'three' and 'three/addons/' from tools/node_modules/three (the site itself uses an importmap).
import { pathToFileURL, fileURLToPath } from 'node:url';
const PKG = fileURLToPath(new URL('../node_modules/three/', import.meta.url));
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: pathToFileURL(PKG + 'build/three.module.js').href, shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: pathToFileURL(PKG + 'examples/jsm/' + spec.slice(13)).href, shortCircuit: true };
  return next(spec, ctx);
}
