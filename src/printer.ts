import { AstPath, Doc, Options, Printer } from "prettier";
import { builders, utils } from "prettier/doc";
import {
  BlockNode,
  ContentNode,
  DirectiveNode,
  ExpressionNode,
  Node,
  Placeholder,
} from "./jte";

const NOT_FOUND = -1;
const TEMPLATE_PLACEHOLDER_LABEL = Symbol("jte-template-placeholder");
const MAP_OF_PATTERN = /(?:^|[^A-Za-z0-9_.$])Map\.of\s*$/;

export const getVisitorKeys = (
  ast: Node | { [id: string]: Node },
): string[] => {
  if ("type" in ast) {
    return ast.type === "root" ? ["nodes"] : [];
  }
  return Object.values(ast)
    .filter((node) => ["block", "content"].includes(node.type))
    .map((node) => node.id);
};

const printNode = (
  path: AstPath<Node>,
  printChild?: (path: AstPath<Node>) => builders.Doc,
): builders.Doc => {
  const node = path.getNode();
  if (!node) {
    return [];
  }

  switch (node.type) {
    case "expression":
      return printExpression(node);
    case "directive":
      return printDirective(path, node, printChild);
    case "comment":
      return printCommentBlock(node);
    case "ignore":
      return node.content;
    case "code":
      return printCode(node.content, node.preNewLines);
    case "content":
      return printContent(path, node, printChild);
  }

  return node.originalText;
};

export const print: Printer<Node>["print"] = (path, _options, printChild) =>
  printNode(
    path as AstPath<Node>,
    printChild as ((path: AstPath<Node>) => builders.Doc) | undefined,
  );

const printExpression = (node: ExpressionNode): builders.Doc => {
  const prefix = node.unsafe ? "$unsafe{" : "${";
  const multiline = node.content.includes("\n");
  const expressionText = multiline
    ? trimBlankEdgeLines(dedentText(node.content, false))
    : node.content.trim();
  const expression = builders.group(
    multiline
      ? [
          prefix,
          builders.indent(getMultilineGroup(expressionText)),
          builders.hardline,
          "}",
        ]
      : [prefix, expressionText, "}"],
    { shouldBreak: node.preNewLines > 0 },
  );

  return node.preNewLines > 1
    ? builders.group([builders.trim, builders.hardline, expression])
    : expression;
};

const printDirective = (
  path: AstPath<Node>,
  node: DirectiveNode,
  printChild?: (path: AstPath<Node>) => builders.Doc,
): builders.Doc => {
  if (node.keyword === "template") {
    return printTemplateDirective(path, node, printChild);
  }

  const body = buildMultilineDoc(
    path,
    node,
    dedentText(normalizeDirectiveContent(node), true),
    printChild,
  );
  const directive = builders.group(["@", body], {
    shouldBreak: node.preNewLines > 0,
  });

  if (
    ["else", "elseif"].includes(node.keyword) &&
    surroundingBlock(node)?.containsNewLines
  ) {
    return [builders.dedent(builders.hardline), directive, builders.hardline];
  }

  return node.preNewLines > 1
    ? builders.group([builders.trim, builders.hardline, directive])
    : directive;
};

const printTemplateDirective = (
  path: AstPath<Node>,
  node: DirectiveNode,
  printChild?: (path: AstPath<Node>) => builders.Doc,
): builders.Doc => {
  const match = node.content.match(
    /^(template(?:\.[A-Za-z0-9_]+)+)\(([\s\S]*)\)$/,
  );
  if (!match) {
    return ["@", node.content];
  }

  const [, templateName, rawArgs] = match;
  const args = splitTemplateArguments(rawArgs);
  const body =
    args.length === 0
      ? `${templateName}()`
      : [
          templateName,
          "(",
          builders.indent([
            builders.softline,
            builders.join(
              [",", builders.line],
              args.map((arg) =>
                printTemplateArgument(path, node, arg, printChild),
              ),
            ),
          ]),
          builders.softline,
          ")",
        ];
  const directive = builders.group(["@", body], {
    shouldBreak: rawArgs.includes("\n"),
  });

  return node.preNewLines > 1
    ? builders.group([builders.trim, builders.hardline, directive])
    : directive;
};

const printTemplateArgument = (
  path: AstPath<Node>,
  node: Node,
  text: string,
  printChild?: (path: AstPath<Node>) => builders.Doc,
): builders.Doc => {
  const value = text.trim();
  const result: builders.Doc = [];
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"' || char === "'") {
      i = skipQuotedText(value, i);
      continue;
    }
    if (char !== "(") {
      continue;
    }

    const end = findClosingDelimiter(value, i, "(", ")");
    if (end === null) {
      break;
    }

    result.push(
      interpolatePlaceholders(path, node, value.slice(start, i), printChild),
    );

    const inner = value.slice(i + 1, end - 1);
    const args = splitTemplateArguments(inner);
    if (!args.length) {
      result.push(
        "(",
        interpolatePlaceholders(path, node, inner.trim(), printChild),
        ")",
      );
    } else {
      const printedArgs = args.map((arg) =>
        printTemplateArgument(path, node, arg, printChild),
      );
      result.push(
        builders.group([
          "(",
          builders.indent([
            builders.softline,
            builders.join(
              [",", builders.line],
              MAP_OF_PATTERN.test(value.slice(start, i))
                ? pairUp(printedArgs)
                : printedArgs,
            ),
          ]),
          builders.softline,
          ")",
        ]),
      );
    }

    start = end;
    i = end - 1;
  }

  if (start < value.length) {
    result.push(
      interpolatePlaceholders(path, node, value.slice(start), printChild),
    );
  }

  return result;
};

const pairUp = (items: builders.Doc[]): builders.Doc[] => {
  const pairs: builders.Doc[] = [];
  for (let i = 0; i < items.length; i += 2) {
    pairs.push(
      i + 1 < items.length ? [items[i], ", ", items[i + 1]] : items[i],
    );
  }
  return pairs;
};

const findClosingDelimiter = (
  text: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): number | null => {
  let depth = 0;

  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    if (char === '"' || char === "'") {
      i = skipQuotedText(text, i);
      continue;
    }
    if (char === openChar) {
      depth++;
    } else if (char === closeChar && --depth === 0) {
      return i + 1;
    }
  }

  return null;
};

const skipQuotedText = (text: string, start: number): number => {
  if (text.startsWith('"""', start)) {
    for (let i = start + 3; i < text.length; i++) {
      if (text.startsWith('"""', i) && !isEscaped(text, i)) {
        return i + 2;
      }
    }
    return text.length;
  }

  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
    } else if (text[i] === quote) {
      return i;
    }
  }

  return text.length;
};

const isEscaped = (text: string, index: number): boolean => {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
};

const printCommentBlock = (node: Node): builders.Doc => {
  const comment = builders.group(node.content, {
    shouldBreak: node.preNewLines > 0,
  });

  return node.preNewLines > 1
    ? builders.group([builders.trim, builders.hardline, comment])
    : comment;
};

const printCode = (content: string, preNewLines: number): builders.Doc => {
  const multiline = content.includes("\n");
  const codeText = multiline
    ? trimBlankEdgeLines(dedentText(content, false))
    : content.trim();
  const code = builders.group(
    multiline
      ? [
          "!{",
          builders.indent(getMultilineGroup(codeText)),
          builders.hardline,
          "}",
        ]
      : ["!{", codeText, "}"],
    { shouldBreak: preNewLines > 0 },
  );

  return preNewLines > 1
    ? builders.group([builders.trim, builders.hardline, code])
    : code;
};

const printContent = (
  path: AstPath<Node>,
  node: ContentNode,
  printChild?: (path: AstPath<Node>) => builders.Doc,
): builders.Doc => {
  if (!node.content.trim()) {
    return "@``";
  }

  const contentText = trimBlankEdgeLines(
    dedentText(node.content.replace(/^\n+|\n+$/g, ""), false),
  );
  const inner = buildMultilineDoc(path, node, contentText, printChild);
  if (!contentText.includes("\n")) {
    return ["@`", inner, "`"];
  }

  const content = builders.group([
    "@`",
    builders.indent([builders.hardline, inner]),
    builders.hardline,
    "`",
  ]);
  return node.preNewLines > 1
    ? builders.group([builders.trim, builders.hardline, content])
    : content;
};

export const embed: Printer<Node>["embed"] = () => {
  return async (
    textToDoc: (text: string, options: Options) => Promise<Doc>,
    print: (
      selector?: string | number | Array<string | number> | AstPath,
    ) => Doc,
    path: AstPath,
    options: Options,
  ): Promise<Doc | undefined> => {
    const node = path.getNode();
    if (!node || !["root", "block", "content"].includes(node.type)) {
      return undefined;
    }

    const mapped = await Promise.all(
      splitAtElse(node).map(async (content) => {
        let doc;
        if (content in node.nodes) {
          doc = content;
        } else {
          doc = await textToDoc(content, {
            ...options,
            parser: "html",
          });
        }

        let ignoreDoc = false;

        return utils.mapDoc(doc, (currentDoc) => {
          if (typeof currentDoc !== "string") {
            return separateAfterTemplateCalls(currentDoc);
          }

          if (currentDoc === "<!-- prettier-ignore -->") {
            ignoreDoc = true;
            return currentDoc;
          }

          const idxs = findPlaceholders(currentDoc).filter(
            ([start, end]) => currentDoc.slice(start, end + 1) in node.nodes,
          );
          if (!idxs.length) {
            ignoreDoc = false;
            return currentDoc;
          }

          const res: builders.Doc = [];
          let lastEnd = 0;
          let previousPlaceholder: string | undefined;
          for (const [start, end] of idxs) {
            if (lastEnd < start) {
              const between = currentDoc.slice(lastEnd, start);
              res.push(
                !ignoreDoc &&
                  previousPlaceholder &&
                  /^\s+$/u.test(between) &&
                  isTemplatePlaceholder(node, previousPlaceholder)
                  ? builders.hardline
                  : between,
              );
            }

            const placeholder = currentDoc.slice(start, end + 1);
            if (ignoreDoc) {
              res.push(node.nodes[placeholder].originalText);
            } else {
              const printed = path.call(print, "nodes", placeholder);
              res.push(
                isTemplatePlaceholder(node, placeholder)
                  ? builders.label(TEMPLATE_PLACEHOLDER_LABEL, printed)
                  : printed,
              );
            }

            lastEnd = end + 1;
            previousPlaceholder = placeholder;
          }

          if (lastEnd > 0 && currentDoc.length > lastEnd) {
            const trailing = currentDoc.slice(lastEnd);
            if (
              !ignoreDoc &&
              previousPlaceholder &&
              isTemplatePlaceholder(node, previousPlaceholder)
            ) {
              res.push(builders.hardline, trailing.trimStart());
            } else {
              res.push(trailing);
            }
          }

          ignoreDoc = false;
          return res;
        });
      }),
    );

    if (node.type === "block") {
      const block = buildBlock(
        path as AstPath<Node>,
        print as (path: AstPath<Node>) => builders.Doc,
        node,
        mapped,
      );
      return node.preNewLines > 1
        ? builders.group([builders.trim, builders.hardline, block])
        : block;
    }

    if (node.type === "content") {
      return embedContent(path as AstPath<Node>, node, mapped);
    }

    return [...mapped, builders.hardline];
  };
};

const separateAfterTemplateCalls = (doc: builders.Doc): builders.Doc => {
  if (Array.isArray(doc)) {
    return doc.map((part, index, parts) =>
      index > 0 && endsWithTemplatePlaceholder(parts[index - 1])
        ? replaceLeadingBreakWithHardline(part)
        : part,
    );
  }

  if (
    !doc ||
    typeof doc !== "object" ||
    !("type" in doc) ||
    doc.type !== "fill"
  ) {
    return doc;
  }

  return {
    ...doc,
    parts: doc.parts.map((part, index, parts) =>
      isLineDoc(part) && endsWithTemplatePlaceholder(parts[index - 1])
        ? builders.hardline
        : part,
    ),
  };
};

const isLineDoc = (doc: builders.Doc | undefined): boolean =>
  Boolean(
    doc &&
    typeof doc === "object" &&
    !Array.isArray(doc) &&
    "type" in doc &&
    doc.type === "line",
  );

const replaceLeadingBreakWithHardline = (doc: builders.Doc): builders.Doc => {
  if (typeof doc === "string") {
    return /^\s+$/u.test(doc) ? builders.hardline : doc;
  }
  if (Array.isArray(doc)) {
    const result = [...doc];
    for (let i = 0; i < result.length; i++) {
      if (result[i] === "") {
        continue;
      }
      result[i] = replaceLeadingBreakWithHardline(result[i]);
      break;
    }
    return result;
  }
  if (isLineDoc(doc)) {
    return builders.hardline;
  }
  if (doc && "contents" in doc) {
    return {
      ...doc,
      contents: replaceLeadingBreakWithHardline(doc.contents),
    };
  }
  if (doc?.type === "fill") {
    const [first, ...rest] = doc.parts;
    return {
      ...doc,
      parts: [replaceLeadingBreakWithHardline(first), ...rest],
    };
  }
  return doc;
};

const endsWithTemplatePlaceholder = (
  doc: builders.Doc | undefined,
): boolean => {
  if (!doc) {
    return false;
  }
  if (typeof doc === "string") {
    return false;
  }
  if (Array.isArray(doc)) {
    for (const entry of [...doc].reverse()) {
      if (entry === "") {
        continue;
      }
      return endsWithTemplatePlaceholder(entry);
    }
    return false;
  }
  if (doc.type === "label" && doc.label === TEMPLATE_PLACEHOLDER_LABEL) {
    return true;
  }
  if (doc.type === "fill") {
    return endsWithTemplatePlaceholder(doc.parts.at(-1));
  }
  if ("contents" in doc) {
    return endsWithTemplatePlaceholder(doc.contents);
  }
  return false;
};

const isTemplatePlaceholder = (node: Node, placeholder: string): boolean => {
  const child = node.nodes[placeholder];
  return child?.type === "directive" && child.keyword === "template";
};

const embedContent = (
  _path: AstPath<Node>,
  node: ContentNode,
  mapped: builders.Doc[],
): builders.Doc => {
  if (!node.content.trim()) {
    return "@``";
  }

  const inner = utils.stripTrailingHardline(builders.group(mapped));
  return builders.group([
    "@`",
    builders.indent([builders.softline, inner]),
    builders.softline,
    "`",
  ]);
};

const getMultilineGroup = (content: string): builders.Group => {
  const lines = content.split("\n");
  const indentSizes = lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => line.search(/\S/));
  const minIndent = indentSizes.length ? Math.min(...indentSizes) : 0;

  return builders.group(
    lines.map((line, i) => [
      builders.hardline,
      i === 0
        ? line.trim()
        : line.trim()
          ? line.slice(minIndent).trimEnd()
          : "",
    ]),
  );
};

const interpolatePlaceholders = (
  path: AstPath<Node>,
  node: Node,
  text: string,
  printChild?: (path: AstPath<Node>) => builders.Doc,
): builders.Doc => {
  const idxs = findPlaceholders(text).filter(
    ([start, end]) => text.slice(start, end + 1) in node.nodes,
  );
  if (!idxs.length) {
    return text;
  }

  const result: builders.Doc = [];
  let lastEnd = 0;
  for (const [start, end] of idxs) {
    if (lastEnd < start) {
      result.push(text.slice(lastEnd, start));
    }
    const placeholder = text.slice(start, end + 1);
    if (printChild) {
      result.push(path.call(printChild as never, "nodes", placeholder));
    } else {
      result.push(node.nodes[placeholder].originalText);
    }
    lastEnd = end + 1;
  }
  if (lastEnd < text.length) {
    result.push(text.slice(lastEnd));
  }
  return result;
};

const buildMultilineDoc = (
  path: AstPath<Node>,
  node: Node,
  text: string,
  printChild?: (path: AstPath<Node>) => builders.Doc,
): builders.Doc => {
  const lines = text.split("\n");
  if (lines.length === 1) {
    return interpolatePlaceholders(path, node, text, printChild);
  }

  const [first, ...rest] = lines;
  return [
    interpolatePlaceholders(path, node, first, printChild),
    builders.indent(
      rest.flatMap((line) => [
        builders.hardline,
        interpolatePlaceholders(path, node, line, printChild),
      ]),
    ),
  ];
};

const dedentText = (text: string, skipFirstLine: boolean): string => {
  const lines = text.split("\n");
  const relevant = (skipFirstLine ? lines.slice(1) : lines).filter((line) =>
    line.trim(),
  );
  const minIndent = relevant.length
    ? Math.min(...relevant.map((line) => line.match(/^\s*/)![0].length))
    : 0;

  if (!minIndent) {
    return text;
  }

  return lines
    .map((line, index) => {
      if ((skipFirstLine && index === 0) || !line.trim()) {
        return skipFirstLine && index === 0 ? line.trimEnd() : "";
      }
      return line.slice(minIndent).trimEnd();
    })
    .join("\n");
};

const trimBlankEdgeLines = (text: string): string => {
  const lines = text.split("\n");
  let start = 0;
  let end = lines.length;

  while (start < end && !lines[start].trim()) {
    start++;
  }

  while (end > start && !lines[end - 1].trim()) {
    end--;
  }

  return lines.slice(start, end).join("\n");
};

const normalizeDirectiveContent = (node: DirectiveNode): string => {
  if (["import", "param"].includes(node.keyword)) {
    return `${node.keyword} ${node.content.slice(node.keyword.length).trim()}`;
  }

  if (["if", "elseif", "for"].includes(node.keyword)) {
    const match = node.content.match(/^(\w+)\s*\(([\s\S]*)\)$/);
    if (match) {
      return `${match[1]}(${match[2].trim()})`;
    }
  }

  if (node.keyword === "template") {
    const match = node.content.match(
      /^(template(?:\.[A-Za-z0-9_]+)+)\(([\s\S]*)\)$/,
    );
    if (match && !match[2].includes("\n")) {
      return `${match[1]}(${match[2].trim()})`;
    }
  }

  return node.content;
};

const splitTemplateArguments = (text: string): string[] => {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      if (quote === '"""') {
        if (text.startsWith(quote, i) && !isEscaped(text, i)) {
          current += quote;
          i += quote.length - 1;
          quote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === "\n") {
        current = current.replace(/[ \t]+$/u, "") + " ";
        while (i + 1 < text.length && /[ \t]/.test(text[i + 1])) {
          i++;
        }
        continue;
      }

      current += char;
      if (char === "\\") {
        i++;
        if (i < text.length) {
          current += text[i];
        }
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (text.startsWith('"""', i)) {
      quote = '"""';
      current += quote;
      i += quote.length - 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth++;
      current += char;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth--;
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      if (current.trim()) {
        args.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
};

const splitAtElse = (node: Node): string[] => {
  const elseNodes = Object.values(node.nodes).filter(
    (current): current is DirectiveNode =>
      current.type === "directive" &&
      ["else", "elseif"].includes(current.keyword) &&
      node.content.search(current.id) !== NOT_FOUND,
  );
  if (!elseNodes.length) {
    return [node.content];
  }

  const re = new RegExp(`(${elseNodes.map((entry) => entry.id).join(")|(")})`);
  return node.content.split(re).filter(Boolean);
};

export const findPlaceholders = (text: string): [number, number][] => {
  const res: [number, number][] = [];
  let i = 0;

  while (true) {
    const start = text.slice(i).search(Placeholder.startToken);
    if (start === NOT_FOUND) {
      break;
    }
    const end = text
      .slice(start + i + Placeholder.startToken.length)
      .search(Placeholder.endToken);
    if (end === NOT_FOUND) {
      break;
    }

    res.push([start + i, end + start + i + Placeholder.startToken.length + 1]);
    i += start + Placeholder.startToken.length;
  }

  return res;
};

export const surroundingBlock = (node: Node): BlockNode | undefined => {
  return Object.values(node.nodes).find(
    (current): current is BlockNode =>
      current.type === "block" && current.content.search(node.id) !== NOT_FOUND,
  );
};

const buildBlock = (
  path: AstPath<Node>,
  print: (path: AstPath<Node>) => builders.Doc,
  block: BlockNode,
  mapped: builders.Doc[],
): builders.Doc => {
  if (block.content.match(/^\s*$/)) {
    return builders.fill([
      path.call(print, "nodes", block.start.id),
      builders.softline,
      path.call(print, "nodes", block.end.id),
    ]);
  }

  if (block.containsNewLines) {
    return builders.group([
      path.call(print, "nodes", block.start.id),
      builders.indent([builders.softline, mapped]),
      builders.hardline,
      path.call(print, "nodes", block.end.id),
    ]);
  }

  return builders.group([
    path.call(print, "nodes", block.start.id),
    mapped,
    path.call(print, "nodes", block.end.id),
  ]);
};
