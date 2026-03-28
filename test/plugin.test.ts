import { expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { format, Options } from "prettier";
import * as jtePlugin from "../src/index";

const prettify = (code: string, options: Options) =>
  format(code, {
    parser: "jte",
    plugins: [jtePlugin],
    ...options,
  });

const testFolder = join(__dirname, "cases");
const tests = readdirSync(testFolder);

tests.forEach((test: string) => {
  if (test.startsWith("_")) {
    return;
  }
  return it(test, async () => {
    const path = join(testFolder, test);
    const input = readFileSync(join(path, "input.jte")).toString();
    const expected = readFileSync(join(path, "expected.jte")).toString();

    const configPath = join(path, "config.json");
    const configString =
      existsSync(configPath) && readFileSync(configPath)?.toString();
    const configObject = configString ? JSON.parse(configString) : {};

    const formatValue = () => prettify(input, configObject);

    const expectedError = expected.match(/Error\(`(?<message>.*)`\)/s)?.groups
      ?.message;

    if (expectedError) {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(formatValue()).rejects.toThrow(expectedError);
    } else {
      const result = await formatValue();
      expect(result).toEqual(expected);
      expect(await prettify(result, configObject)).toEqual(expected);
    }
  });
});
