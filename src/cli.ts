#!/usr/bin/env node

async function main() {
  // 动态导入 ink 库的 render 方法（ink 是一个 React 终端渲染库）
  const { render } = await import("ink");
  // createElement 用于创建 React 组件
  const { createElement } = await import("react");
  // 动态导入当前目录下的 App.js 模块
  const { App } = await import("./App.js");

  // 渲染 React 应用到终端
  // render() 是 ink 提供的核心方法，用于将 React 组件渲染到命令行界面
  const instance = render(
    createElement(App), // 创建 App 组件的 React 元素并渲染
    {
      // Ctrl+C 交给 App.tsx 中的 useInput() 自己处理
      exitOnCtrlC: false
    }
  );
  // 等待渲染实例退出
  // waitUntilExit() 返回一个 Promise，当组件完全卸载后 resolve
  // 这保证了在应用退出前，所有清理工作都能完成
  await instance.waitUntilExit();
}

// 执行 main 函数，并捕获可能发生的错误
main().catch((err) => {
  // 如果发生错误，将错误信息输出到 stderr
  console.error(err);
  // 退出进程，返回状态码 1 表示异常退出
  process.exit(1);
});
