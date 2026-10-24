@template.example(label = "\u0041", content = @`<p>Hello,world</p>`)
@template.example(label = "\u0041", content = @`<p>call(a,b),then(c,d)</p>`)
@template.example(label = \u0022Hello,world\u0022, content = @`<p>Hello,world</p>`)
@template.example(values = List.of("\u0041", @`<p>Hello,world</p>`))
@template.example(
label = "\u0041",
content = @`
<p>Hello,world (a,b)</p>
`
)
<section>
  @template.example(label = "\u0041", content = @`<p>Hello,world</p>`)
  @template.example(content = @`<p>Hello,world</p>`)
</section>
