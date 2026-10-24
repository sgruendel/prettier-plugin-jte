import { Parser } from "prettier";
import {
  BlockNode,
  ContentNode,
  DirectiveKeyword,
  DirectiveNode,
  Node,
  Placeholder,
  RootNode,
} from "./jte";
import { parseHtml } from "angular-html-parser";

const NOT_FOUND = -1;
const IGNORE_START = /^<!--\s*prettier-ignore-start\s*-->/;
const IGNORE_END = /<!--\s*prettier-ignore-end\s*-->/;

export const parse: Parser<Node>["parse"] = (text) => {
  const root: RootNode = {
    id: "0",
    type: "root",
    content: text,
    preNewLines: 0,
    originalText: text,
    index: 0,
    length: text.length,
    nodes: {},
  };

  const generatePlaceholder = placeholderGenerator(text);
  root.content = parseFragment(text, root.nodes, generatePlaceholder);

  // Validate HTML using the same parser prettier uses internally
  const { errors } = parseHtml(root.content, {
    canSelfClose: true,
    allowHtmComponentClosingTags: true,
  });

  if (errors.length > 0) {
    const error = errors[0];
    const {
      msg,
      span: { start, end },
    } = error;
    const startLine = start.line + 1;
    const startCol = start.col + 1;

    throw new PrettierParseError(`${msg} (${startLine}:${startCol})`, {
      start: { line: startLine, column: startCol },
      end: { line: end.line + 1, column: end.col + 1 },
    });
  }
  return root;
};

type AttributeContext = "attribute" | "attribute-value";
type JteMatch = {
  raw: string;
  content: string;
} & (
  | { type: "expression"; unsafe: boolean }
  | { type: "directive"; keyword: DirectiveKeyword }
  | { type: "ignore" | "comment" | "code" | "content" }
);
type TagState = {
  name: string;
  value:
    "between" | "name" | "after-name" | "before-value" | "quoted" | "unquoted";
  quote?: string;
  selfClosingSlash?: number;
};
const OPEN_TAG = /<([a-z][\w:.-]*)(?=[\s/>])/iy;
const RAW_CLOSE = {
  script: /<\/script\s*>/gi,
  style: /<\/style\s*>/gi,
};

const parseFragment = (
  text: string,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
  sourceOffset = 0,
): string => {
  // Build placeholder output separately so every index remains an offset in
  // the original source, including recursively parsed content blocks.
  const parts: string[] = [];
  const stack: { start: DirectiveNode; localIndex: number; parts: string[] }[] =
    [];
  const currentParts = () => stack.at(-1)?.parts ?? parts;
  let tag: TagState | undefined;
  let i = 0;
  let textStart = 0;
  let anchor = 0;
  const flush = (end: number) => {
    if (end > textStart) currentParts().push(text.slice(textStart, end));
    textStart = end;
  };

  while (i < text.length) {
    if (!tag && text[i] === "<") {
      OPEN_TAG.lastIndex = i;
      const opening = OPEN_TAG.exec(text);
      if (opening) {
        tag = { name: opening[1].toLowerCase(), value: "between" };
        i = OPEN_TAG.lastIndex;
        continue;
      }
    }

    const matched = matchJte(text, i, nodes, generatePlaceholder, sourceOffset);
    if (matched) {
      flush(i);
      const id = generatePlaceholder();
      const context: AttributeContext | undefined = tag
        ? tag.value === "before-value" ||
          tag.value === "quoted" ||
          tag.value === "unquoted"
          ? "attribute-value"
          : "attribute"
        : undefined;
      const { raw, ...value } = matched;
      const node: Node = {
        ...value,
        id,
        ...(context ? { context } : {}),
        preNewLines: getPreNewLines(text.slice(anchor, i)),
        originalText: raw,
        index: sourceOffset + i,
        length: matched.raw.length,
        nodes,
      };
      nodes[id] = node;
      const end = i + matched.raw.length;

      if (
        node.type === "directive" &&
        (node.keyword === "if" || node.keyword === "for")
      ) {
        stack.push({ start: node, localIndex: i, parts: [] });
      } else if (
        node.type === "directive" &&
        (node.keyword === "endif" || node.keyword === "endfor")
      ) {
        const endKeyword = node.keyword;
        while (
          stack.length &&
          !matchesBlockBoundary(stack.at(-1)!.start.keyword, endKeyword)
        ) {
          const unmatched = stack.pop()!;
          currentParts().push(unmatched.start.id, unmatched.parts.join(""));
        }
        const opening = stack.pop();
        if (!opening) {
          throw new Error(
            `No opening statement found for closing statement "@${endKeyword}".`,
          );
        }
        const blockId = generatePlaceholder();
        const originalText = text.slice(opening.localIndex, end);
        nodes[blockId] = {
          id: blockId,
          type: "block",
          start: opening.start,
          end: node,
          content: opening.parts.join(""),
          preNewLines: opening.start.preNewLines,
          containsNewLines: originalText.includes("\n"),
          originalText,
          index: opening.start.index,
          length: originalText.length,
          ...(opening.start.context ? { context: opening.start.context } : {}),
          nodes,
        } satisfies BlockNode;
        currentParts().push(blockId);
      } else {
        currentParts().push(id);
      }

      if (
        tag?.value === "before-value" &&
        matched.type !== "comment" &&
        matched.type !== "ignore"
      ) {
        tag.value = "unquoted";
      }
      if (tag) tag.selfClosingSlash = undefined;
      i = end;
      textStart = end;
      anchor = end;
      continue;
    }

    const htmlComment = matchHtmlComment(text, i);
    if (htmlComment) {
      i += htmlComment.length;
      anchor = i;
      continue;
    }

    if (tag) {
      const char = text[i];
      if (tag.value === "quoted") {
        if (char === tag.quote) tag.value = "between";
      } else if (char === ">") {
        const slash = tag.selfClosingSlash;
        const selfClosing = slash !== undefined;
        if (slash !== undefined && slash < i - 1) {
          flush(slash + 1);
          textStart = i;
        }
        const closing =
          tag.name === "script"
            ? RAW_CLOSE.script
            : tag.name === "style"
              ? RAW_CLOSE.style
              : undefined;
        tag = undefined;
        i++;
        if (closing && !selfClosing) {
          closing.lastIndex = i;
          const end = closing.exec(text);
          i = end ? closing.lastIndex : text.length;
          anchor = i;
        }
        continue;
      } else {
        if (!/\s/u.test(char)) {
          tag.selfClosingSlash =
            char === "/" &&
            (tag.value === "between" ||
              tag.value === "name" ||
              tag.value === "after-name")
              ? i
              : undefined;
        }
        if (/\s/u.test(char)) {
          if (tag.value === "unquoted") tag.value = "between";
          else if (tag.value === "name") tag.value = "after-name";
        } else if (tag.value === "before-value") {
          if (char === '"' || char === "'") {
            tag.value = "quoted";
            tag.quote = char;
          } else {
            tag.value = "unquoted";
          }
        } else if (tag.value === "unquoted") {
          if (char === "'" || char === '"') {
            // Preserve the value of tolerated HTML quote characters in an
            // unquoted attribute while making it acceptable to the HTML parser.
            flush(i);
            currentParts().push(char === "'" ? "&#39;" : "&quot;");
            textStart = i + 1;
          }
        } else if (char === "=") {
          tag.value = "before-value";
        } else if (char !== "/") {
          tag.value = "name";
        }
      }
    }
    i++;
  }

  flush(text.length);
  while (stack.length) {
    const unmatched = stack.pop()!;
    currentParts().push(unmatched.start.id, unmatched.parts.join(""));
  }
  return parts.join("");
};

const matchJte = (
  text: string,
  index: number,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
  sourceOffset: number,
): JteMatch | null => {
  const char = text[index];
  if (char !== "<" && char !== "$" && char !== "!" && char !== "@") return null;
  const ignore = matchIgnoreBlock(text, index);
  if (ignore) return { type: "ignore", raw: ignore, content: ignore };
  const comment = matchComment(text, index);
  if (comment) return { type: "comment", raw: comment, content: comment };
  const expression = matchExpression(text, index);
  if (expression) return { type: "expression", ...expression };
  const code = matchCodeBlock(
    text,
    index,
    nodes,
    generatePlaceholder,
    sourceOffset,
  );
  if (code) return { type: "code", ...code };
  const content = matchContentBlock(
    text,
    index,
    nodes,
    generatePlaceholder,
    sourceOffset,
  );
  if (content) return { type: "content", ...content };
  const directive = matchDirective(
    text,
    index,
    nodes,
    generatePlaceholder,
    sourceOffset,
  );
  return directive ? { type: "directive", ...directive } : null;
};
const matchesBlockBoundary = (
  startKeyword: DirectiveKeyword,
  endKeyword: "endif" | "endfor",
): boolean => {
  return (
    (startKeyword === "if" && endKeyword === "endif") ||
    (startKeyword === "for" && endKeyword === "endfor")
  );
};

const matchIgnoreBlock = (text: string, index: number): string | null => {
  if (!text.startsWith("<!--", index)) return null;
  const start = text.slice(index).match(IGNORE_START)?.[0];
  if (!start) {
    return null;
  }

  const rest = text.slice(index + start.length);
  const endMatch = rest.match(IGNORE_END);
  if (!endMatch || endMatch.index === undefined) {
    return null;
  }

  return text.slice(
    index,
    index + start.length + endMatch.index + endMatch[0].length,
  );
};

const matchHtmlComment = (text: string, index: number): string | null => {
  if (!text.startsWith("<!--", index)) {
    return null;
  }

  const endIndex = text.indexOf("-->", index + 4);
  if (endIndex === NOT_FOUND) {
    return text.slice(index);
  }

  let end = endIndex + 3;
  while (end < text.length && /\s/.test(text[end])) {
    end++;
  }
  return text.slice(index, end);
};

const matchComment = (text: string, index: number): string | null => {
  if (!text.startsWith("<%--", index)) {
    return null;
  }

  const endIndex = text.indexOf("--%>", index + 4);
  if (endIndex === NOT_FOUND) {
    return null;
  }

  return text.slice(index, endIndex + 4);
};

const matchExpression = (
  text: string,
  index: number,
): { raw: string; content: string; unsafe: boolean } | null => {
  const prefix = text.startsWith("$unsafe{", index)
    ? "$unsafe{"
    : text.startsWith("${", index)
      ? "${"
      : null;
  if (!prefix) {
    return null;
  }

  const openIndex = index + prefix.length - 1;
  const end = scanBalanced(text, openIndex);
  if (end === null) {
    return null;
  }

  return {
    raw: text.slice(index, end),
    content: text.slice(openIndex + 1, end - 1),
    unsafe: prefix === "$unsafe{",
  };
};

const matchCodeBlock = (
  text: string,
  index: number,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
  sourceOffset = 0,
): { raw: string; content: string } | null => {
  if (!text.startsWith("!{", index)) {
    return null;
  }

  const end = scanBalanced(text, index + 1);
  if (end === null) {
    return null;
  }

  return {
    raw: text.slice(index, end),
    content: parseInlineContentBlocks(
      text.slice(index + 2, end - 1),
      nodes,
      generatePlaceholder,
      sourceOffset + index + 2,
    ),
  };
};

const matchContentBlock = (
  text: string,
  index: number,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
  sourceOffset = 0,
): { raw: string; content: string } | null => {
  if (!text.startsWith("@`", index)) {
    return null;
  }

  const endIndex = findClosingBacktick(text, index + 2);
  if (endIndex === null) {
    return null;
  }

  const inner = text.slice(index + 2, endIndex);
  return {
    raw: text.slice(index, endIndex + 1),
    content: parseFragment(
      inner,
      nodes,
      generatePlaceholder,
      sourceOffset + index + 2,
    ),
  };
};

const matchDirective = (
  text: string,
  index: number,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
  sourceOffset = 0,
): { raw: string; content: string; keyword: DirectiveKeyword } | null => {
  if (text[index] !== "@") {
    return null;
  }

  const bareKeyword =
    matchBareKeyword(text, index, "else") ??
    matchBareKeyword(text, index, "endif") ??
    matchBareKeyword(text, index, "endfor");
  if (bareKeyword) {
    return bareKeyword;
  }

  const ifDirective = matchParenDirective(text, index, "if");
  if (ifDirective) {
    return ifDirective;
  }

  const elseifDirective = matchParenDirective(text, index, "elseif");
  if (elseifDirective) {
    return elseifDirective;
  }

  const forDirective = matchParenDirective(text, index, "for");
  if (forDirective) {
    return forDirective;
  }

  const importDirective = matchLineDirective(text, index, "import");
  if (importDirective) {
    return importDirective;
  }

  const paramDirective = matchLineDirective(text, index, "param");
  if (paramDirective) {
    return paramDirective;
  }

  return matchTemplateDirective(
    text,
    index,
    nodes,
    generatePlaceholder,
    sourceOffset,
  );
};

const matchBareKeyword = (
  text: string,
  index: number,
  keyword: "else" | "endif" | "endfor",
): { raw: string; content: string; keyword: DirectiveKeyword } | null => {
  const raw = `@${keyword}`;
  if (!text.startsWith(raw, index)) {
    return null;
  }

  const next = text[index + raw.length];
  if (next && /[A-Za-z0-9_.]/.test(next)) {
    return null;
  }

  return { raw, content: keyword, keyword };
};

const matchParenDirective = (
  text: string,
  index: number,
  keyword: "if" | "elseif" | "for",
): { raw: string; content: string; keyword: DirectiveKeyword } | null => {
  const prefix = `@${keyword}`;
  if (!text.startsWith(prefix, index)) {
    return null;
  }

  let current = index + prefix.length;
  while (current < text.length && /\s/.test(text[current])) {
    current++;
  }
  if (text[current] !== "(") {
    return null;
  }

  const end = scanBalanced(text, current);
  if (end === null) {
    return null;
  }

  return {
    raw: text.slice(index, end),
    content: text.slice(index + 1, end),
    keyword,
  };
};

const matchLineDirective = (
  text: string,
  index: number,
  keyword: "import" | "param",
): { raw: string; content: string; keyword: DirectiveKeyword } | null => {
  const prefix = `@${keyword}`;
  if (!text.startsWith(prefix, index)) {
    return null;
  }

  const lineEnd = text.indexOf("\n", index);
  const end = lineEnd === NOT_FOUND ? text.length : lineEnd;
  return {
    raw: text.slice(index, end),
    content: text.slice(index + 1, end),
    keyword,
  };
};

const matchTemplateDirective = (
  text: string,
  index: number,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
  sourceOffset = 0,
): { raw: string; content: string; keyword: DirectiveKeyword } | null => {
  if (!text.startsWith("@template.", index)) {
    return null;
  }

  let current = index + "@template".length;
  while (current < text.length && /[A-Za-z0-9_.]/.test(text[current])) {
    current++;
  }
  const nameEnd = current;
  while (current < text.length && /\s/.test(text[current])) {
    current++;
  }
  if (text[current] !== "(") {
    return null;
  }

  const end = scanBalanced(text, current);
  if (end === null) {
    return null;
  }

  const raw = text.slice(index, end);
  const header = text.slice(index + 1, nameEnd);
  const args = text.slice(current + 1, end - 1);
  return {
    raw,
    content:
      header +
      "(" +
      parseInlineContentBlocks(
        args,
        nodes,
        generatePlaceholder,
        sourceOffset + current + 1,
      ) +
      ")",
    keyword: "template",
  };
};

const parseInlineContentBlocks = (
  text: string,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
  sourceOffset = 0,
): string => {
  const parts: string[] = [];
  let textStart = 0;
  let i = 0;

  while (i < text.length) {
    if (text[i] === '"') {
      i = skipQuoted(text, i) + 1;
      continue;
    }

    const block = matchContentBlock(
      text,
      i,
      nodes,
      generatePlaceholder,
      sourceOffset,
    );
    if (!block) {
      i++;
      continue;
    }

    const id = generatePlaceholder();
    nodes[id] = {
      id,
      type: "content",
      content: block.content,
      preNewLines: 0,
      originalText: block.raw,
      index: sourceOffset + i,
      length: block.raw.length,
      nodes,
    } satisfies ContentNode;
    parts.push(text.slice(textStart, i), id);
    i += block.raw.length;
    textStart = i;
  }

  parts.push(text.slice(textStart));
  return parts.join("");
};

const getPreNewLines = (text: string): number => {
  if (!text.match(/^\s+$/)) {
    return 0;
  }
  return text.split("\n").length - 1;
};

const findClosingBacktick = (text: string, index: number): number | null => {
  let depth = 1;
  for (let i = index; i < text.length; i++) {
    if (text.startsWith("@`", i)) {
      depth++;
      i++;
    } else if (text[i] === "`" && --depth === 0) {
      return i;
    }
  }
  return null;
};

const scanBalanced = (text: string, openIndex: number): number | null => {
  // Match JTE's TemplateParser: strings and content use raw delimiters;
  // Java comments and Unicode escapes do not alter template boundaries.
  const closing = [text[openIndex] === "(" ? ")" : "}"];
  for (let i = openIndex + 1; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      i = skipQuoted(text, i);
    } else if (text.startsWith("@`", i)) {
      const end = findClosingBacktick(text, i + 2);
      if (end === null) {
        return null;
      }
      i = end;
    } else if (char === "(" || char === "{") {
      closing.push(char === "(" ? ")" : "}");
    } else if (char === ")" || char === "}") {
      if (closing.pop() !== char) {
        return null;
      }
      if (!closing.length) {
        return i + 1;
      }
    }
  }
  return null;
};

const skipQuoted = (text: string, index: number): number => {
  const quote = text[index];
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) {
      return i;
    }
    i++;
  }
  return text.length;
};

const placeholderGenerator = (text: string) => {
  let id = 0;

  return (): string => {
    while (true) {
      id++;
      const placeholder = Placeholder.startToken + id + Placeholder.endToken;
      if (!text.includes(placeholder)) {
        return placeholder;
      }
    }
  };
};

type ParseErrorLocation = {
  start: { line: number; column: number };
  end: { line: number; column: number };
};

export class PrettierParseError extends SyntaxError {
  loc: ParseErrorLocation;

  constructor(message: string, loc: ParseErrorLocation) {
    super(message);
    this.name = "PrettierParseError";
    this.loc = loc;
  }
}
