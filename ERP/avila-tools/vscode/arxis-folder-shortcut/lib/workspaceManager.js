const path = require('path');

const DEFAULT_TARGET_PATH = path.normalize('D:\\GitHub\\arxis');

function normalizeFsPath(fsPath, pathModule) {
  return pathModule.normalize(fsPath).toLowerCase();
}

function addFolderToWorkspace({ workspace, window, Uri, configuration, fs, path: pathModule }) {
  const configuredPath = configuration.get('targetPath');
  const rawTarget = (configuredPath && configuredPath.trim()) || DEFAULT_TARGET_PATH;
  const normalizedTarget = pathModule.normalize(rawTarget);

  if (!fs.existsSync(normalizedTarget)) {
    window.showErrorMessage(
      `A pasta configurada (${normalizedTarget}) não existe. Atualize a configuração "arxisFolderShortcut.targetPath".`
    );
    return { status: 'missingPath', targetPath: normalizedTarget };
  }

  const folderUri = Uri.file(normalizedTarget);
  const workspaceFolders = workspace.workspaceFolders || [];

  const alreadyPresent = workspaceFolders.some((folder) =>
    normalizeFsPath(folder.uri.fsPath, pathModule) === normalizeFsPath(folderUri.fsPath, pathModule)
  );

  if (alreadyPresent) {
    window.showInformationMessage('A pasta Arxis já está presente no workspace.');
    return { status: 'alreadyPresent', targetPath: normalizedTarget };
  }

  const insertionIndex = workspaceFolders.length;
  const added = workspace.updateWorkspaceFolders(insertionIndex, 0, { uri: folderUri });

  if (!added) {
    window.showErrorMessage('Não foi possível adicionar a pasta Arxis ao workspace.');
    return { status: 'failed', targetPath: normalizedTarget };
  }

  window.showInformationMessage('Pasta Arxis adicionada ao workspace.');
  return { status: 'added', targetPath: normalizedTarget };
}

module.exports = {
  addFolderToWorkspace,
  DEFAULT_TARGET_PATH
};
