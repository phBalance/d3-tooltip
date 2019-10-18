import typescript from "rollup-plugin-typescript2";
import sourcemaps from "rollup-plugin-sourcemaps";
import {terser} from "rollup-plugin-terser";

import pkg from "./package.json";

const DEV = process.env.BUILD === "development";
const COPYRIGHT = `// Copyright ${(new Date).getFullYear()} ${pkg.author}`;

export default {
	input: "src/fo-tooltip.ts",
	output: [
		{
			file: pkg.main,
			format: "cjs",
			sourcemap: true
		},
		{
			file: pkg.module,
			format: "es",
			sourcemap: true
		},
	],
	external: [
		...Object.keys(pkg.dependencies || {}),
		...Object.keys(pkg.peerDependencies || {}),
	],
	plugins: [
		typescript({
			typescript: require("typescript"),
		}),
		sourcemaps(),
		!DEV // minifies generated bundles for non development mode
			? terser({output: {preamble: COPYRIGHT}}) 
			: undefined, 
	]
};