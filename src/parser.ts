import { Parser } from "prettier";
import {
  BlockNode,
  ContentNode,
  DirectiveKeyword,
  DirectiveNode,
  ExpressionNode,
  IgnoreNode,
  Node,
  Placeholder,
  RootNode,
} from "./jte";

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
    length: 0,
    nodes: {},
  };

  const generatePlaceholder = placeholderGenerator(text);
  root.content = parseFragment(text, root.nodes, generatePlaceholder);

  return root;
};

const parseFragment = (
  text: string,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
): string => {
  const directiveStack: DirectiveNode[] = [];
  let content = text;
  let i = 0;
  let anchor = 0;

  while (i < content.length) {
    const preNewLines = getPreNewLines(content.slice(anchor, i));

    const ignoreBlock = matchIgnoreBlock(content, i);
    if (ignoreBlock) {
      const id = generatePlaceholder();
      nodes[id] = {
        id,
        type: "ignore",
        content: ignoreBlock,
        preNewLines,
        originalText: ignoreBlock,
        index: i,
        length: ignoreBlock.length,
        nodes,
      } satisfies IgnoreNode;
      content = replaceAt(content, id, i, ignoreBlock.length);
      i += id.length;
      anchor = i;
      continue;
    }

    const scriptOrStyleBlock = matchScriptOrStyleBlock(content, i);
    if (scriptOrStyleBlock) {
      i += scriptOrStyleBlock.length;
      anchor = i;
      continue;
    }

    const htmlComment = matchHtmlComment(content, i);
    if (htmlComment) {
      i += htmlComment.length;
      anchor = i;
      continue;
    }

    const comment = matchComment(content, i);
    if (comment) {
      const id = generatePlaceholder();
      nodes[id] = {
        id,
        type: "comment",
        content: comment,
        preNewLines,
        originalText: comment,
        index: i,
        length: comment.length,
        nodes,
      };
      content = replaceAt(content, id, i, comment.length);
      i += id.length;
      anchor = i;
      continue;
    }

    const expression = matchExpression(content, i);
    if (expression) {
      const id = generatePlaceholder();
      nodes[id] = {
        id,
        type: "expression",
        unsafe: expression.unsafe,
        content: expression.content,
        preNewLines,
        originalText: expression.raw,
        index: i,
        length: expression.raw.length,
        nodes,
      } satisfies ExpressionNode;
      content = replaceAt(content, id, i, expression.raw.length);
      i += id.length;
      anchor = i;
      continue;
    }

    const code = matchCodeBlock(content, i);
    if (code) {
      const id = generatePlaceholder();
      nodes[id] = {
        id,
        type: "code",
        content: code.content,
        preNewLines,
        originalText: code.raw,
        index: i,
        length: code.raw.length,
        nodes,
      };
      content = replaceAt(content, id, i, code.raw.length);
      i += id.length;
      anchor = i;
      continue;
    }

    const contentBlock = matchContentBlock(
      content,
      i,
      nodes,
      generatePlaceholder,
    );
    if (contentBlock) {
      const id = generatePlaceholder();
      nodes[id] = {
        id,
        type: "content",
        content: contentBlock.content,
        preNewLines,
        originalText: contentBlock.raw,
        index: i,
        length: contentBlock.raw.length,
        nodes,
      } satisfies ContentNode;
      content = replaceAt(content, id, i, contentBlock.raw.length);
      i += id.length;
      anchor = i;
      continue;
    }

    const directive = matchDirective(content, i, nodes, generatePlaceholder);
    if (directive) {
      const id = generatePlaceholder();
      const node: DirectiveNode = {
        id,
        type: "directive",
        keyword: directive.keyword,
        content: directive.content,
        preNewLines,
        originalText: directive.raw,
        index: i,
        length: directive.raw.length,
        nodes,
      };

      if (directive.keyword === "if" || directive.keyword === "for") {
        nodes[id] = node;
        directiveStack.push(node);
        i += directive.raw.length;
        anchor = i;
        continue;
      }

      if (directive.keyword === "endif" || directive.keyword === "endfor") {
        const start = popMatchingDirective(
          directiveStack,
          directive.keyword,
          content,
        );
        nodes[id] = node;

        const originalText = content.slice(
          start.index,
          i + directive.raw.length,
        );
        const blockId = generatePlaceholder();
        nodes[blockId] = {
          id: blockId,
          type: "block",
          start,
          end: node,
          content: originalText.slice(
            start.length,
            originalText.length - directive.raw.length,
          ),
          preNewLines: start.preNewLines,
          containsNewLines: originalText.includes("\n"),
          originalText,
          index: start.index,
          length: originalText.length,
          nodes,
        } satisfies BlockNode;

        content = replaceAt(content, blockId, start.index, originalText.length);
        i = start.index + blockId.length;
        anchor = i;
        continue;
      }

      nodes[id] = node;
      content = replaceAt(content, id, i, directive.raw.length);
      i += id.length;
      anchor = i;
      continue;
    }

    i++;
  }

  for (const directive of directiveStack) {
    content = content.replace(directive.originalText, directive.id);
  }

  return content;
};

const popMatchingDirective = (
  stack: DirectiveNode[],
  endKeyword: "endif" | "endfor",
  content: string,
): DirectiveNode => {
  while (true) {
    const start = stack.pop();
    if (!start) {
      throw new Error(
        `No opening statement found for closing statement "@${endKeyword}".`,
      );
    }

    if (matchesBlockBoundary(start.keyword, endKeyword)) {
      return start;
    }

    content = replaceAt(content, start.id, start.index, start.length);
  }
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

const matchScriptOrStyleBlock = (
  text: string,
  index: number,
): string | null => {
  const lower = text.slice(index).toLowerCase();
  const tag = lower.startsWith("<script")
    ? "script"
    : lower.startsWith("<style")
      ? "style"
      : null;
  if (!tag) {
    return null;
  }

  const endIndex = lower.indexOf(`</${tag}>`);
  if (endIndex === NOT_FOUND) {
    return text.slice(index);
  }

  return text.slice(index, index + endIndex + tag.length + 3);
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
  const end = scanBalanced(text, openIndex, "{", "}");
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
): { raw: string; content: string } | null => {
  if (!text.startsWith("!{", index)) {
    return null;
  }

  const end = scanBalanced(text, index + 1, "{", "}");
  if (end === null) {
    return null;
  }

  return {
    raw: text.slice(index, end),
    content: text.slice(index + 2, end - 1),
  };
};

const matchContentBlock = (
  text: string,
  index: number,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
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
    content: parseFragment(inner, nodes, generatePlaceholder),
  };
};

const matchDirective = (
  text: string,
  index: number,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
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

  return matchTemplateDirective(text, index, nodes, generatePlaceholder);
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

  const end = scanBalanced(text, current, "(", ")");
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
): { raw: string; content: string; keyword: DirectiveKeyword } | null => {
  if (!text.startsWith("@template.", index)) {
    return null;
  }

  let current = index + "@template".length;
  while (current < text.length && /[A-Za-z0-9_.]/.test(text[current])) {
    current++;
  }
  if (text[current] !== "(") {
    return null;
  }

  const end = scanBalanced(text, current, "(", ")");
  if (end === null) {
    return null;
  }

  const raw = text.slice(index, end);
  const openParen = raw.indexOf("(");
  const header = raw.slice(1, openParen + 1);
  const args = raw.slice(openParen + 1, -1);
  return {
    raw,
    content:
      header + parseInlineContentBlocks(args, nodes, generatePlaceholder) + ")",
    keyword: "template",
  };
};

const parseInlineContentBlocks = (
  text: string,
  nodes: { [id: string]: Node },
  generatePlaceholder: () => string,
): string => {
  let content = text;
  let i = 0;

  while (i < content.length) {
    const block = matchContentBlock(content, i, nodes, generatePlaceholder);
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
      index: i,
      length: block.raw.length,
      nodes,
    } satisfies ContentNode;
    content = replaceAt(content, id, i, block.raw.length);
    i += id.length;
  }

  return content;
};

const getPreNewLines = (text: string): number => {
  if (!text.match(/^\s+$/)) {
    return 0;
  }
  return text.split("\n").length - 1;
};

const findClosingBacktick = (text: string, index: number): number | null => {
  const endIndex = text.indexOf("`", index);
  return endIndex === NOT_FOUND ? null : endIndex;
};

const scanBalanced = (
  text: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): number | null => {
  let depth = 0;
  let i = openIndex;

  while (i < text.length) {
    const char = text[i];

    if (char === '"' || char === "'") {
      i = skipQuoted(text, i, char);
      continue;
    }

    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }

    i++;
  }

  return null;
};

const skipQuoted = (text: string, index: number, quote: string): number => {
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

const replaceAt = (
  str: string,
  replacement: string,
  start: number,
  length: number,
): string => {
  return str.slice(0, start) + replacement + str.slice(start + length);
};
