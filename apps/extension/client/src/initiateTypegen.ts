import { getTypegenOutput, TypegenData } from '@xstate/tools-shared';
import * as vscode from 'vscode';
import { Utils as UriUtils } from 'vscode-uri';
import { registerDisposable } from './registerDisposable';
import { TypeSafeLanguageClient } from './typeSafeLanguageClient';

const createDeferred = () => {
  let deferred: {
    resolve?: () => void;
    reject?: () => void;
    promise?: Promise<void>;
  } = {};
  const promise = new Promise<void>((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  deferred.promise = promise;
  return deferred as Required<typeof deferred>;
};

const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const createTypegenFile = async (
  context: vscode.ExtensionContext,
  uri: string,
  types: TypegenData[],
) => {
  const parsedUri = vscode.Uri.parse(uri);
  const typegenUri = parsedUri.with({
    path:
      parsedUri.path.slice(0, -UriUtils.extname(parsedUri).length) +
      '.typegen.ts',
  });

  const documentOpened = createDeferred();

  const dispose = registerDisposable(
    context,
    // by saving in this listener we prevent VS Code from opening a new tab for the dirty state of the typegen file
    vscode.workspace.onDidOpenTextDocument((textDocument) => {
      if (String(textDocument.uri) === String(typegenUri)) {
        documentOpened.resolve();
        // by saving here we
        textDocument.save();
      }
    }),
  );

  Promise.race([
    // timeout shouldn't happen in practice
    // it's not clear how strong guarantees we have for this though
    // so to be on a safer side of things we handle it as a potential valid scenario
    timeout(3000),
    documentOpened.promise,
  ]).then(dispose);

  const workspaceEdit = new vscode.WorkspaceEdit();
  // in the future we could provide the initial content directly here
  // an option for it has been introduced in VS Code 1.72:
  // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/62594/files#diff-0a5f3d01be8ab95a0ca83baa6915417d7497d254e6f0b508447db7388111a2e4R3688
  workspaceEdit.createFile(typegenUri, {
    overwrite: true,
  });

  workspaceEdit.insert(
    typegenUri,
    new vscode.Position(0, 0),
    getTypegenOutput(types),
  );

  await vscode.workspace.applyEdit(workspaceEdit);
};

export const initiateTypegen = (
  context: vscode.ExtensionContext,
  languageClient: TypeSafeLanguageClient,
) => {
  registerDisposable(
    context,
    vscode.workspace.onWillSaveTextDocument((event) => {
      event.waitUntil(
        (async () => {
          const uri = String(event.document.uri);

          if (uri.includes('.typegen.')) {
            return [];
          }

          const { edits, types } = await languageClient.sendRequest(
            'getTsTypesAndEdits',
            {
              uri,
            },
          );

          if (!types.length) {
            return [];
          }

          await createTypegenFile(context, uri, types);

          return edits.map(
            (edit) =>
              new vscode.TextEdit(
                new vscode.Range(
                  new vscode.Position(edit.range[0].line, edit.range[0].column),
                  new vscode.Position(edit.range[1].line, edit.range[1].column),
                ),
                edit.newText,
              ),
          );
        })(),
      );
    }),
  );

  registerDisposable(
    context,
    languageClient.onNotification('typesUpdated', async ({ uri, types }) => {
      await createTypegenFile(context, uri, types);
    }),
  );
};
