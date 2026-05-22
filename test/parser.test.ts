import { expect, test } from "vitest";
import { parse, PrettierParseError } from "../src/parser";
import { ParserOptions } from "prettier";

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
