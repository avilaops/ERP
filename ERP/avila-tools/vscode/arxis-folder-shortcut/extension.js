const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { addFolderToWorkspace } = require('./lib/workspaceManager');

function activate(context) {
  const disposable = vscode.commands.registerCommand('arxisFolderShortcut.addFolder', () => {
    const configuration = vscode.workspace.getConfiguration('arxisFolderShortcut');

    addFolderToWorkspace({
      workspace: vscode.workspace,
      window: vscode.window,
      Uri: vscode.Uri,
      configuration,
      fs,
      path
    });
  });

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
