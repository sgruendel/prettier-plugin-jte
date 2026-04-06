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

export const getVisitorKeys = (
  ast: Node | { [id: string]: Node },
): string[] => {
  if ("type" in ast) {
    return ast.type === "root" ? ["nodes"] : [];
  }
  return Object.values(ast)
    .filter((node) => node.type === "block")
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
  const expression = builders.group(
    multiline
      ? [
          prefix,
          builders.indent(getMultilineGroup(node.content)),
          builders.hardline,
          "}",
        ]
      : [prefix, node.content.trim(), "}"],
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
                interpolatePlaceholders(path, node, arg.trim(), printChild),
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
  const code = builders.group(
    multiline
      ? [
          "!{",
          builders.indent(getMultilineGroup(content)),
          builders.hardline,
          "}",
        ]
      : ["!{", content.trim(), "}"],
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
  const inner = stripLeadingIndent(
    buildMultilineDoc(path, node, contentText, printChild),
  );
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

const stripLeadingIndent = (doc: builders.Doc): builders.Doc => {
  if (!Array.isArray(doc) || doc.length < 2) {
    return doc;
  }

  const [first, second, ...rest] = doc;
  if (typeof first !== "string" || !isIndentDoc(second)) {
    return doc;
  }

  return [first, ...(second.contents as builders.Doc[]), ...rest];
};

const isIndentDoc = (
  doc: builders.Doc,
): doc is { type: "indent"; contents: builders.Doc } => {
  return (
    Boolean(doc) &&
    typeof doc === "object" &&
    "type" in doc &&
    doc.type === "indent" &&
    "contents" in doc
  );
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
            return currentDoc;
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
          for (const [start, end] of idxs) {
            if (lastEnd < start) {
              res.push(currentDoc.slice(lastEnd, start));
            }

            const placeholder = currentDoc.slice(start, end + 1);
            if (ignoreDoc) {
              res.push(node.nodes[placeholder].originalText);
            } else {
              res.push(path.call(print, "nodes", placeholder));
            }

            lastEnd = end + 1;
          }

          if (lastEnd > 0 && currentDoc.length > lastEnd) {
            res.push(currentDoc.slice(lastEnd));
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

const embedContent = (
  path: AstPath<Node>,
  node: ContentNode,
  mapped: builders.Doc[],
): builders.Doc => {
  if (!node.content.trim()) {
    return "";
  }

  if (node.content.includes("\n")) {
    return builders.group(mapped);
  }

  return builders.group(mapped);
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
