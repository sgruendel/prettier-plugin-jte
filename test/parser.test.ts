import { expect, test } from "vitest";
import { parse, PrettierParseError } from "../src/parser";
import { ParserOptions } from "prettier";

const literalContent = "@`<b class = 'raw'>=</b>`";
const unmatchedContent = "@`unterminated";

test.each([
  [
    "quoted comment markers",
    String.raw`var text=\u0022// ${literalContent}\u0022;`,
  ],
  [
    "quoted unmatched backticks",
    String.raw`var text=\u0022${unmatchedContent}\u0022;`,
  ],
  [
    "quoted closing braces",
    String.raw`var text=\u0022} // ${unmatchedContent}\u0022;`,
  ],
  ["character literals", String.raw`var brace=\u0027}\u0027;`],
  [
    "escaped quotes",
    String.raw`var text=\u0022\u005c\u0022// ${unmatchedContent}\u0022;`,
  ],
  [
    "ineligible escapes",
    String.raw`var text="\\u0022 // ${unmatchedContent}";`,
  ],
  [
    "eligible escapes after backslashes",
    String.raw`var text="\\\u0022; // ${unmatchedContent} \u000a var after=1;`,
  ],
  [
    "backslashes produced by escapes",
    String.raw`var text="\u005c\\u0022; // ${unmatchedContent} \u000a var after=1;`,
  ],
  [
    "line comments ending with LF",
    String.raw`// } ${unmatchedContent} \u000a var after=1;`,
  ],
  [
    "line comments ending with CR",
    String.raw`// } ${unmatchedContent} \u000d var after=1;`,
  ],
  [
    "repeated Unicode markers",
    String.raw`// } ${unmatchedContent} \uuu000A var after=1;`,
  ],
  [
    "Unicode block comments",
    String.raw`\u002f\u002a } ${unmatchedContent} \u002a\u002f var after=1;`,
  ],
  [
    "Unicode braces",
    String.raw`if (true) \u007b var text=\u0022}\u0022; \u007d`,
  ],
  ["raw content delimiters", "var content=@`<b>\\u0060 } //</b>`;"],
  [
    "text blocks",
    String.raw`var text=\u0022\u0022\u0022
} // ${unmatchedContent}
\u0022\u0022\u0022;`,
  ],
])("preserves Unicode-aware code boundaries: %s", async (_name, body) => {
  const code = `!{${body}}`;
  const root = await parse(`${code}\n<p>\${ value }</p>`, {} as ParserOptions);
  const nodes = Object.values(root.nodes);
  const codeNodes = nodes.filter((node) => node.type === "code");
  const expressions = nodes.filter((node) => node.type === "expression");

  expect(codeNodes).toHaveLength(1);
  expect(codeNodes[0]).toMatchObject({
    content: body,
    originalText: code,
    length: code.length,
  });
  expect(nodes.filter((node) => node.type === "content")).toHaveLength(0);
  expect(expressions).toHaveLength(1);
  expect(root.content).toEqual(
    `${codeNodes[0].id}\n<p>${expressions[0].id}</p>`,
  );
});

test.each([
  ["expression", "${", "}"],
  ["directive", "@template.example(", ")"],
])("preserves Unicode-aware %s boundaries", async (type, prefix, suffix) => {
  const source = `${prefix}\\u0022// ${literalContent}\\u0022${suffix}`;
  const root = await parse(source, {} as ParserOptions);
  const nodes = Object.values(root.nodes);

  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatchObject({
    type,
    originalText: source,
    length: source.length,
  });
  expect(root.content).toEqual(nodes[0].id);
});

test("keeps broken expression text untouched", async () => {
  expect(
    (await parse("<div>${ user.getName( </div>", {} as ParserOptions)).content,
  ).toEqual("<div>${ user.getName( </div>");
});

test("keeps broken directive text untouched", async () => {
  expect(
    (await parse("<div>@for(var entry : entries </div>", {} as ParserOptions))
      .content,
  ).toEqual("<div>@for(var entry : entries </div>");
});
test("throws on invalid HTML nesting", () => {
  const expectedException = new PrettierParseError("Unexpected closing tag \"p\". It may happen when the tag has already been closed by another tag. For more info see https://www.w3.org/TR/html5/syntax.html#closing-elements-that-have-implied-end-tags (1:26)", {
    start: { line: 1, column: 26 },
    end: { line: 1, column: 30 },
  });
  expect(() =>
      parse("<p><ul><li>item</li></ul></p>", {} as ParserOptions)
  ).toThrow(expectedException);
});
test("throws on malformed tag", () => {
  const expectedException = new PrettierParseError("Unexpected character \"EOF\" (1:16)", {
    start: { line: 1, column: 16 },
    end: { line: 1, column: 16 },
  });
  expect(() =>
      parse("<strong>Title</", {} as ParserOptions)
  ).toThrow(expectedException)
});
