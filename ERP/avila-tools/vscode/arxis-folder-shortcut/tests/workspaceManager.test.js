'use strict';

const assert = require('assert');
const path = require('path');
const { addFolderToWorkspace, DEFAULT_TARGET_PATH } = require('../lib/workspaceManager');

function createEnvironment({
  existingFolders = [],
  exists = true,
  updateSucceeds = true,
  configuredPath = DEFAULT_TARGET_PATH
} = {}) {
  const messages = [];
  const updateCalls = [];

  const workspaceFolders = existingFolders.map((folderPath) => ({
    uri: { fsPath: path.normalize(folderPath) }
  }));

  return {
    env: {
      workspace: {
        get workspaceFolders() {
          return workspaceFolders;
        },
        updateWorkspaceFolders: (start, deleteCount, ...foldersToAdd) => {
          updateCalls.push({ start, deleteCount, foldersToAdd });
          return updateSucceeds;
        }
      },
      window: {
        showInformationMessage: (message) => messages.push({ type: 'info', message }),
        showErrorMessage: (message) => messages.push({ type: 'error', message })
      },
      Uri: {
        file: (folderPath) => ({ fsPath: path.normalize(folderPath) })
      },
      configuration: {
        get: () => configuredPath
      },
      fs: {
        existsSync: () => exists
      },
      path
    },
    messages,
    updateCalls
  };
}

;(function testMissingPath() {
  const { env, messages, updateCalls } = createEnvironment({ exists: false });
  const result = addFolderToWorkspace(env);

  assert.strictEqual(result.status, 'missingPath');
  assert.strictEqual(messages.length, 1, 'Esperava uma mensagem de erro quando a pasta não existe');
  assert.strictEqual(messages[0].type, 'error');
  assert.ok(messages[0].message.includes('não existe'));
  assert.strictEqual(updateCalls.length, 0, 'Não deveria tentar atualizar o workspace quando a pasta não existe');
})();

;(function testAlreadyPresent() {
  const { env, messages, updateCalls } = createEnvironment({ existingFolders: [DEFAULT_TARGET_PATH] });
  const result = addFolderToWorkspace(env);

  assert.strictEqual(result.status, 'alreadyPresent');
  assert.strictEqual(messages.length, 1, 'Esperava uma mensagem informativa quando a pasta já existe');
  assert.strictEqual(messages[0].type, 'info');
  assert.ok(messages[0].message.includes('já está presente'));
  assert.strictEqual(updateCalls.length, 0, 'Não deveria tentar atualizar o workspace quando a pasta já está presente');
})();

;(function testUpdateFails() {
  const { env, messages, updateCalls } = createEnvironment({ updateSucceeds: false });
  const result = addFolderToWorkspace(env);

  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(messages.length, 1, 'Esperava uma mensagem de erro quando updateWorkspaceFolders falha');
  assert.strictEqual(messages[0].type, 'error');
  assert.ok(messages[0].message.includes('Não foi possível'));
  assert.strictEqual(updateCalls.length, 1, 'Deveria tentar atualizar o workspace uma vez');
})();

;(function testSuccess() {
  const customPath = path.join('D:\\', 'GitHub', 'arxis');
  const { env, messages, updateCalls } = createEnvironment({ configuredPath: `  ${customPath}  ` });
  const result = addFolderToWorkspace(env);

  assert.strictEqual(result.status, 'added');
  assert.strictEqual(messages.length, 1, 'Esperava uma mensagem informativa quando a pasta é adicionada');
  assert.strictEqual(messages[0].type, 'info');
  assert.ok(messages[0].message.includes('adicionada'));
  assert.strictEqual(updateCalls.length, 1, 'Deveria adicionar a pasta ao workspace');
  const call = updateCalls[0];
  assert.strictEqual(call.start, call.deleteCount, 'Não deve remover pastas existentes');
  assert.strictEqual(call.deleteCount, 0, 'Não deveria remover pastas existentes');
  assert.strictEqual(call.foldersToAdd.length, 1, 'Deveria adicionar exatamente uma pasta');
  assert.strictEqual(
    path.normalize(call.foldersToAdd[0].uri.fsPath),
    path.normalize(customPath),
    'A pasta adicionada deve corresponder ao caminho configurado normalizado'
  );
})();

console.log('Todos os testes passaram com sucesso.');
