# prettier-plugin-jte

[![CI](https://github.com/sgruendel/prettier-plugin-jte/actions/workflows/ci.yml/badge.svg)](https://github.com/sgruendel/prettier-plugin-jte/actions/workflows/ci.yml)

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

It currently focuses on Java JTE syntax only. Kotlin `.kte` syntax is out of scope.

## Install

```bash
npm install --save-dev prettier prettier-plugin-jte
```

## Usage

Prettier will pick up the plugin automatically when it is installed locally and the file extension is `.jte`.

You can also invoke it explicitly:

```bash
npx prettier --write "src/**/*.jte" --parser jte
```

Example `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-jte"]
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
