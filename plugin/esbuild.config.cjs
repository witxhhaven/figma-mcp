const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");
const pluginDir = __dirname;
const distDir = path.join(pluginDir, "dist");

async function build() {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  const sandboxOptions = {
    entryPoints: [path.join(pluginDir, "src/code.ts")],
    bundle: true,
    outfile: path.join(distDir, "code.js"),
    target: "es2017",
    format: "iife",
    logOverride: { "direct-eval": "silent" },
  };

  if (isWatch) {
    const ctx = await esbuild.context(sandboxOptions);
    await ctx.rebuild();
    // Copy ui.html to dist
    copyUI();
    console.log("Initial build complete");

    await ctx.watch();

    // Also watch ui.html for changes
    fs.watchFile(path.join(pluginDir, "src/ui/ui.html"), { interval: 500 }, () => {
      copyUI();
      console.log("UI copied");
    });

    console.log("Watching for changes...");
  } else {
    esbuild.buildSync(sandboxOptions);
    copyUI();
    console.log("Build complete");
  }
}

function copyUI() {
  fs.copyFileSync(
    path.join(pluginDir, "src/ui/ui.html"),
    path.join(distDir, "ui.html")
  );
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
