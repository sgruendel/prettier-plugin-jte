# prettier-plugin-jte

[![CI](https://github.com/sgruendel/prettier-plugin-jte/actions/workflows/ci.yaml/badge.svg)](https://github.com/sgruendel/prettier-plugin-jte/actions/workflows/ci.yaml)
[![Depfu](https://badges.depfu.com/badges/2d4a10b6819e6ab830a395d236f28051/overview.svg)](https://depfu.com/github/sgruendel/prettier-plugin-jte?project_id=70595)
[![npm version](https://img.shields.io/npm/v/prettier-plugin-jte.svg)](https://www.npmjs.com/package/prettier-plugin-jte)

Prettier plugin for formatting Java JTE templates with Prettier.

This plugin targets Java-style `.jte` files and formats JTE directives while delegating HTML layout to Prettier's HTML printer.

It supports:

- `${...}` and `$unsafe{...}` expressions
- `@if`, `@elseif`, `@else`, `@endif`
- `@for`, `@else`, `@endfor`
- `@import` and `@param`
- `@template...(...)` calls
- `!{...}` local Java code blocks
- ``@`...` `` content blocks
- `<%-- ... --%>` comments

Imports are sorted alphabetically within groups: other imports, `javax.*` followed by `java.*`, then static imports.
Blank lines separate these three groups and separate imports from parameters.
Set `jteImportOrder` to `open-java-format` to order imports like [open-java-format](https://openjavaformat.dev/)
instead (see [Options](#options)).

Like Prettier, other blank lines are kept as they were in the source, with multiple blank lines collapsed into one.

It currently focuses on Java JTE syntax only. Kotlin `.kte` syntax is out of scope.

## Install

```bash
npm install --save-dev prettier prettier-plugin-jte
```

## Usage

Prettier will pick up the plugin automatically when it is installed locally and the file extension is `.jte`.

You can also invoke it explicitly:

```bash
npx prettier --write "src/main/*.jte" --parser jte
```

Example `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-jte"]
}
```

## Options

| Option           | CLI flag             | Default   | Description                                                                                                                                                                                     |
| ---------------- | -------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jteImportOrder` | `--jte-import-order` | `default` | `default`: other imports, then `javax.*` and `java.*`, then static imports. `open-java-format`: static imports, then all other imports, each group sorted alphabetically like open-java-format. |

```json
{
  "plugins": ["prettier-plugin-jte"],
  "jteImportOrder": "open-java-format"
}
```

## Example

```jte
@import org.example.Page

@param Page page

@if(page.getDescription() != null)
    <meta name="description" content="${page.getDescription()}">
@endif

@template.layout.page(
    page = page,
    content = @`
        <h1>${page.getTitle()}</h1>
    `
)
```
