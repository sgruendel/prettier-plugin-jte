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
