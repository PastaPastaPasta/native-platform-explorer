import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SDK_PACKAGE = '@dashevo/evo-sdk';
const OUTPUT = 'src/data/sdk-reference.json';
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)
    || ts.isAwaitExpression(node))) node = node.expression;
  return node;
}

function propertyPath(node) {
  node = unwrap(node);
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) return [...propertyPath(node.expression), node.name.text];
  return [];
}

function importsSdk(node) {
  node = unwrap(node);
  return node && ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === SDK_PACKAGE;
}

/** Follow referenced declarations, rather than whole imported modules: one
 * identity hook must not pull unrelated queries from the queries.ts barrel.
 * This is a static capability map, not an execution trace. Conditional tabs,
 * handlers and operation descriptors remain included; app layouts do not. */
export function generateSdkReference(rootDir) {
  const configPath = path.join(rootDir, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, rootDir);
  if (parsed.errors.length) throw new Error(ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n'));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const srcDir = path.join(rootDir, 'src') + path.sep;
  const relative = (file) => path.relative(rootDir, file).split(path.sep).join('/');
  const isLocal = (node) => node.getSourceFile().fileName.startsWith(srcDir)
    && !node.getSourceFile().isDeclarationFile;
  const resolveSymbol = (node) => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol?.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  };
  const sdkModule = ts.resolveModuleName(SDK_PACKAGE, configPath, parsed.options, ts.sys).resolvedModule;
  const sdkSource = sdkModule && program.getSourceFile(sdkModule.resolvedFileName);
  const sdkSymbol = sdkSource && checker.getSymbolAtLocation(sdkSource);
  const sdkExports = sdkSymbol ? checker.getExportsOfModule(sdkSymbol) : [];
  const sdkExportNames = new Map(sdkExports.map((symbol) => [
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol, symbol.getName(),
  ]));

  function sdkCall(expression) {
    const parts = propertyPath(expression);
    if (!parts.length) return null;
    let root = unwrap(expression);
    while (ts.isPropertyAccessExpression(root)) root = unwrap(root.expression);
    if (!ts.isIdentifier(root)) return null;
    const symbol = resolveSymbol(root);
    const declarations = symbol?.declarations ?? [];
    if (parts.length === 1) {
      const exportedName = sdkExportNames.get(symbol);
      if (exportedName) return { method: exportedName, kind: 'utility' };
      for (const declaration of declarations) {
        if (ts.isBindingElement(declaration) && ts.isVariableDeclaration(declaration.parent.parent)
          && importsSdk(declaration.parent.parent.initializer)) {
          const name = declaration.propertyName ?? declaration.name;
          if ((ts.isIdentifier(name) || ts.isStringLiteral(name))
            && sdkExports.some((exported) => exported.getName() === name.text)) {
            return { method: name.text, kind: 'utility' };
          }
        }
      }
      return null;
    }
    // Recognize EvoSDK-owned instance members by declaration, including nullable
    // contexts and Pick<EvoSDK, ...> helpers, without requiring a variable name.
    const member = checker.getPropertyOfType(checker.getNonNullableType(checker.getTypeAtLocation(root)), parts[1]);
    if (member?.declarations?.some((d) => d.getSourceFile().fileName.includes('/@dashevo/')
      && ts.isClassDeclaration(d.parent)
      && d.parent.name?.getText() === 'EvoSDK'
      && (!ts.canHaveModifiers(d)
        || !ts.getModifiers(d)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)))) {
      return { method: parts.slice(1).join('.'), kind: 'facade' };
    }
    for (const declaration of declarations) {
      if (ts.isVariableDeclaration(declaration)) {
        if (importsSdk(declaration.initializer)) return { method: parts.slice(1).join('.'), kind: 'utility' };
        const initializer = unwrap(declaration.initializer);
        if (initializer && ts.isCallExpression(initializer)
          && sdkCall(initializer.expression)?.method === 'getWasmSdkConnected') {
          return { method: parts.slice(1).join('.'), kind: 'wasm' };
        }
      }
      if (ts.isBindingElement(declaration) && ts.isVariableDeclaration(declaration.parent.parent)
        && importsSdk(declaration.parent.parent.initializer)) {
        const name = declaration.propertyName ?? declaration.name;
        if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
          return { method: [name.text, ...parts.slice(1)].join('.'), kind: 'utility' };
        }
      }
      if (declaration.getSourceFile().fileName.includes('/@dashevo/')) {
        return { method: parts.join('.'), kind: 'utility' };
      }
    }
    return null;
  }

  function callsFor(page) {
    const calls = new Map();
    const visited = new Set();
    const moduleSymbol = checker.getSymbolAtLocation(page);
    const exported = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((s) => s.name === 'default');
    if (!exported) throw new Error(`Page has no default export: ${relative(page.fileName)}`);
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const pending = [...(target.declarations ?? [])];
    function visit(node, owner) {
      if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isInterfaceDeclaration(node)) return;
      // TypeScript represents destructured dynamic imports as local bindings,
      // not import aliases. Follow only their selected export as well.
      if (ts.isBindingElement(node) && ts.isVariableDeclaration(node.parent.parent)) {
        const initializer = unwrap(node.parent.parent.initializer);
        if (initializer && ts.isCallExpression(initializer)
          && initializer.expression.kind === ts.SyntaxKind.ImportKeyword
          && ts.isStringLiteral(initializer.arguments[0])) {
          const resolved = ts.resolveModuleName(initializer.arguments[0].text,
            node.getSourceFile().fileName, parsed.options, ts.sys).resolvedModule;
          const imported = resolved && program.getSourceFile(resolved.resolvedFileName);
          const importedSymbol = imported && checker.getSymbolAtLocation(imported);
          const selected = importedSymbol && checker.getExportsOfModule(importedSymbol)
            .find((s) => s.name === (node.propertyName ?? node.name).getText());
          const actual = selected?.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(selected) : selected;
          for (const declaration of actual?.declarations ?? []) {
            if (isLocal(declaration) && !visited.has(declaration)) pending.push(declaration);
          }
        }
      }
      if (ts.isCallExpression(node)) {
        const call = sdkCall(node.expression);
        if (call) {
          const key = `${call.kind}:${call.method}`;
          const record = calls.get(key) ?? { ...call, sources: [] };
          const source = node.getSourceFile();
          const location = {
            file: relative(source.fileName),
            line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            owner,
          };
          if (!record.sources.some((s) => s.file === location.file && s.line === location.line)) {
            record.sources.push(location);
          }
          calls.set(key, record);
        }
      }
      if (ts.isIdentifier(node)) {
        for (const declaration of resolveSymbol(node)?.declarations ?? []) {
          if (isLocal(declaration) && !visited.has(declaration)) pending.push(declaration);
        }
      }
      ts.forEachChild(node, (child) => visit(child, owner));
    }
    while (pending.length) {
      const declaration = pending.pop();
      if (visited.has(declaration)) continue;
      visited.add(declaration);
      const owner = ts.getNameOfDeclaration(declaration)?.getText() ?? 'default';
      visit(declaration, owner);
    }
    return [...calls.values()].sort((a, b) => compareText(a.kind, b.kind) || compareText(a.method, b.method))
      .map((call) => ({ ...call, sources: call.sources.sort((a, b) => compareText(a.file, b.file) || a.line - b.line) }));
  }

  const pages = program.getSourceFiles()
    .filter((file) => file.fileName.startsWith(path.join(srcDir, 'app') + path.sep)
      && file.fileName.endsWith(`${path.sep}page.tsx`))
    .map((page) => {
      const directory = path.relative(path.join(srcDir, 'app'), path.dirname(page.fileName)).split(path.sep).join('/');
      return { route: directory ? `/${directory}/` : '/', source: relative(page.fileName), calls: callsFor(page) };
    }).sort((a, b) => compareText(a.route, b.route));
  const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  return { sdkPackage: SDK_PACKAGE, sdkVersion: pkg.dependencies[SDK_PACKAGE], pages };
}

export function referenceText(rootDir) {
  return JSON.stringify(generateSdkReference(rootDir), null, 2) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const generated = referenceText(rootDir);
  const output = path.join(rootDir, OUTPUT);
  if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== generated) {
      throw new Error(`SDK reference is stale. Run node scripts/generate-sdk-reference.mjs`);
    }
    process.stdout.write('SDK reference matches route source.\n');
  } else {
    writeFileSync(output, generated);
    process.stdout.write(`Generated ${OUTPUT}.\n`);
  }
}
