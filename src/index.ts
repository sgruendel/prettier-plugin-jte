import { Node } from "./jte";
import { parse } from "./parser";
import { print, embed, getVisitorKeys } from "./printer";
import { Parser, Printer, SupportLanguage } from "prettier";

const PLUGIN_KEY = "jte";

export const languages: SupportLanguage[] = [
  {
    name: "JTE",
    parsers: [PLUGIN_KEY],
    extensions: [".jte"],
    vscodeLanguageIds: ["jte"],
  },
];

export const parsers = {
  [PLUGIN_KEY]: {
    astFormat: PLUGIN_KEY,
    parse,
    locStart: (node) => node.index,
    locEnd: (node) => node.index + node.length,
  } as Parser<Node>,
};

export const printers = {
  [PLUGIN_KEY]: {
    print,
    embed,
    getVisitorKeys,
  } as Printer<Node>,
};
