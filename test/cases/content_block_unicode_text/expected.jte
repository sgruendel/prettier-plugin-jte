@template.foo(content = @`<p class="a">Price \u20ac</p>`)
@template.foo(content = @`<p class="a">Price \\u20ac</p>`)
!{
  var c = "\\u0041"; var d = @`<p class="a">x</p>`;
}
<section>
  @template.foo(
    label = "\u0041",
    content = @`<p class="a">Hello,world (a,b)</p>`
  )
</section>
