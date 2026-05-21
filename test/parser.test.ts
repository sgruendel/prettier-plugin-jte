import { expect, test } from "vitest";
import { parse } from "../src/parser";
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
  expect(() =>
      parse("<p><ul><li>item</li></ul></p>", {} as ParserOptions)
  ).toThrow(SyntaxError);
});
test("throws on malformed tag", () => {
  expect(() =>
      parse("<strong>Title</strong>\n</\n<ul><li>item</li></ul>", {} as ParserOptions)
  ).toThrow(SyntaxError);
});
