${before}
<section>
  <script src="${assetPath("entry.js")}" data-title="${title}"></script>
  @template.card(
    content = @`
      <p>${inside}</p>
      @if(visible)
        <span>${branch}</span>
      @else
        <span>${fallback}</span>
      @endif
    `
  )
  !{
    var content = @`<span>${nested}</span>`;
  }
</section>
