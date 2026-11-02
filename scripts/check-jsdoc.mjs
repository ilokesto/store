import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import ts from 'typescript';

const hasModifier = (node, kind) => node.modifiers?.some(modifier => modifier.kind === kind);
const commentText = comment => typeof comment === 'string'
  ? comment
  : comment?.map(part => part.getText()).join('') ?? '';
const hasEnglish = text => /[A-Za-z]{2,}/.test(text)
  && !/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}]/u.test(text);
const descriptionText = text => text.replace(/^\s*-\s*/, '').trim();

export function checkJsdoc(program, { sourceRoot }) {
  const checker = program.getTypeChecker();
  const diagnostics = [];
  const checked = new Set();
  const root = path.resolve(sourceRoot);
  const isOwnedFile = file => !file.isDeclarationFile
    && !path.relative(root, file.fileName).startsWith('..')
    && !path.isAbsolute(path.relative(root, file.fileName));
  const isOwned = node => isOwnedFile(node.getSourceFile());
  const symbolOwned = symbol => symbol?.declarations?.some(isOwned);
  const report = (node, code, message) => {
    const file = node.getSourceFile();
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
    diagnostics.push({ file: file.fileName, line: line + 1, column: character + 1, code, message });
  };

  // Declaration provenance bounds traversal; imported DOM/React members never
  // become ours merely because an owned interface extends or maps their type.
  function fields(type, location, ancestors = new Set(), includeCallableMembers = false) {
    if (ancestors.has(type) || type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) {
      return [];
    }
    if (type.isUnionOrIntersection()) {
      return type.types.flatMap(part => fields(part, location, new Set([...ancestors, type]), includeCallableMembers));
    }
    if (!(type.flags & ts.TypeFlags.Object) || checker.isArrayType(type) || checker.isTupleType(type)
      || (!includeCallableMembers && type.getCallSignatures().length) || type.getConstructSignatures().length
      || type.symbol?.declarations?.some(node => ts.isClassDeclaration(node) || ts.isClassExpression(node))) {
      return [];
    }
    return checker.getPropertiesOfType(type)
      .filter(symbol => symbolOwned(symbol) || (!symbol.declarations?.length && symbolOwned(type.aliasSymbol)))
      .map(symbol => ({
        name: symbol.name,
        type: checker.getTypeOfSymbolAtLocation(symbol, location),
        optional: Boolean(symbol.flags & ts.SymbolFlags.Optional),
      }));
  }

  function ownedPaths(type, location, prefix = '', optional = false, ancestors = new Set()) {
    if (ancestors.has(type)) {
      return [];
    }
    const next = new Set([...ancestors, type]);
    if (type.isUnionOrIntersection()) {
      return type.types.flatMap(part => ownedPaths(part, location, prefix, optional, next));
    }
    return fields(type, location).flatMap(field => {
      const name = prefix ? `${prefix}.${field.name}` : field.name;
      const isOptional = optional || field.optional;
      return [
        { name, optional: isOptional, type: field.type },
        ...ownedPaths(field.type, location, name, isOptional, next),
      ];
    });
  }

  function docFor(node, declarations = [node]) {
    const candidates = [node, ...declarations.filter(declaration => declaration !== node)];
    for (const candidate of candidates) {
      const host = ts.isVariableDeclaration(candidate) ? candidate.parent.parent : candidate;
      const docs = host.jsDoc ?? candidate.jsDoc;
      if (docs?.length) {
        return docs[docs.length - 1];
      }
    }
    return undefined;
  }

  function returnMembers(type, location, prefix = '', ancestors = new Set()) {
    if (ancestors.has(type)) {
      return [];
    }
    const next = new Set([...ancestors, type]);
    if (type.isUnion()) {
      return type.types.flatMap(part => returnMembers(part, location, prefix, next));
    }
    if (checker.isTupleType(type)) {
      return checker.getTypeArguments(type).flatMap((part, index) => {
        const name = prefix ? `${prefix}.${index}` : String(index);
        const label = type.target.labeledElementDeclarations?.[index]?.name?.getText();
        return [
          { name, alias: label && (prefix ? `${prefix}.${label}` : label) },
          ...returnMembers(part, location, name, next),
        ];
      });
    }
    return fields(type, location, new Set(), true).flatMap(field => {
      const name = prefix ? `${prefix}.${field.name}` : field.name;
      return [{ name }, ...returnMembers(field.type, location, name, next)];
    });
  }

  function check(node, name, signatures, { component = false, declarations, classProps } = {}) {
    if (checked.has(node)) {
      return;
    }
    checked.add(node);
    const doc = docFor(node, declarations);
    if (!doc) {
      report(node, 'JSDOC_MISSING', `${name}: add an English JSDoc block.`);
      return;
    }
    const tags = [...doc.tags ?? []];
    const descriptions = tags.filter(tag => tag.tagName.text === 'description');
    if (descriptions.length !== 1 || !hasEnglish(commentText(descriptions[0]?.comment))) {
      report(node, 'DESCRIPTION', `${name}: require one nonempty English @description.`);
    }
    const examples = tags.filter(tag => tag.tagName.text === 'example');
    if (!examples.some(tag => /[A-Za-z]/.test(commentText(tag.comment)))) {
      report(node, 'EXAMPLE', `${name}: require a nonempty @example.`);
    }
    const params = tags.filter(ts.isJSDocParameterTag);
    const documented = new Map();
    for (const tag of params) {
      const paramName = tag.name.getText();
      if (documented.has(paramName)) {
        report(tag, 'PARAM_DUPLICATE', `${name}: duplicate @param ${paramName}.`);
      }
      documented.set(paramName, tag);
      if (!tag.typeExpression?.type || !tag.typeExpression.type.getText().trim()) {
        report(tag, 'PARAM_TYPE', `${name}: @param ${paramName} needs {Type}.`);
      }
      if (!hasEnglish(descriptionText(commentText(tag.comment)))) {
        report(tag, 'PARAM_DESCRIPTION', `${name}: @param ${paramName} needs an English description.`);
      }
      if (/^\s*-(?!-)\s+/m.test(commentText(tag.comment).split('\n').slice(1).join('\n'))) {
        report(tag, 'PARAM_SUBLIST', `${name}: parameter description sublists use --, not -.`);
      }
    }
    const roots = params.filter(tag => !tag.name.getText().includes('.'));
    const expected = new Map();
    const addParam = (paramName, type, optional) => {
      for (const item of [{ name: paramName, type, optional }, ...ownedPaths(type, node, paramName, optional)]) {
        const previous = expected.get(item.name);
        expected.set(item.name, { ...item, optional: item.optional || previous?.optional || false });
      }
    };
    if (classProps) {
      addParam('props', classProps, false);
    }
    for (const signature of signatures) {
      signature.parameters.forEach((parameter, index) => {
        const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
        const destructured = declaration && ts.isParameter(declaration) && !ts.isIdentifier(declaration.name);
        const paramName = component && index === 0
          ? 'props'
          : destructured ? roots[index]?.name.getText() ?? `arg${index}` : parameter.name;
        const optional = Boolean(parameter.flags & ts.SymbolFlags.Optional)
          || Boolean(declaration?.questionToken || declaration?.initializer);
        addParam(paramName, checker.getTypeOfSymbolAtLocation(parameter, node), optional);
      });
    }
    for (const [paramName, parameter] of expected) {
      const tag = documented.get(paramName);
      if (!tag) {
        report(node, 'PARAM_MISSING', `${name}: missing @param ${parameter.optional ? `[${paramName}]` : paramName}.`);
      } else if (Boolean(tag.isBracketed) !== parameter.optional) {
        report(tag, 'PARAM_OPTIONAL', `${name}: @param ${paramName} ${parameter.optional ? 'must' : 'must not'} use brackets.`);
      }
    }
    for (const [paramName, tag] of documented) {
      if (expected.has(paramName)) {
        continue;
      }
      // Explicit external prop documentation is welcome, but still must name
      // a real member; external members are not mandatory or recursively owned.
      const parts = paramName.split('.');
      let type = expected.get(parts.shift())?.type;
      let optional = expected.get(paramName.split('.')[0])?.optional ?? false;
      for (const part of parts) {
        const property = type && checker.getPropertyOfType(checker.getNonNullableType(type), part);
        if (!property) {
          type = undefined;
          break;
        }
        optional ||= Boolean(property.flags & ts.SymbolFlags.Optional);
        type = checker.getTypeOfSymbolAtLocation(property, node);
      }
      if (!type) {
        report(tag, 'PARAM_UNKNOWN', `${name}: @param ${paramName} is not a public signature parameter or field.`);
      } else if (Boolean(tag.isBracketed) !== optional) {
        report(tag, 'PARAM_OPTIONAL', `${name}: @param ${paramName} ${optional ? 'must' : 'must not'} use brackets.`);
      }
    }
    const returnTypes = ts.isConstructorDeclaration(node)
      ? []
      : signatures.map(signature => checker.getReturnTypeOfSignature(signature));
    const needsReturn = returnTypes.some(type => !(type.flags & (ts.TypeFlags.Void | ts.TypeFlags.Never)));
    const returns = tags.filter(ts.isJSDocReturnTag);
    if (needsReturn && returns.length !== 1) {
      report(node, 'RETURN_MISSING', `${name}: require one typed @returns for the returned value.`);
    }
    for (const tag of returns) {
      if (!tag.typeExpression?.type || !tag.typeExpression.type.getText().trim()) {
        report(tag, 'RETURN_TYPE', `${name}: @returns needs {Type}.`);
      }
      const text = commentText(tag.comment);
      if (!hasEnglish(descriptionText(text.split('\n')[0]))) {
        report(tag, 'RETURN_DESCRIPTION', `${name}: @returns needs an English description.`);
      }
      const members = new Map();
      for (const line of text.split('\n').slice(1)) {
        const match = /^\s*([-:])\s+`?([\w.$]+)`?\s+`([^`]+)`\s+-\s+(.+)$/.exec(line);
        if (match) {
          members.set(match[2], { marker: match[1], description: match[4] });
        } else if (/^\s*[-:]\s+/.test(line)) {
          report(tag, 'RETURN_MEMBER_FORMAT', `${name}: use "- member \`Type\` - Description" or ": parent.member \`Type\` - Description".`);
        }
      }
      const expectedMembers = new Map(returnTypes.flatMap(type => returnMembers(type, node)).map(member => [member.name, member]));
      for (const member of expectedMembers.values()) {
        const entry = members.get(member.name) ?? members.get(member.alias);
        if (!entry) {
          report(tag, 'RETURN_MEMBER_MISSING', `${name}: describe returned member ${member.name}.`);
        } else if (entry.marker !== (member.name.includes('.') ? ':' : '-') || !hasEnglish(entry.description)) {
          report(tag, 'RETURN_MEMBER_FORMAT', `${name}: returned member ${member.name} needs English prose and ${member.name.includes('.') ? ':' : '-'} prefix.`);
        }
      }
      for (const member of members.keys()) {
        if (!expectedMembers.has(member) && ![...expectedMembers.values()].some(expectedMember => expectedMember.alias === member)) {
          report(tag, 'RETURN_MEMBER_UNKNOWN', `${name}: ${member} is not an owned object member or tuple slot of the return type.`);
        }
      }
    }
  }

  function checkClass(node, name) {
    const type = checker.getTypeAtLocation(node);
    const explicitConstructor = node.members.some(ts.isConstructorDeclaration);
    const props = !explicitConstructor && checker.getPropertyOfType(type, 'props');
    check(node, name, [], { classProps: props && checker.getTypeOfSymbolAtLocation(props, node) });
    for (const member of node.members) {
      if (hasModifier(member, ts.SyntaxKind.PrivateKeyword) || hasModifier(member, ts.SyntaxKind.ProtectedKeyword)
        || (member.name && ts.isPrivateIdentifier(member.name))) {
        continue;
      }
      if (ts.isConstructorDeclaration(member)) {
        if (member.body) {
          const constructors = node.members.filter(ts.isConstructorDeclaration);
          const publicConstructors = constructors.filter(declaration => !declaration.body);
          check(member, `${name}.constructor`, (publicConstructors.length ? publicConstructors : [member])
            .map(declaration => checker.getSignatureFromDeclaration(declaration)), { declarations: constructors });
        }
        continue;
      }
      if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
        check(member, `${name}.${member.name.getText()}`, [checker.getSignatureFromDeclaration(member)]);
        continue;
      }
      if (member.name && (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member))) {
        const symbol = checker.getSymbolAtLocation(member.name);
        const signatures = checker.getTypeAtLocation(member).getCallSignatures();
        if (signatures.length && (member.body || ts.isPropertyDeclaration(member))) {
          check(member, `${name}.${member.name.getText()}`, signatures, { declarations: symbol?.declarations });
        }
      }
    }
  }

  function visitModule(moduleSymbol) {
    for (let symbol of checker.getExportsOfModule(moduleSymbol)) {
      if (symbol.declarations?.every(declaration =>
        ts.isExportSpecifier(declaration) && (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly))) {
        continue;
      }
      if (symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
      }
      if (!(symbol.flags & ts.SymbolFlags.Value)) {
        continue;
      }
      const node = symbol.valueDeclaration;
      if (!node || !isOwned(node)) {
        continue;
      }
      if (ts.isModuleDeclaration(node)) {
        visitModule(symbol);
      } else if (ts.isClassDeclaration(node)) {
        checkClass(node, symbol.name);
      } else if (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) {
        const signatures = checker.getTypeOfSymbolAtLocation(symbol, node).getCallSignatures();
        if (signatures.length) {
          const implementation = symbol.declarations?.find(declaration => ts.isFunctionDeclaration(declaration) && declaration.body) ?? node;
          check(implementation, symbol.name, signatures, {
            component: /^[A-Z]/.test(symbol.name) && signatures.every(signature => signature.parameters.length === 1),
            declarations: symbol.declarations,
          });
        }
      }
    }
  }

  for (const file of program.getSourceFiles().filter(isOwnedFile)) {
    const symbol = checker.getSymbolAtLocation(file);
    if (symbol) {
      visitModule(symbol);
    }
  }
  return diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
}

export function checkProject(project = path.join(process.cwd(), 'tsconfig.json')) {
  const configPath = path.resolve(project);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length) {
    throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  }
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  const compilerDiagnostics = ts.getPreEmitDiagnostics(program);
  if (compilerDiagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(compilerDiagnostics, {
      getCanonicalFileName: file => file,
      getCurrentDirectory: () => path.dirname(configPath),
      getNewLine: () => '\n',
    }));
  }
  return checkJsdoc(program, { sourceRoot: path.join(path.dirname(configPath), 'src') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values, positionals } = parseArgs({ options: { project: { type: 'string' } }, allowPositionals: true });
    if (positionals.length > 1 || (positionals.length && values.project)) {
      throw new Error('Usage: check-jsdoc.mjs [root] | --project tsconfig.json');
    }
    const diagnostics = checkProject(values.project ?? path.join(positionals[0] ?? process.cwd(), 'tsconfig.json'));
    for (const diagnostic of diagnostics) {
      process.stderr.write(`${path.relative(process.cwd(), diagnostic.file)}:${diagnostic.line}:${diagnostic.column} [${diagnostic.code}] ${diagnostic.message}\n`);
    }
    process.stdout.write(`JSDoc: ${diagnostics.length} diagnostic(s).\n`);
    process.exitCode = diagnostics.length ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
