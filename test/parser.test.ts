import { expect, test } from "vitest";
import { parse, PrettierParseError } from "../src/parser";
import { ParserOptions } from "prettier";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsers } from "../src/index";

test.each([
  "nested_node_locations",
  "attribute_conditionals",
  "attribute_unquoted_quotes",
  "raw_text_self_closing_whitespace",
])("keeps original source locations in %s", async (name) => {
  for (const file of ["input.jte", "expected.jte"]) {
    const source = readFileSync(join(__dirname, "cases", name, file), "utf8");
    const root = await parse(source, {} as ParserOptions);
    for (const node of [root, ...Object.values(root.nodes)]) {
      expect(
        source.slice(parsers.jte.locStart(node), parsers.jte.locEnd(node)),
      ).toEqual(node.originalText);
    }
  }
});

test.each(["script", "style"])(
  "parses JTE attributes on %s elements without parsing their body",
  async (tag) => {
    const expression = '${flag ? "a > b" : assetPath("/assets/example")}';
    const body = "/* ${clientOnly} @if(clientOnly) */";
    const root = await parse(
      `<${tag} data-note="a > b" data-src="${expression}">${body}</${tag}>`,
      {} as ParserOptions,
    );
    const nodes = Object.values(root.nodes);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: "expression",
      originalText: expression,
    });
    expect(root.content).toEqual(
      `<${tag} data-note="a > b" data-src="${nodes[0].id}">${body}</${tag}>`,
    );
  },
);

test.each([
  ["code", "!{var x=1; // see <b> tag}"],
  ["code", "!{var x=1; /* see <b> tag}"],
  ["code", String.raw`!{if (a) \u007b}`],
  ["code", String.raw`!{\u007d}`],
  ["code", String.raw`!{var text=\u0022}`],
  ["code", '!{var text="} // @`<b>raw</b>`";}'],
  ["code", '!{var text="escaped \\" }";}'],
  ["code", "!{var x=fn(() -> { return 1; });}"],
  ["expression", "${value // see <b> tag}"],
  ["expression", "${value /* see <b> tag}"],
  ["expression", "${value + \\u007b}"],
  ["directive", '@template.example(label="\\u0041", text="a,b")'],
  ["directive", "@template.example(value /* see <b> tag)"],
])("uses JTE raw boundaries for %s: %s", async (type, source) => {
  const root = await parse(`${source}\n<p>after</p>`, {} as ParserOptions);
  const nodes = Object.values(root.nodes);

  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatchObject({
    type,
    originalText: source,
    length: source.length,
  });
  expect(root.content).toEqual(`${nodes[0].id}\n<p>after</p>`);
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
