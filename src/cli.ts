#!/usr/bin/env node

async function main() {
  const { render } = await import("ink");
  const { createElement } = await import("react");
  const { App } = await import("./App.js");

  const instance = render(
    createElement(App),
    {
      // Ctrl+C 交给 App.tsx 中的 useInput() 自己处理
      exitOnCtrlC: false
    }
  );

  await instance.waitUntilExit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
